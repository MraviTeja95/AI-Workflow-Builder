import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const endpoint = env.HASURA_GRAPHQL_ENDPOINT;
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;
const sqlUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v2/query";
const authUrl = "https://zggynlwwpraxjmbawiym.auth.ap-southeast-1.nhost.run/v1";

const orgAId = "0101ca0e-6bab-4154-9cfc-d4b581ad3554";

async function setupTestUsers() {
  console.log("Setting up Admin and Member users for Organization A...");

  const usersToSetup = [
    { email: "admin.a.test@example.com", role: "admin", name: "Admin Alice" },
    { email: "member.a.test@example.com", role: "member", name: "Member Bob" },
  ];

  for (const u of usersToSetup) {
    // 1. Sign up user via Nhost Auth
    await fetch(`${authUrl}/signup/email-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: u.email, password: "SecurePassword123!" }),
    });

    // 2. Mark verified and copy working password hash
    const sql = `
      UPDATE auth.users
      SET email_verified = true,
          disabled = false,
          password_hash = (SELECT password_hash FROM auth.users WHERE email = 'owner.b.isolation.test@example.com')
      WHERE email = '${u.email}';
    `;
    await fetch(sqlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
      body: JSON.stringify({ type: "run_sql", args: { source: "default", sql } }),
    });

    // 3. Get user id
    const userRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
      body: JSON.stringify({
        query: `query { users(where: { email: { _eq: "${u.email}" } }) { id email } }`,
      }),
    }).then((r) => r.json());

    const userId = userRes.data?.users?.[0]?.id;

    // 4. Add to org_members
    const memberMutation = `
      mutation AddMember($orgId: uuid!, $userId: uuid!, $role: String!) {
        insert_org_members_one(
          object: { org_id: $orgId, user_id: $userId, role: $role }
          on_conflict: { constraint: org_members_org_id_user_id_key, update_columns: [role] }
        ) {
          id
          role
        }
      }
    `;

    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
      body: JSON.stringify({
        query: memberMutation,
        variables: { orgId: orgAId, userId, role: u.role },
      }),
    });

    console.log(`  ✓ Configured ${u.role.toUpperCase()}: ${u.email} (${userId})`);
  }
}

setupTestUsers().catch(console.error);
