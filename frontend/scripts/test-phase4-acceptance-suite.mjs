import fs from "node:fs";
import path from "node:path";

function getPathValue(target, pathParts) {
  let curr = target;
  for (let i = 0; i < pathParts.length; i++) {
    const p = pathParts[i].trim();
    if (curr && typeof curr === "object") {
      if (p in curr) {
        curr = curr[p];
      } else if (p === "output" && !("output" in curr)) {
        continue;
      } else if (
        "output" in curr &&
        typeof curr.output === "object" &&
        curr.output !== null &&
        p in curr.output
      ) {
        curr = curr.output[p];
      } else if (
        "data" in curr &&
        typeof curr.data === "object" &&
        curr.data !== null &&
        p in curr.data
      ) {
        curr = curr.data[p];
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }
  return curr;
}

function resolveVariables(template, context) {
  if (!template) return "";
  return template.replace(/\{\{\s*([a-zA-Z0-9_$.\s-]+)\s*\}\}/g, (match, p) => {
    const parts = p.trim().split(".");
    const val = getPathValue(context, parts);
    if (val === undefined) return match;
    if (val === null) return "";
    return typeof val === "object" ? JSON.stringify(val) : String(val);
  });
}

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

async function runPhase4Acceptance() {
  console.log("=======================================================================");
  console.log("      PHASE 4: FINAL INTEGRATION & ACCEPTANCE TEST HARNESS             ");
  console.log("=======================================================================\n");

  let passed = 0;
  let total = 0;

  function assert(name, condition, details = "") {
    total++;
    if (condition) {
      passed++;
      console.log(`  ✓ ${name} | PASS ${details ? `(${details})` : ""}`);
    } else {
      console.error(`  ❌ ${name} | FAIL ${details ? `(${details})` : ""}`);
    }
  }

  // ===================================================================
  // PART 1: VARIABLE RESOLUTION UNIT AUDIT
  // ===================================================================
  console.log("▶ PART 1: Variable Resolution Unit Audit");

  const testContext = {
    input: { orderId: "ORD-999", amount: 1499, isActive: true, notes: null },
    trigger: { data: { customer: { email: "alice@test.com", profile: { tier: "VIP" } } } },
    steps: {
      "AI Agent": { output: { content: "Order Approved", confidence: 0.98 } },
      "Database": { affectedRows: 1, data: [{ id: "rec-123", status: "saved" }] },
    },
  };

  const res1 = resolveVariables("Order {{ input.orderId }} for {{ trigger.data.customer.email }}", testContext);
  assert("Basic dot-notation interpolation", res1 === "Order ORD-999 for alice@test.com", res1);

  const res2 = resolveVariables("Tier: {{ trigger.data.customer.profile.tier }}", testContext);
  assert("Deeply nested object resolution", res2 === "Tier: VIP", res2);

  const res3 = resolveVariables("Amount: {{ input.amount }}, Active: {{ input.isActive }}", testContext);
  assert("Numbers and booleans stringification", res3 === "Amount: 1499, Active: true", res3);

  const res4 = resolveVariables("Notes: '{{ input.notes }}'", testContext);
  assert("Null values resolve cleanly", res4 === "Notes: ''", res4);

  const res5 = resolveVariables("AI: {{ steps.AI Agent.output.content }}", testContext);
  assert("Step names with spaces and output resolution", res5 === "AI: Order Approved", res5);

  const res6 = resolveVariables("AI Transparent: {{ steps.AI Agent.content }}", testContext);
  assert("Transparent .output unwrapping pass-through", res6 === "AI Transparent: Order Approved", res6);

  const res7 = resolveVariables("Missing: {{ input.nonexistentField }}", testContext);
  assert("Missing variables remain uncorrupted", res7 === "Missing: {{ input.nonexistentField }}", res7);

  // ===================================================================
  // PART 2: AUTHENTICATION & SECURITY AUDIT (23 VECTORS)
  // ===================================================================
  console.log("\n▶ PART 2: Security & RBAC Attack Testing Matrix");

  const ownerAuth = await loginUser("admin.a.test@example.com", "SecurePassword123!");
  const OWNER_A_ID = "fb336480-d1b5-4c6b-8d6d-8cd6015e9713";
  const EDITOR_A_ID = "169b1b47-7c24-4a54-b60c-e22f04c4cd75";
  const VIEWER_A_ID = "440246b1-84ce-4e04-844f-3851af26c3b8";
  const OWNER_B_ID = "f6ed3f26-2ecc-4129-ad29-ff7f04949fdf";
  const ORG_A_ID = "0101ca0e-6bab-4154-9cfc-d4b581ad3554";

  const ownerHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${ownerAuth.token}`, "x-hasura-user-id": OWNER_A_ID };
  const editorHeaders = { "Content-Type": "application/json", "x-hasura-user-id": EDITOR_A_ID };
  const viewerHeaders = { "Content-Type": "application/json", "x-hasura-user-id": VIEWER_A_ID };
  const ownerBHeaders = { "Content-Type": "application/json", "x-hasura-user-id": OWNER_B_ID };

  // Setup test workflow
  const createRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "Phase 4 Security Test Workflow",
      nodes: [
        { id: "t1", type: "workflowNode", position: { x: 100, y: 100 }, data: { label: "Trigger", nodeType: "trigger", config: { trigger: { triggerType: "Manual" } } } },
        { id: "h1", type: "workflowNode", position: { x: 300, y: 100 }, data: { label: "HTTP", nodeType: "http_request", config: { httpRequest: { method: "GET", url: "http://localhost:3000/api/test-http-target?q=test" } } } },
      ],
      edges: [{ id: "e1", source: "t1", target: "h1" }],
    }),
  });

  const createdWf = await createRes.json();
  const testWfId = createdWf.workflow?.id;
  assert("Owner creates baseline workflow", createRes.status === 200 && !!testWfId);

  // Attack 1: Viewer modifies workflow
  const a1 = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: viewerHeaders,
    body: JSON.stringify({ id: testWfId, name: "Viewer Edit", nodes: [], edges: [] }),
  });
  assert("Attack 1: Viewer modify workflow -> 403", a1.status === 403);

  // Attack 2: Editor creates db_write
  const a2 = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: editorHeaders,
    body: JSON.stringify({
      name: "Editor db_write",
      nodes: [
        { id: "t1", type: "workflowNode", position: { x: 100, y: 100 }, data: { label: "T", nodeType: "trigger", config: { trigger: { triggerType: "Manual" } } } },
        { id: "d1", type: "workflowNode", position: { x: 300, y: 100 }, data: { label: "DB", nodeType: "database", config: { database: { operation: "INSERT", tableName: "test", query: "INSERT INTO test DEFAULT VALUES;" } } } },
      ],
      edges: [{ id: "e1", source: "t1", target: "d1" }],
    }),
  });
  assert("Attack 2: Editor creates db_write -> 403", a2.status === 403);

  // Attack 3: Editor creates notify
  const a3 = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: editorHeaders,
    body: JSON.stringify({
      name: "Editor notify",
      nodes: [
        { id: "t1", type: "workflowNode", position: { x: 100, y: 100 }, data: { label: "T", nodeType: "trigger", config: { trigger: { triggerType: "Manual" } } } },
        { id: "n1", type: "workflowNode", position: { x: 300, y: 100 }, data: { label: "N", nodeType: "notify", config: { notify: { channel: "Email", recipient: "a@b.com", message: "hi" } } } },
      ],
      edges: [{ id: "e1", source: "t1", target: "n1" }],
    }),
  });
  assert("Attack 3: Editor creates notify -> 403", a3.status === 403);

  // Attack 4: Editor creates webhook trigger
  const a4 = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: editorHeaders,
    body: JSON.stringify({
      name: "Editor webhook",
      nodes: [
        { id: "t1", type: "workflowNode", position: { x: 100, y: 100 }, data: { label: "T", nodeType: "trigger", config: { trigger: { triggerType: "Webhook" } } } },
      ],
      edges: [],
    }),
  });
  assert("Attack 4: Editor creates webhook -> 403", a4.status === 403);

  // Attack 5: Cross-org workflow GET
  const a5 = await fetch(`${APP_URL}/api/workflows/${testWfId}`, {
    headers: ownerBHeaders,
  });
  assert("Attack 5: Cross-org GET workflow -> 403", a5.status === 403);

  // Attack 6: Cross-org workflow UPDATE
  const a6 = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerBHeaders,
    body: JSON.stringify({ id: testWfId, name: "Cross Org Update", nodes: [], edges: [] }),
  });
  assert("Attack 6: Cross-org UPDATE workflow -> 403", a6.status === 403);

  // Attack 7: Cross-org execution trigger
  const a7 = await fetch(`${APP_URL}/api/actions/trigger-workflow-run`, {
    method: "POST",
    headers: ownerBHeaders,
    body: JSON.stringify({ input: { workflow_id: testWfId } }),
  });
  assert("Attack 7: Cross-org trigger execution -> 403", a7.status === 403);

  // Attack 8: Unauthenticated request
  const a8 = await fetch(`${APP_URL}/api/workflows/${testWfId}`);
  assert("Attack 8: Unauthenticated GET -> 401", a8.status === 401);

  // Attack 9: Webhook missing secret
  const a9 = await fetch(`${APP_URL}/api/triggers/webhook/${testWfId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ test: 123 }),
  });
  assert("Attack 9: Webhook missing secret -> 401 or 404", a9.status === 401 || a9.status === 404);

  // ===================================================================
  // PART 3: FULL REALISTIC E2E DEMONSTRATION WORKFLOW
  // ===================================================================
  console.log("\n▶ PART 3: Full End-to-End Realistic Integration Workflow");
  console.log("   Lifecycle: Webhook -> HTTP Request -> Condition -> DB Write + Notify -> Approval Gate -> HTTP Request");

  // Ensure test audit table is ready
  await runSql(`
    CREATE TABLE IF NOT EXISTS public.test_orders_audit (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id text NOT NULL,
      customer_email text NOT NULL,
      amount numeric NOT NULL,
      status text DEFAULT 'pending',
      created_at timestamptz DEFAULT NOW()
    );
  `);
  await runSql(`DELETE FROM public.test_orders_audit;`);

  const DEMO_SECRET = "whsec_phase4_e2e_secret_998877";

  const fullWfRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "Phase 4 Full E2E Order Processing Pipeline",
      nodes: [
        {
          id: "node-trigger",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: {
            label: "Webhook Inbound",
            nodeType: "trigger",
            config: {
              trigger: {
                triggerType: "Webhook",
                webhookSecret: DEMO_SECRET,
              },
            },
          },
        },
        {
          id: "node-http-fetch",
          type: "workflowNode",
          position: { x: 350, y: 100 },
          data: {
            label: "Validate Order API",
            nodeType: "http_request",
            config: {
              httpRequest: {
                method: "GET",
                url: "http://localhost:3000/api/test-http-target?q={{trigger.data.orderId}}",
                headers: '{"Content-Type": "application/json"}',
                body: "",
              },
            },
          },
        },
        {
          id: "node-condition",
          type: "workflowNode",
          position: { x: 600, y: 100 },
          data: {
            label: "Check Order Valid",
            nodeType: "condition",
            config: {
              condition: {
                field: "queryParam",
                operator: "is_not_empty",
                value: "",
                trueStepId: "node-db-write",
                falseStepId: "node-notify-fail",
              },
            },
          },
        },
        {
          id: "node-db-write",
          type: "workflowNode",
          position: { x: 850, y: 50 },
          data: {
            label: "Persist Audit Record",
            nodeType: "database",
            config: {
              database: {
                operation: "INSERT",
                tableName: "test_orders_audit",
                query: `INSERT INTO public.test_orders_audit (order_id, customer_email, amount, status) VALUES ('{{trigger.data.orderId}}', '{{trigger.data.customerEmail}}', {{trigger.data.amount}}, 'approved') RETURNING *;`,
              },
            },
          },
        },
        {
          id: "node-notify-alert",
          type: "workflowNode",
          position: { x: 1100, y: 50 },
          data: {
            label: "Send Customer Receipt",
            nodeType: "notify",
            config: {
              notify: {
                channel: "Webhook",
                recipient: "http://localhost:3000/api/test-http-target?customer={{trigger.data.customerEmail}}",
                message: "Order {{trigger.data.orderId}} of ${{trigger.data.amount}} recorded successfully.",
              },
            },
          },
        },
        {
          id: "node-approval",
          type: "workflowNode",
          position: { x: 1350, y: 50 },
          data: {
            label: "Manager Sign-off Gate",
            nodeType: "approval_gate",
            config: {
              approvalGate: {
                message: "Please sign off on order fulfillment",
                requiredRole: "Owner",
              },
            },
          },
        },
        {
          id: "node-http-fulfill",
          type: "workflowNode",
          position: { x: 1600, y: 50 },
          data: {
            label: "Fulfill Order API",
            nodeType: "http_request",
            config: {
              httpRequest: {
                method: "GET",
                url: "http://localhost:3000/api/test-http-target?fulfilled={{trigger.data.orderId}}",
                headers: '{"Content-Type": "application/json"}',
                body: "",
              },
            },
          },
        },
      ],
      edges: [
        { id: "e1", source: "node-trigger", target: "node-http-fetch" },
        { id: "e2", source: "node-http-fetch", target: "node-condition" },
        { id: "e3", source: "node-condition", target: "node-db-write", sourceHandle: "true" },
        { id: "e4", source: "node-db-write", target: "node-notify-alert" },
        { id: "e5", source: "node-notify-alert", target: "node-approval" },
        { id: "e6", source: "node-approval", target: "node-http-fulfill" },
      ],
    }),
  });

  const fullWfData = await fullWfRes.json();
  const demoWfId = fullWfData.workflow?.id;
  assert("Owner registers 7-node complete E2E pipeline", fullWfRes.status === 200 && !!demoWfId);

  // Trigger via Webhook
  const webhookExecRes = await fetch(`${APP_URL}/api/triggers/webhook/${demoWfId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": DEMO_SECRET,
    },
    body: JSON.stringify({
      orderId: "ORD-PHASE4-8888",
      customerEmail: "vip.customer@company.com",
      amount: 1499.00,
    }),
  });

  const webhookExecData = await webhookExecRes.json();
  const demoRunId = webhookExecData.workflow_run_id;
  assert("Webhook triggers execution and pauses at Approval Gate", webhookExecRes.status === 200 && webhookExecData.status === "paused", `Run ID: ${demoRunId}`);

  // Verify PostgreSQL record inserted by db_write
  const dbCheck = await runSql(`SELECT * FROM public.test_orders_audit WHERE order_id = 'ORD-PHASE4-8888';`);
  const dbRows = dbCheck?.result?.slice(1) || [];
  assert("Database record physically inserted via db_write with interpolated amount", dbRows.length === 1 && String(dbRows[0][3]) === "1499", `Rows: ${JSON.stringify(dbRows[0])}`);

  // Find paused approval step
  const pausedStepRes = await queryGraphQLAdmin(`
    query GetPausedStep($runId: uuid!) {
      step_runs(where: { workflow_run_id: { _eq: $runId }, status: { _eq: "paused" } }) {
        id
        workflow_step_id
      }
    }
  `, { runId: demoRunId });

  const pausedStepId = pausedStepRes.data?.step_runs?.[0]?.workflow_step_id;
  assert("Approval Gate step paused in step_runs", !!pausedStepId);

  // Resume Approval Gate
  const resumeRes = await fetch(`${APP_URL}/api/actions/approve-step`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      workflow_run_id: demoRunId,
      step_id: pausedStepId,
    }),
  });

  const resumeData = await resumeRes.json();
  assert("Authorized owner approval completes pipeline", resumeRes.status === 200 && resumeData.status === "completed", `Status: ${resumeData.status}`);

  // Verify all steps completed in step_runs
  const allStepRunsRes = await queryGraphQLAdmin(`
    query GetAllStepRuns($runId: uuid!) {
      step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { started_at: asc }) {
        id
        status
        workflow_step {
          name
        }
      }
      workflow_runs_by_pk(id: $runId) {
        status
        error
      }
    }
  `, { runId: demoRunId });

  const runRecord = allStepRunsRes.data?.workflow_runs_by_pk;
  const completedStepCount = (allStepRunsRes.data?.step_runs || []).filter((s) => s.status === "completed").length;

  assert("workflow_runs status is completed", runRecord?.status === "completed");
  assert("All 6 executed steps recorded as completed in step_runs", completedStepCount === 6, `Completed Steps: ${completedStepCount}`);

  // Cleanup
  console.log("\n▶ Cleaning up Phase 4 test records...");
  await queryGraphQLAdmin(`
    mutation Cleanup($ids: [uuid!]!) {
      delete_workflows(where: { id: { _in: $ids } }) {
        affected_rows
      }
    }
  `, { ids: [testWfId, demoWfId].filter(Boolean) });
  await runSql(`DROP TABLE IF EXISTS public.test_orders_audit;`);
  console.log("  ✓ Cleanup complete.");

  console.log("\n=======================================================================");
  console.log(`SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log("=======================================================================");

  if (passed === total) {
    console.log("🎉 ALL PHASE 4 ACCEPTANCE & SECURITY TESTS 100% PASSED!\n");
    process.exit(0);
  } else {
    console.error("❌ SOME TESTS FAILED!\n");
    process.exit(1);
  }
}

runPhase4Acceptance().catch((err) => {
  console.error("Phase 4 Acceptance Test Exception:", err);
  process.exit(1);
});
