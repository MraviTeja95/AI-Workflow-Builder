import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const authUrl = "https://zggynlwwpraxjmbawiym.auth.ap-southeast-1.nhost.run/v1";
const wsUrl = "wss://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";
const testWorkflowRunId = "9a32c97a-3157-4a92-b771-26f5d7a18a4a";

const EXACT_SUBSCRIPTION_QUERY = `
subscription WorkflowStepRuns($workflowRunId: uuid!) {
  step_runs(
    where: {
      workflow_run_id: {
        _eq: $workflowRunId
      }
    }
    order_by: {
      created_at: asc
    }
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

async function testExactSubscription() {
  console.log("=======================================================================");
  console.log("   TESTING SUBSCRIPTION WITH RUN ID: 9a32c97a-3157-4a92-b771-26f5d7a18a4a");
  console.log("=======================================================================\n");

  const signInRes = await fetch(`${authUrl}/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin.a.test@example.com", password: "SecurePassword123!" }),
  });
  const signInData = await signInRes.json();
  const token = signInData.session?.accessToken;

  console.log("1. User Authenticated (Token length: " + token?.length + ")");

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, "graphql-ws");
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Timeout"));
    }, 6000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "connection_init",
        payload: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "connection_ack") {
        ws.send(JSON.stringify({
          id: "step-runs-sub-1",
          type: "start",
          payload: {
            query: EXACT_SUBSCRIPTION_QUERY,
            variables: { workflowRunId: testWorkflowRunId },
          },
        }));
      } else if (msg.type === "data") {
        const stepRuns = msg.payload?.data?.step_runs;
        console.log(`\n2. Subscription Data Received Successfully!`);
        console.log(`   • step_runs records received: ${stepRuns?.length}`);
        for (const sr of stepRuns || []) {
          console.log(`     - Step Run ID: ${sr.id}`);
          console.log(`       Step ID:     ${sr.workflow_step_id}`);
          console.log(`       Status:      ${sr.status}`);
          console.log(`       Attempts:    ${sr.attempt_count}`);
        }
        clearTimeout(timeout);
        ws.send(JSON.stringify({ id: "step-runs-sub-1", type: "stop" }));
        ws.close();
        resolve(true);
      } else if (msg.type === "error" || msg.type === "connection_error") {
        clearTimeout(timeout);
        ws.close();
        reject(new Error(JSON.stringify(msg.payload)));
      }
    };
  });
}

testExactSubscription().catch(console.error);
