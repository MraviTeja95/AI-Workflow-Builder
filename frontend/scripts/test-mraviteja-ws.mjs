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

async function testMraviteja() {
  console.log("=======================================================================");
  console.log("   TESTING SUBSCRIPTION WITH MRAVITEJA JWT                             ");
  console.log("=======================================================================\n");

  // Sign in as mraviteja876@gmail.com
  const signInRes = await fetch(`${authUrl}/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "mraviteja876@gmail.com", password: "SecurePassword123!" }),
  });
  const signInData = await signInRes.json();
  const token = signInData.session?.accessToken;

  console.log("• Token acquired for mraviteja876@gmail.com:", !!token);

  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl, "graphql-ws");
    const timeout = setTimeout(() => {
      console.log(`[TIMEOUT] Closing connection`);
      ws.close();
      resolve(false);
    }, 6000);

    ws.onopen = () => {
      console.log("• WS Open. Sending connection_init with Bearer token...");
      ws.send(JSON.stringify({
        type: "connection_init",
        payload: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }));
    };

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      console.log(`• Received WS message: type='${msg.type}' id='${msg.id || "N/A"}'`);

      if (msg.type === "connection_ack") {
        console.log("• Connection ACK! Sending subscription for run:", testWorkflowRunId);
        ws.send(JSON.stringify({
          id: "sub-1",
          type: "start",
          payload: {
            query: SUBSCRIPTION_QUERY,
            variables: { workflowRunId: testWorkflowRunId },
          },
        }));
      } else if (msg.type === "data") {
        const stepRuns = msg.payload?.data?.step_runs;
        console.log(`✓ DATA RECEIVED! Records count: ${stepRuns?.length}`);
        console.log("  Step runs:", JSON.stringify(stepRuns, null, 2));
        clearTimeout(timeout);
        ws.send(JSON.stringify({ id: "sub-1", type: "stop" }));
        ws.close();
        resolve(true);
      } else if (msg.type === "error" || msg.type === "connection_error") {
        console.error("✗ Subscription error payload:", JSON.stringify(msg.payload));
        clearTimeout(timeout);
        ws.close();
        resolve(false);
      }
    };

    ws.onerror = (err) => {
      console.error("✗ WS error event:", err);
    };
  });
}

testMraviteja().catch(console.error);
