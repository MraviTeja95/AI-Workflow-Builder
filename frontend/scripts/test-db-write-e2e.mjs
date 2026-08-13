import fs from "node:fs";
import path from "node:path";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    const env = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        let v = trimmed.slice(idx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        env[k] = v;
      }
    }
    return env;
  }
  return process.env;
}

const env = loadEnv();
const HASURA_ENDPOINT =
  env.HASURA_GRAPHQL_ENDPOINT ||
  "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";
const ADMIN_SECRET = env.HASURA_GRAPHQL_ADMIN_SECRET;
const SQL_URL = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v2/query";
const NHOST_AUTH_URL = `https://${env.NHOST_SUBDOMAIN || "zggynlwwpraxjmbawiym"}.auth.${env.NHOST_REGION || "ap-southeast-1"}.nhost.run/v1`;
const HASURA_WS_URL =
  `wss://${env.NHOST_SUBDOMAIN || "zggynlwwpraxjmbawiym"}.hasura.${env.NHOST_REGION || "ap-southeast-1"}.nhost.run/v1/graphql`;
const APP_URL = "http://localhost:3000";

async function queryGraphQLAdmin(query, variables = {}) {
  const res = await fetch(HASURA_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function runSql(sql) {
  const res = await fetch(SQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": ADMIN_SECRET,
    },
    body: JSON.stringify({
      type: "run_sql",
      args: { source: "default", sql },
    }),
  });
  return res.json();
}

