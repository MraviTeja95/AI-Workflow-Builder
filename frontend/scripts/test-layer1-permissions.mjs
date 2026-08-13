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
  };
}

async function queryGraphQLWithJWT(jwtToken, query, variables = {}) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwtToken}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function runLayer1Verification() {
  console.log("=======================================================================");
  console.log("   ASSIGNMENT LAYER 1: MULTI-TENANT PERMISSION VERIFICATION           ");
  console.log("   (100% REAL NHOST RS256 JWTS • ZERO HASURA ADMIN SECRET IN TEST)    ");
  console.log("=======================================================================\n");

  // 1. Sign in both owners
  console.log("1. Authenticating separate organization owners...");
  const userA = await signIn("mraviteja876@gmail.com", "SecurePassword123!");
  const userB = await signIn("owner.b.isolation.test@example.com", "SecurePassword123!");

  console.log(`   • Owner A (${userA.userId}) authenticated.`);
  console.log(`   • Owner B (${userB.userId}) authenticated.\n`);

  const workflowAId = "efab066b-82db-4d72-adfa-f3c06a5a1200";
  const workflowBId = "7b3f2be5-96cf-4389-8884-71fe8bd9f52a";

  const LIST_WORKFLOWS_QUERY = `
    query ListWorkflows {
      workflows {
        id
        name
        org_id
        organization {
          id
          name
        }
      }
    }
  `;

  const GET_WORKFLOW_BY_PK = `
    query GetWorkflow($id: uuid!) {
      workflows_by_pk(id: $id) {
        id
        name
        org_id
        organization {
          id
          name
        }
      }
    }
  `;

  const UPDATE_WORKFLOW_MUTATION = `
    mutation AttackUpdateWorkflow($id: uuid!, $name: String!) {
      update_workflows_by_pk(pk_columns: { id: $id }, _set: { name: $name }) {
        id
        name
      }
    }
  `;

  // 2. Test Owner A Permissions
  console.log("2. Testing Owner A (Org A: 'AI Workflow Builder') Isolation...");

  const userAWorkflowsRes = await queryGraphQLWithJWT(userA.token, LIST_WORKFLOWS_QUERY);
  const userAWorkflows = userAWorkflowsRes.data?.workflows || [];
  const userAWorkflowIds = userAWorkflows.map((w) => w.id);

  const userASeesOwnOrgWorkflow = userAWorkflowIds.includes(workflowAId);
  const userASeesOtherOrgWorkflow = userAWorkflowIds.includes(workflowBId);

  console.log(`   • Owner A visible workflows count: ${userAWorkflows.length}`);
  console.log(`   • Owner A can view Org A workflow: ${userASeesOwnOrgWorkflow ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • Owner A cannot view Org B workflow in list: ${!userASeesOtherOrgWorkflow ? "PASS ✓" : "FAIL ✗"}`);

  // Test 2B: Owner A guesses Org B workflow UUID
  const userAGuessRes = await queryGraphQLWithJWT(userA.token, GET_WORKFLOW_BY_PK, { id: workflowBId });
  const userAGuessResult = userAGuessRes.data?.workflows_by_pk;
  const userAGuessBlocked = userAGuessResult === null || userAGuessResult === undefined;
  console.log(`   • Owner A guessing Org B UUID (${workflowBId}): ${userAGuessBlocked ? "DENIED / NULL (PASS ✓)" : "LEAK! (FAIL ✗)"}`);

  // Test 2C: Owner A tries to mutate Org B workflow
  const userAAttackRes = await queryGraphQLWithJWT(userA.token, UPDATE_WORKFLOW_MUTATION, {
    id: workflowBId,
    name: "Hacked by User A",
  });
  const userAAttackBlocked = !userAAttackRes.data?.update_workflows_by_pk;
  console.log(`   • Owner A mutating Org B workflow: ${userAAttackBlocked ? "DENIED (PASS ✓)" : "MUTATED (FAIL ✗)"}`);

  // 3. Test Owner B Permissions
  console.log("\n3. Testing Owner B (Org B: 'Acme Corp') Isolation...");

  const userBWorkflowsRes = await queryGraphQLWithJWT(userB.token, LIST_WORKFLOWS_QUERY);
  const userBWorkflows = userBWorkflowsRes.data?.workflows || [];
  const userBWorkflowIds = userBWorkflows.map((w) => w.id);

  const userBSeesOwnOrgWorkflow = userBWorkflowIds.includes(workflowBId);
  const userBSeesOtherOrgWorkflow = userBWorkflowIds.includes(workflowAId);

  console.log(`   • Owner B visible workflows count: ${userBWorkflows.length}`);
  console.log(`   • Owner B can view Org B workflow: ${userBSeesOwnOrgWorkflow ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • Owner B cannot view Org A workflow in list: ${!userBSeesOtherOrgWorkflow ? "PASS ✓" : "FAIL ✗"}`);

  // Test 3B: Owner B guesses Org A workflow UUID
  const userBGuessRes = await queryGraphQLWithJWT(userB.token, GET_WORKFLOW_BY_PK, { id: workflowAId });
  const userBGuessResult = userBGuessRes.data?.workflows_by_pk;
  const userBGuessBlocked = userBGuessResult === null || userBGuessResult === undefined;
  console.log(`   • Owner B guessing Org A UUID (${workflowAId}): ${userBGuessBlocked ? "DENIED / NULL (PASS ✓)" : "LEAK! (FAIL ✗)"}`);

  // Test 3C: Owner B tries to mutate Org A workflow
  const userBAttackRes = await queryGraphQLWithJWT(userB.token, UPDATE_WORKFLOW_MUTATION, {
    id: workflowAId,
    name: "Hacked by User B",
  });
  const userBAttackBlocked = !userBAttackRes.data?.update_workflows_by_pk;
  console.log(`   • Owner B mutating Org A workflow: ${userBAttackBlocked ? "DENIED (PASS ✓)" : "MUTATED (FAIL ✗)"}`);

  // 4. Test Organization & Membership Table Isolation
  console.log("\n4. Testing Organization & Member Tables Isolation...");

  const ORGS_AND_MEMBERS_QUERY = `
    query {
      organizations {
        id
        name
        org_members {
          id
          user_id
          role
        }
      }
    }
  `;

  const userAOrgsRes = await queryGraphQLWithJWT(userA.token, ORGS_AND_MEMBERS_QUERY);
  const userAOrgs = userAOrgsRes.data?.organizations || [];
  const userAOrgIds = userAOrgs.map((o) => o.id);

  const userBOrgsRes = await queryGraphQLWithJWT(userB.token, ORGS_AND_MEMBERS_QUERY);
  const userBOrgs = userBOrgsRes.data?.organizations || [];
  const userBOrgIds = userBOrgs.map((o) => o.id);

  const orgAIsolated = userAOrgIds.includes("0101ca0e-6bab-4154-9cfc-d4b581ad3554") && !userAOrgIds.includes("cce7603e-9b66-4c75-9ae3-9964fe97742f");
  const orgBIsolated = userBOrgIds.includes("cce7603e-9b66-4c75-9ae3-9964fe97742f") && !userBOrgIds.includes("0101ca0e-6bab-4154-9cfc-d4b581ad3554");

  console.log(`   • Owner A sees only Org A: ${orgAIsolated ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`   • Owner B sees only Org B: ${orgBIsolated ? "PASS ✓" : "FAIL ✗"}`);

  console.log("\n=======================================================================");
  console.log("   LAYER 1 PERMISSION & ISOLATION VERIFICATION MATRIX                  ");
  console.log("=======================================================================");
  console.log(`  1. Owner A can access Org A workflow:           ${userASeesOwnOrgWorkflow ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  2. Owner A cannot access Org B workflow:       ${!userASeesOtherOrgWorkflow ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  3. Owner B can access Org B workflow:           ${userBSeesOwnOrgWorkflow ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  4. Owner B cannot access Org A workflow:       ${!userBSeesOtherOrgWorkflow ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  5. Guessing UUID returns null (A querying B):   ${userAGuessBlocked ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  6. Guessing UUID returns null (B querying A):   ${userBGuessBlocked ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  7. Cross-org mutation blocked (A attacking B):  ${userAAttackBlocked ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  8. Cross-org mutation blocked (B attacking A):  ${userBAttackBlocked ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  9. Organization table isolation (Org A vs B):   ${orgAIsolated && orgBIsolated ? "PASS ✓" : "FAIL ✗"}`);
  console.log("=======================================================================\n");

  const allPassed =
    userASeesOwnOrgWorkflow &&
    !userASeesOtherOrgWorkflow &&
    userAGuessBlocked &&
    userAAttackBlocked &&
    userBSeesOwnOrgWorkflow &&
    !userBSeesOtherOrgWorkflow &&
    userBGuessBlocked &&
    userBAttackBlocked &&
    orgAIsolated &&
    orgBIsolated;

  if (!allPassed) {
    throw new Error("One or more permission tests failed.");
  }
  console.log("🎉 ALL LAYER 1 PERMISSION CHECKS PASSED WITH 100% SUCCESS!\n");
}

runLayer1Verification().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
