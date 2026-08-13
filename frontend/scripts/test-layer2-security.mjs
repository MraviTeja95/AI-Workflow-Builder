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
const graphqlUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

const ORG_A_ID = "0101ca0e-6bab-4154-9cfc-d4b581ad3554";
const OWNER_A_ID = "fb336480-d1b5-4c6b-8d6d-8cd6015e9713";
const EDITOR_A_ID = "169b1b47-7c24-4a54-b60c-e22f04c4cd75";
const VIEWER_A_ID = "440246b1-84ce-4e04-844f-3851af26c3b8";

const ORG_B_ID = "cce7603e-9b66-4c75-9ae3-9964fe97742f";
const OWNER_B_ID = "f6ed3f26-2ecc-4129-ad29-ff7f04949fdf";

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

async function runLayer2SecurityMatrix() {
  console.log("=======================================================================");
  console.log("   LAYER 2 SECURITY TEST MATRIX (PRIVILEGED STEP/TRIGGER RBAC)         ");
  console.log("=======================================================================\n");

  const results = [];

  // Helper to test workflow save
  async function testSaveWorkflow(testName, payload, headers, expectedStatus) {
    console.log(`▶ Executing ${testName}...`);
    const res = await fetch("http://localhost:3000/api/workflows", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    const passed = res.status === expectedStatus;
    console.log(`  -> Status: ${res.status} (Expected: ${expectedStatus}) | Result: ${passed ? "PASS" : "FAIL"}`);
    if (!passed) {
      console.log("  -> Response Body:", data);
    } else {
      console.log(`  -> Message: ${data.message || data.error}`);
    }

    results.push({
      testName,
      expectedStatus,
      actualStatus: res.status,
      passed,
      response: data,
    });

    return { res, data };
  }

  // -------------------------------------------------------------------------
  // Test 1: Owner creates workflow containing db_write
  // -------------------------------------------------------------------------
  const t1 = await testSaveWorkflow(
    "Test 1: Owner creates workflow containing db_write",
    {
      name: "Security Test - Owner DB Write",
      userId: OWNER_A_ID,
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
          data: { label: "DB Write Step", nodeType: "database", config: { database: { operation: "INSERT" } } },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "db-1" }],
    },
    { "x-hasura-user-id": OWNER_A_ID },
    200
  );

  const orgAWorkflowId = t1.data?.workflow?.id;

  // -------------------------------------------------------------------------
  // Test 2: Editor creates workflow containing db_write
  // -------------------------------------------------------------------------
  await testSaveWorkflow(
    "Test 2: Editor creates workflow containing db_write",
    {
      name: "Security Test - Editor DB Write",
      userId: EDITOR_A_ID,
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
          data: { label: "DB Write Step", nodeType: "database", config: { database: { operation: "INSERT" } } },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "db-1" }],
    },
    { "x-hasura-user-id": EDITOR_A_ID },
    403
  );

  // -------------------------------------------------------------------------
  // Test 3: Viewer creates workflow containing db_write
  // -------------------------------------------------------------------------
  await testSaveWorkflow(
    "Test 3: Viewer creates workflow containing db_write",
    {
      name: "Security Test - Viewer DB Write",
      userId: VIEWER_A_ID,
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
          data: { label: "DB Write Step", nodeType: "database", config: { database: { operation: "INSERT" } } },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "db-1" }],
    },
    { "x-hasura-user-id": VIEWER_A_ID },
    403
  );

  // -------------------------------------------------------------------------
  // Test 4: Owner creates workflow containing notify
  // -------------------------------------------------------------------------
  await testSaveWorkflow(
    "Test 4: Owner creates workflow containing notify",
    {
      name: "Security Test - Owner Notify",
      userId: OWNER_A_ID,
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: { label: "Trigger", nodeType: "trigger", config: { trigger: { triggerType: "Manual" } } },
        },
        {
          id: "notify-1",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: { label: "Notify Step", nodeType: "notify", config: { notify: { channel: "Email" } } },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "notify-1" }],
    },
    { "x-hasura-user-id": OWNER_A_ID },
    200
  );

  // -------------------------------------------------------------------------
  // Test 5: Editor creates workflow containing notify
  // -------------------------------------------------------------------------
  await testSaveWorkflow(
    "Test 5: Editor creates workflow containing notify",
    {
      name: "Security Test - Editor Notify",
      userId: EDITOR_A_ID,
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: { label: "Trigger", nodeType: "trigger", config: { trigger: { triggerType: "Manual" } } },
        },
        {
          id: "notify-1",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: { label: "Notify Step", nodeType: "notify", config: { notify: { channel: "Email" } } },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "notify-1" }],
    },
    { "x-hasura-user-id": EDITOR_A_ID },
    403
  );

  // -------------------------------------------------------------------------
  // Test 6: Owner creates workflow containing webhook trigger
  // -------------------------------------------------------------------------
  await testSaveWorkflow(
    "Test 6: Owner creates workflow containing webhook trigger",
    {
      name: "Security Test - Owner Webhook",
      userId: OWNER_A_ID,
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: { label: "Webhook Trigger", nodeType: "trigger", config: { trigger: { triggerType: "Webhook" } } },
        },
        {
          id: "http-1",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: { label: "HTTP Action", nodeType: "http_request", config: { httpRequest: { url: "https://httpbin.org/get" } } },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "http-1" }],
    },
    { "x-hasura-user-id": OWNER_A_ID },
    200
  );

  // -------------------------------------------------------------------------
  // Test 7: Editor creates workflow containing webhook trigger
  // -------------------------------------------------------------------------
  await testSaveWorkflow(
    "Test 7: Editor creates workflow containing webhook trigger",
    {
      name: "Security Test - Editor Webhook",
      userId: EDITOR_A_ID,
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: { label: "Webhook Trigger", nodeType: "trigger", config: { trigger: { triggerType: "Webhook" } } },
        },
        {
          id: "http-1",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: { label: "HTTP Action", nodeType: "http_request", config: { httpRequest: { url: "https://httpbin.org/get" } } },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "http-1" }],
    },
    { "x-hasura-user-id": EDITOR_A_ID },
    403
  );

  // -------------------------------------------------------------------------
  // Test 8: Org B editor attempts to modify an Org A workflow using ID directly
  // -------------------------------------------------------------------------
  if (orgAWorkflowId) {
    // Org B editor user
    await testSaveWorkflow(
      "Test 8: Org B user attempts to modify Org A workflow using ID directly",
      {
        id: orgAWorkflowId,
        name: "Hacked by Org B Editor",
        userId: OWNER_B_ID,
        nodes: [
          {
            id: "trigger-1",
            type: "workflowNode",
            position: { x: 100, y: 100 },
            data: { label: "Trigger", nodeType: "trigger", config: { trigger: { triggerType: "Manual" } } },
          },
        ],
        edges: [],
      },
      { "x-hasura-user-id": OWNER_B_ID },
      403
    );

    // -----------------------------------------------------------------------
    // Test 9: Org B owner attempts to inject a privileged step into Org A workflow
    // -----------------------------------------------------------------------
    await testSaveWorkflow(
      "Test 9: Org B owner attempts to inject privileged step into Org A workflow",
      {
        id: orgAWorkflowId,
        name: "Injected Privileged Step by Org B",
        userId: OWNER_B_ID,
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
            data: { label: "DB Write Step", nodeType: "database", config: { database: { operation: "INSERT" } } },
          },
        ],
        edges: [{ id: "e1", source: "trigger-1", target: "db-1" }],
      },
      { "x-hasura-user-id": OWNER_B_ID },
      403
    );

    // Also test GET /api/workflows/[id] cross-org access
    console.log("▶ Executing Test 8b: Org B user attempts to GET Org A workflow directly...");
    const crossGetRes = await fetch(`http://localhost:3000/api/workflows/${orgAWorkflowId}`, {
      headers: { "x-hasura-user-id": OWNER_B_ID },
    });
    console.log(`  -> Status: ${crossGetRes.status} (Expected: 403) | Result: ${crossGetRes.status === 403 ? "PASS" : "FAIL"}`);
  }

  console.log("\n=======================================================================");
  const allPassed = results.every((r) => r.passed);
  console.log(`SUMMARY: ${results.filter(r => r.passed).length} / ${results.length} TESTS PASSED`);
  console.log(`STATUS: ${allPassed ? "🎉 ALL LAYER 2 SECURITY TESTS 100% PASSED!" : "❌ SOME TESTS FAILED"}`);
  console.log("=======================================================================\n");

  if (!allPassed) {
    process.exit(1);
  }
}

runLayer2SecurityMatrix().catch((e) => {
  console.error(e);
  process.exit(1);
});
