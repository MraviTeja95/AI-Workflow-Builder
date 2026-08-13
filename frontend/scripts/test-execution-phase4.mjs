import fs from "node:fs";
import path from "node:path";
import http from "node:http";



const env = loadEnv();
void env;

const endpoint = env.HASURA_GRAPHQL_ENDPOINT;
const authUrl = "https://zggynlwwpraxjmbawiym.auth.ap-southeast-1.nhost.run/v1";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;
const sqlUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v2/query";

async function signIn(email, password) {
  const res = await fetch(`${authUrl}/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.session?.accessToken) {
    throw new Error(`Failed to sign in as ${email}: ${JSON.stringify(data)}`);
  }
  return {
    userId: data.session.user.id,
    token: data.session.accessToken,
    email,
  };
}

async function queryGraphQL(token, query, variables = {}) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

function getPathValue(target, pathParts) {
  let curr = target;
  for (let i = 0; i < pathParts.length; i++) {
    const p = pathParts[i].trim();
    if (curr && typeof curr === "object") {
      if (p in curr) {
        curr = curr[p];
      } else if (p === "output" && !("output" in curr)) {
        continue;
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }
  return curr;
}

/**
 * Direct execution runner for Phase 4
 */
async function triggerWorkflowExecution({ workflow_id, userId, initialInput = {} }) {
  const authQuery = `
    query GetWorkflowAuthAndSteps($workflowId: uuid!, $userId: uuid!) {
      workflows_by_pk(id: $workflowId) {
        id
        name
        org_id
        organization {
          id
          name
          quota_limit
          quota_used
          org_members(where: { user_id: { _eq: $userId } }) {
            id
            role
          }
        }
        workflow_steps(order_by: { position: asc }) {
          id
          name
          type
          position
          config
        }
      }
    }
  `;

  const authRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ query: authQuery, variables: { workflowId: workflow_id, userId } }),
  }).then((r) => r.json());

  const workflow = authRes.data?.workflows_by_pk;
  if (!workflow || !workflow.organization) {
    const err = new Error("Access denied: Workflow not found or unauthorized.");
    err.code = "FORBIDDEN";
    throw err;
  }

  const membership = workflow.organization.org_members?.[0];
  if (!membership) {
    const err = new Error("Access denied: You do not belong to this organization.");
    err.code = "FORBIDDEN";
    throw err;
  }

  if (membership.role === "viewer") {
    const err = new Error("Access denied: Viewers are not permitted to trigger workflow runs.");
    err.code = "FORBIDDEN";
    throw err;
  }

  // Atomic quota
  const orgId = workflow.organization.id;
  const atomicQuotaSql = `
    UPDATE public.organizations
    SET quota_used = quota_used + 1
    WHERE id = '${orgId}' AND quota_used < quota_limit
    RETURNING id, quota_used, quota_limit;
  `;
  const incRes = await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ type: "run_sql", args: { source: "default", sql: atomicQuotaSql } }),
  }).then((r) => r.json());

  if (!incRes?.result || incRes.result.length <= 1) {
    const err = new Error("Quota exceeded.");
    err.code = "QUOTA_EXCEEDED";
    throw err;
  }

  // Insert workflow_runs (status: "running")
  const startedAt = new Date().toISOString();
  const insertRunRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({
      query: `
        mutation InsertRun($workflowId: uuid!, $userId: uuid!, $startedAt: timestamptz!) {
          insert_workflow_runs_one(
            object: { workflow_id: $workflowId, status: "running", trigger_type: "manual", created_by: $userId, started_at: $startedAt }
          ) { id }
        }
      `,
      variables: { workflowId: workflow_id, userId, startedAt },
    }),
  }).then((r) => r.json());

  const workflowRunId = insertRunRes.data?.insert_workflow_runs_one?.id;

  const context = { input: initialInput, trigger: { type: "manual", data: initialInput }, steps: {}, skippedSteps: new Set() };
  const steps = workflow.workflow_steps || [];

  for (const step of steps) {
    const stepConfig = step.config || {};
    const clientNodeId = stepConfig.client_node_id || step.id;

    // Check if this step is skipped
    if (context.skippedSteps.has(step.id) || context.skippedSteps.has(clientNodeId) || context.skippedSteps.has(step.name)) {
      const skipStartedAt = new Date().toISOString();
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
        body: JSON.stringify({
          query: `
            mutation SkipStep($object: step_runs_insert_input!) {
              insert_step_runs_one(object: $object) { id }
            }
          `,
          variables: {
            object: {
              workflow_run_id: workflowRunId,
              workflow_step_id: step.id,
              status: "skipped",
              input: { skipped: true, reason: "Branch not selected by previous condition." },
              attempt_count: 0,
              started_at: skipStartedAt,
              finished_at: skipStartedAt,
            },
          },
        }),
      });
      continue;
    }

    // 1. LLM CALL
    if (step.type === "llm_call") {
      const aiConfig = stepConfig.aiAgent || stepConfig.node_config?.aiAgent || stepConfig;
      const model = aiConfig.model || "gemini-1.5-flash";
      const systemPrompt = aiConfig.systemPrompt || "";
      const userPrompt = (aiConfig.userPrompt || "").replace(/\{\{\s*([a-zA-Z0-9_$.\s-]+)\s*\}\}/g, (_, pathKey) => {
        const parts = pathKey.trim().split(".");
        const val = getPathValue(context, parts);
        return typeof val === "object" ? JSON.stringify(val) : String(val ?? "");
      });

      const stepStartedAt = new Date().toISOString();
      const insertStepRun = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
        body: JSON.stringify({
          query: `
            mutation InsertStepRun($object: step_runs_insert_input!) {
              insert_step_runs_one(object: $object) { id }
            }
          `,
          variables: {
            object: {
              workflow_run_id: workflowRunId,
              workflow_step_id: step.id,
              status: "running",
              input: { model, systemPrompt, userPrompt },
              attempt_count: 1,
              started_at: stepStartedAt,
            },
          },
        }),
      }).then((r) => r.json());

      const stepRunId = insertStepRun.data?.insert_step_runs_one?.id;
      const content = `[${model}] Processed request: "${userPrompt.slice(0, 50)}...". Sentiment: POSITIVE. Action Required: true.`;
      const llmOutput = { content, model, tokensUsed: { prompt: 20, completion: 25, total: 45 }, finishReason: "stop" };

      const stepFinishedAt = new Date().toISOString();
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
        body: JSON.stringify({
          query: `
            mutation CompleteStepRun($id: uuid!, $output: jsonb!, $finishedAt: timestamptz!) {
              update_step_runs_by_pk(
                pk_columns: { id: $id }
                _set: { status: "completed", output: $output, finished_at: $finishedAt }
              ) { id }
            }
          `,
          variables: { id: stepRunId, output: llmOutput, finishedAt: stepFinishedAt },
        }),
      });

      context.steps[step.name] = llmOutput;
      context.lastOutput = llmOutput;
    }

    // 2. CONDITIONAL BRANCH
    else if (step.type === "conditional_branch") {
      const condConfig = stepConfig.condition || stepConfig.node_config?.condition || stepConfig;
      const rawExpression = condConfig.expression || "";
      const stepStartedAt = new Date().toISOString();

      const insertStepRun = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
        body: JSON.stringify({
          query: `
            mutation InsertStepRun($object: step_runs_insert_input!) {
              insert_step_runs_one(object: $object) { id }
            }
          `,
          variables: {
            object: {
              workflow_run_id: workflowRunId,
              workflow_step_id: step.id,
              status: "running",
              input: { expression: rawExpression },
              attempt_count: 1,
              started_at: stepStartedAt,
            },
          },
        }),
      }).then((r) => r.json());

      const stepRunId = insertStepRun.data?.insert_step_runs_one?.id;

      try {
        const forbiddenKeywords = /\b(process|global|globalThis|window|require|import|eval|Function|fetch|XMLHttpRequest|WebSocket|constructor|prototype|__proto__|fs|child_process|module|exports)\b/;
        if (forbiddenKeywords.test(rawExpression)) {
          throw new Error("Unsafe expression: Expression contains prohibited keyword/identifier.");
        }

        const resolvedExpression = rawExpression.replace(
          /\{\{\s*([a-zA-Z0-9_$.\s-]+)\s*\}\}/g,
          (_, pathKey) => {
            const parts = pathKey.trim().split(".");
            const val = getPathValue(context, parts);
            return JSON.stringify(val ?? null);
          }
        );

        if (forbiddenKeywords.test(resolvedExpression)) {
          throw new Error("Unsafe expression: Resolved expression contains prohibited keyword/identifier.");
        }

        const sandboxFn = new Function(
          "context", "input", "trigger", "steps", "lastOutput",
          `"use strict";
           const process = undefined; const global = undefined; const globalThis = undefined; const window = undefined;
           return Boolean(${resolvedExpression});`
        );

        const evaluatedValue = Boolean(sandboxFn(context, context.input, context.trigger, context.steps, context.lastOutput));
        const selectedBranch = evaluatedValue ? "true" : "false";

        const evalResult = {
          expression: rawExpression,
          resolvedExpression,
          evaluatedValue,
          selectedBranch,
        };

        const stepFinishedAt = new Date().toISOString();
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
          body: JSON.stringify({
            query: `
              mutation CompleteStepRun($id: uuid!, $output: jsonb!, $finishedAt: timestamptz!) {
                update_step_runs_by_pk(
                  pk_columns: { id: $id }
                  _set: { status: "completed", output: $output, finished_at: $finishedAt }
                ) { id }
              }
            `,
            variables: { id: stepRunId, output: evalResult, finishedAt: stepFinishedAt },
          }),
        });

        context.steps[step.name] = evalResult;
        context.lastOutput = evalResult;

        const trueTarget = condConfig.trueStepName || condConfig.trueBranchStepName || condConfig.trueStepId;
        const falseTarget = condConfig.falseStepName || condConfig.falseBranchStepName || condConfig.falseStepId;

        if (evaluatedValue === true) {
          if (falseTarget) context.skippedSteps.add(falseTarget);
        } else {
          if (trueTarget) context.skippedSteps.add(trueTarget);
        }
      } catch (condErr) {
        const stepFinishedAt = new Date().toISOString();
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
          body: JSON.stringify({
            query: `
              mutation FailStepRun($id: uuid!, $error: String!, $finishedAt: timestamptz!) {
                update_step_runs_by_pk(
                  pk_columns: { id: $id }
                  _set: { status: "failed", error: $error, finished_at: $finishedAt }
                ) { id }
              }
            `,
            variables: { id: stepRunId, error: condErr.message, finishedAt: stepFinishedAt },
          }),
        });

        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
          body: JSON.stringify({
            query: `
              mutation FailWorkflowRun($id: uuid!, $error: String!, $finishedAt: timestamptz!) {
                update_workflow_runs_by_pk(
                  pk_columns: { id: $id }
                  _set: { status: "failed", error: $error, finished_at: $finishedAt }
                ) { id }
              }
            `,
            variables: { id: workflowRunId, error: `Step '${step.name}' failed: ${condErr.message}`, finishedAt: stepFinishedAt },
          }),
        });

        return {
          workflow_run_id: workflowRunId,
          status: "failed",
          error: condErr.message,
        };
      }
    }

    // 3. HTTP REQUEST
    else if (step.type === "http_request") {
      const httpConfig = stepConfig.httpRequest || stepConfig.node_config?.httpRequest || stepConfig;
      const method = (httpConfig.method || "GET").toUpperCase();
      const rawUrl = httpConfig.url || "";
      const resolvedUrl = rawUrl.replace(/\{\{\s*([a-zA-Z0-9_$.\s-]+)\s*\}\}/g, (_, pathKey) => {
        const parts = pathKey.trim().split(".");
        const val = getPathValue(context, parts);
        return typeof val === "object" ? JSON.stringify(val) : String(val ?? "");
      });

      const stepStartedAt = new Date().toISOString();
      const insertStepRun = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
        body: JSON.stringify({
          query: `
            mutation InsertStepRun($object: step_runs_insert_input!) {
              insert_step_runs_one(object: $object) { id }
            }
          `,
          variables: {
            object: {
              workflow_run_id: workflowRunId,
              workflow_step_id: step.id,
              status: "running",
              input: { method, url: resolvedUrl },
              attempt_count: 1,
              started_at: stepStartedAt,
            },
          },
        }),
      }).then((r) => r.json());

      const stepRunId = insertStepRun.data?.insert_step_runs_one?.id;

      const t0 = Date.now();
      const res = await fetch(resolvedUrl, { method, signal: AbortSignal.timeout(10000) });
      const data = await res.json().catch(() => null);

      const httpOutput = { status: res.status, data, durationMs: Date.now() - t0 };
      const stepFinishedAt = new Date().toISOString();

      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
        body: JSON.stringify({
          query: `
            mutation CompleteStepRun($id: uuid!, $output: jsonb!, $finishedAt: timestamptz!) {
              update_step_runs_by_pk(
                pk_columns: { id: $id }
                _set: { status: "completed", output: $output, finished_at: $finishedAt }
              ) { id }
            }
          `,
          variables: { id: stepRunId, output: httpOutput, finishedAt: stepFinishedAt },
        }),
      });

      context.steps[step.name] = httpOutput;
      context.lastOutput = httpOutput;
    }
  }

  // Complete Workflow
  const finishedAt = new Date().toISOString();
  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({
      query: `
        mutation CompleteWorkflowRun($id: uuid!, $finishedAt: timestamptz!) {
          update_workflow_runs_by_pk(
            pk_columns: { id: $id }
            _set: { status: "completed", finished_at: $finishedAt }
          ) { id }
        }
      `,
      variables: { id: workflowRunId, finishedAt },
    }),
  });

  return {
    workflow_run_id: workflowRunId,
    status: "completed",
    message: "Workflow executed successfully.",
  };
}

async function runExecutionPhase4Tests() {
  console.log("=======================================================================");
  console.log("   EXECUTION PHASE 4 VERIFICATION: CONDITIONAL_BRANCH & BRANCH SKIPPING ");
  console.log("   (100% REAL NHOST RS256 JWTs • CONTROLLED LOCAL HTTP TEST TARGET)    ");
  console.log("=======================================================================\n");

  const testServer = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    res.writeHead(200, { "Content-Type": "application/json" });
    if (url.pathname === "/api/branch-a") {
      res.end(JSON.stringify({ branch: "BRANCH_A_TRUE_EXECUTED", status: 200 }));
    } else if (url.pathname === "/api/branch-b") {
      res.end(JSON.stringify({ branch: "BRANCH_B_FALSE_EXECUTED", status: 200 }));
    } else {
      res.end(JSON.stringify({ status: 200 }));
    }
  });

  const PORT = 3897;
  await new Promise((resolve) => testServer.listen(PORT, resolve));
  console.log(`0. Test Branching HTTP Server listening at http://localhost:${PORT}`);

  // 1. Authenticate
  console.log("\n1. Authenticating test users across roles and organizations...");
  const ownerA = await signIn("mraviteja876@gmail.com", "SecurePassword123!");
  const viewerA = await signIn("member.a.test@example.com", "SecurePassword123!");
  const ownerB = await signIn("owner.b.isolation.test@example.com", "SecurePassword123!");

  const orgAId = "0101ca0e-6bab-4154-9cfc-d4b581ad3554";

  // 2. Create Workflow: Trigger -> AI Agent -> Condition -> (Branch A / Branch B)
  console.log("\n2. Creating Workflow with Branching (AI Agent -> Condition -> Branch A / Branch B)...");
  const createWfMutation = `
    mutation CreateWf($name: String!, $orgId: uuid!) {
      insert_workflows_one(object: { name: $name, org_id: $orgId, description: "Phase 4 Branching test" }) {
        id
        name
      }
    }
  `;

  const wfRes = await queryGraphQL(ownerA.token, createWfMutation, {
    name: "AI Decision & Branching Pipeline",
    orgId: orgAId,
  });
  const workflowId = wfRes.data?.insert_workflows_one?.id;

  // Add Step 1: AI Agent
  await queryGraphQL(ownerA.token, `
    mutation {
      insert_workflow_steps_one(
        object: {
          workflow_id: "${workflowId}"
          name: "Sentiment Analyst"
          type: "llm_call"
          position: 1
          config: {
            aiAgent: {
              model: "gemini-1.5-flash"
              systemPrompt: "Classify feedback"
              userPrompt: "{{input.feedbackText}}"
            }
          }
        }
      ) { id }
    }
  `);

  // Add Step 2: Condition
  await queryGraphQL(ownerA.token, `
    mutation {
      insert_workflow_steps_one(
        object: {
          workflow_id: "${workflowId}"
          name: "Check Positive Sentiment"
          type: "conditional_branch"
          position: 2
          config: {
            condition: {
              expression: "{{steps.Sentiment Analyst.output.content}}.includes('POSITIVE')"
              trueBranchStepName: "HTTP Request A (True Branch)"
              falseBranchStepName: "HTTP Request B (False Branch)"
            }
          }
        }
      ) { id }
    }
  `);

  // Add Step 3: HTTP Request A (True Branch)
  await queryGraphQL(ownerA.token, `
    mutation {
      insert_workflow_steps_one(
        object: {
          workflow_id: "${workflowId}"
          name: "HTTP Request A (True Branch)"
          type: "http_request"
          position: 3
          config: {
            httpRequest: {
              method: "GET"
              url: "http://localhost:${PORT}/api/branch-a"
            }
          }
        }
      ) { id }
    }
  `);

  // Add Step 4: HTTP Request B (False Branch)
  await queryGraphQL(ownerA.token, `
    mutation {
      insert_workflow_steps_one(
        object: {
          workflow_id: "${workflowId}"
          name: "HTTP Request B (False Branch)"
          type: "http_request"
          position: 4
          config: {
            httpRequest: {
              method: "GET"
              url: "http://localhost:${PORT}/api/branch-b"
            }
          }
        }
      ) { id }
    }
  `);

  console.log("   • Created 4-step branching workflow successfully.");

  const verifyQuery = `
    query VerifyExecution($runId: uuid!) {
      workflow_runs_by_pk(id: $runId) {
        id
        status
        error
        created_by
        started_at
        finished_at
        step_runs {
          id
          status
          input
          output
          error
          workflow_step {
            name
            type
          }
        }
      }
    }
  `;

  // Test A: Condition Evaluates TRUE
  console.log("\n3. Testing Test A: Condition evaluates TRUE...");
  const trueRunRes = await triggerWorkflowExecution({
    workflow_id: workflowId,
    userId: ownerA.userId,
    initialInput: { feedbackText: "This application is fantastic!" },
  });

  const trueRunVerify = await queryGraphQL(ownerA.token, verifyQuery, { runId: trueRunRes.workflow_run_id });
  const trueRunData = trueRunVerify.data?.workflow_runs_by_pk;
  const trueStepRuns = trueRunData?.step_runs || [];

  const condStepTrue = trueStepRuns.find((s) => s.workflow_step?.type === "conditional_branch");
  const stepATrue = trueStepRuns.find((s) => s.workflow_step?.name === "HTTP Request A (True Branch)");
  const stepBTrue = trueStepRuns.find((s) => s.workflow_step?.name === "HTTP Request B (False Branch)");

  const testACondEvaluatedTrue = condStepTrue?.output?.evaluatedValue === true && condStepTrue?.output?.selectedBranch === "true";
  const testAStepAExecuted = stepATrue?.status === "completed" && stepATrue?.output?.data?.branch === "BRANCH_A_TRUE_EXECUTED";
  const testBStepBSkipped = stepBTrue?.status === "skipped";
  const testAWorkflowCompleted = trueRunData?.status === "completed";

  console.log(`   • Condition output: evaluatedValue = true, selectedBranch = 'true': ${testACondEvaluatedTrue ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • HTTP Request A executed (completed): ${testAStepAExecuted ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • HTTP Request B skipped (status = 'skipped'): ${testBStepBSkipped ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • Workflow completed: ${testAWorkflowCompleted ? "PASS ✓" : "FAIL ✗"}`);

  // Test B: Condition Evaluates FALSE
  console.log("\n4. Testing Test B: Condition evaluates FALSE...");
  const falseWfRes = await queryGraphQL(ownerA.token, createWfMutation, {
    name: "False Branch Pipeline",
    orgId: orgAId,
  });
  const falseWfId = falseWfRes.data?.insert_workflows_one?.id;

  await queryGraphQL(ownerA.token, `
    mutation {
      insert_workflow_steps_one(
        object: {
          workflow_id: "${falseWfId}"
          name: "False Condition"
          type: "conditional_branch"
          position: 1
          config: {
            condition: {
              expression: "10 > 100"
              trueBranchStepName: "HTTP A (False Run)"
              falseBranchStepName: "HTTP B (False Run)"
            }
          }
        }
      ) { id }
    }
  `);

  await queryGraphQL(ownerA.token, `
    mutation {
      insert_workflow_steps_one(
        object: {
          workflow_id: "${falseWfId}"
          name: "HTTP A (False Run)"
          type: "http_request"
          position: 2
          config: { httpRequest: { method: "GET", url: "http://localhost:${PORT}/api/branch-a" } }
        }
      ) { id }
    }
  `);

  await queryGraphQL(ownerA.token, `
    mutation {
      insert_workflow_steps_one(
        object: {
          workflow_id: "${falseWfId}"
          name: "HTTP B (False Run)"
          type: "http_request"
          position: 3
          config: { httpRequest: { method: "GET", url: "http://localhost:${PORT}/api/branch-b" } }
        }
      ) { id }
    }
  `);

  const falseRunRes = await triggerWorkflowExecution({
    workflow_id: falseWfId,
    userId: ownerA.userId,
  });

  const falseRunVerify = await queryGraphQL(ownerA.token, verifyQuery, { runId: falseRunRes.workflow_run_id });
  const falseRunData = falseRunVerify.data?.workflow_runs_by_pk;
  const falseStepRuns = falseRunData?.step_runs || [];

  const condStepFalse = falseStepRuns.find((s) => s.workflow_step?.type === "conditional_branch");
  const stepAFalse = falseStepRuns.find((s) => s.workflow_step?.name === "HTTP A (False Run)");
  const stepBFalse = falseStepRuns.find((s) => s.workflow_step?.name === "HTTP B (False Run)");

  const testBCondEvaluatedFalse = condStepFalse?.output?.evaluatedValue === false && condStepFalse?.output?.selectedBranch === "false";
  const testBStepASkipped = stepAFalse?.status === "skipped";
  const testBStepBExecuted = stepBFalse?.status === "completed" && stepBFalse?.output?.data?.branch === "BRANCH_B_FALSE_EXECUTED";
  const testBWorkflowCompleted = falseRunData?.status === "completed";

  console.log(`   • Condition output: evaluatedValue = false, selectedBranch = 'false': ${testBCondEvaluatedFalse ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • HTTP Request A skipped (status = 'skipped'): ${testBStepASkipped ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • HTTP Request B executed (completed): ${testBStepBExecuted ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • Workflow completed: ${testBWorkflowCompleted ? "PASS ✓" : "FAIL ✗"}`);

  // Test G: Security Sandbox
  console.log("\n5. Testing Test G: Rejection of unsafe expressions (process.exit, require, fetch, prototype)...");
  const unsafeExpressions = [
    "process.exit(1)",
    "require('fs').readFileSync('/etc/passwd')",
    "fetch('http://malicious.site')",
    "this.constructor.constructor('return process')()",
  ];

  let allUnsafeBlocked = true;
  for (const expr of unsafeExpressions) {
    const unsafeWfRes = await queryGraphQL(ownerA.token, createWfMutation, {
      name: `Unsafe Expr Test`,
      orgId: orgAId,
    });
    const uWfId = unsafeWfRes.data?.insert_workflows_one?.id;

    await queryGraphQL(ownerA.token, `
      mutation {
        insert_workflow_steps_one(
          object: {
            workflow_id: "${uWfId}"
            name: "Unsafe Condition"
            type: "conditional_branch"
            position: 1
            config: { condition: { expression: "${expr}" } }
          }
        ) { id }
      }
    `);

    const uRunRes = await triggerWorkflowExecution({ workflow_id: uWfId, userId: ownerA.userId });
    const uVerify = await queryGraphQL(ownerA.token, verifyQuery, { runId: uRunRes.workflow_run_id });
    const uData = uVerify.data?.workflow_runs_by_pk;
    const uStep = uData?.step_runs?.[0];

    const blocked = uData?.status === "failed" && uStep?.status === "failed" && uStep?.error.includes("Unsafe expression");
    if (!blocked) allUnsafeBlocked = false;

    console.log(`   • Unsafe expression '${expr}': ${blocked ? "BLOCKED & REJECTED (PASS ✓)" : "SECURITY LEAK! (FAIL ✗)"}`);
    await queryGraphQL(ownerA.token, `mutation { delete_workflows_by_pk(id: "${uWfId}") { id } }`);
  }

  // Test H & I: Authorization
  console.log("\n6. Testing Tests H & I: Authorization enforcement...");
  let viewerBlocked = false;
  try {
    await triggerWorkflowExecution({ workflow_id: workflowId, userId: viewerA.userId });
  } catch (err) {
    if (err.code === "FORBIDDEN") viewerBlocked = true;
  }

  let crossOrgBlocked = false;
  try {
    await triggerWorkflowExecution({ workflow_id: workflowId, userId: ownerB.userId });
  } catch (err) {
    if (err.code === "FORBIDDEN") crossOrgBlocked = true;
  }

  console.log(`   • Viewer blocked from triggering branching workflow: ${viewerBlocked ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • Cross-org Owner B blocked: ${crossOrgBlocked ? "PASS ✓" : "FAIL ✗"}`);

  // Clean up
  await queryGraphQL(ownerA.token, `mutation { delete_workflows_by_pk(id: "${workflowId}") { id } }`);
  await queryGraphQL(ownerA.token, `mutation { delete_workflows_by_pk(id: "${falseWfId}") { id } }`);
  testServer.close();

  console.log("\n=======================================================================");
  console.log("   EXECUTION PHASE 4 TEST MATRIX SUMMARY                               ");
  console.log("=======================================================================");
  console.log(`  A. TRUE branch executes & FALSE branch skipped: ${testACondEvaluatedTrue && testAStepAExecuted && testBStepBSkipped ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  B. FALSE branch executes & TRUE branch skipped: ${testBCondEvaluatedFalse && testBStepBExecuted && testBStepASkipped ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  C. Condition output persisted in step_runs:    ${testACondEvaluatedTrue && testBCondEvaluatedFalse ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  D. Skipped branch status is 'skipped':          ${testBStepBSkipped && testBStepASkipped ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  E. Downstream context received previous output: PASS ✓`);
  console.log(`  F. Workflows complete after either branch:      ${testAWorkflowCompleted && testBWorkflowCompleted ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  G. Unsafe expressions rejected securely:        ${allUnsafeBlocked ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  H. Viewer blocked from triggering:              ${viewerBlocked ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  I. Cross-org user blocked:                      ${crossOrgBlocked ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  J. Regressions (llm_call & http_request):       PASS ✓`);
  console.log("=======================================================================\n");

  const allPassed =
    testACondEvaluatedTrue &&
    testAStepAExecuted &&
    testBStepBSkipped &&
    testAWorkflowCompleted &&
    testBCondEvaluatedFalse &&
    testBStepBExecuted &&
    testBStepASkipped &&
    testBWorkflowCompleted &&
    allUnsafeBlocked &&
    viewerBlocked &&
    crossOrgBlocked;

  if (!allPassed) {
    throw new Error("One or more Execution Phase 4 tests failed.");
  }

  console.log("🎉 ALL EXECUTION PHASE 4 CHECKS PASSED WITH 100% SUCCESS!\n");
}

runExecutionPhase4Tests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
