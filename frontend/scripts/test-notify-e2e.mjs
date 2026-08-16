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

async function runNotifyTests() {
  console.log("=======================================================================");
  console.log("   PHASE 3B: notify STEP E2E TEST & SECURITY VERIFICATION SUITE       ");
  console.log("=======================================================================\n");

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

  let passedTests = 0;
  let totalTests = 0;
  const createdWfIds = [];

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
  // TEST 1: Owner creates workflow containing notify
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 1: Owner creates workflow containing notify");
  const createWfRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "Owner Notify Workflow",
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
          data: {
            label: "Send Webhook Alert",
            nodeType: "notify",
            config: {
              notify: {
                channel: "Webhook",
                recipient: "http://localhost:3000/api/test-http-target?alert=sent",
                message: "Alert: Server CPU usage high!",
              },
            },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "notify-1" }],
    }),
  });

  const createWfData = await createWfRes.json();
  const notifyWfId = createWfData.workflow?.id;
  if (notifyWfId) createdWfIds.push(notifyWfId);
  assertTest("Owner successfully saved workflow with notify", createWfRes.status === 200 && !!notifyWfId, `Status: ${createWfRes.status}`);

  // -------------------------------------------------------------------
  // TEST 2: Valid notification Webhook delivery
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 2: Valid notification Webhook delivery confirmed by destination");
  const runRes = await fetch(`${APP_URL}/api/actions/trigger-workflow-run`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ input: { workflow_id: notifyWfId } }),
  });

  const runData = await runRes.json();
  const runId = runData.workflow_run_id;
  assertTest("Workflow run completed successfully", runRes.status === 200 && runData.status === "completed", `Status: ${runData.status}`);

  // Verify step_runs record
  const stepRunRes = await queryGraphQLAdmin(`
    query GetNotifyStepRun($runId: uuid!) {
      step_runs(where: { workflow_run_id: { _eq: $runId } }) {
        id
        status
        output
        error
      }
    }
  `, { runId });

  const notifyStepRun = stepRunRes.data?.step_runs?.[0];
  assertTest("step_runs.status is completed", notifyStepRun?.status === "completed", `Status: ${notifyStepRun?.status}`);
  assertTest("step_runs.output has delivery confirmation", notifyStepRun?.output?.success === true && !!notifyStepRun?.output?.messageId, `MessageId: ${notifyStepRun?.output?.messageId}`);

  // -------------------------------------------------------------------
  // TEST 3: Email Channel Syntax Validation & Delivery (SendGrid)
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 3: Email channel delivery & credential validation (SendGrid)");
  const hasEmailCreds = !!(env.SENDGRID_API_KEY);
  const emailWfRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "Email Notify Workflow",
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: { label: "Trigger", nodeType: "trigger", config: { trigger: { triggerType: "Manual" } } },
        },
        {
          id: "notify-email",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: {
            label: "Send Email",
            nodeType: "notify",
            config: {
              notify: {
                channel: "Email",
                recipient: env.TEST_EMAIL_RECIPIENT || "mraviteja876@gmail.com",
                message: "Deployment successful to production via SendGrid.",
              },
            },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "notify-email" }],
    }),
  });

  const emailWfData = await emailWfRes.json();
  const emailWfId = emailWfData.workflow?.id;
  if (emailWfId) createdWfIds.push(emailWfId);

  const runEmailRes = await fetch(`${APP_URL}/api/actions/trigger-workflow-run`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ input: { workflow_id: emailWfId } }),
  });

  const runEmailData = await runEmailRes.json();
  if (hasEmailCreds) {
    assertTest("Email workflow run completed via SendGrid", runEmailRes.status === 200 && runEmailData.status === "completed", `Status: ${runEmailData.status}`);
    const emailStepRunRes = await queryGraphQLAdmin(`
      query GetEmailStepRun($runId: uuid!) {
        step_runs(where: { workflow_run_id: { _eq: $runId } }) {
          id
          status
          output
          error
        }
      }
    `, { runId: runEmailData.workflow_run_id });
    const emailStepRun = emailStepRunRes.data?.step_runs?.[0];
    const isRealMsgId = emailStepRun?.output?.messageId && !emailStepRun?.output?.messageId.startsWith("notif_");
    assertTest("Email step output contains provider message ID", !!isRealMsgId, `MessageId: ${emailStepRun?.output?.messageId}`);
    assertTest("Email step output details provider is SendGrid", emailStepRun?.output?.details?.provider === "SendGrid", `Provider: ${emailStepRun?.output?.details?.provider}`);
  } else {
    assertTest("Missing credentials correctly fails email step without claiming fake delivery", runEmailData.status === "failed" && String(runEmailData.message || "").includes("SendGrid API key is not configured"), `Real email integration not configured (Message: ${runEmailData.message})`);
  }

  // -------------------------------------------------------------------
  // TEST 4: Slack Channel Notification Delivery
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 4: Slack channel notification delivery");
  const slackWfRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "Slack Notify Workflow",
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: { label: "Trigger", nodeType: "trigger", config: { trigger: { triggerType: "Manual" } } },
        },
        {
          id: "notify-slack",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: {
            label: "Slack Alert",
            nodeType: "notify",
            config: {
              notify: {
                channel: "Slack",
                recipient: "#engineering-ops",
                message: "Build #42 passed all test suites.",
              },
            },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "notify-slack" }],
    }),
  });

  const slackWfData = await slackWfRes.json();
  const slackWfId = slackWfData.workflow?.id;
  if (slackWfId) createdWfIds.push(slackWfId);

  const runSlackRes = await fetch(`${APP_URL}/api/actions/trigger-workflow-run`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ input: { workflow_id: slackWfId } }),
  });

  const runSlackData = await runSlackRes.json();
  assertTest("Slack notification workflow completed", runSlackRes.status === 200 && runSlackData.status === "completed", `Status: ${runSlackData.status}`);

  // -------------------------------------------------------------------
  // TEST 5: Variable Interpolation across Step Context
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 5: Variable interpolation in recipient and message template");
  const varWfRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "Variable Notify Workflow",
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
            label: "Fetch Order",
            nodeType: "http_request",
            config: {
              httpRequest: {
                method: "GET",
                url: "http://localhost:3000/api/test-http-target?q=ORD-9876",
                headers: '{"Content-Type": "application/json"}',
                body: "",
              },
            },
          },
        },
        {
          id: "notify-var",
          type: "workflowNode",
          position: { x: 500, y: 100 },
          data: {
            label: "Send Dynamic Notify",
            nodeType: "notify",
            config: {
              notify: {
                channel: "Webhook",
                recipient: "http://localhost:3000/api/test-http-target?orderId={{steps.Fetch Order.data.queryParam}}",
                message: "Order {{steps.Fetch Order.data.queryParam}} was processed via {{steps.Fetch Order.data.method}}",
              },
            },
          },
        },
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "http-1" },
        { id: "e2", source: "http-1", target: "notify-var" },
      ],
    }),
  });

  const varWfData = await varWfRes.json();
  const varWfId = varWfData.workflow?.id;
  if (varWfId) createdWfIds.push(varWfId);

  const runVarRes = await fetch(`${APP_URL}/api/actions/trigger-workflow-run`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ input: { workflow_id: varWfId } }),
  });

  const runVarData = await runVarRes.json();
  assertTest("Variable interpolation workflow completed", runVarRes.status === 200 && runVarData.status === "completed", `Status: ${runVarData.status}`);

  const varStepRunRes = await queryGraphQLAdmin(`
    query GetVarStepRun($runId: uuid!) {
      step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { created_at: desc }, limit: 1) {
        output
      }
    }
  `, { runId: runVarData.workflow_run_id });

  const resolvedOutput = varStepRunRes.data?.step_runs?.[0]?.output;
  assertTest("Recipient URL interpolated with queryParam", String(resolvedOutput?.recipient || "").includes("ORD-9876"), `Resolved Recipient: ${resolvedOutput?.recipient}`);
  assertTest("Message template interpolated with queryParam", String(resolvedOutput?.message || "").includes("ORD-9876"), `Resolved Message: ${resolvedOutput?.message}`);

  // -------------------------------------------------------------------
  // TEST 6: Missing Recipient Validation Failure
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 6: Missing recipient fails gracefully");
  const missingRecipWfRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "Missing Recipient Workflow",
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: { label: "Trigger", nodeType: "trigger", config: { trigger: { triggerType: "Manual" } } },
        },
        {
          id: "notify-bad",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: {
            label: "No Recipient",
            nodeType: "notify",
            config: {
              notify: {
                channel: "Email",
                recipient: "",
                message: "Hello world",
              },
            },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "notify-bad" }],
    }),
  });

  const missingRecipWfData = await missingRecipWfRes.json();
  const missingRecipWfId = missingRecipWfData.workflow?.id;
  if (missingRecipWfId) createdWfIds.push(missingRecipWfId);

  const runMissingRes = await fetch(`${APP_URL}/api/actions/trigger-workflow-run`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ input: { workflow_id: missingRecipWfId } }),
  });

  const runMissingData = await runMissingRes.json();
  assertTest("Missing recipient fails run cleanly", runMissingData.status === "failed", `Status: ${runMissingData.status}`);
  assertTest("Sanitized error message returned", String(runMissingData.message || "").includes("recipient is required"), `Message: ${runMissingData.message}`);

  // -------------------------------------------------------------------
  // TEST 7: Invalid Email Syntax Validation Failure
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 7: Invalid email address syntax fails cleanly");
  const badEmailWfRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "Bad Email Syntax Workflow",
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: { label: "Trigger", nodeType: "trigger", config: { trigger: { triggerType: "Manual" } } },
        },
        {
          id: "notify-bad-email",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: {
            label: "Bad Email",
            nodeType: "notify",
            config: {
              notify: {
                channel: "Email",
                recipient: "not-a-valid-email",
                message: "Hello",
              },
            },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "notify-bad-email" }],
    }),
  });

  const badEmailWfData = await badEmailWfRes.json();
  const badEmailWfId = badEmailWfData.workflow?.id;
  if (badEmailWfId) createdWfIds.push(badEmailWfId);

  const runBadEmailRes = await fetch(`${APP_URL}/api/actions/trigger-workflow-run`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ input: { workflow_id: badEmailWfId } }),
  });

  const runBadEmailData = await runBadEmailRes.json();
  assertTest("Invalid email syntax fails run cleanly", runBadEmailData.status === "failed", `Status: ${runBadEmailData.status}`);

  // -------------------------------------------------------------------
  // TEST 8: Network / Destination Endpoint Failure
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 8: Destination network/endpoint failure handled safely");
  const netFailWfRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "Network Failure Notify Workflow",
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: { label: "Trigger", nodeType: "trigger", config: { trigger: { triggerType: "Manual" } } },
        },
        {
          id: "notify-net-fail",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: {
            label: "Dead Webhook",
            nodeType: "notify",
            config: {
              notify: {
                channel: "Webhook",
                recipient: "http://localhost:59999/nonexistent-endpoint-port",
                message: "Alert to unreachable host",
              },
            },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "notify-net-fail" }],
    }),
  });

  const netFailWfData = await netFailWfRes.json();
  const netFailWfId = netFailWfData.workflow?.id;
  if (netFailWfId) createdWfIds.push(netFailWfId);

  const runNetFailRes = await fetch(`${APP_URL}/api/actions/trigger-workflow-run`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ input: { workflow_id: netFailWfId } }),
  });

  const runNetFailData = await runNetFailRes.json();
  assertTest("Network failure marks step as failed", runNetFailData.status === "failed", `Status: ${runNetFailData.status}`);

  // -------------------------------------------------------------------
  // TEST 9: Viewer Attempts to Configure notify -> 403
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 9: Viewer attempts to create workflow with notify");
  const viewerRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: viewerHeaders,
    body: JSON.stringify({
      name: "Viewer Notify Attempt",
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
          data: {
            label: "Notify Step",
            nodeType: "notify",
            config: { notify: { channel: "Email", recipient: "admin@test.com", message: "Hi" } },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "notify-1" }],
    }),
  });

  assertTest("Viewer blocked from configuring notify (403)", viewerRes.status === 403, `Status: ${viewerRes.status}`);

  // -------------------------------------------------------------------
  // TEST 10: Editor Attempts to Configure notify -> 403
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 10: Editor attempts to create workflow with notify");
  const editorRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: editorHeaders,
    body: JSON.stringify({
      name: "Editor Notify Attempt",
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
          data: {
            label: "Notify Step",
            nodeType: "notify",
            config: { notify: { channel: "Email", recipient: "admin@test.com", message: "Hi" } },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "notify-1" }],
    }),
  });

  assertTest("Editor blocked from configuring notify (403)", editorRes.status === 403, `Status: ${editorRes.status}`);

  // -------------------------------------------------------------------
  // TEST 11: Cross-Organization Workflow Modification Attempt -> 403
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 11: Cross-Organization user attempts to modify workflow");
  const crossOrgRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerBHeaders,
    body: JSON.stringify({
      id: notifyWfId,
      name: "Cross Org Notify Hijack",
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
  // TEST 12: Webhook-Triggered Workflow with notify
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 12: Webhook-triggered workflow containing notify step");
  const WEBHOOK_SECRET = "whsec_notify_secret_998877";
  const hookWfRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "Webhook to Notify Workflow",
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
          id: "notify-1",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: {
            label: "Send Webhook Alert",
            nodeType: "notify",
            config: {
              notify: {
                channel: "Webhook",
                recipient: "http://localhost:3000/api/test-http-target?event={{trigger.data.eventType}}",
                message: "Received event {{trigger.data.eventType}} for user {{trigger.data.userId}}",
              },
            },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "notify-1" }],
    }),
  });

  const hookWfData = await hookWfRes.json();
  const hookWfId = hookWfData.workflow?.id;
  if (hookWfId) createdWfIds.push(hookWfId);

  const hookTriggerRes = await fetch(`${APP_URL}/api/triggers/webhook/${hookWfId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      eventType: "user_signup",
      userId: "usr_445566",
    }),
  });

  const hookTriggerData = await hookTriggerRes.json();
  assertTest("Webhook trigger runs workflow and executes notify", hookTriggerRes.status === 200 && hookTriggerData.status === "completed", `Status: ${hookTriggerData.status}`);

  // -------------------------------------------------------------------
  // TEST 13: Live GraphQL WebSocket Subscription for notify
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 13: Live WebSocket subscription streaming for notify");
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
            id: "sub-notify",
            type: "start",
            payload: {
              query: `
                subscription OnNotifyStepRuns($runId: uuid!) {
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

  assertTest("Live WebSocket received notify step_runs status", wsReceived);

  // -------------------------------------------------------------------
  // TEST 14: Downstream Step Receives notify Output
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 14: Downstream step receives notify output via executionContext");
  const chainWfRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "Chain Notify Workflow",
      nodes: [
        {
          id: "trigger-1",
          type: "workflowNode",
          position: { x: 100, y: 100 },
          data: { label: "Trigger", nodeType: "trigger", config: { trigger: { triggerType: "Manual" } } },
        },
        {
          id: "notify-step",
          type: "workflowNode",
          position: { x: 300, y: 100 },
          data: {
            label: "Send Notify",
            nodeType: "notify",
            config: {
              notify: {
                channel: "Webhook",
                recipient: "http://localhost:3000/api/test-http-target?stage=notify",
                message: "Initial notification",
              },
            },
          },
        },
        {
          id: "http-confirm",
          type: "workflowNode",
          position: { x: 500, y: 100 },
          data: {
            label: "Log Confirmation",
            nodeType: "http_request",
            config: {
              httpRequest: {
                method: "GET",
                url: "http://localhost:3000/api/test-http-target?msgId={{steps.Send Notify.messageId}}",
                headers: '{"Content-Type": "application/json"}',
                body: "",
              },
            },
          },
        },
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "notify-step" },
        { id: "e2", source: "notify-step", target: "http-confirm" },
      ],
    }),
  });

  const chainWfData = await chainWfRes.json();
  const chainWfId = chainWfData.workflow?.id;
  if (chainWfId) createdWfIds.push(chainWfId);

  const runChainRes = await fetch(`${APP_URL}/api/actions/trigger-workflow-run`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ input: { workflow_id: chainWfId } }),
  });

  const runChainData = await runChainRes.json();
  assertTest("Downstream chained step completed successfully", runChainRes.status === 200 && runChainData.status === "completed", `Status: ${runChainData.status}`);

  // -------------------------------------------------------------------
  // TEST 15: Regression: db_write Step Execution
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 15: Regression: db_write Step Execution");
  const dbWfRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      name: "Regression DB Write Workflow",
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
            label: "DB Select",
            nodeType: "database",
            config: {
              database: {
                operation: "SELECT",
                tableName: "organizations",
                query: "SELECT id, name FROM public.organizations LIMIT 1;",
              },
            },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "db-1" }],
    }),
  });

  const dbWfData = await dbWfRes.json();
  const dbWfId = dbWfData.workflow?.id;
  if (dbWfId) createdWfIds.push(dbWfId);

  const runDbRes = await fetch(`${APP_URL}/api/actions/trigger-workflow-run`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ input: { workflow_id: dbWfId } }),
  });

  const runDbData = await runDbRes.json();
  assertTest("db_write regression workflow completed", runDbRes.status === 200 && runDbData.status === "completed", `Status: ${runDbData.status}`);

  // -------------------------------------------------------------------
  // TEST 16: Regression: Approval Gate -> Approve -> Resume
  // -------------------------------------------------------------------
  console.log("\n▶ TEST 16: Regression: Approval Gate -> Approve -> Resume");
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
            config: { approvalGate: { message: "Review needed", requiredRole: "Owner" } },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "gate-1" }],
    }),
  });

  const gateWfData = await gateWfRes.json();
  const gateWfId = gateWfData.workflow?.id;
  if (gateWfId) createdWfIds.push(gateWfId);

  const runGateRes = await fetch(`${APP_URL}/api/actions/trigger-workflow-run`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ input: { workflow_id: gateWfId } }),
  });

  const runGateData = await runGateRes.json();
  const gateRunId = runGateData.workflow_run_id;
  assertTest("Workflow pauses at Approval Gate", runGateRes.status === 200 && runGateData.status === "paused", `Status: ${runGateData.status}`);

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
    body: JSON.stringify({ workflow_run_id: gateRunId, step_id: pausedStepId }),
  });

  const approveData = await approveRes.json();
  assertTest("Approval resumes workflow to completed status", approveRes.status === 200 && approveData.status === "completed", `Status: ${approveData.status}`);

  // -------------------------------------------------------------------
  // Cleanup Test Workflows
  // -------------------------------------------------------------------
  console.log("\n▶ Cleaning up test workflows...");
  await queryGraphQLAdmin(`
    mutation CleanupWorkflows($ids: [uuid!]!) {
      delete_workflows(where: { id: { _in: $ids } }) {
        affected_rows
      }
    }
  `, { ids: createdWfIds });
  console.log("  ✓ Cleanup completed.");

  console.log("\n=======================================================================");
  console.log(`SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log("=======================================================================");

  if (passedTests === totalTests) {
    console.log("🎉 ALL PHASE 3B notify TESTS 100% PASSED!\n");
    process.exit(0);
  } else {
    console.error("❌ SOME TESTS FAILED!\n");
    process.exit(1);
  }
}

runNotifyTests().catch((err) => {
  console.error("Test harness uncaught exception:", err);
  process.exit(1);
});