async function loginUser(email, password) {
  const res = await fetch(`${NHOST_AUTH_URL}/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.session?.accessToken) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);
  }
  return {
    token: data.session.accessToken,
    user: data.session.user,
  };
}

async function runDbWriteTests() {
  console.log("=======================================================================");
  console.log("   PHASE 3A: db_write STEP E2E TEST & SECURITY VERIFICATION SUITE       ");
  console.log("=======================================================================\n");

  // 1. Authenticate Users
  console.log("▶ 1. Authenticating Test Users...");
  const ownerAuth = await loginUser("admin.a.test@example.com", "SecurePassword123!");
  const OWNER_A_ID = "fb336480-d1b5-4c6b-8d6d-8cd6015e9713";
  const EDITOR_A_ID = "169b1b47-7c24-4a54-b60c-e22f04c4cd75";
  const VIEWER_A_ID = "440246b1-84ce-4e04-844f-3851af26c3b8";
  const OWNER_B_ID = "f6ed3f26-2ecc-4129-ad29-ff7f04949fdf";
  console.log(`  ✓ Auth Token Acquired (User: ${ownerAuth.user.id})`);

  const ownerHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ownerAuth.token}`,
    "x-hasura-user-id": OWNER_A_ID,
  };

  const editorHeaders = {
    "Content-Type": "application/json",
    "x-hasura-user-id": EDITOR_A_ID,
  };

  const viewerHeaders = {
    "Content-Type": "application/json",
    "x-hasura-user-id": VIEWER_A_ID,
  };

  const ownerBHeaders = {
    "Content-Type": "application/json",
    "x-hasura-user-id": OWNER_B_ID,
  };

  const ORG_A_ID = "0101ca0e-6bab-4154-9cfc-d4b581ad3554";
  const orgId = ORG_A_ID;
  console.log(`  ✓ Organization Resolved: ${orgId}`);

  // Create clean test table in database
  console.log("\n▶ 2. Ensuring test table 'test_audit_records' exists...");
  await runSql(`
    CREATE TABLE IF NOT EXISTS public.test_audit_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL,
      event_type text NOT NULL,
      payload jsonb,
      status text DEFAULT 'pending',
      created_at timestamptz DEFAULT NOW()
    );
  `);
  console.log("  ✓ Table 'test_audit_records' ready.");

  // Clear previous test records
  await runSql(`DELETE FROM public.test_audit_records WHERE org_id = '${orgId}';`);

  let passedTests = 0;
  let totalTests = 0;

  function assertTest(name, condition, details = "") {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✓ ${name} | PASS ${details ? `(${details})` : ""}`);
    } else {
      console.error(`  ❌ ${name} | FAIL ${details ? `(${details})` : ""}`);
    }
  }

  // -------------------------------------------------------------------
  // TEST 1: Owner Creates Workflow with db_write Step
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 1: Owner creates and saves workflow with db_write step");
  const createWfRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "Owner DB Write Workflow",
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: {
            label: "Trigger",
            nodeType: "trigger",
            config: { trigger: { triggerType: "Manual" } },
          },
        },
        {
          id: "db-1",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: {
            label: "DB Insert Audit Record",
            nodeType: "database",
            config: {
              database: {
                operation: "INSERT",
                tableName: "test_audit_records",
                query: `INSERT INTO public.test_audit_records (org_id, event_type, payload, status) VALUES ('${orgId}', 'user_action', '{"source": "manual_test"}', 'active') RETURNING *;`,
              },
            },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "db-1" }],
    }),
  });

  const createWfData = await createWfRes.json();
  const dbWfId = createWfData.workflow?.id;
  assertTest("Owner successfully saved workflow with db_write", createWfRes.status === 200 && !!dbWfId, `Status: ${createWfRes.status}`);

  // -------------------------------------------------------------------
  // TEST 2: Execute db_write Workflow & Verify Database Record
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 2: Execute db_write workflow and verify PostgreSQL record");
  const runRes = await fetch(`${APP_URL}/api/actions/trigger-workflow-run`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      input: { workflow_id: dbWfId },
    }),
  });

  const runData = await runRes.json();
  const runId = runData.workflow_run_id;
  assertTest("Workflow run started and completed", runRes.status === 200 && runData.status === "completed", `Status: ${runData.status}`);

  // Check database table for the inserted record
  const dbCheckRes = await runSql(`SELECT * FROM public.test_audit_records WHERE org_id = '${orgId}' AND event_type = 'user_action';`);
  const insertedRows = dbCheckRes?.result?.slice(1) || [];
  assertTest("Database record physically inserted into test_audit_records", insertedRows.length > 0, `Rows found: ${insertedRows.length}`);

  // -------------------------------------------------------------------
  // TEST 3: db_write with Workflow Variable Interpolation
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 3: db_write step with variable resolution from previous step");
  const varWfRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "Variable Interpolation DB Write",
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: {
            label: "Trigger",
            nodeType: "trigger",
            config: { trigger: { triggerType: "Manual" } },
          },
        },
        {
          id: "http-1",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: {
            label: "Fetch Payload",
            nodeType: "http_request",
            config: {
              httpRequest: {
                method: "GET",
                url: "http://localhost:3000/api/test-http-target?q=order_created",
                headers: '{"Content-Type": "application/json"}',
                body: "",
              },
            },
          },
        },
        {
          id: "db-1",
          type: "workflowNode",
          position: { x: 500, y: 100 },
          data: {
            label: "Persist Resolved Record",
            nodeType: "database",
            config: {
              database: {
                operation: "INSERT",
                tableName: "test_audit_records",
                query: `INSERT INTO public.test_audit_records (org_id, event_type, payload, status) VALUES ('${orgId}', '{{steps.Fetch Payload.data.queryParam}}', '{"method": "{{steps.Fetch Payload.data.method}}"}', 'verified') RETURNING *;`,
              },
            },
          },
        },
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "http-1" },
        { id: "e2", source: "http-1", target: "db-1" },
      ],
    }),
  });

  const varWfData = await varWfRes.json();
  const varWfId = varWfData.workflow?.id;

  const runVarRes = await fetch(`${APP_URL}/api/actions/trigger-workflow-run`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      input: { workflow_id: varWfId },
    }),
  });

  const runVarData = await runVarRes.json();
  assertTest("Variable interpolation workflow completed", runVarRes.status === 200 && runVarData.status === "completed", `Status: ${runVarData.status}`);

  const varDbCheck = await runSql(`SELECT * FROM public.test_audit_records WHERE org_id = '${orgId}' AND event_type = 'order_created';`);
  const varRows = varDbCheck?.result?.slice(1) || [];
  assertTest("Interpolated variable {{steps.Fetch Payload.data.queryParam}} saved as 'order_created'", varRows.length > 0, `Rows: ${varRows.length}`);

  // -------------------------------------------------------------------
  // TEST 4: db_write UPDATE Operation
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 4: db_write UPDATE operation");
  const updateWfRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "DB Update Workflow",
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: {
            label: "Trigger",
            nodeType: "trigger",
            config: { trigger: { triggerType: "Manual" } },
          },
        },
        {
          id: "db-1",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: {
            label: "Update Status",
            nodeType: "database",
            config: {
              database: {
                operation: "UPDATE",
                tableName: "test_audit_records",
                query: `UPDATE public.test_audit_records SET status = 'completed_processed' WHERE org_id = '${orgId}' AND event_type = 'order_created' RETURNING *;`,
              },
            },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "db-1" }],
    }),
  });

  const updateWfData = await updateWfRes.json();
  const updateWfId = updateWfData.workflow?.id;

  const runUpdateRes = await fetch(`${APP_URL}/api/actions/trigger-workflow-run`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      input: { workflow_id: updateWfId },
    }),
  });

  const runUpdateData = await runUpdateRes.json();
  assertTest("DB UPDATE workflow completed", runUpdateRes.status === 200 && runUpdateData.status === "completed", `Status: ${runUpdateData.status}`);

  const updateDbCheck = await runSql(`SELECT * FROM public.test_audit_records WHERE org_id = '${orgId}' AND status = 'completed_processed';`);
  const updateRows = updateDbCheck?.result?.slice(1) || [];
  assertTest("Record status updated to 'completed_processed'", updateRows.length > 0, `Rows: ${updateRows.length}`);

  // -------------------------------------------------------------------
  // TEST 5: db_write DELETE Operation
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 5: db_write DELETE operation");
  const deleteWfRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "DB Delete Workflow",
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: {
            label: "Trigger",
            nodeType: "trigger",
            config: { trigger: { triggerType: "Manual" } },
          },
        },
        {
          id: "db-1",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: {
            label: "Delete Record",
            nodeType: "database",
            config: {
              database: {
                operation: "DELETE",
                tableName: "test_audit_records",
                query: `DELETE FROM public.test_audit_records WHERE org_id = '${orgId}' AND event_type = 'order_created' RETURNING *;`,
              },
            },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "db-1" }],
    }),
  });

  const deleteWfData = await deleteWfRes.json();
  const deleteWfId = deleteWfData.workflow?.id;

  const runDeleteRes = await fetch(`${APP_URL}/api/actions/trigger-workflow-run`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      input: { workflow_id: deleteWfId },
    }),
  });

  const runDeleteData = await runDeleteRes.json();
  assertTest("DB DELETE workflow completed", runDeleteRes.status === 200 && runDeleteData.status === "completed", `Status: ${runDeleteData.status}`);

  const deleteDbCheck = await runSql(`SELECT * FROM public.test_audit_records WHERE org_id = '${orgId}' AND event_type = 'order_created';`);
  const deleteRows = deleteDbCheck?.result?.slice(1) || [];
  assertTest("Record successfully deleted from test_audit_records", deleteRows.length === 0, `Rows remaining: ${deleteRows.length}`);

  // -------------------------------------------------------------------
  // TEST 6: Invalid Query / Malformed SQL -> Safe Step Run Failure
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 6: Invalid Database Query Error Handling");
  const badWfRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "Bad DB Query Workflow",
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: {
            label: "Trigger",
            nodeType: "trigger",
            config: { trigger: { triggerType: "Manual" } },
          },
        },
        {
          id: "db-1",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: {
            label: "Invalid SQL Step",
            nodeType: "database",
            config: {
              database: {
                operation: "INSERT",
                tableName: "nonexistent_table_xyz",
                query: "INSERT INTO nonexistent_table_xyz (dummy) VALUES (123);",
              },
            },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "db-1" }],
    }),
  });

  const badWfData = await badWfRes.json();
  const badWfId = badWfData.workflow?.id;

  const runBadRes = await fetch(`${APP_URL}/api/actions/trigger-workflow-run`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      input: { workflow_id: badWfId },
    }),
  });

  const runBadData = await runBadRes.json();
  assertTest("Invalid SQL marks run as failed", runBadData.status === "failed", `Status: ${runBadData.status}`);
  assertTest("Safe error message returned", String(runBadData.message || "").includes("nonexistent_table_xyz"), `Message: ${runBadData.message}`);

  // -------------------------------------------------------------------
  // TEST 7: Viewer Attempts to Configure db_write Step -> 403
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 7: Viewer attempts to create workflow with db_write");
  const viewerRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: viewerHeaders,
    body: JSON.stringify({
      name: "Viewer DB Write Attempt",
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: { label: "Trigger", nodeType: "trigger", config: { trigger: { triggerType: "Manual" } } },
        },
        {
          id: "db-1",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: {
            label: "DB Step",
            nodeType: "database",
            config: { database: { operation: "INSERT", tableName: "test_audit_records", query: "INSERT INTO test_audit_records DEFAULT VALUES;" } },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "db-1" }],
    }),
  });

  assertTest("Viewer blocked from configuring db_write (403)", viewerRes.status === 403, `Status: ${viewerRes.status}`);

  // -------------------------------------------------------------------
  // TEST 8: Editor Attempts to Configure db_write Step -> 403
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 8: Editor attempts to create workflow with db_write");
  const editorRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: editorHeaders,
    body: JSON.stringify({
      name: "Editor DB Write Attempt",
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: { label: "Trigger", nodeType: "trigger", config: { trigger: { triggerType: "Manual" } } },
        },
        {
          id: "db-1",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: {
            label: "DB Step",
            nodeType: "database",
            config: { database: { operation: "INSERT", tableName: "test_audit_records", query: "INSERT INTO test_audit_records DEFAULT VALUES;" } },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "db-1" }],
    }),
  });

  assertTest("Editor blocked from configuring db_write (403)", editorRes.status === 403, `Status: ${editorRes.status}`);

  // -------------------------------------------------------------------
  // TEST 9: Cross-Organization Workflow Modification Attempt -> 403
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 9: Cross-Organization user attempts to modify workflow");
  const crossOrgRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerBHeaders,
    body: JSON.stringify({
      id: dbWfId,
      name: "Cross Org Hijack Attempt",
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: { label: "Trigger", nodeType: "trigger", config: { trigger: { triggerType: "Manual" } } },
        },
      ],
      edges: [],
    }),
  });

  assertTest("Cross-org workflow edit rejected with 403", crossOrgRes.status === 403, `Status: ${crossOrgRes.status}`);

  // -------------------------------------------------------------------
  // TEST 10: Webhook-Triggered Workflow with db_write
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 10: Webhook-triggered workflow containing db_write step");
  const WEBHOOK_SECRET = "whsec_db_write_secret_12345";
  const hookWfRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "Webhook to DB Workflow",
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: {
            label: "Webhook Trigger",
            nodeType: "trigger",
            config: {
              trigger: {
                triggerType: "Webhook",
                webhookSecret: WEBHOOK_SECRET,
              },
            },
          },
        },
        {
          id: "db-1",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: {
            label: "Persist Webhook Event",
            nodeType: "database",
            config: {
              database: {
                operation: "INSERT",
                tableName: "test_audit_records",
                query: `INSERT INTO public.test_audit_records (org_id, event_type, payload, status) VALUES ('${orgId}', '{{trigger.data.eventType}}', '{"userId": "{{trigger.data.userId}}", "amount": {{trigger.data.amount}}}', 'webhook_processed') RETURNING *;`,
              },
            },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "db-1" }],
    }),
  });

  const hookWfData = await hookWfRes.json();
  const hookWfId = hookWfData.workflow?.id;

  const hookTriggerRes = await fetch(`${APP_URL}/api/triggers/webhook/${hookWfId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      eventType: "payment_received",
      userId: "cust_777",
      amount: 299.50,
    }),
  });

  const hookTriggerData = await hookTriggerRes.json();
  assertTest("Webhook trigger starts workflow and completes db_write", hookTriggerRes.status === 200 && hookTriggerData.status === "completed", `Status: ${hookTriggerData.status}`);

  const hookDbCheck = await runSql(`SELECT * FROM public.test_audit_records WHERE org_id = '${orgId}' AND event_type = 'payment_received';`);
  const hookRows = hookDbCheck?.result?.slice(1) || [];
  assertTest("Webhook payload persisted to PostgreSQL via db_write", hookRows.length > 0, `Rows: ${hookRows.length}`);

  // -------------------------------------------------------------------
  // TEST 11: Live GraphQL Subscription for db_write Step Status
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 11: Live WebSocket subscription streaming for db_write");
  let wsReceived = false;

  await new Promise((resolve) => {
    const ws = new globalThis.WebSocket(HASURA_WS_URL, "graphql-ws");

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "connection_init",
        payload: {
          headers: {
            Authorization: `Bearer ${ownerAuth.token}`,
          },
        },
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "connection_ack") {
          ws.send(JSON.stringify({
            id: "sub-db",
            type: "start",
            payload: {
              query: `
                subscription OnDbStepRuns($runId: uuid!) {
                  step_runs(where: { workflow_run_id: { _eq: $runId } }) {
                    id
                    status
                  }
                }
              `,
              variables: { runId },
            },
          }));
        } else if (msg.type === "data") {
          const liveRuns = msg.payload?.data?.step_runs;
          if (Array.isArray(liveRuns) && liveRuns.length > 0) {
            wsReceived = true;
            ws.close();
            resolve();
          }
        }
      } catch (err) {
        console.error("WS error:", err);
      }
    };

    ws.onerror = () => resolve();
    setTimeout(() => {
      try { ws.close(); } catch {}
      resolve();
    }, 4000);
  });

  assertTest("Live WebSocket received db_write step_runs status", wsReceived);

  // -------------------------------------------------------------------
  // TEST 12: Regression: HTTP Request Workflow Execution
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 12: Regression: HTTP Request Workflow Execution");
  const httpWfRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "HTTP Request Regression Workflow",
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: { label: "Trigger", nodeType: "trigger", config: { trigger: { triggerType: "Manual" } } },
        },
        {
          id: "http-1",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: {
            label: "Fetch Status",
            nodeType: "http_request",
            config: {
              httpRequest: {
                method: "GET",
                url: "http://localhost:3000/api/test-http-target?status=ok",
                headers: '{"Content-Type": "application/json"}',
                body: "",
              },
            },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "http-1" }],
    }),
  });

  const httpWfData = await httpWfRes.json();
  const httpWfId = httpWfData.workflow?.id;

  const runHttpRes = await fetch(`${APP_URL}/api/actions/trigger-workflow-run`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ input: { workflow_id: httpWfId } }),
  });

  const runHttpData = await runHttpRes.json();
  assertTest("HTTP Request workflow completes successfully", runHttpRes.status === 200 && runHttpData.status === "completed", `Status: ${runHttpData.status}`);

  // -------------------------------------------------------------------
  // TEST 13: Regression: Approval Gate -> Approve -> Resume
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 13: Regression: Approval Gate -> Approve -> Resume");
  const gateWfRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "Approval Gate Regression Workflow",
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: { label: "Trigger", nodeType: "trigger", config: { trigger: { triggerType: "Manual" } } },
        },
        {
          id: "gate-1",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: {
            label: "Admin Review",
            nodeType: "approval_gate",
            config: {
              approvalGate: {
                message: "Please review",
                requiredRole: "Owner",
              },
            },
          },
        },
        {
          id: "http-post",
          type: "workflowNode",
          position: { x: 500, y: 100 },
          data: {
            label: "Final Step",
            nodeType: "http_request",
            config: {
              httpRequest: {
                method: "GET",
                url: "http://localhost:3000/api/test-http-target?done=true",
                headers: '{"Content-Type": "application/json"}',
                body: "",
              },
            },
          },
        },
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "gate-1" },
        { id: "e2", source: "gate-1", target: "http-post" },
      ],
    }),
  });

  const gateWfData = await gateWfRes.json();
  const gateWfId = gateWfData.workflow?.id;

  const runGateRes = await fetch(`${APP_URL}/api/actions/trigger-workflow-run`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ input: { workflow_id: gateWfId } }),
  });

  const runGateData = await runGateRes.json();
  const gateRunId = runGateData.workflow_run_id;
  assertTest("Workflow pauses at Approval Gate", runGateRes.status === 200 && runGateData.status === "paused", `Status: ${runGateData.status}`);

  // Fetch paused step run
  const stepRunsRes = await queryGraphQLAdmin(`
    query GetPausedStep($runId: uuid!) {
      step_runs(where: { workflow_run_id: { _eq: $runId }, status: { _eq: "paused" } }) {
        id
        workflow_step_id
      }
    }
  `, { runId: gateRunId });

  const pausedStepId = stepRunsRes.data?.step_runs?.[0]?.workflow_step_id;

  const approveRes = await fetch(`${APP_URL}/api/actions/approve-step`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      workflow_run_id: gateRunId,
      step_id: pausedStepId,
    }),
  });

  const approveData = await approveRes.json();
  assertTest("Approval resumes workflow to completed status", approveRes.status === 200 && approveData.status === "completed", `Status: ${approveData.status}`);

  // -------------------------------------------------------------------
  // Cleanup Test Workflows & Table
  // -------------------------------------------------------------------
  console.log("\n▶ Cleaning up test workflows & records...");
  await queryGraphQLAdmin(`
    mutation CleanupWorkflows($ids: [uuid!]!) {
      delete_workflows(where: { id: { _in: $ids } }) {
        affected_rows
      }
    }
  `, { ids: [dbWfId, varWfId, updateWfId, deleteWfId, badWfId, hookWfId, httpWfId, gateWfId].filter(Boolean) });

  await runSql(`DROP TABLE IF EXISTS public.test_audit_records;`);
  console.log("  ✓ Cleanup completed.");

  console.log("\n=======================================================================");
  console.log(`SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log("=======================================================================");

  if (passedTests === totalTests) {
    console.log("🎉 ALL PHASE 3A db_write TESTS 100% PASSED!\n");
    process.exit(0);
  } else {
    console.error("❌ SOME TESTS FAILED!\n");
    process.exit(1);
  }
}

runDbWriteTests().catch((err) => {
  console.error("Test harness uncaught exception:", err);
  process.exit(1);
});
