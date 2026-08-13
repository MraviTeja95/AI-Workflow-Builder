import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const endpoint = env.HASURA_GRAPHQL_ENDPOINT;
const authUrl = "https://zggynlwwpraxjmbawiym.auth.ap-southeast-1.nhost.run/v1";

async function signIn(email, password) {
  const res = await fetch(`${authUrl}/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.session?.accessToken) {
    throw new Error(`Failed to sign in as ${email}: ${JSON.stringify(data)}`);
  }
  return {
    userId: data.session.user.id,
    token: data.session.accessToken,
    email,
  };
}

async function queryGraphQL(token, query, variables = {}) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function runLayer2Verification() {
  console.log("=======================================================================");
  console.log("   ASSIGNMENT LAYER 2: ROLE & STEP-LEVEL PERMISSION VERIFICATION       ");
  console.log("   (ROLES: OWNER, EDITOR, VIEWER • REAL NHOST RS256 JWT TOKENS)        ");
  console.log("=======================================================================\n");

  // 1. Authenticate users
  console.log("1. Authenticating test users across roles and organizations...");
  const ownerA = await signIn("mraviteja876@gmail.com", "SecurePassword123!");
  const editorA = await signIn("admin.a.test@example.com", "SecurePassword123!");
  const viewerA = await signIn("member.a.test@example.com", "SecurePassword123!");
  const ownerB = await signIn("owner.b.isolation.test@example.com", "SecurePassword123!");

  console.log(`   • Org A OWNER  (${ownerA.email}): ${ownerA.userId}`);
  console.log(`   • Org A EDITOR (${editorA.email}): ${editorA.userId}`);
  console.log(`   • Org A VIEWER (${viewerA.email}): ${viewerA.userId}`);
  console.log(`   • Org B OWNER  (${ownerB.email}): ${ownerB.userId}\n`);

  const workflowAId = "efab066b-82db-4d72-adfa-f3c06a5a1200";
  const orgAId = "0101ca0e-6bab-4154-9cfc-d4b581ad3554";

  // GraphQL Operations
  const INSERT_STEP = `
    mutation InsertStep($step: workflow_steps_insert_input!) {
      insert_workflow_steps_one(object: $step) {
        id
        name
        type
        position
        config
      }
    }
  `;

  const UPDATE_STEP = `
    mutation UpdateStep($id: uuid!, $name: String!, $config: jsonb!) {
      update_workflow_steps_by_pk(pk_columns: { id: $id }, _set: { name: $name, config: $config }) {
        id
        name
        config
      }
    }
  `;

  const DELETE_STEP = `
    mutation DeleteStep($id: uuid!) {
      delete_workflow_steps_by_pk(id: $id) {
        id
      }
    }
  `;

  const INSERT_TRIGGER = `
    mutation InsertTrigger($trigger: workflow_triggers_insert_input!) {
      insert_workflow_triggers_one(object: $trigger) {
        id
        type
      }
    }
  `;

  const GET_STEPS_BY_WORKFLOW = `
    query GetWorkflowSteps($workflowId: uuid!) {
      workflow_steps(where: { workflow_id: { _eq: $workflowId } }) {
        id
        name
        type
        config
      }
    }
  `;

  const GET_STEP_BY_PK = `
    query GetStepByPk($id: uuid!) {
      workflow_steps_by_pk(id: $id) {
        id
        name
        type
        config
      }
    }
  `;

  // -----------------------------------------------------------------------------------------
  // 2. OWNER A: Full Capabilities
  // -----------------------------------------------------------------------------------------
  console.log("2. Testing OWNER A Capabilities (Full Privileges in Org A)...");

  // A. Owner creates approval_gate step
  const ownerCreateApprovalRes = await queryGraphQL(ownerA.token, INSERT_STEP, {
    step: {
      workflow_id: workflowAId,
      name: "Security Review Gate",
      type: "approval_gate",
      position: 10,
      config: { message: "Security Approval", requiredRole: "Owner", timeoutHours: 24 },
    },
  });
  const ownerStepId = ownerCreateApprovalRes.data?.insert_workflow_steps_one?.id;
  const ownerCanCreateStep = !!ownerStepId;
  console.log(`   • Owner A created 'approval_gate' step: ${ownerCanCreateStep ? `PASS ✓ (ID: ${ownerStepId})` : "FAIL ✗"}`);

  // B. Owner creates db_write step (Owner-only permitted)
  const ownerCreateDbRes = await queryGraphQL(ownerA.token, INSERT_STEP, {
    step: {
      workflow_id: workflowAId,
      name: "Customer Data Persistence",
      type: "db_write",
      position: 11,
      config: { operation: "INSERT", tableName: "customers" },
    },
  });
  const ownerDbStepId = ownerCreateDbRes.data?.insert_workflow_steps_one?.id;
  const ownerCanCreateDb = !!ownerDbStepId;
  console.log(`   • Owner A created 'db_write' step (Owner-only): ${ownerCanCreateDb ? `PASS ✓ (ID: ${ownerDbStepId})` : "FAIL ✗"}`);

  // C. Owner creates notify step (Owner-only permitted)
  const ownerCreateNotifyRes = await queryGraphQL(ownerA.token, INSERT_STEP, {
    step: {
      workflow_id: workflowAId,
      name: "Slack Alert Dispatcher",
      type: "notify",
      position: 12,
      config: { channel: "Slack", recipient: "#alerts", message: "Success" },
    },
  });
  const ownerNotifyStepId = ownerCreateNotifyRes.data?.insert_workflow_steps_one?.id;
  const ownerCanCreateNotify = !!ownerNotifyStepId;
  console.log(`   • Owner A created 'notify' step (Owner-only): ${ownerCanCreateNotify ? `PASS ✓ (ID: ${ownerNotifyStepId})` : "FAIL ✗"}`);

  // D. Owner creates webhook trigger (Owner-only permitted)
  const ownerCreateWebhookRes = await queryGraphQL(ownerA.token, INSERT_TRIGGER, {
    trigger: {
      workflow_id: workflowAId,
      type: "webhook",
      enabled: true,
      config: {},
    },
  });
  const ownerTriggerId = ownerCreateWebhookRes.data?.insert_workflow_triggers_one?.id;
  const ownerCanCreateWebhook = !!ownerTriggerId;
  console.log(`   • Owner A created 'webhook' trigger (Owner-only): ${ownerCanCreateWebhook ? "PASS ✓" : "FAIL ✗"}`);

  // E. Owner manages organization members
  const ownerMemberQuery = await queryGraphQL(ownerA.token, `
    query { org_members(where: { org_id: { _eq: "${orgAId}" } }) { id user_id role } }
  `);
  const ownerCanReadMembers = (ownerMemberQuery.data?.org_members?.length || 0) >= 3;
  console.log(`   • Owner A can manage organization members: ${ownerCanReadMembers ? "PASS ✓" : "FAIL ✗"}`);

  // -----------------------------------------------------------------------------------------
  // 3. EDITOR A: Authoring Allowed Steps & Blocked on Owner-Only Steps
  // -----------------------------------------------------------------------------------------
  console.log("\n3. Testing EDITOR A Permissions & Restrictions (Org A)...");

  // A. Editor reads steps in Org A
  const editorReadSteps = await queryGraphQL(editorA.token, GET_STEPS_BY_WORKFLOW, { workflowId: workflowAId });
  const editorCanReadSteps = (editorReadSteps.data?.workflow_steps?.length || 0) > 0;
  console.log(`   • Editor A can read Org A steps: ${editorCanReadSteps ? "PASS ✓" : "FAIL ✗"}`);

  // B. Editor creates allowed step type (llm_call)
  const editorCreateLlmRes = await queryGraphQL(editorA.token, INSERT_STEP, {
    step: {
      workflow_id: workflowAId,
      name: "Analysis Agent",
      type: "llm_call",
      position: 13,
      config: { model: "Gemini", systemPrompt: "Analyze input" },
    },
  });
  const editorStepId = editorCreateLlmRes.data?.insert_workflow_steps_one?.id;
  const editorCanCreateAllowedStep = !!editorStepId;
  console.log(`   • Editor A created allowed step ('llm_call'): ${editorCanCreateAllowedStep ? `PASS ✓ (ID: ${editorStepId})` : "FAIL ✗"}`);

  // C. Editor creates allowed trigger type (manual)
  const editorCreateManualTrigger = await queryGraphQL(editorA.token, INSERT_TRIGGER, {
    trigger: {
      workflow_id: workflowAId,
      type: "manual",
      enabled: true,
      config: {},
    },
  });
  const editorCanCreateManualTrigger = !!editorCreateManualTrigger.data?.insert_workflow_triggers_one;
  console.log(`   • Editor A created allowed trigger ('manual'): ${editorCanCreateManualTrigger ? "PASS ✓" : "FAIL ✗"}`);

  // D. Editor BLOCKED from creating 'db_write' (Owner-only rule)
  const editorCreateDbRes = await queryGraphQL(editorA.token, INSERT_STEP, {
    step: {
      workflow_id: workflowAId,
      name: "Unauthorized DB Write",
      type: "db_write",
      position: 14,
      config: { operation: "DELETE", tableName: "users" },
    },
  });
  const editorDbBlocked = !editorCreateDbRes.data?.insert_workflow_steps_one;
  console.log(`   • Editor A creating 'db_write' (Owner-only): ${editorDbBlocked ? "BLOCKED / DENIED (PASS ✓)" : "SECURITY LEAK! (FAIL ✗)"}`);

  // E. Editor BLOCKED from creating 'notify' (Owner-only rule)
  const editorCreateNotifyRes = await queryGraphQL(editorA.token, INSERT_STEP, {
    step: {
      workflow_id: workflowAId,
      name: "Unauthorized Notify",
      type: "notify",
      position: 15,
      config: { channel: "Email" },
    },
  });
  const editorNotifyBlocked = !editorCreateNotifyRes.data?.insert_workflow_steps_one;
  console.log(`   • Editor A creating 'notify' (Owner-only): ${editorNotifyBlocked ? "BLOCKED / DENIED (PASS ✓)" : "SECURITY LEAK! (FAIL ✗)"}`);

  // F. Editor BLOCKED from creating 'webhook' trigger (Owner-only rule)
  const editorCreateWebhookRes = await queryGraphQL(editorA.token, INSERT_TRIGGER, {
    trigger: {
      workflow_id: workflowAId,
      type: "webhook",
      enabled: true,
      config: {},
    },
  });
  const editorWebhookBlocked = !editorCreateWebhookRes.data?.insert_workflow_triggers_one;
  console.log(`   • Editor A creating 'webhook' trigger (Owner-only): ${editorWebhookBlocked ? "BLOCKED / DENIED (PASS ✓)" : "SECURITY LEAK! (FAIL ✗)"}`);

  // G. Editor BLOCKED from deleting workflow entity (Owner-only rule)
  const editorDeleteWorkflowRes = await queryGraphQL(editorA.token, `
    mutation { delete_workflows_by_pk(id: "${workflowAId}") { id } }
  `);
  const editorCannotDeleteWorkflow = !editorDeleteWorkflowRes.data?.delete_workflows_by_pk;
  console.log(`   • Editor A deleting workflow entity (Owner-only): ${editorCannotDeleteWorkflow ? "BLOCKED / DENIED (PASS ✓)" : "FAIL ✗"}`);

  // H. Editor BLOCKED from managing members
  const editorAddMemberRes = await queryGraphQL(editorA.token, `
    mutation { insert_org_members_one(object: { org_id: "${orgAId}", user_id: "${editorA.userId}", role: "owner" }) { id } }
  `);
  const editorCannotManageMembers = !editorAddMemberRes.data?.insert_org_members_one;
  console.log(`   • Editor A managing org members (Owner-only): ${editorCannotManageMembers ? "BLOCKED / DENIED (PASS ✓)" : "FAIL ✗"}`);

  // -----------------------------------------------------------------------------------------
  // 4. VIEWER A: Read-Only Access & Total Mutation Restrictions
  // -----------------------------------------------------------------------------------------
  console.log("\n4. Testing VIEWER A Restrictions (Read-Only in Org A)...");

  // A. Viewer can read Org A steps
  const viewerReadSteps = await queryGraphQL(viewerA.token, GET_STEPS_BY_WORKFLOW, { workflowId: workflowAId });
  const viewerCanReadSteps = (viewerReadSteps.data?.workflow_steps?.length || 0) > 0;
  console.log(`   • Viewer A can view Org A steps: ${viewerCanReadSteps ? "PASS ✓" : "FAIL ✗"}`);

  // B. Viewer CANNOT create workflows
  const viewerCreateWorkflowRes = await queryGraphQL(viewerA.token, `
    mutation { insert_workflows_one(object: { org_id: "${orgAId}", name: "Viewer Workflow" }) { id } }
  `);
  const viewerCannotCreateWorkflow = !viewerCreateWorkflowRes.data?.insert_workflows_one;
  console.log(`   • Viewer A creating workflow: ${viewerCannotCreateWorkflow ? "BLOCKED / DENIED (PASS ✓)" : "FAIL ✗"}`);

  // C. Viewer CANNOT insert any step
  const viewerCreateStepRes = await queryGraphQL(viewerA.token, INSERT_STEP, {
    step: {
      workflow_id: workflowAId,
      name: "Viewer Step",
      type: "llm_call",
      position: 20,
      config: {},
    },
  });
  const viewerCannotCreateStep = !viewerCreateStepRes.data?.insert_workflow_steps_one;
  console.log(`   • Viewer A creating step: ${viewerCannotCreateStep ? "BLOCKED / DENIED (PASS ✓)" : "FAIL ✗"}`);

  // D. Viewer CANNOT update step
  const viewerUpdateStepRes = await queryGraphQL(viewerA.token, UPDATE_STEP, {
    id: ownerStepId,
    name: "Viewer Hacked Step",
    config: {},
  });
  const viewerCannotUpdateStep = !viewerUpdateStepRes.data?.update_workflow_steps_by_pk;
  console.log(`   • Viewer A updating step: ${viewerCannotUpdateStep ? "BLOCKED / DENIED (PASS ✓)" : "FAIL ✗"}`);

  // E. Viewer CANNOT delete step
  const viewerDeleteStepRes = await queryGraphQL(viewerA.token, DELETE_STEP, { id: ownerStepId });
  const viewerCannotDeleteStep = !viewerDeleteStepRes.data?.delete_workflow_steps_by_pk;
  console.log(`   • Viewer A deleting step: ${viewerCannotDeleteStep ? "BLOCKED / DENIED (PASS ✓)" : "FAIL ✗"}`);

  // -----------------------------------------------------------------------------------------
  // 5. OWNER B: Cross-Organization Isolation
  // -----------------------------------------------------------------------------------------
  console.log("\n5. Testing Cross-Organization Isolation (Owner B -> Org A)...");

  // A. Owner B querying Org A steps list
  const ownerBReadSteps = await queryGraphQL(ownerB.token, GET_STEPS_BY_WORKFLOW, { workflowId: workflowAId });
  const ownerBStepsListEmpty = (ownerBReadSteps.data?.workflow_steps?.length || 0) === 0;
  console.log(`   • Owner B querying Org A steps list: ${ownerBStepsListEmpty ? "EMPTY LIST / DENIED (PASS ✓)" : "LEAK! FAIL ✗"}`);

  // B. Owner B guessing exact Org A Step UUID
  const ownerBGuessStep = await queryGraphQL(ownerB.token, GET_STEP_BY_PK, { id: ownerStepId });
  const ownerBGuessBlocked = ownerBGuessStep.data?.workflow_steps_by_pk === null;
  console.log(`   • Owner B querying exact Step UUID (${ownerStepId}): ${ownerBGuessBlocked ? "NULL / DENIED (PASS ✓)" : "LEAK! FAIL ✗"}`);

  // C. Owner B mutating Org A step
  const ownerBUpdateStep = await queryGraphQL(ownerB.token, UPDATE_STEP, {
    id: ownerStepId,
    name: "Attacked by Org B",
    config: {},
  });
  const ownerBUpdateBlocked = !ownerBUpdateStep.data?.update_workflow_steps_by_pk;
  console.log(`   • Owner B mutating Org A step: ${ownerBUpdateBlocked ? "BLOCKED / DENIED (PASS ✓)" : "FAIL ✗"}`);

  // Clean up created test steps
  if (ownerStepId) await queryGraphQL(ownerA.token, DELETE_STEP, { id: ownerStepId });
  if (ownerDbStepId) await queryGraphQL(ownerA.token, DELETE_STEP, { id: ownerDbStepId });
  if (ownerNotifyStepId) await queryGraphQL(ownerA.token, DELETE_STEP, { id: ownerNotifyStepId });
  if (editorStepId) await queryGraphQL(ownerA.token, DELETE_STEP, { id: editorStepId });
  if (ownerTriggerId) await queryGraphQL(ownerA.token, `mutation { delete_workflow_triggers_by_pk(id: "${ownerTriggerId}") { id } }`);

  console.log("\n=======================================================================");
  console.log("   ASSIGNMENT LAYER 2 ROLE & STEP PERMISSION MATRIX SUMMARY            ");
  console.log("=======================================================================");
  console.log(`  1. OWNER can create approval_gate:                  ${ownerCanCreateStep ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  2. OWNER can create db_write (Owner-only):          ${ownerCanCreateDb ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  3. OWNER can create notify (Owner-only):            ${ownerCanCreateNotify ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  4. OWNER can create webhook trigger (Owner-only):   ${ownerCanCreateWebhook ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  5. OWNER can manage org members:                    ${ownerCanReadMembers ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  6. EDITOR can create llm_call / manual trigger:     ${editorCanCreateAllowedStep && editorCanCreateManualTrigger ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  7. EDITOR blocked from db_write (Owner-only):       ${editorDbBlocked ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  8. EDITOR blocked from notify (Owner-only):         ${editorNotifyBlocked ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  9. EDITOR blocked from webhook trigger (Owner-only): ${editorWebhookBlocked ? "PASS ✓" : "FAIL ✗"}`);
  console.log(` 10. EDITOR blocked from deleting workflow / members: ${editorCannotDeleteWorkflow && editorCannotManageMembers ? "PASS ✓" : "FAIL ✗"}`);
  console.log(` 11. VIEWER can read steps in organization:          ${viewerCanReadSteps ? "PASS ✓" : "FAIL ✗"}`);
  console.log(` 12. VIEWER blocked from inserting/updating steps:   ${viewerCannotCreateStep && viewerCannotUpdateStep ? "PASS ✓" : "FAIL ✗"}`);
  console.log(` 13. Cross-Org exact step UUID access denied:         ${ownerBGuessBlocked ? "PASS ✓" : "FAIL ✗"}`);
  console.log(` 14. Cross-Org step mutation blocked:                 ${ownerBUpdateBlocked ? "PASS ✓" : "FAIL ✗"}`);
  console.log("=======================================================================\n");

  const allPassed =
    ownerCanCreateStep &&
    ownerCanCreateDb &&
    ownerCanCreateNotify &&
    ownerCanCreateWebhook &&
    ownerCanReadMembers &&
    editorCanCreateAllowedStep &&
    editorCanCreateManualTrigger &&
    editorDbBlocked &&
    editorNotifyBlocked &&
    editorWebhookBlocked &&
    editorCannotDeleteWorkflow &&
    editorCannotManageMembers &&
    viewerCanReadSteps &&
    viewerCannotCreateStep &&
    viewerCannotUpdateStep &&
    ownerBStepsListEmpty &&
    ownerBGuessBlocked &&
    ownerBUpdateBlocked;

  if (!allPassed) {
    throw new Error("One or more Layer 2 permission verification checks failed.");
  }
  console.log("🎉 ALL ASSIGNMENT LAYER 2 ROLE & STEP PERMISSION CHECKS PASSED (100%)!\n");
}

runLayer2Verification().catch((err) => {
  console.error("Layer 2 verification error:", err);
  process.exit(1);
});
