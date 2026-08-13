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
const graphqlUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";
const wsUrl = "wss://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

const ORG_A_ID = "0101ca0e-6bab-4154-9cfc-d4b581ad3554";
const OWNER_A_ID = "fb336480-d1b5-4c6b-8d6d-8cd6015e9713";
const EDITOR_A_ID = "169b1b47-7c24-4a54-b60c-e22f04c4cd75";
const VIEWER_A_ID = "440246b1-84ce-4e04-844f-3851af26c3b8";
const OWNER_B_ID = "f6ed3f26-2ecc-4129-ad29-ff7f04949fdf";

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

async function executeAdminGraphQL(query, variables = {}) {
  const res = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": adminSecret,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function runApprovalGateE2ETest() {
  console.log("=======================================================================");
  console.log("   APPROVAL GATE & RESUME FLOW END-TO-END TEST & SECURITY SUITE        ");
  console.log("=======================================================================\n");

  // 1. Authenticate Editor User for live stream
  const signInRes = await fetch(`${authUrl}/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin.a.test@example.com", password: "SecurePassword123!" }),
  });
  const signInData = await signInRes.json();
  const token = signInData.session?.accessToken;

  // 2. Create Workflow: Trigger -> AI Agent -> Approval Gate -> HTTP Request
  console.log("1. Setting up Test Workflow: Trigger -> AI Agent -> Approval Gate -> HTTP Request");
  const wfRes = await executeAdminGraphQL(`
    mutation CreateApprovalWorkflow($orgId: uuid!) {
      insert_workflows_one(object: {
        org_id: $orgId
        name: "E2E Approval Gate Test Workflow"
        description: "Test pause, approval authorization, and resume"
        created_by: "${EDITOR_A_ID}"
      }) {
        id
      }
    }
  `, { orgId: ORG_A_ID });

  const wfId = wfRes.data.insert_workflows_one.id;
  console.log(`• Workflow created: ${wfId}`);

  await executeAdminGraphQL(`
    mutation SyncApprovalSteps($wfId: uuid!) {
      insert_workflow_steps(objects: [
        {
          workflow_id: $wfId
          name: "AI Analysis Agent"
          type: "llm_call"
          position: 0
          config: {
            client_node_id: "ai-node-1"
            aiAgent: {
              model: "gemini-3.5-flash"
              systemPrompt: "You are a financial analyst. Process incoming data."
              userPrompt: "Analyze the Q3 invoice #9812 for approval."
              temperature: 0.2
              maxTokens: 60
            }
            connections: [{ target_node_id: "gate-node-2", source_handle: "source", target_handle: "target" }]
          }
        },
        {
          workflow_id: $wfId
          name: "Manager Approval Gate"
          type: "approval_gate"
          position: 1
          config: {
            client_node_id: "gate-node-2"
            approvalGate: {
              message: "Please review and approve the Q3 invoice processing."
              requiredRole: "Editor"
              timeoutHours: 24
            }
            connections: [{ target_node_id: "http-node-3", source_handle: "source", target_handle: "target" }]
          }
        },
        {
          workflow_id: $wfId
          name: "Post-Approval HTTP Dispatch"
          type: "http_request"
          position: 2
          config: {
            client_node_id: "http-node-3"
            httpRequest: {
              method: "GET"
              url: "http://localhost:3000/api/test-http-target?stage=post_approval"
            }
            connections: []
          }
        }
      ]) {
        affected_rows
      }
    }
  `, { wfId });

  console.log("• Workflow steps registered.");

  // -------------------------------------------------------------------------
  // PHASE 1: TRIGGER WORKFLOW & VERIFY PAUSE AT APPROVAL GATE
  // -------------------------------------------------------------------------
  console.log("\n-----------------------------------------------------------------------");
  console.log("▶ PHASE 1: Trigger Workflow -> Execution Must Pause at Approval Gate");
  console.log("-----------------------------------------------------------------------");

  const triggerRes = await fetch("http://localhost:3000/api/actions/trigger-workflow-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: { name: "triggerWorkflowRun" },
      input: { workflow_id: wfId, trigger_type: "manual" },
      session_variables: { "x-hasura-user-id": EDITOR_A_ID, "x-hasura-role": "editor" },
    }),
  }).then((r) => r.json());

  console.log("• Trigger response:", triggerRes);
  const runId = triggerRes.workflow_run_id;

  if (triggerRes.status !== "paused") {
    throw new Error(`Expected status 'paused' but received '${triggerRes.status}'`);
  }
  console.log("✓ Workflow correctly returned status: 'paused'");

  // Check DB state after Phase 1
  const dbCheck1 = await executeAdminGraphQL(`
    query CheckPhase1($runId: uuid!) {
      workflow_runs_by_pk(id: $runId) {
        status
        error
        finished_at
      }
      step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { started_at: asc }) {
        id
        workflow_step_id
        status
        output
        attempt_count
        approved_by
        approved_at
        workflow_step {
          name
          type
        }
      }
    }
  `, { runId });

  const run1 = dbCheck1.data.workflow_runs_by_pk;
  const steps1 = dbCheck1.data.step_runs;

  console.log(`• DB workflow_run status: ${run1.status} (finished_at: ${run1.finished_at})`);
  console.log("• DB Step Runs in Phase 1:");
  for (const sr of steps1) {
    console.log(`   - [${sr.status.toUpperCase()}] ${sr.workflow_step?.name} (${sr.workflow_step?.type})`);
  }

  if (run1.status !== "paused") throw new Error("DB workflow_run is not paused");
  if (steps1.length !== 2) throw new Error(`Expected 2 steps (AI Agent, Gate) but got ${steps1.length}`);
  if (steps1[0].status !== "completed") throw new Error("AI Agent step is not completed");
  if (steps1[1].status !== "paused") throw new Error("Approval Gate step is not paused");
  console.log("✓ Verified: Step 1 (AI Agent) is COMPLETED, Step 2 (Gate) is PAUSED, Step 3 (HTTP) NOT executed yet!");

  // -------------------------------------------------------------------------
  // PHASE 2: SECURITY AUTHORIZATION TESTS
  // -------------------------------------------------------------------------
  console.log("\n-----------------------------------------------------------------------");
  console.log("▶ PHASE 2: Security & Authorization Test Matrix");
  console.log("-----------------------------------------------------------------------");

  // Test C: Viewer of same org -> FORBIDDEN (403)
  console.log("• Test C: Viewer of same organization attempts approval...");
  const viewerRes = await fetch("http://localhost:3000/api/actions/approve-step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: { name: "approveStep" },
      input: { workflow_run_id: runId },
      session_variables: { "x-hasura-user-id": VIEWER_A_ID, "x-hasura-role": "viewer" },
    }),
  });
  const viewerData = await viewerRes.json();
  console.log(`  -> HTTP Status: ${viewerRes.status} | Response:`, viewerData);
  if (viewerRes.status !== 403) throw new Error("Viewer was not rejected with 403 Forbidden");
  console.log("  ✓ Test C PASSED: Viewer correctly rejected with 403 Forbidden.");

  // Test D: Owner of another org (Org B) -> FORBIDDEN (403)
  console.log("\n• Test D: Cross-organization user (Org B Owner) attempts approval...");
  const crossOrgRes = await fetch("http://localhost:3000/api/actions/approve-step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: { name: "approveStep" },
      input: { workflow_run_id: runId },
      session_variables: { "x-hasura-user-id": OWNER_B_ID, "x-hasura-role": "owner" },
    }),
  });
  const crossOrgData = await crossOrgRes.json();
  console.log(`  -> HTTP Status: ${crossOrgRes.status} | Response:`, crossOrgData);
  if (crossOrgRes.status !== 403) throw new Error("Cross-org user was not rejected with 403 Forbidden");
  console.log("  ✓ Test D PASSED: Cross-org user correctly rejected with 403 Forbidden.");

  // Test G: Invalid workflow_run_id -> NOT_FOUND (404/403)
  console.log("\n• Test G: Invalid workflow_run_id attempts approval...");
  const invalidRes = await fetch("http://localhost:3000/api/actions/approve-step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: { name: "approveStep" },
      input: { workflow_run_id: "00000000-0000-0000-0000-000000000000" },
      session_variables: { "x-hasura-user-id": EDITOR_A_ID, "x-hasura-role": "editor" },
    }),
  });
  const invalidData = await invalidRes.json();
  console.log(`  -> HTTP Status: ${invalidRes.status} | Response:`, invalidData);
  if (invalidRes.status < 400) throw new Error("Invalid run ID did not error");
  console.log("  ✓ Test G PASSED: Invalid workflow_run_id rejected safely.");

  // -------------------------------------------------------------------------
  // PHASE 3: AUTHORIZED RESUME (EDITOR APPROVAL)
  // -------------------------------------------------------------------------
  console.log("\n-----------------------------------------------------------------------");
  console.log("▶ PHASE 3: Authorized Approval (Test B - Editor of Same Org)");
  console.log("-----------------------------------------------------------------------");

  console.log(`• Approving workflow run as Editor (${EDITOR_A_ID})...`);
  const approveRes = await fetch("http://localhost:3000/api/actions/approve-step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: { name: "approveStep" },
      input: { workflow_run_id: runId },
      session_variables: { "x-hasura-user-id": EDITOR_A_ID, "x-hasura-role": "editor" },
    }),
  });
  const approveData = await approveRes.json();
  console.log(`• HTTP Status: ${approveRes.status} | Approve Response:`, approveData);

  if (approveRes.status !== 200 || approveData.status !== "completed") {
    throw new Error("Approval resume did not complete successfully");
  }
  console.log("✓ Test B PASSED: Editor approval resumed workflow to completion!");

  // Verify DB state after Phase 3
  const dbCheck2 = await executeAdminGraphQL(`
    query CheckPhase3($runId: uuid!) {
      workflow_runs_by_pk(id: $runId) {
        status
        error
        finished_at
      }
      step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { started_at: asc }) {
        id
        workflow_step_id
        status
        output
        attempt_count
        approved_by
        approved_at
        finished_at
        workflow_step {
          name
          type
        }
      }
    }
  `, { runId });

  const run2 = dbCheck2.data.workflow_runs_by_pk;
  const steps2 = dbCheck2.data.step_runs;

  console.log(`\n• DB workflow_run status: ${run2.status} (finished_at: ${run2.finished_at})`);
  console.log("• DB Step Runs after Resume:");
  for (const sr of steps2) {
    console.log(`   - [${sr.status.toUpperCase()}] ${sr.workflow_step?.name} (${sr.workflow_step?.type})`);
    if (sr.workflow_step?.type === "approval_gate") {
      console.log(`     approved_by: ${sr.approved_by}`);
      console.log(`     approved_at: ${sr.approved_at}`);
    }
  }

  if (run2.status !== "completed") throw new Error("Workflow run is not completed");
  if (steps2.length !== 3) throw new Error(`Expected 3 steps, found ${steps2.length}`);
  if (steps2[1].status !== "completed") throw new Error("Approval gate is not completed");
  if (!steps2[1].approved_by) throw new Error("approved_by is null");
  if (!steps2[1].approved_at) throw new Error("approved_at is null");
  if (steps2[2].status !== "completed") throw new Error("Post-approval HTTP step is not completed");
  console.log("✓ Database verified: running -> paused -> running -> completed, approved_by and approved_at populated!");

  // -------------------------------------------------------------------------
  // PHASE 4: DUPLICATE & INVALID STATE APPROVAL TESTS
  // -------------------------------------------------------------------------
  console.log("\n-----------------------------------------------------------------------");
  console.log("▶ PHASE 4: Duplicate & Non-Paused Approval Prevention Tests");
  console.log("-----------------------------------------------------------------------");

  // Test E & F: Repeated approval on already completed run
  console.log("• Test E/F: Repeated approval on completed run...");
  const dupRes = await fetch("http://localhost:3000/api/actions/approve-step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: { name: "approveStep" },
      input: { workflow_run_id: runId },
      session_variables: { "x-hasura-user-id": EDITOR_A_ID, "x-hasura-role": "editor" },
    }),
  });
  const dupData = await dupRes.json();
  console.log(`  -> HTTP Status: ${dupRes.status} | Response:`, dupData);
  if (dupRes.status !== 400) throw new Error("Duplicate approval was not rejected with 400 Bad Request");
  console.log("  ✓ Test E/F PASSED: Duplicate approval safely rejected with 400 Bad Request.");

  // -------------------------------------------------------------------------
  // PHASE 5: TEST A (OWNER OF SAME ORG APPROVAL)
  // -------------------------------------------------------------------------
  console.log("\n-----------------------------------------------------------------------");
  console.log("▶ PHASE 5: Test A - Owner Approval");
  console.log("-----------------------------------------------------------------------");
  await new Promise((r) => setTimeout(r, 8000));

  // Trigger Run 2 on the same workflow
  const trigger2Res = await fetch("http://localhost:3000/api/actions/trigger-workflow-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: { name: "triggerWorkflowRun" },
      input: { workflow_id: wfId, trigger_type: "manual" },
      session_variables: { "x-hasura-user-id": OWNER_A_ID, "x-hasura-role": "owner" },
    }),
  }).then((r) => r.json());

  const run2Id = trigger2Res.workflow_run_id;
  console.log(`• Workflow Run 2 triggered (ID: ${run2Id}), status: ${trigger2Res.status}`);

  // Approve as Owner
  console.log(`• Approving Run 2 as Owner (${OWNER_A_ID})...`);
  const ownerApproveRes = await fetch("http://localhost:3000/api/actions/approve-step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: { name: "approveStep" },
      input: { workflow_run_id: run2Id },
      session_variables: { "x-hasura-user-id": OWNER_A_ID, "x-hasura-role": "owner" },
    }),
  });
  const ownerApproveData = await ownerApproveRes.json();
  console.log(`• HTTP Status: ${ownerApproveRes.status} | Owner Approve Response:`, ownerApproveData);
  if (ownerApproveRes.status !== 200 || ownerApproveData.status !== "completed") {
    throw new Error("Owner approval resume failed");
  }
  console.log("  ✓ Test A PASSED: Owner approval succeeded and workflow completed!");

  // -------------------------------------------------------------------------
  // PHASE 6: LIVE GRAPHQL WEBSOCKET STREAM VERIFICATION
  // -------------------------------------------------------------------------
  console.log("\n-----------------------------------------------------------------------");
  console.log("▶ PHASE 6: Live WebSocket Subscription Verification");
  console.log("-----------------------------------------------------------------------");

  await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, "graphql-ws");
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("WS timeout"));
    }, 6000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "connection_init",
        payload: { headers: { Authorization: `Bearer ${token}` } },
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "connection_ack") {
        ws.send(JSON.stringify({
          id: "sub-test-approval",
          type: "start",
          payload: { query: SUBSCRIPTION_QUERY, variables: { workflowRunId: runId } },
        }));
      } else if (msg.type === "data") {
        const liveRuns = msg.payload?.data?.step_runs;
        console.log(`✓ Live GraphQL Subscription Streamed ${liveRuns?.length} step_runs for Run 1!`);
        for (const sr of liveRuns || []) {
          console.log(`   • Step Run ID: ${sr.id} | Status: ${sr.status} | Approved By: ${sr.approved_by || "none"} | Approved At: ${sr.approved_at || "none"}`);
        }
        clearTimeout(timeout);
        ws.send(JSON.stringify({ id: "sub-test-approval", type: "stop" }));
        ws.close();
        resolve(true);
      }
    };
  });
}

runApprovalGateE2ETest()
  .then(() => {
    console.log("\n=======================================================================");
    console.log("🎉 ALL APPROVAL GATE & SECURITY TESTS 100% PASSED!");
    console.log("=======================================================================\n");
  })
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
