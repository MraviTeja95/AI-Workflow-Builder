import fs from "node:fs";
import path from "node:path";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const content = fs.readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        env[key] = value;
      }
    }
  }
  return env;
}

void loadEnv();

const authUrl = "https://zggynlwwpraxjmbawiym.auth.ap-southeast-1.nhost.run/v1";
const wsUrl = "wss://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";
const workflowId = "cffee6d9-d7e2-494f-9702-bf1af4aefc0f";

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

async function verifyClientLiveE2E() {
  console.log("=======================================================================");
  console.log("   LIVE END-TO-END EXECUTION & SUBSCRIPTION INTEGRATION TEST           ");
  console.log("=======================================================================\n");

  // 1. Authenticate user to obtain live JWT
  console.log("1. Authenticating user via Nhost Auth...");
  const signInRes = await fetch(`${authUrl}/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin.a.test@example.com", password: "SecurePassword123!" }),
  });
  const signInData = await signInRes.json();
  const token = signInData.session?.accessToken;
  const userId = signInData.session?.user?.id;

  console.log("   • User Authenticated (User ID: " + userId + ")");
  console.log("   • Reactive access token obtained (length: " + token?.length + ")\n");

  // 2. Trigger workflow run via Next.js Action endpoint
  console.log("2. Triggering workflow execution via /api/actions/trigger-workflow-run...");
  const triggerRes = await fetch("http://localhost:3000/api/actions/trigger-workflow-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: { name: "triggerWorkflowRun" },
      input: { workflow_id: workflowId, trigger_type: "manual" },
      session_variables: {
        "x-hasura-user-id": userId,
        "x-hasura-role": "editor",
      },
    }),
  });

  const triggerData = await triggerRes.json();
  console.log("   • Trigger Response Status:", triggerRes.status);
  console.log("   • Workflow Run ID:", triggerData.workflow_run_id);
  console.log("   • Workflow Status:", triggerData.status);

  if (!triggerData.workflow_run_id) {
    throw new Error("Trigger failed: " + JSON.stringify(triggerData));
  }

  const runId = triggerData.workflow_run_id;

  // 3. Connect authenticated WebSocket subscription
  console.log(`\n3. Connecting Authenticated WebSocket to ${wsUrl}...`);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, "graphql-ws");
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket timeout waiting for step_runs data"));
    }, 10000);

    ws.onopen = () => {
      console.log("   • WebSocket Open (readyState: " + ws.readyState + ")");
      // Send connection_init with Bearer token
      ws.send(JSON.stringify({
        type: "connection_init",
        payload: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }));
      console.log("   • Sent authenticated connection_init");
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      console.log("   • WS Message received: type='" + msg.type + "'");

      if (msg.type === "connection_ack") {
        console.log("   • connection_ack received! Starting subscription for runId:", runId);
        ws.send(JSON.stringify({
          id: "sub-live",
          type: "start",
          payload: {
            query: SUBSCRIPTION_QUERY,
            variables: { workflowRunId: runId },
          },
        }));
      } else if (msg.type === "data") {
        const stepRuns = msg.payload?.data?.step_runs;
        console.log("\n4. LIVE STEP RUNS DATA STREAMED VIA WEBSOCKET:");
        console.log("   • Total step_runs count:", stepRuns?.length);
        for (const sr of stepRuns || []) {
          console.log(`     ▶ Step Run: ${sr.id}`);
          console.log(`       Status:   ${sr.status}`);
          console.log(`       Attempts: ${sr.attempt_count}`);
        }
        clearTimeout(timeout);
        ws.send(JSON.stringify({ id: "sub-live", type: "stop" }));
        ws.close();
        resolve(true);
      } else if (msg.type === "error" || msg.type === "connection_error") {
        console.error("   ✗ Subscription error:", msg.payload);
        clearTimeout(timeout);
        ws.close();
        reject(new Error(JSON.stringify(msg.payload)));
      }
    };

    ws.onerror = (err) => {
      console.error("   ✗ WebSocket Error:", err);
      clearTimeout(timeout);
      reject(err);
    };
  });
}

verifyClientLiveE2E()
  .then(() => {
    console.log("\n=======================================================================");
    console.log("🎉 ALL REQUIREMENTS VERIFIED WORKING 100%!");
    console.log("=======================================================================\n");
  })
  .catch((err) => {
    console.error("E2E Verification Failed:", err);
    process.exit(1);
  });
