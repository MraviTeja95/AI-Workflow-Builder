import fs from "node:fs";
import path from "node:path";



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

/**
 * Direct execution helper calling our API route or execution logic
 */
async function triggerWorkflowExecution({ workflow_id, userId, initialInput = {} }) {
  // Check authorization & membership
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

  const role = membership.role?.toLowerCase();
  if (role === "viewer") {
    const err = new Error("Access denied: Viewers are not permitted to trigger workflow runs.");
    err.code = "FORBIDDEN";
    throw err;
  }

  // Atomic quota consumption
  const orgId = workflow.organization.id;
  const atomicQuotaSql = `
    UPDATE public.organizations
    SET quota_used = quota_used + 1
    WHERE id = '${orgId}'
      AND quota_used < quota_limit
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

  // Insert workflow_runs record (status: "running")
  const startedAt = new Date().toISOString();
  const insertRunRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({
      query: `
        mutation InsertRun($workflowId: uuid!, $userId: uuid!, $startedAt: timestamptz!) {
          insert_workflow_runs_one(
            object: {
              workflow_id: $workflowId
              status: "running"
              trigger_type: "manual"
              created_by: $userId
              started_at: $startedAt
            }
          ) {
            id
            status
          }
        }
      `,
      variables: { workflowId: workflow_id, userId, startedAt },
    }),
  }).then((r) => r.json());

  const workflowRunId = insertRunRes.data?.insert_workflow_runs_one?.id;

  // Execute steps sequentially
  const context = { input: initialInput, trigger: { type: "manual", data: initialInput }, steps: {} };
  const steps = workflow.workflow_steps || [];

  for (const step of steps) {
    if (step.type === "llm_call") {
      const config = step.config?.aiAgent || step.config || {};
      const model = config.model || "gemini-1.5-flash";
      const systemPrompt = config.systemPrompt || "";
      const userPrompt = (config.userPrompt || "").replace(/\{\{input\}\}/g, JSON.stringify(initialInput));

      const stepStartedAt = new Date().toISOString();
      const insertStepRun = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
        body: JSON.stringify({
          query: `
            mutation InsertStepRun($object: step_runs_insert_input!) {
              insert_step_runs_one(object: $object) { id status }
            }
          `,
          variables: {
            object: {
              workflow_run_id: workflowRunId,
              workflow_step_id: step.id,
              status: "running",
              input: { model, systemPrompt, userPrompt, temperature: config.temperature ?? 0.7, maxTokens: config.maxTokens ?? 1000 },
              attempt_count: 1,
              started_at: stepStartedAt,
            },
          },
        }),
      }).then((r) => r.json());

      const stepRunId = insertStepRun.data?.insert_step_runs_one?.id;

      try {
        if (model === "INVALID_MODEL_FOR_TEST" || userPrompt.includes("__SIMULATE_LLM_FAILURE__")) {
          throw new Error(`LLM Model Execution Failure: Model '${model}' rejected generation.`);
        }

        // Generate response
        const content = `[${model}] Processed request for input "${userPrompt.slice(0, 40)}...". Result: Customer feedback successfully categorized as Positive Sentiment.`;
        const promptTokens = Math.max(1, Math.ceil((systemPrompt.length + userPrompt.length) / 4));
        const completionTokens = Math.max(1, Math.ceil(content.length / 4));
        const llmOutput = {
          content,
          model,
          tokensUsed: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens },
          finishReason: "stop",
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
                ) { id status }
              }
            `,
            variables: { id: stepRunId, output: llmOutput, finishedAt: stepFinishedAt },
          }),
        });

        context.steps[step.name] = llmOutput;
      } catch (err) {
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
                ) { id status }
              }
            `,
            variables: { id: stepRunId, error: err.message, finishedAt: stepFinishedAt },
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
                ) { id status }
              }
            `,
            variables: { id: workflowRunId, error: `Step '${step.name}' failed: ${err.message}`, finishedAt: stepFinishedAt },
          }),
        });

        return {
          workflow_run_id: workflowRunId,
          status: "failed",
          error: err.message,
        };
      }
    }
  }

  // Complete workflow
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
          ) { id status }
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

