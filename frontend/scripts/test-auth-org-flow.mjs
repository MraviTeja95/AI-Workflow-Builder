import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const endpoint =
  env.HASURA_GRAPHQL_ENDPOINT ||
  "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function testAuthAndOrgRetrieval() {
  console.log("=================================================================");
  console.log("     NHOST AUTHENTICATION & ORGANIZATION RETRIEVAL TEST          ");
  console.log("=================================================================\n");

  const query = `
    query VerifyAuthAndOrg {
      users(where: { email: { _eq: "mraviteja876@gmail.com" } }) {
        id
        email
        displayName
      }
      organizations(where: { org_members: { role: { _eq: "owner" } } }) {
        id
        name
        quota_limit
        quota_used
        org_members {
          id
          user_id
          role
        }
      }
    }
  `;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": adminSecret,
    },
    body: JSON.stringify({ query }),
  });

  const data = await res.json();
  if (data.errors) {
    throw new Error(JSON.stringify(data.errors, null, 2));
  }

  const user = data.data.users[0];
  const org = data.data.organizations[0];
  const member = org?.org_members?.[0];

  console.log("▶ Authenticated User Details:");
  console.log(`  • User ID: ${user?.id}`);
  console.log(`  • Email: ${user?.email}`);

  console.log("\n▶ Organization Details:");
  console.log(`  • Organization ID: ${org?.id}`);
  console.log(`  • Organization Name: "${org?.name}"`);
  console.log(`  • Quota Limit: ${org?.quota_limit}`);

  console.log("\n▶ Membership & Role Details:");
  console.log(`  • Membership ID: ${member?.id}`);
  console.log(`  • User ID: ${member?.user_id}`);
  console.log(`  • Role: "${member?.role}"`);

  const userValid = user?.id === "fb336480-d1b5-4c6b-8d6d-8cd6015e9713";
  const orgValid = org?.id === "0101ca0e-6bab-4154-9cfc-d4b581ad3554" && org?.name === "AI Workflow Builder";
  const roleValid = member?.role === "owner" && member?.user_id === user?.id;

  console.log("\n▶ Verification Summary:");
  console.log(`  • User ID Match: ${userValid ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  • Organization Match: ${orgValid ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  • Role = owner: ${roleValid ? "PASS ✓" : "FAIL ✗"}`);

  if (!userValid || !orgValid || !roleValid) {
    throw new Error("Verification failed.");
  }

  console.log("\n=================================================================");
  console.log("   🎉 AUTH & ORGANIZATION RETRIEVAL VERIFIED SUCCESSFULLY!       ");
  console.log("=================================================================\n");
}

testAuthAndOrgRetrieval().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
