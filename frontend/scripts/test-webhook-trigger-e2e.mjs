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

async function runWebhookTests() {
  console.log("=======================================================================");
  console.log("   PHASE 2: WEBHOOK TRIGGER E2E TEST & SECURITY VERIFICATION SUITE     ");
  console.log("=======================================================================\n");

  const TEST_SECRET = "whsec_test_secret_abc123xyz789";

  // 1. Authenticate Owner User to set up test workflows
  console.log("▶ Authenticating Organization Owner...");
  const ownerA = await loginUser("admin.a.test@example.com", "SecurePassword123!");
  console.log(`  ✓ Owner Authenticated (ID: ${ownerA.user.id})`);

  // Get Owner's Organization
  const orgMemberRes = await queryGraphQLAdmin(`
    query GetOrg($userId: uuid!) {
      org_members(where: { user_id: { _eq: $userId } }) {
        org_id
        role
        organization {
          id
          name
          quota_limit
          quota_used
        }
      }
    }
  `, { userId: ownerA.user.id });

  const orgId = orgMemberRes.data?.org_members?.[0]?.org_id || "0101ca0e-6bab-4154-9cfc-d4b581ad3554";
  console.log(`  ✓ Organization Resolved: ${orgId}`);

  // Reset Quota to ensure clean test state
  await queryGraphQLAdmin(`
    mutation ResetQuota($orgId: uuid!) {
      update_organizations_by_pk(pk_columns: { id: $orgId }, _set: { quota_used: 0, quota_limit: 1000 }) {
        id
        quota_used
        quota_limit
      }
    }
  `, { orgId });

  // 2. Setup Test Workflow 1: Webhook Trigger -> HTTP Request -> Approval Gate -> HTTP Request
  console.log("\n▶ Setting up Webhook Workflow (HTTP Request + Approval Gate)...");
  const wfRes = await queryGraphQLAdmin(`
    mutation CreateWebhookWorkflow($object: workflows_insert_input!) {
      insert_workflows_one(object: $object) {
        id
        name
      }
    }
  `, {
    object: {
      name: "E2E Webhook Test Workflow",
      org_id: orgId,
      created_by: ownerA.user.id,
    },
  });

  const webhookWfId = wfRes.data?.insert_workflows_one?.id;
  console.log(`  ✓ Workflow Created (ID: ${webhookWfId})`);

  // Register Webhook Trigger
  await queryGraphQLAdmin(`
    mutation AddTrigger($trigger: workflow_triggers_insert_input!) {
      insert_workflow_triggers_one(object: $trigger) {
        id
      }
    }
  `, {
    trigger: {
      workflow_id: webhookWfId,
      type: "webhook",
      enabled: true,
      config: {
        node_config: {
          trigger: {
            triggerType: "Webhook",
            webhookSecret: TEST_SECRET,
          },
        },
      },
    },
  });

  // Register Steps:
  // Step 0: HTTP Request (using payload variable {{ trigger.data.action }})
  // Step 1: Approval Gate (requiredRole: Owner)
  // Step 2: HTTP Request (downstream confirmation)
  await queryGraphQLAdmin(`
    mutation AddSteps($steps: [workflow_steps_insert_input!]!) {
      insert_workflow_steps(objects: $steps) {
        affected_rows
      }
    }
  `, {
    steps: [
      {
        workflow_id: webhookWfId,
        name: "Inbound Payload Dispatch",
        type: "http_request",
        position: 0,
        config: {
          method: "GET",
          url: "http://localhost:3000/api/test-http-target?action={{trigger.data.action}}&user={{trigger.data.userId}}",
          headers: '{"Content-Type": "application/json"}',
          body: "",
        },
      },
      {
        workflow_id: webhookWfId,
        name: "Manager Approval Gate",
        type: "approval_gate",
        position: 1,
        config: {
          message: "Please approve webhook event execution for {{trigger.data.userId}}.",
          requiredRole: "Owner",
          timeoutHours: 24,
        },
      },
      {
        workflow_id: webhookWfId,
        name: "Post-Approval Confirmation",
        type: "http_request",
        position: 2,
        config: {
          method: "GET",
          url: "http://localhost:3000/api/test-http-target?status=confirmed",
          headers: '{"Content-Type": "application/json"}',
          body: "",
        },
      },
    ],
  });
  console.log("  ✓ Webhook Trigger & 3 Steps registered.");

  // Setup Workflow 2: Workflow WITHOUT Webhook Trigger (Manual only)
  const manualWfRes = await queryGraphQLAdmin(`
    mutation CreateManualWorkflow($object: workflows_insert_input!) {
      insert_workflows_one(object: $object) {
        id
      }
    }
  `, {
    object: {
      name: "Manual Only Workflow",
      org_id: orgId,
      created_by: ownerA.user.id,
    },
  });
  const manualWfId = manualWfRes.data?.insert_workflows_one?.id;

  await queryGraphQLAdmin(`
    mutation AddManualTrigger($trigger: workflow_triggers_insert_input!) {
      insert_workflow_triggers_one(object: $trigger) {
        id
      }
    }
  `, {
    trigger: {
      workflow_id: manualWfId,
      type: "manual",
      enabled: true,
      config: {},
    },
  });

  // Setup Workflow 3: Workflow with DISABLED Webhook Trigger
  const disabledWfRes = await queryGraphQLAdmin(`
    mutation CreateDisabledWf($object: workflows_insert_input!) {
      insert_workflows_one(object: $object) {
        id
      }
    }
  `, {
    object: {
      name: "Disabled Webhook Workflow",
      org_id: orgId,
      created_by: ownerA.user.id,
    },
  });
  const disabledWfId = disabledWfRes.data?.insert_workflows_one?.id;

  await queryGraphQLAdmin(`
    mutation AddDisabledTrigger($trigger: workflow_triggers_insert_input!) {
      insert_workflow_triggers_one(object: $trigger) {
        id
      }
    }
  `, {
    trigger: {
      workflow_id: disabledWfId,
      type: "webhook",
      enabled: false,
      config: {
        node_config: {
          trigger: {
            triggerType: "Webhook",
            webhookSecret: TEST_SECRET,
          },
        },
      },
    },
  });

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
  // TEST 1: Missing Webhook Secret -> 401 Unauthorized
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 1: Missing Webhook Secret");
  const test1Res = await fetch(`${APP_URL}/api/triggers/webhook/${webhookWfId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sync", userId: "usr_100" }),
  });
  assertTest("Missing secret rejected with 401", test1Res.status === 401, `Status: ${test1Res.status}`);

  // -------------------------------------------------------------------
  // TEST 2: Wrong Webhook Secret -> 401 Unauthorized
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 2: Wrong Webhook Secret");
  const test2Res = await fetch(`${APP_URL}/api/triggers/webhook/${webhookWfId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": "whsec_wrong_secret",
    },
    body: JSON.stringify({ action: "sync", userId: "usr_100" }),
  });
  assertTest("Wrong secret rejected with 401", test2Res.status === 401, `Status: ${test2Res.status}`);

  // -------------------------------------------------------------------
  // TEST 3: Workflow Without Webhook Trigger -> 404
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 3: Workflow Without Webhook Trigger");
  const test3Res = await fetch(`${APP_URL}/api/triggers/webhook/${manualWfId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": TEST_SECRET,
    },
    body: JSON.stringify({ action: "sync" }),
  });
  assertTest("Manual-only workflow rejected with 404", test3Res.status === 404, `Status: ${test3Res.status}`);

  // -------------------------------------------------------------------
  // TEST 4: Disabled Webhook Trigger -> 403 / 404
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 4: Disabled Webhook Trigger");
  const test4Res = await fetch(`${APP_URL}/api/triggers/webhook/${disabledWfId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": TEST_SECRET,
    },
    body: JSON.stringify({ action: "sync" }),
  });
  assertTest("Disabled trigger rejected with 403 or 404", test4Res.status === 403 || test4Res.status === 404, `Status: ${test4Res.status}`);

  // -------------------------------------------------------------------
  // TEST 5: Invalid Workflow UUID -> 400 Bad Request
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 5: Invalid Workflow UUID Format");
  const test5Res = await fetch(`${APP_URL}/api/triggers/webhook/not-a-valid-uuid`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": TEST_SECRET,
    },
    body: JSON.stringify({ action: "sync" }),
  });
  assertTest("Invalid UUID format rejected with 400", test5Res.status === 400, `Status: ${test5Res.status}`);

  // -------------------------------------------------------------------
  // TEST 6: Nonexistent Workflow UUID -> 404 Not Found
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 6: Nonexistent Workflow UUID");
  const test6Res = await fetch(`${APP_URL}/api/triggers/webhook/00000000-0000-0000-0000-000000000000`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": TEST_SECRET,
    },
    body: JSON.stringify({ action: "sync" }),
  });
  assertTest("Nonexistent workflow rejected with 404", test6Res.status === 404, `Status: ${test6Res.status}`);

  // -------------------------------------------------------------------
  // TEST 7: Valid Webhook Call -> Starts Execution & Pauses at Approval Gate
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 7: Valid Webhook Execution & Variable Resolution");
  const webhookPayload = {
    action: "process_order",
    userId: "cust_9999",
    amount: 149.99,
  };

  const test7Res = await fetch(`${APP_URL}/api/triggers/webhook/${webhookWfId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": TEST_SECRET,
    },
    body: JSON.stringify(webhookPayload),
  });

  const test7Data = await test7Res.json();
  const runId = test7Data.workflow_run_id;

  assertTest("Valid Webhook returns 200", test7Res.status === 200, `Status: ${test7Res.status}`);
  assertTest("Workflow Run ID returned", !!runId, `Run ID: ${runId}`);
  assertTest("Execution paused at Approval Gate", test7Data.status === "paused", `Status: ${test7Data.status}`);

  // Inspect Step Runs in Database
  const stepRunsRes = await queryGraphQLAdmin(`
    query GetStepRuns($runId: uuid!) {
      step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { started_at: asc }) {
        id
        status
        workflow_step_id
        input
        output
      }
    }
  `, { runId });

  const stepRuns = stepRunsRes.data?.step_runs || [];
  assertTest("Created expected step runs", stepRuns.length === 2, `Count: ${stepRuns.length}`);

  // Check Step 0 (HTTP Request) resolved variable from webhook payload
  const step0 = stepRuns[0];
  assertTest("Step 0 (HTTP Request) completed", step0?.status === "completed", `Step 0 Status: ${step0?.status}`);
  const step0Url = String(step0?.input?.url || "");
  assertTest("Step 0 resolved {{trigger.data.action}} and {{trigger.data.userId}}",
    step0Url.includes("action=process_order") && step0Url.includes("user=cust_9999"),
    `Resolved URL: ${step0Url}`
  );

  // Check Step 1 (Approval Gate) is paused
  const step1 = stepRuns[1];
  assertTest("Step 1 (Approval Gate) is paused", step1?.status === "paused", `Step 1 Status: ${step1?.status}`);

  // -------------------------------------------------------------------
  // TEST 8: Live WebSocket Subscription Receives Webhook Step Runs
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 8: Live WebSocket Subscription for Webhook Run");
  let wsReceived = false;

  await new Promise((resolve) => {
    const ws = new globalThis.WebSocket(HASURA_WS_URL, "graphql-ws");

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "connection_init",
        payload: {
          headers: {
            Authorization: `Bearer ${ownerA.token}`,
          },
        },
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "connection_ack") {
          ws.send(JSON.stringify({
            id: "sub-1",
            type: "start",
            payload: {
              query: `
                subscription OnStepRuns($runId: uuid!) {
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
        console.error("WS parse error:", err);
      }
    };

    ws.onerror = (err) => {
      console.error("WS error:", err);
      resolve();
    };

    setTimeout(() => {
      try { ws.close(); } catch {}
      resolve();
    }, 4000);
  });

  assertTest("Live WebSocket received step_runs for webhook execution", wsReceived);

  // -------------------------------------------------------------------
  // TEST 9: Existing approveStep Resumes the Webhook Workflow Run
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 9: Resuming Paused Webhook Run via approveStep");
  const stepGateId = step1?.workflow_step_id;
  const approveRes = await fetch(`${APP_URL}/api/actions/approve-step`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ownerA.token}`,
    },
    body: JSON.stringify({
      input: {
        workflow_run_id: runId,
        step_id: stepGateId,
      },
    }),
  });

  const approveData = await approveRes.json();
  assertTest("approveStep returned 200", approveRes.status === 200, `Status: ${approveRes.status}`);
  assertTest("Workflow run completed after approval", approveData.status === "completed", `Status: ${approveData.status}`);

  // Verify all 3 steps completed in database
  const finalRunsRes = await queryGraphQLAdmin(`
    query GetFinalStepRuns($runId: uuid!) {
      step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { started_at: asc }) {
        id
        status
      }
      workflow_runs_by_pk(id: $runId) {
        status
        trigger_type
      }
    }
  `, { runId });

  const finalSteps = finalRunsRes.data?.step_runs || [];
  const finalWfRun = finalRunsRes.data?.workflow_runs_by_pk;

  assertTest("All 3 step_runs completed", finalSteps.length === 3 && finalSteps.every(s => s.status === "completed"), `Step Count: ${finalSteps.length}`);
  assertTest("workflow_run status is completed", finalWfRun?.status === "completed", `Status: ${finalWfRun?.status}`);
  assertTest("workflow_run trigger_type is 'webhook'", finalWfRun?.trigger_type === "webhook", `Type: ${finalWfRun?.trigger_type}`);

  // -------------------------------------------------------------------
  // TEST 10: Quota Enforcement on Webhook Trigger
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 10: Quota Exhaustion Enforcement");
  // Set quota_used equal to quota_limit
  await queryGraphQLAdmin(`
    mutation ExhaustQuota($orgId: uuid!) {
      update_organizations_by_pk(pk_columns: { id: $orgId }, _set: { quota_used: 100, quota_limit: 100 }) {
        id
        quota_used
        quota_limit
      }
    }
  `, { orgId });

  const test10Res = await fetch(`${APP_URL}/api/triggers/webhook/${webhookWfId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": TEST_SECRET,
    },
    body: JSON.stringify({ action: "blocked_run" }),
  });

  const test10Data = await test10Res.json();
  assertTest("Quota exhausted returns 403", test10Res.status === 403, `Status: ${test10Res.status}`);
  assertTest("Quota error message returned", String(test10Data.error || "").toLowerCase().includes("quota"), `Message: ${test10Data.error}`);

  // Reset Quota back
  await queryGraphQLAdmin(`
    mutation RestoreQuota($orgId: uuid!) {
      update_organizations_by_pk(pk_columns: { id: $orgId }, _set: { quota_used: 0, quota_limit: 1000 }) {
        id
      }
    }
  `, { orgId });

  // -------------------------------------------------------------------
  // TEST 11: Hasura Action Handler Endpoint Verification
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 11: Hasura Action Handler Endpoint (triggerWebhookWorkflow)");
  const actionRes = await fetch(`${APP_URL}/api/actions/trigger-webhook-workflow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: { name: "triggerWebhookWorkflow" },
      input: {
        workflow_id: webhookWfId,
        secret: TEST_SECRET,
        payload: { action: "action_test", userId: "usr_action_1" },
      },
    }),
  });

  const actionData = await actionRes.json();
  assertTest("Hasura Action handler returns 200", actionRes.status === 200, `Status: ${actionRes.status}`);
  assertTest("Hasura Action returns workflow_run_id", !!actionData.workflow_run_id, `Run ID: ${actionData.workflow_run_id}`);
  assertTest("Hasura Action run paused at gate", actionData.status === "paused", `Status: ${actionData.status}`);

  // -------------------------------------------------------------------
  // TEST 12: Bearer Token Secret Authentication Support
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 12: Authorization Bearer Header Secret Support");
  const bearerRes = await fetch(`${APP_URL}/api/triggers/webhook/${webhookWfId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_SECRET}`,
    },
    body: JSON.stringify({ action: "bearer_test", userId: "usr_bearer" }),
  });

  const bearerData = await bearerRes.json();
  assertTest("Bearer secret returns 200", bearerRes.status === 200, `Status: ${bearerRes.status}`);
  assertTest("Bearer secret created run", !!bearerData.workflow_run_id, `Run ID: ${bearerData.workflow_run_id}`);

  // -------------------------------------------------------------------
  // Cleanup Test Workflows
  // -------------------------------------------------------------------
  console.log("\n▶ Cleaning up test workflows...");
  await queryGraphQLAdmin(`
    mutation Cleanup($ids: [uuid!]!) {
      delete_workflows(where: { id: { _in: $ids } }) {
        affected_rows
      }
    }
  `, { ids: [webhookWfId, manualWfId, disabledWfId] });
  console.log("  ✓ Test workflows cleaned up.");

  console.log("\n=======================================================================");
  console.log(`SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log("=======================================================================");

  if (passedTests === totalTests) {
    console.log("🎉 ALL PHASE 2 WEBHOOK TESTS 100% PASSED!\n");
    process.exit(0);
  } else {
    console.error("❌ SOME TESTS FAILED!\n");
    process.exit(1);
  }
}

runWebhookTests().catch((err) => {
  console.error("Test harness uncaught exception:", err);
  process.exit(1);
});