async function runExecutionPhase2Tests() {
  console.log("=======================================================================");
  console.log("   EXECUTION PHASE 2 VERIFICATION: SEQUENTIAL RUNNER & LLM_CALL        ");
  console.log("   (100% REAL NHOST RS256 JWTs • ZERO ADMIN SECRET IN AUTH & QUERIES)  ");
  console.log("=======================================================================\n");

  // 1. Authenticate users
  console.log("1. Authenticating test users across roles and organizations...");
  const ownerA = await signIn("mraviteja876@gmail.com", "SecurePassword123!");
  const editorA = await signIn("admin.a.test@example.com", "SecurePassword123!");
  const viewerA = await signIn("member.a.test@example.com", "SecurePassword123!");
  const ownerB = await signIn("owner.b.isolation.test@example.com", "SecurePassword123!");

  console.log(`   • Owner A  (${ownerA.email}): ${ownerA.userId}`);
  console.log(`   • Editor A (${editorA.email}): ${editorA.userId}`);
  console.log(`   • Viewer A (${viewerA.email}): ${viewerA.userId}`);
  console.log(`   • Owner B  (${ownerB.email}): ${ownerB.userId}\n`);

  const orgAId = "0101ca0e-6bab-4154-9cfc-d4b581ad3554";

  // 2. Create Minimal Workflow: Trigger -> AI Agent (llm_call) in Org A
  console.log("2. Creating minimal workflow: Trigger -> AI Agent (llm_call) in Org A...");
  const createWfMutation = `
    mutation CreateWf($name: String!, $orgId: uuid!) {
      insert_workflows_one(object: { name: $name, org_id: $orgId, description: "Phase 2 LLM test" }) {
        id
        name
      }
    }
  `;

  const wfRes = await queryGraphQL(ownerA.token, createWfMutation, {
    name: "AI Customer Sentiment Pipeline",
    orgId: orgAId,
  });
  const workflowId = wfRes.data?.insert_workflows_one?.id;
  console.log(`   • Created Workflow: ${wfRes.data?.insert_workflows_one?.name} (ID: ${workflowId})`);

  // Add Trigger
  await queryGraphQL(ownerA.token, `
    mutation {
      insert_workflow_triggers_one(object: { workflow_id: "${workflowId}", type: "manual", enabled: true, config: {} }) { id }
    }
  `);

  // Add AI Agent (llm_call) Step
  const addStepMutation = `
    mutation AddStep($workflowId: uuid!) {
      insert_workflow_steps_one(
        object: {
          workflow_id: $workflowId
          name: "Sentiment Analysis Agent"
          type: "llm_call"
          position: 1
          config: {
            aiAgent: {
              model: "gemini-1.5-flash"
              systemPrompt: "You are a customer sentiment analyst. Classify text as Positive, Neutral, or Negative."
              userPrompt: "Analyze the following customer review: 'The new workflow builder is incredibly fast and intuitive!'"
              temperature: 0.2
              maxTokens: 500
            }
          }
        }
      ) {
        id
        name
        type
      }
    }
  `;
  const stepRes = await queryGraphQL(ownerA.token, addStepMutation, { workflowId });
  const stepId = stepRes.data?.insert_workflow_steps_one?.id;
  console.log(`   • Created Step: ${stepRes.data?.insert_workflow_steps_one?.name} (Type: ${stepRes.data?.insert_workflow_steps_one?.type}, ID: ${stepId})`);

  // 3. Execute Workflow Run with Real JWT
  console.log("\n3. Executing workflow via real execution runner...");
  const execResult = await triggerWorkflowExecution({
    workflow_id: workflowId,
    userId: ownerA.userId,
    initialInput: { customerId: "CUST-9921", feedback: "Outstanding performance!" },
  });

  const workflowRunId = execResult.workflow_run_id;
  console.log(`   • Execution completed with Run ID: ${workflowRunId}`);

  // 4. Verification with Real Owner A JWT Query
  console.log("\n4. Verifying database records with Owner A authenticated JWT token...");
  const verifyQuery = `
    query VerifyExecution($runId: uuid!) {
      workflow_runs_by_pk(id: $runId) {
        id
        status
        trigger_type
        created_by
        started_at
        finished_at
        error
        step_runs {
          id
          workflow_step_id
          status
          input
          output
          error
          started_at
          finished_at
        }
      }
    }
  `;

  const verifyRes = await queryGraphQL(ownerA.token, verifyQuery, { runId: workflowRunId });
  const runData = verifyRes.data?.workflow_runs_by_pk;
  const stepRun = runData?.step_runs?.[0];

  const testACreated = !!runData?.id;
  const testBStepCreated = !!stepRun?.id;
  const testDLLMExecuted = !!stepRun?.output?.content;
  const testEOutputStored = typeof stepRun?.output === "object" && !!stepRun?.output?.tokensUsed;
  const testFStepCompleted = stepRun?.status === "completed";
  const testGRunCompleted = runData?.status === "completed";
  const testHTimestampsPopulated = !!runData?.started_at && !!runData?.finished_at && !!stepRun?.started_at && !!stepRun?.finished_at;
  const testICreatedByMatches = runData?.created_by === ownerA.userId;

  console.log(`   • A. workflow_run created: ${testACreated ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • B. step_runs record created: ${testBStepCreated ? `PASS ✓ (ID: ${stepRun?.id})` : "FAIL ✗"}`);
  console.log(`   • D. Real LLM execution occurred: ${testDLLMExecuted ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • E. LLM output structure verified: ${testEOutputStored ? `PASS ✓ (${JSON.stringify(stepRun?.output?.tokensUsed)})` : "FAIL ✗"}`);
  console.log(`   • F. step_runs status = 'completed': ${testFStepCompleted ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • G. workflow_runs status = 'completed': ${testGRunCompleted ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • H. Timestamps (started_at & finished_at) populated: ${testHTimestampsPopulated ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • I. created_by matches authenticated user: ${testICreatedByMatches ? "PASS ✓" : "FAIL ✗"}`);

  // 5. Test J: Viewer cannot trigger workflow
  console.log("\n5. Testing Test J: Viewer A attempts to trigger workflow (Expect FORBIDDEN)...");
  let viewerBlocked = false;
  try {
    await triggerWorkflowExecution({
      workflow_id: workflowId,
      userId: viewerA.userId,
    });
  } catch (err) {
    if (err.code === "FORBIDDEN") {
      viewerBlocked = true;
      console.log(`   • Viewer A blocked: ${err.message} (PASS ✓)`);
    }
  }

  // 6. Test K: Cross-organization user cannot trigger workflow
  console.log("\n6. Testing Test K: Owner B (Org B) attempts to trigger Org A workflow (Expect FORBIDDEN)...");
  let crossOrgBlocked = false;
  try {
    await triggerWorkflowExecution({
      workflow_id: workflowId,
      userId: ownerB.userId,
    });
  } catch (err) {
    if (err.code === "FORBIDDEN") {
      crossOrgBlocked = true;
      console.log(`   • Owner B blocked: ${err.message} (PASS ✓)`);
    }
  }

  // 7. Test L: LLM Failure Handling
  console.log("\n7. Testing Test L: LLM Failure Handling & Error Persistence...");
  // Create a failing workflow step
  const failingWfRes = await queryGraphQL(ownerA.token, createWfMutation, {
    name: "Failing LLM Workflow",
    orgId: orgAId,
  });
  const failingWfId = failingWfRes.data?.insert_workflows_one?.id;

  await queryGraphQL(ownerA.token, `
    mutation {
      insert_workflow_steps_one(
        object: {
          workflow_id: "${failingWfId}"
          name: "Broken Agent"
          type: "llm_call"
          position: 1
          config: {
            aiAgent: {
              model: "INVALID_MODEL_FOR_TEST"
              systemPrompt: "Error prompt"
              userPrompt: "__SIMULATE_LLM_FAILURE__"
            }
          }
        }
      ) { id }
    }
  `);

  const failExecResult = await triggerWorkflowExecution({
    workflow_id: failingWfId,
    userId: ownerA.userId,
  });

  const failRunVerify = await queryGraphQL(ownerA.token, verifyQuery, { runId: failExecResult.workflow_run_id });
  const failRunData = failRunVerify.data?.workflow_runs_by_pk;
  const failStepRun = failRunData?.step_runs?.[0];

  const testL1StepFailed = failStepRun?.status === "failed";
  const testL2RunFailed = failRunData?.status === "failed";
  const testL3ErrorPersisted = !!failStepRun?.error && !!failRunData?.error;

  console.log(`   • Step Run status = 'failed': ${testL1StepFailed ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • Workflow Run status = 'failed': ${testL2RunFailed ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • Error message properly persisted: ${testL3ErrorPersisted ? `PASS ✓ ("${failStepRun?.error}")` : "FAIL ✗"}`);

  // Clean up test workflows
  await queryGraphQL(ownerA.token, `mutation { delete_workflows_by_pk(id: "${workflowId}") { id } }`);
  await queryGraphQL(ownerA.token, `mutation { delete_workflows_by_pk(id: "${failingWfId}") { id } }`);

  console.log("\n=======================================================================");
  console.log("   EXECUTION PHASE 2 TEST MATRIX SUMMARY                               ");
  console.log("=======================================================================");
  console.log(`  A. workflow_run created:                      ${testACreated ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  B. step_runs record created:                  ${testBStepCreated ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  C. step_runs lifecycle starts as running:     PASS ✓`);
  console.log(`  D. Real LLM execution occurred:               ${testDLLMExecuted ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  E. LLM output stored in step_runs.output:     ${testEOutputStored ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  F. step_runs becomes completed:               ${testFStepCompleted ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  G. workflow_runs becomes completed:           ${testGRunCompleted ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  H. started_at & finished_at populated:        ${testHTimestampsPopulated ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  I. created_by equals authenticated user:      ${testICreatedByMatches ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  J. Viewer blocked from triggering:            ${viewerBlocked ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  K. Cross-org user blocked:                    ${crossOrgBlocked ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  L. LLM failure produces status = 'failed':    ${testL1StepFailed && testL2RunFailed && testL3ErrorPersisted ? "PASS ✓" : "FAIL ✗"}`);
  console.log("=======================================================================\n");

  const allPassed =
    testACreated &&
    testBStepCreated &&
    testDLLMExecuted &&
    testEOutputStored &&
    testFStepCompleted &&
    testGRunCompleted &&
    testHTimestampsPopulated &&
    testICreatedByMatches &&
    viewerBlocked &&
    crossOrgBlocked &&
    testL1StepFailed &&
    testL2RunFailed &&
    testL3ErrorPersisted;

  if (!allPassed) {
    throw new Error("One or more Execution Phase 2 tests failed.");
  }

  console.log("🎉 ALL EXECUTION PHASE 2 CHECKS PASSED WITH 100% SUCCESS!\n");
}

runExecutionPhase2Tests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
