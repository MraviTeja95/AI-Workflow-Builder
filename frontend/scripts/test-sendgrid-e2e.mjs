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
    userId: data.session.user.id,
  };
}

let passedCount = 0;
let failedCount = 0;

function assertTest(name, condition, details = "") {
  if (condition) {
    console.log(`  ✓ PASS: ${name} ${details ? `(${details})` : ""}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${name} ${details ? `(${details})` : ""}`);
    failedCount++;
  }
}

async function runSendGridE2ETest() {
  console.log("===================================================================");
  console.log("SENDGRID EMAIL WORKFLOW E2E INTEGRATION SUITE");
  console.log("Trigger -> AI Agent -> Approval Gate -> Notify (Email via SendGrid)");
  console.log("===================================================================\n");

  // 1. Authenticate Owner
  console.log("▶ Step 1: Authenticating User / Owner...");
  const ownerAuth = await loginUser(env.DEMO_USER_EMAIL || "demo.evaluator@example.com", env.DEMO_USER_PASSWORD || "SecurePassword123!");
  assertTest("Owner authentication succeeded", !!ownerAuth.token);

  const ownerHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ownerAuth.token}`,
    "x-hasura-user-id": ownerAuth.userId,
  };

  // 2. Define workflow: Trigger -> AI Agent -> Approval Gate -> Notify (Email)
  // Send to a third-party / external evaluator recipient (different from from_email)
  const targetRecipient = "evaluator.recipient.workflow@gmail.com";
  console.log(`\n▶ Step 2: Creating 4-node pipeline targeting external recipient: ${targetRecipient}`);

  const wfPayload = {
    name: "SendGrid E2E Pipeline (Trigger -> AI -> Gate -> Notify)",
    nodes: [
      {
        id: "step-trigger",
        type: "workflowNode",
        position: { x: 100, y: 150 },
        data: {
          label: "Trigger",
          nodeType: "trigger",
          config: {
            trigger: { triggerType: "Manual" },
          },
        },
      },
      {
        id: "step-ai-agent",
        type: "workflowNode",
        position: { x: 350, y: 150 },
        data: {
          label: "AI Agent",
          nodeType: "ai_agent",
          config: {
            aiAgent: {
              model: "Gemini",
              systemPrompt: "You are an automated dispatch summarizer. Keep output strictly under 15 words.",
              userPrompt: "Generate a brief approval summary for order #SG-9821.",
              temperature: 0.2,
              maxTokens: 50,
            },
          },
        },
      },
      {
        id: "step-approval-gate",
        type: "workflowNode",
        position: { x: 600, y: 150 },
        data: {
          label: "Approval Gate",
          nodeType: "approval_gate",
          config: {
            approvalGate: {
              message: "Please review and approve dispatch for order #SG-9821.",
              requiredRole: "Owner",
              timeoutHours: 24,
            },
          },
        },
      },
      {
        id: "step-notify-email",
        type: "workflowNode",
        position: { x: 850, y: 150 },
        data: {
          label: "Notify",
          nodeType: "notify",
          config: {
            notify: {
              channel: "Email",
              recipient: targetRecipient,
              message: "Order #SG-9821 Approved. AI Analysis: {{steps.AI Agent.output.content}} (Sent via SendGrid)",
            },
          },
        },
      },
    ],
    edges: [
      { id: "e1", source: "step-trigger", target: "step-ai-agent" },
      { id: "e2", source: "step-ai-agent", target: "step-approval-gate" },
      { id: "e3", source: "step-approval-gate", target: "step-notify-email" },
    ],
  };

  const createRes = await fetch(`${APP_URL}/api/workflows`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify(wfPayload),
  });

  const createData = await createRes.json();
  assertTest("Workflow created successfully", createRes.status === 200 && !!createData.workflow?.id, `Workflow ID: ${createData.workflow?.id}`);
  const workflowId = createData.workflow.id;

  // 3. Trigger workflow run
  console.log("\n▶ Step 3: Triggering initial workflow execution...");
  const runRes = await fetch(`${APP_URL}/api/actions/trigger-workflow-run`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ input: { workflow_id: workflowId } }),
  });

  const runData = await runRes.json();
  console.log("  Run API Response status:", runRes.status, "body:", runData);
  assertTest("Workflow execution initiated", runRes.status === 200 && !!runData.workflow_run_id, `Run ID: ${runData.workflow_run_id}`);
  const runId = runData.workflow_run_id;

  assertTest("Workflow paused at Approval Gate as expected", runData.status === "paused", `Status: ${runData.status}`);

  // Inspect intermediate step runs
  const initialStepsRes = await queryGraphQLAdmin(`
    query GetStepRuns($runId: uuid!) {
      step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { created_at: asc }) {
        id
        status
        output
        workflow_step {
          name
          type
        }
      }
    }
  `, { runId });

  const initialSteps = initialStepsRes.data?.step_runs || [];
  console.log(`  Dispatched ${initialSteps.length} initial step runs:`);
  for (const sr of initialSteps) {
    console.log(`    - [${sr.workflow_step?.type}] ${sr.workflow_step?.name}: status=${sr.status}`);
  }

  const triggerStep = initialSteps.find(s => s.workflow_step?.type === "trigger");
  const aiStep = initialSteps.find(s => s.workflow_step?.type === "ai_agent" || s.workflow_step?.type === "llm_call");
  const gateStep = initialSteps.find(s => s.workflow_step?.type === "approval_gate");

  assertTest("Trigger successfully initiated workflow run", !!runId);
  assertTest("AI Agent step completed with Gemini output", aiStep?.status === "completed" && !!(aiStep?.output?.content || aiStep?.output?.response));
  assertTest("Approval Gate step reached and paused", gateStep?.status === "paused");

  // 4. Approve the approval gate
  console.log(`\n▶ Step 4: Approving Gate Step (runId: ${runId})...`);
  const approveRes = await fetch(`${APP_URL}/api/actions/approve-step`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      input: {
        workflow_run_id: runId,
        step_id: gateStep.workflow_step?.id,
      },
    }),
  });

  const approveData = await approveRes.json();
  assertTest("Approve step API succeeded", approveRes.status === 200, `Response: ${JSON.stringify(approveData)}`);

  // 5. Verify resumed execution & SendGrid email dispatch
  console.log("\n▶ Step 5: Verifying resumed workflow execution & SendGrid delivery...");
  const finalStepsRes = await queryGraphQLAdmin(`
    query GetFinalStepRuns($runId: uuid!) {
      workflow_runs_by_pk(id: $runId) {
        status
      }
      step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { created_at: asc }) {
        id
        status
        output
        error
        workflow_step {
          name
          type
        }
      }
    }
  `, { runId });

  const finalRun = finalStepsRes.data?.workflow_runs_by_pk;
  const finalSteps = finalStepsRes.data?.step_runs || [];

  console.log(`\n  Final workflow run status: ${finalRun?.status}`);
  console.log("  Step runs status breakdown:");
  for (const sr of finalSteps) {
    console.log(`    - [${sr.workflow_step?.type}] ${sr.workflow_step?.name}: status=${sr.status}`);
    if (sr.error) console.log(`      Error: ${sr.error}`);
  }

  const notifyStep = finalSteps.find(s => s.workflow_step?.type === "notify");

  assertTest("Workflow run status is completed", finalRun?.status === "completed", `Run Status: ${finalRun?.status}`);
  assertTest("Approval gate step marked completed", finalSteps.find(s => s.workflow_step?.type === "approval_gate")?.status === "completed");
  assertTest("Notify (Email) step marked completed", notifyStep?.status === "completed", `Notify Status: ${notifyStep?.status}`);
  assertTest("Notify step provider is SendGrid", notifyStep?.output?.details?.provider === "SendGrid", `Provider: ${notifyStep?.output?.details?.provider}`);
  assertTest("SendGrid accepted HTTP status code 202", notifyStep?.output?.details?.statusCode === 202, `Status Code: ${notifyStep?.output?.details?.statusCode}`);
  assertTest("Notify step captured valid message ID", !!notifyStep?.output?.messageId, `MessageId: ${notifyStep?.output?.messageId}`);
  assertTest("Notify step delivered to third-party recipient", notifyStep?.output?.recipient === targetRecipient, `Recipient: ${notifyStep?.output?.recipient}`);
  assertTest("Notify message includes interpolated AI Agent content", !notifyStep?.output?.message.includes("{{") && notifyStep?.output?.message.includes("Order #SG-9821 Approved"), `Resolved message: ${notifyStep?.output?.message}`);

  // Clean up created workflow
  console.log("\n▶ Step 6: Cleaning up test workflow...");
  await queryGraphQLAdmin(`
    mutation DeleteWorkflow($id: uuid!) {
      delete_workflow_runs(where: { workflow_id: { _eq: $id } }) { affected_rows }
      delete_workflow_steps(where: { workflow_id: { _eq: $id } }) { affected_rows }
      delete_workflows_by_pk(id: $id) { id }
    }
  `, { id: workflowId });

  console.log("\n===================================================================");
  console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("===================================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runSendGridE2ETest().catch((err) => {
  console.error("FATAL TEST ERROR:", err);
  process.exit(1);
});
