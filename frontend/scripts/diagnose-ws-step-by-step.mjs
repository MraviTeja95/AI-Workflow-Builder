import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const authUrl = "https://zggynlwwpraxjmbawiym.auth.ap-southeast-1.nhost.run/v1";
const wsUrl = "wss://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";
const testWorkflowRunId = "cb2605ea-5a6a-4e67-ac28-d435426c4be8";

const SUBSCRIPTION_QUERY = `
  subscription WorkflowStepRuns($workflowRunId: uuid!) {
    step_runs(
      where: { workflow_run_id: { _eq: $workflowRunId } }
      order_by: { created_at: asc }
    ) {
      id
      workflow_run_id
      workflow_step_id
      status
      input
      output
      error
      attempt_count
      approved_by
      approved_at
      started_at
      finished_at
      created_at
    }
  }
`;

async function testScenario(name, token, variables) {
  console.log(`\n=======================================================================`);
  console.log(`▶ TEST SCENARIO: ${name}`);
  console.log(`  Token present: ${!!token} (length: ${token?.length || 0})`);
  console.log(`=======================================================================`);

  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl, "graphql-ws");
    const timeout = setTimeout(() => {
      console.log(`  [TIMEOUT] Closing connection after 5s`);
      ws.close();
      resolve({ status: "TIMEOUT" });
    }, 5000);

    ws.onopen = () => {
      console.log(`  • WS Open. ReadyState: ${ws.readyState}`);
      const initPayload = token
        ? { headers: { Authorization: `Bearer ${token}` } }
        : {};
      ws.send(JSON.stringify({ type: "connection_init", payload: initPayload }));
      console.log(`  • Sent connection_init (headers present: ${!!token})`);
    };

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      console.log(`  • Received WS msg: type='${msg.type}' id='${msg.id || "N/A"}'`);

      if (msg.type === "connection_ack") {
        console.log(`  • Acked! Sending start subscription with variables:`, JSON.stringify(variables));
        ws.send(
          JSON.stringify({
            id: "sub-test",
            type: "start",
            payload: {
              query: SUBSCRIPTION_QUERY,
              variables,
            },
          })
        );
      } else if (msg.type === "data") {
        const runs = msg.payload?.data?.step_runs;
        console.log(`  ✓ DATA RECEIVED: ${runs?.length} step_runs records`);
        clearTimeout(timeout);
        ws.send(JSON.stringify({ id: "sub-test", type: "stop" }));
        ws.close();
        resolve({ status: "SUCCESS", count: runs?.length });
      } else if (msg.type === "error" || msg.type === "connection_error") {
        console.log(`  ✗ ERROR RECEIVED:`, JSON.stringify(msg.payload));
        clearTimeout(timeout);
        ws.close();
        resolve({ status: "ERROR", error: msg.payload });
      }
    };

    ws.onerror = (err) => {
      console.log(`  ✗ WS Error:`, err);
    };

    ws.onclose = (evt) => {
      console.log(`  • WS Closed. Code: ${evt.code}, Reason: '${evt.reason}'`);
    };
  });
}

async function runAllDiagnostics() {
  // 1. Get real JWT for user A
  const signInRes = await fetch(`${authUrl}/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin.a.test@example.com", password: "SecurePassword123!" }),
  });
  const signInData = await signInRes.json();
  const tokenUserA = signInData.session?.accessToken;

  // Scenario 1: Authenticated User A with valid workflowRunId
  await testScenario("1. Authenticated User with valid workflowRunId", tokenUserA, { workflowRunId: testWorkflowRunId });

  // Scenario 2: Unauthenticated (token is null)
  await testScenario("2. Unauthenticated (no token sent in connection_init)", null, { workflowRunId: testWorkflowRunId });

  // Scenario 3: Authenticated User with null / invalid workflowRunId
  await testScenario("3. Authenticated User with null workflowRunId", tokenUserA, { workflowRunId: null });

  // Scenario 4: Authenticated User with empty string workflowRunId
  await testScenario("4. Authenticated User with empty string workflowRunId", tokenUserA, { workflowRunId: "" });
}

runAllDiagnostics().catch(console.error);
