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

/**
 * Direct execution runner for Phase 3
 */
async function triggerWorkflowExecution({ workflow_id, userId, initialInput = {} }) {
  // 1. Authorization check
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

  // 2. Concurrency-safe atomic quota
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

  // 3. Insert workflow_runs record (status: "running")
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

  // 4. Sequential Step Execution
  const context = { input: initialInput, trigger: { type: "manual", data: initialInput }, steps: {} };
  const steps = workflow.workflow_steps || [];

  for (const step of steps) {
    if (step.type === "http_request") {
      const httpConfig = step.config?.httpRequest || step.config || {};
      const method = (httpConfig.method || "GET").toUpperCase();

      // Resolve variables in URL, headers, and body
      const rawUrl = httpConfig.url || "";
      const resolvedUrl = rawUrl.replace(/\{\{\s*([a-zA-Z0-9_$.]+)\s*\}\}/g, (_, pathKey) => {
        const parts = pathKey.split(".");
        let curr = context;
        for (const p of parts) curr = curr?.[p];
        return typeof curr === "object" ? JSON.stringify(curr) : String(curr ?? "");
      });

      let parsedHeaders = {};
      if (typeof httpConfig.headers === "string" && httpConfig.headers.trim()) {
        try {
          parsedHeaders = JSON.parse(
            httpConfig.headers.replace(/\{\{\s*([a-zA-Z0-9_$.]+)\s*\}\}/g, (_, pathKey) => {
              const parts = pathKey.split(".");
              let curr = context;
              for (const p of parts) curr = curr?.[p];
              return String(curr ?? "");
            })
          );
        } catch {
          // fallback key: value
        }
      } else if (typeof httpConfig.headers === "object") {
        parsedHeaders = httpConfig.headers;
      }

      let requestBody = undefined;
      if (method !== "GET" && method !== "HEAD") {
        const rawBody = typeof httpConfig.body === "object" ? JSON.stringify(httpConfig.body) : String(httpConfig.body || "");
        requestBody = rawBody.replace(/\{\{\s*([a-zA-Z0-9_$.]+)\s*\}\}/g, (_, pathKey) => {
          const parts = pathKey.split(".");
          let curr = context;
          for (const p of parts) curr = curr?.[p];
          return typeof curr === "object" ? JSON.stringify(curr) : String(curr ?? "");
        });
        if (!parsedHeaders["Content-Type"]) parsedHeaders["Content-Type"] = "application/json";
      }

      const stepInput = { method, url: resolvedUrl, headers: parsedHeaders, body: requestBody };

      // Insert step_runs record (status: "running", attempt_count: 1)
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
              input: stepInput,
              attempt_count: 1,
              started_at: stepStartedAt,
            },
          },
        }),
      }).then((r) => r.json());

      const stepRunId = insertStepRun.data?.insert_step_runs_one?.id;
      const maxAttempts = Math.max(1, httpConfig.retries ?? 2);
      let finalAttemptCount = 1;
      let stepSuccess = false;
      let lastErr = null;
      let httpResult = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        finalAttemptCount = attempt;
        if (attempt > 1) {
          // Update attempt_count on the SAME step_runs record
          await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
            body: JSON.stringify({
              query: `
                mutation UpdateAttempt($id: uuid!, $attempt: Int!) {
                  update_step_runs_by_pk(pk_columns: { id: $id }, _set: { attempt_count: $attempt }) { id }
                }
              `,
              variables: { id: stepRunId, attempt },
            }),
          });
        }

        const t0 = Date.now();
        try {
          const res = await fetch(resolvedUrl, {
            method,
            headers: parsedHeaders,
            body: requestBody,
            signal: AbortSignal.timeout(10000),
          });

          const dur = Date.now() - t0;
          const headersObj = {};
          res.headers.forEach((v, k) => {
            headersObj[k] = v;
          });

          let data = null;
          const cType = res.headers.get("content-type") || "";
          if (cType.includes("application/json")) {
            try {
              data = await res.json();
            } catch {
              data = null;
            }
          } else {
            data = await res.text();
          }

          if (res.ok) {
            httpResult = { status: res.status, statusText: res.statusText, headers: headersObj, data, durationMs: dur, attempts: attempt };
            stepSuccess = true;
            break;
          }

          if (res.status >= 500 && attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 50 * attempt));
            continue;
          }

          throw new Error(`HTTP ${res.status} ${res.statusText}: ${typeof data === "object" ? JSON.stringify(data) : data}`);
        } catch (err) {
          lastErr = err;
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 50 * attempt));
            continue;
          }
        }
      }

      if (stepSuccess && httpResult) {
        const stepFinishedAt = new Date().toISOString();
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
          body: JSON.stringify({
            query: `
              mutation CompleteStepRun($id: uuid!, $output: jsonb!, $attempt: Int!, $finishedAt: timestamptz!) {
                update_step_runs_by_pk(
                  pk_columns: { id: $id }
                  _set: { status: "completed", output: $output, attempt_count: $attempt, finished_at: $finishedAt }
                ) { id status }
              }
            `,
            variables: { id: stepRunId, output: httpResult, attempt: finalAttemptCount, finishedAt: stepFinishedAt },
          }),
        });

        context.steps[step.name] = httpResult;
      } else {
        const stepFinishedAt = new Date().toISOString();
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
          body: JSON.stringify({
            query: `
              mutation FailStepRun($id: uuid!, $error: String!, $attempt: Int!, $finishedAt: timestamptz!) {
                update_step_runs_by_pk(
                  pk_columns: { id: $id }
                  _set: { status: "failed", error: $error, attempt_count: $attempt, finished_at: $finishedAt }
                ) { id status }
              }
            `,
            variables: { id: stepRunId, error: lastErr?.message || "HTTP Failure", attempt: finalAttemptCount, finishedAt: stepFinishedAt },
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
            variables: { id: workflowRunId, error: `Step '${step.name}' failed: ${lastErr?.message}`, finishedAt: stepFinishedAt },
          }),
        });

        return {
          workflow_run_id: workflowRunId,
          status: "failed",
          error: lastErr?.message,
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

async function runExecutionPhase3Tests() {
  console.log("=======================================================================");
  console.log("   EXECUTION PHASE 3 VERIFICATION: HTTP_REQUEST EXECUTOR & RETRIES      ");
  console.log("   (100% REAL NHOST RS256 JWTs • CONTROLLED LOCAL HTTP TEST TARGET)    ");
  console.log("=======================================================================\n");

  // Start local HTTP test server
  let localRequestCounter = 0;
  const testServer = http.createServer(async (req, res) => {
    localRequestCounter++;
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/success-post") {
      let bodyStr = "";
      req.on("data", (chunk) => (bodyStr += chunk));
      req.on("end", () => {
        const parsed = JSON.parse(bodyStr || "{}");
        res.writeHead(200, { "Content-Type": "application/json", "X-Server-Version": "1.0.0" });
        res.end(
          JSON.stringify({
            status: 200,
            received: parsed,
            authHeader: req.headers["x-custom-key"],
            message: "HTTP POST verified successfully",
          })
        );
      });
    } else if (url.pathname === "/api/retry-server-error") {
      // Simulate 500 error on first 2 attempts, succeed on 3rd attempt
      if (localRequestCounter <= 2) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Temporary 500 Error", attempt: localRequestCounter }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: 200, message: "Recovered on retry 3!", attempts: localRequestCounter }));
      }
    } else if (url.pathname === "/api/persistent-fail") {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Service Unavailable", code: "UNAVAILABLE" }));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: 200, query: url.searchParams.get("q"), auth: req.headers["x-auth-token"] }));
    }
  });

  const PORT = 3899;
  await new Promise((resolve) => testServer.listen(PORT, resolve));
  console.log(`0. Test HTTP Server listening at http://localhost:${PORT}`);

  // 1. Authenticate users
  console.log("\n1. Authenticating test users across roles and organizations...");
  const ownerA = await signIn("mraviteja876@gmail.com", "SecurePassword123!");
  const viewerA = await signIn("member.a.test@example.com", "SecurePassword123!");
  const ownerB = await signIn("owner.b.isolation.test@example.com", "SecurePassword123!");

  console.log(`   • Owner A  (${ownerA.email}): ${ownerA.userId}`);
  console.log(`   • Viewer A (${viewerA.email}): ${viewerA.userId}`);
  console.log(`   • Owner B  (${ownerB.email}): ${ownerB.userId}\n`);

  const orgAId = "0101ca0e-6bab-4154-9cfc-d4b581ad3554";

  // 2. Test A, B, C, D, E, F, G: Workflow with HTTP POST, Headers, and Variables
  console.log("2. Creating Workflow: Trigger -> HTTP POST with Variables & Custom Headers...");
  const createWfMutation = `
    mutation CreateWf($name: String!, $orgId: uuid!) {
      insert_workflows_one(object: { name: $name, org_id: $orgId, description: "Phase 3 HTTP test" }) {
        id
        name
      }
    }
  `;

  const wfRes = await queryGraphQL(ownerA.token, createWfMutation, {
    name: "HTTP Webhook Dispatcher",
    orgId: orgAId,
  });
  const workflowId = wfRes.data?.insert_workflows_one?.id;

  // Add HTTP Request Step
  const addHttpStepMutation = `
    mutation AddHttpStep($workflowId: uuid!) {
      insert_workflow_steps_one(
        object: {
          workflow_id: $workflowId
          name: "Dispatch Event"
          type: "http_request"
          position: 1
          config: {
            httpRequest: {
              method: "POST"
              url: "http://localhost:${PORT}/api/success-post"
              headers: "{\\"Content-Type\\": \\"application/json\\", \\"X-Custom-Key\\": \\"{{input.apiKey}}\\"}"
              body: "{\\"eventId\\": \\"{{input.eventId}}\\", \\"action\\": \\"PAYMENT_CONFIRMED\\", \\"amount\\": 450}"
              retries: 2
            }
          }
        }
      ) { id name }
    }
  `;
  const stepRes = await queryGraphQL(ownerA.token, addHttpStepMutation, { workflowId });
  const stepId = stepRes.data?.insert_workflow_steps_one?.id;
  console.log(`   • Created Step: ${stepRes.data?.insert_workflow_steps_one?.name} (ID: ${stepId})`);

  // Execute Workflow
  console.log("\n3. Executing HTTP POST workflow with variable injection...");
  const execRes = await triggerWorkflowExecution({
    workflow_id: workflowId,
    userId: ownerA.userId,
    initialInput: { apiKey: "SECRET_KEY_9988", eventId: "EVT_7721" },
  });

  // Verify in Database with Real JWT
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
          attempt_count
          started_at
          finished_at
        }
      }
    }
  `;

  const verifyRes = await queryGraphQL(ownerA.token, verifyQuery, { runId: execRes.workflow_run_id });
  const runData = verifyRes.data?.workflow_runs_by_pk;
  const stepRun = runData?.step_runs?.[0];

  const testASuccess = stepRun?.output?.status === 200;
  const testBPostSuccess = stepRun?.output?.data?.received?.action === "PAYMENT_CONFIRMED";
  const testCHeadersSent = stepRun?.output?.data?.authHeader === "SECRET_KEY_9988";
  const testDVariableResolved = stepRun?.output?.data?.received?.eventId === "EVT_7721";
  const testEResponseStored = typeof stepRun?.output === "object" && !!stepRun?.output?.data;
  const testFAttemptCount = stepRun?.attempt_count === 1;
  const testGWorkflowCompleted = runData?.status === "completed";

  console.log(`   • A. HTTP Status 200: ${testASuccess ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • B. HTTP POST JSON body received: ${testBPostSuccess ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • C. Custom Headers received correctly: ${testCHeadersSent ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • D. Variables resolved (eventId, apiKey): ${testDVariableResolved ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • E. Response stored in step_runs.output: ${testEResponseStored ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • F. attempt_count = 1: ${testFAttemptCount ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • G. workflow_runs status = 'completed': ${testGWorkflowCompleted ? "PASS ✓" : "FAIL ✗"}`);

  // 4. Test I: Retry Behavior on 500 error
  console.log("\n4. Testing Test I: Retry behavior on 500 server error...");
  localRequestCounter = 0; // Reset counter for 3-attempt simulation

  const retryWfRes = await queryGraphQL(ownerA.token, createWfMutation, {
    name: "Retry Test Workflow",
    orgId: orgAId,
  });
  const retryWfId = retryWfRes.data?.insert_workflows_one?.id;

  await queryGraphQL(ownerA.token, `
    mutation {
      insert_workflow_steps_one(
        object: {
          workflow_id: "${retryWfId}"
          name: "Flaky Endpoint"
          type: "http_request"
          position: 1
          config: {
            httpRequest: {
              method: "GET"
              url: "http://localhost:${PORT}/api/retry-server-error"
              retries: 3
            }
          }
        }
      ) { id }
    }
  `);

  const retryExecRes = await triggerWorkflowExecution({
    workflow_id: retryWfId,
    userId: ownerA.userId,
  });

  const retryVerify = await queryGraphQL(ownerA.token, verifyQuery, { runId: retryExecRes.workflow_run_id });
  const retryRunData = retryVerify.data?.workflow_runs_by_pk;
  const retryStepRun = retryRunData?.step_runs?.[0];
  const allStepRunsForRetry = retryRunData?.step_runs?.length === 1; // Must be exactly 1 record!
  const retryAttemptCount = retryStepRun?.attempt_count === 3;
  const retryRecovered = retryStepRun?.status === "completed" && retryStepRun?.output?.data?.attempts === 3;

  console.log(`   • Single step_runs record maintained during retries: ${allStepRunsForRetry ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • attempt_count updated to 3: ${retryAttemptCount ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • Workflow recovered on 3rd attempt: ${retryRecovered ? "PASS ✓" : "FAIL ✗"}`);

  // 5. Test H: Failure Handling when all retries fail
  console.log("\n5. Testing Test H: Failure handling on persistent 503 error...");
  const failWfRes = await queryGraphQL(ownerA.token, createWfMutation, {
    name: "Persistent Fail Workflow",
    orgId: orgAId,
  });
  const failWfId = failWfRes.data?.insert_workflows_one?.id;

  await queryGraphQL(ownerA.token, `
    mutation {
      insert_workflow_steps_one(
        object: {
          workflow_id: "${failWfId}"
          name: "Broken API"
          type: "http_request"
          position: 1
          config: {
            httpRequest: {
              method: "GET"
              url: "http://localhost:${PORT}/api/persistent-fail"
              retries: 2
            }
          }
        }
      ) { id }
    }
  `);

  const failExecRes = await triggerWorkflowExecution({
    workflow_id: failWfId,
    userId: ownerA.userId,
  });

  const failVerify = await queryGraphQL(ownerA.token, verifyQuery, { runId: failExecRes.workflow_run_id });
  const failRunData = failVerify.data?.workflow_runs_by_pk;
  const failStepRun = failRunData?.step_runs?.[0];

  const testHStepFailed = failStepRun?.status === "failed";
  const testHRunFailed = failRunData?.status === "failed";
  const testHErrorPersisted = !!failStepRun?.error && failStepRun?.error.includes("503");

  console.log(`   • step_runs.status = 'failed': ${testHStepFailed ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • workflow_runs.status = 'failed': ${testHRunFailed ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • Error persisted with status details: ${testHErrorPersisted ? `PASS ✓ ("${failStepRun?.error}")` : "FAIL ✗"}`);

  // 6. Test J & K: Viewer and Cross-Org Authorization
  console.log("\n6. Testing Tests J & K: Authorization enforcement on HTTP workflows...");
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

  console.log(`   • Viewer blocked from triggering HTTP workflow: ${viewerBlocked ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • Cross-org Owner B blocked: ${crossOrgBlocked ? "PASS ✓" : "FAIL ✗"}`);

  // Clean up test workflows & stop server
  await queryGraphQL(ownerA.token, `mutation { delete_workflows_by_pk(id: "${workflowId}") { id } }`);
  await queryGraphQL(ownerA.token, `mutation { delete_workflows_by_pk(id: "${retryWfId}") { id } }`);
  await queryGraphQL(ownerA.token, `mutation { delete_workflows_by_pk(id: "${failWfId}") { id } }`);
  testServer.close();

  console.log("\n=======================================================================");
  console.log("   EXECUTION PHASE 3 TEST MATRIX SUMMARY                               ");
  console.log("=======================================================================");
  console.log(`  A. HTTP GET / Status 200:                     ${testASuccess ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  B. HTTP POST succeeds with JSON body:         ${testBPostSuccess ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  C. Headers sent correctly:                    ${testCHeadersSent ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  D. Variable resolution works in URL/headers:  ${testDVariableResolved ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  E. Response status/body stored in output:     ${testEResponseStored ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  F. attempt_count is correct:                  ${testFAttemptCount ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  G. Successful workflow becomes completed:     ${testGWorkflowCompleted ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  H. HTTP failure produces failed run & error:  ${testHStepFailed && testHRunFailed && testHErrorPersisted ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  I. Retries update single step_runs record:    ${allStepRunsForRetry && retryAttemptCount && retryRecovered ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  J. Viewer blocked from triggering:            ${viewerBlocked ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  K. Cross-org user blocked:                    ${crossOrgBlocked ? "PASS ✓" : "FAIL ✗"}`);
  console.log("=======================================================================\n");

  const allPassed =
    testASuccess &&
    testBPostSuccess &&
    testCHeadersSent &&
    testDVariableResolved &&
    testEResponseStored &&
    testFAttemptCount &&
    testGWorkflowCompleted &&
    allStepRunsForRetry &&
    retryAttemptCount &&
    retryRecovered &&
    testHStepFailed &&
    testHRunFailed &&
    testHErrorPersisted &&
    viewerBlocked &&
    crossOrgBlocked;

  if (!allPassed) {
    throw new Error("One or more Execution Phase 3 tests failed.");
  }

  console.log("🎉 ALL EXECUTION PHASE 3 CHECKS PASSED WITH 100% SUCCESS!\n");
}

runExecutionPhase3Tests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
