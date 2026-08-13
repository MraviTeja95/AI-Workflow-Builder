import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const endpoint = env.HASURA_GRAPHQL_ENDPOINT;
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;
const authUrl = "https://zggynlwwpraxjmbawiym.auth.ap-southeast-1.nhost.run/v1";

async function runCrossOrgPermissionTest() {
  console.log("=================================================================");
  console.log("   LAYER 1: CROSS-ORGANIZATION & ROLE PERMISSION TEST            ");
  console.log("=================================================================\n");

  const orgAId = "0101ca0e-6bab-4154-9cfc-d4b581ad3554";
  const userAId = "fb336480-d1b5-4c6b-8d6d-8cd6015e9713";
  const workflowAId = "efab066b-82db-4d72-adfa-f3c06a5a1200";

  // Step 1: Ensure User B and Organization B exist in the database
  const userBEmail = "owner.b.isolation.test@example.com";
  const userBPassword = "SecurePassword123!";

  console.log("1. Setting up Organization B & Owner B in Nhost/Hasura...");
  let userBId = null;

  // Check if User B already exists in auth.users
  const userQuery = `
    query GetUserB {
      users(where: { email: { _eq: "${userBEmail}" } }) {
        id
        email
      }
    }
  `;
  const userRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ query: userQuery }),
  }).then((r) => r.json());

  if (userRes.data?.users?.length > 0) {
    userBId = userRes.data.users[0].id;
    console.log(`   • Existing User B found: ${userBId}`);
  } else {
    // Sign up User B through Nhost Auth HTTP endpoint
    console.log("   • Registering Owner B via Nhost Auth...");
    const signUpRes = await fetch(`${authUrl}/signup/email-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: userBEmail,
        password: userBPassword,
      }),
    }).then((r) => r.json());

    userBId = signUpRes.session?.user?.id || signUpRes.user?.id;
    if (!userBId) {
      // Fallback check if user created
      const retryUser = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
        body: JSON.stringify({ query: userQuery }),
      }).then((r) => r.json());
      userBId = retryUser.data?.users?.[0]?.id;
    }
    console.log(`   • Registered Owner B with ID: ${userBId}`);
  }

  // Create Organization B and workflow B if not exists
  const setupOrgBQuery = `
    mutation SetupOrgB($userBId: uuid!) {
      insert_organizations_one(
        object: {
          name: "Acme Corp (Org B)"
          quota_limit: 50
          org_members: {
            data: [{ user_id: $userBId, role: "owner" }]
          }
          workflows: {
            data: [{
              name: "Acme Customer Ingestion (Org B Workflow)"
              created_by: $userBId
            }]
          }
        }
      ) {
        id
        name
        org_members { id user_id role }
        workflows { id name }
      }
    }
  `;

  // Check if Org B already exists
  const orgBCheck = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({
      query: `query { organizations(where: { name: { _eq: "Acme Corp (Org B)" } }) { id name workflows { id name } } }`,
    }),
  }).then((r) => r.json());

  let orgBId;
  let workflowBId;

  if (orgBCheck.data?.organizations?.length > 0) {
    orgBId = orgBCheck.data.organizations[0].id;
    workflowBId = orgBCheck.data.organizations[0].workflows[0]?.id;
  } else {
    const orgBRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
      body: JSON.stringify({ query: setupOrgBQuery, variables: { userBId } }),
    }).then((r) => r.json());
    orgBId = orgBRes.data?.insert_organizations_one?.id;
    workflowBId = orgBRes.data?.insert_organizations_one?.workflows[0]?.id;
  }

  console.log(`   • Organization A ID: ${orgAId}`);
  console.log(`   • Organization A Workflow ID: ${workflowAId}`);
  console.log(`   • Organization B ID: ${orgBId}`);
  console.log(`   • Organization B Workflow ID: ${workflowBId}\n`);

  // Step 2: Query as User A (role: 'user', X-Hasura-User-Id: userAId) WITHOUT admin secret
  console.log("2. Testing User A (Owner of Org A) Queries (NO ADMIN SECRET)...");

  const queryWorkflows = `
    query GetMyWorkflows {
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

  const querySpecificWorkflow = `
    query GetWorkflowById($id: uuid!) {
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

  const userAHeaders = {
    "Content-Type": "application/json",
    "x-hasura-role": "user",
    "x-hasura-user-id": userAId,
  };

  const userBHeaders = {
    "Content-Type": "application/json",
    "x-hasura-role": "user",
    "x-hasura-user-id": userBId,
  };

  // Test 2A: User A lists all visible workflows
  const userAWorkflows = await fetch(endpoint, {
    method: "POST",
    headers: userAHeaders,
    body: JSON.stringify({ query: queryWorkflows }),
  }).then((r) => r.json());

  const userAVisibleIds = userAWorkflows.data?.workflows?.map((w) => w.id) || [];
  const userASeesOrgA = userAVisibleIds.includes(workflowAId);
  const userASeesOrgB = userAVisibleIds.includes(workflowBId);

  console.log(`   • User A lists visible workflows: ${userAVisibleIds.length} found`);
  console.log(`   • User A can see Org A Workflow (${workflowAId}): ${userASeesOrgA ? "YES (PASS ✓)" : "NO (FAIL ✗)"}`);
  console.log(`   • User A can see Org B Workflow in list: ${userASeesOrgB ? "YES (LEAK! FAIL ✗)" : "NO (PASS ✓)"}`);

  // Test 2B: User A tries to directly fetch Org B's workflow by guessing UUID
  const userATargetsOrgB = await fetch(endpoint, {
    method: "POST",
    headers: userAHeaders,
    body: JSON.stringify({ query: querySpecificWorkflow, variables: { id: workflowBId } }),
  }).then((r) => r.json());

  const userAGuessResult = userATargetsOrgB.data?.workflows_by_pk;
  console.log(`   • User A directly querying Org B UUID (${workflowBId}): ${userAGuessResult === null ? "NULL / DENIED (PASS ✓)" : "ACCESSED (LEAK! FAIL ✗)"}`);

  // Step 3: Query as User B (role: 'user', X-Hasura-User-Id: userBId) WITHOUT admin secret
  console.log("\n3. Testing User B (Owner of Org B) Queries (NO ADMIN SECRET)...");

  const userBWorkflows = await fetch(endpoint, {
    method: "POST",
    headers: userBHeaders,
    body: JSON.stringify({ query: queryWorkflows }),
  }).then((r) => r.json());

  const userBVisibleIds = userBWorkflows.data?.workflows?.map((w) => w.id) || [];
  const userBSeesOrgB = userBVisibleIds.includes(workflowBId);
  const userBSeesOrgA = userBVisibleIds.includes(workflowAId);

  console.log(`   • User B lists visible workflows: ${userBVisibleIds.length} found`);
  console.log(`   • User B can see Org B Workflow (${workflowBId}): ${userBSeesOrgB ? "YES (PASS ✓)" : "NO (FAIL ✗)"}`);
  console.log(`   • User B can see Org A Workflow in list: ${userBSeesOrgA ? "YES (LEAK! FAIL ✗)" : "NO (PASS ✓)"}`);

  // Test 3B: User B tries to directly fetch Org A's workflow by guessing UUID
  const userBTargetsOrgA = await fetch(endpoint, {
    method: "POST",
    headers: userBHeaders,
    body: JSON.stringify({ query: querySpecificWorkflow, variables: { id: workflowAId } }),
  }).then((r) => r.json());

  const userBGuessResult = userBTargetsOrgA.data?.workflows_by_pk;
  console.log(`   • User B directly querying Org A UUID (${workflowAId}): ${userBGuessResult === null ? "NULL / DENIED (PASS ✓)" : "ACCESSED (LEAK! FAIL ✗)"}`);

  // Step 4: Test Mutation Permissions (User B tries to update Org A's workflow)
  console.log("\n4. Testing Cross-Organization Mutation Security...");
  const updateMutation = `
    mutation AttackUpdateWorkflow($id: uuid!) {
      update_workflows_by_pk(pk_columns: { id: $id }, _set: { name: "Hacked Workflow" }) {
        id
        name
      }
    }
  `;

  const userBAttacksOrgA = await fetch(endpoint, {
    method: "POST",
    headers: userBHeaders,
    body: JSON.stringify({ query: updateMutation, variables: { id: workflowAId } }),
  }).then((r) => r.json());

  const updateSuccess = userBAttacksOrgA.data?.update_workflows_by_pk !== null && userBAttacksOrgA.data?.update_workflows_by_pk !== undefined;
  console.log(`   • User B updating Org A workflow: ${!updateSuccess ? "BLOCKED / DENIED (PASS ✓)" : "MUTATED (SECURITY BREACH! FAIL ✗)"}`);

  console.log("\n=================================================================");
  console.log("      ORGANIZATION ISOLATION & PERMISSION SUMMARY               ");
  console.log("=================================================================");
  console.log(`  1. Owner A can access Org A workflow:       ${userASeesOrgA ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  2. Owner A cannot access Org B workflow:   ${!userASeesOrgB ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  3. Owner B can access Org B workflow:       ${userBSeesOrgB ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  4. Owner B cannot access Org A workflow:   ${!userBSeesOrgA ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  5. Guessing target UUID returns null:       ${userAGuessResult === null && userBGuessResult === null ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  6. Cross-org unauthorized mutation blocked: ${!updateSuccess ? "PASS ✓" : "FAIL ✗"}`);
  console.log("=================================================================\n");

  if (!userASeesOrgA || userASeesOrgB || !userBSeesOrgB || userBSeesOrgA || userAGuessResult !== null || updateSuccess) {
    throw new Error("One or more permission tests failed.");
  }
}

runCrossOrgPermissionTest().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
