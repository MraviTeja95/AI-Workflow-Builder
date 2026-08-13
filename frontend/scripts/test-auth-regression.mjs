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

const env = loadEnv();
const authUrl = "https://zggynlwwpraxjmbawiym.auth.ap-southeast-1.nhost.run/v1";
const wsUrl = "wss://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";

const ORG_A_WORKFLOW_ID = "ef7b923d-1419-4c7e-932d-0e5c78cf4303";

async function loginUser(email, password) {
  const res = await fetch(`${authUrl}/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return {
    token: data.session?.accessToken,
    userId: data.session?.user?.id,
  };
}

async function runRegressionSuite() {
  console.log("=======================================================================");
  console.log("   AUTHENTICATION REGRESSION & TENANT ISOLATION SUITE                 ");
  console.log("=======================================================================\n");

  // 1. Logged-out user (no Authorization header) attempts to GET protected workflow
  console.log("▶ Test 1: Logged-out user attempts to GET protected workflow...");
  const loggedOutRes = await fetch(`http://localhost:3000/api/workflows/${ORG_A_WORKFLOW_ID}`);
  const loggedOutData = await loggedOutRes.json();
  const test1Passed = loggedOutRes.status === 401;
  console.log(`  -> Status: ${loggedOutRes.status} (Expected: 401) | Result: ${test1Passed ? "PASS" : "FAIL"}`);
  console.log(`  -> Message: ${loggedOutData.error}`);

  // 2. Log in as Org A user (Owner)
  console.log("\n▶ Logging in as Org A User (Owner)...");
  const userA = await loginUser("admin.a.test@example.com", "SecurePassword123!");
  console.log(`  -> Authenticated User ID: ${userA.userId}`);
  console.log(`  -> Access Token available: ${Boolean(userA.token)} (length: ${userA.token?.length})`);

  // 3. Logged-in Org A user loads their own workflow
  console.log("\n▶ Test 2: Logged-in Org A user loads their own workflow with Bearer token...");
  const orgAGetRes = await fetch(`http://localhost:3000/api/workflows/${ORG_A_WORKFLOW_ID}`, {
    headers: {
      Authorization: `Bearer ${userA.token}`,
    },
  });
  const orgAGetData = await orgAGetRes.json();
  const test2Passed = orgAGetRes.status === 200 && orgAGetData.workflow?.id === ORG_A_WORKFLOW_ID;
  console.log(`  -> Status: ${orgAGetRes.status} (Expected: 200) | Result: ${test2Passed ? "PASS" : "FAIL"}`);
  console.log(`  -> Loaded Workflow Name: "${orgAGetData.workflow?.name}", Nodes: ${orgAGetData.nodes?.length}`);

  // 4. Log in as Org B user (Owner B)
  console.log("\n▶ Logging in as Org B User (Owner B)...");
  const userB = await loginUser("owner.b.isolation.test@example.com", "SecurePassword123!");
  console.log(`  -> Authenticated User ID: ${userB.userId}`);

  // 5. Org B user attempts to load Org A workflow by ID
  console.log("\n▶ Test 3: Org B user attempts to load Org A workflow by ID...");
  const orgBGetRes = await fetch(`http://localhost:3000/api/workflows/${ORG_A_WORKFLOW_ID}`, {
    headers: {
      Authorization: `Bearer ${userB.token}`,
    },
  });
  const orgBGetData = await orgBGetRes.json();
  const test3Passed = orgBGetRes.status === 403;
  console.log(`  -> Status: ${orgBGetRes.status} (Expected: 403) | Result: ${test3Passed ? "PASS" : "FAIL"}`);
  console.log(`  -> Error Message: ${orgBGetData.error}`);

  // 6. Verify workflow execution still works
  console.log("\n▶ Test 4: Trigger workflow execution with live execution engine...");
  const triggerRes = await fetch("http://localhost:3000/api/actions/trigger-workflow-run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userA.token}`,
    },
    body: JSON.stringify({
      action: { name: "triggerWorkflowRun" },
      input: { workflow_id: ORG_A_WORKFLOW_ID },
      session_variables: {
        "x-hasura-user-id": userA.userId,
        "x-hasura-role": "owner",
      },
    }),
  });
  const triggerData = await triggerRes.json();
  const test4Passed = triggerRes.status === 200 && triggerData.status === "paused";
  console.log(`  -> Status: ${triggerRes.status}, Workflow Run Status: ${triggerData.status} | Result: ${test4Passed ? "PASS" : "FAIL"}`);
  console.log(`  -> Run ID: ${triggerData.workflow_run_id}, Message: ${triggerData.message}`);

  // 7. Verify live GraphQL WebSocket subscription receives step_runs
  console.log("\n▶ Test 5: Verify Live GraphQL WebSocket subscription...");
  let wsReceived = false;

  await new Promise((resolve) => {
    const ws = new WebSocket(wsUrl, "graphql-ws");
    const timeout = setTimeout(() => {
      ws.close();
      resolve();
    }, 6000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "connection_init",
        payload: {
          headers: {
            Authorization: `Bearer ${userA.token}`,
          },
        },
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "connection_ack") {
        ws.send(JSON.stringify({
          id: "1",
          type: "start",
          payload: {
            query: `
              subscription OnStepRunsChange($runId: uuid!) {
                step_runs(where: { workflow_run_id: { _eq: $runId } }) {
                  id
                  status
                  workflow_step_id
                }
              }
            `,
            variables: { runId: triggerData.workflow_run_id },
          },
        }));
      } else if (msg.type === "data") {
        const stepRuns = msg.payload?.data?.step_runs || [];
        if (stepRuns.length > 0) {
          wsReceived = true;
          console.log(`  -> Live WebSocket received ${stepRuns.length} step_runs!`);
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      }
    };

    ws.onerror = (err) => {
      console.error("  -> WS Error:", err.message);
      clearTimeout(timeout);
      ws.close();
      resolve();
    };
  });

  console.log(`  -> Subscription Result: ${wsReceived ? "PASS" : "FAIL"}`);

  console.log("\n=======================================================================");
  const allPassed = test1Passed && test2Passed && test3Passed && test4Passed && wsReceived;
  console.log(`SUMMARY: ${allPassed ? "🎉 ALL 5 AUTH REGRESSION TESTS 100% PASSED!" : "❌ SOME TESTS FAILED"}`);
  console.log("=======================================================================\n");

  if (!allPassed) process.exit(1);
}

runRegressionSuite().catch((e) => {
  console.error(e);
  process.exit(1);
});
