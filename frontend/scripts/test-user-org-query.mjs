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
        const value = trimmed.slice(idx + 1).trim();
        env[key] = value;
      }
    }
  }
  return env;
}

const env = loadEnv();
const endpoint =
  env.HASURA_GRAPHQL_ENDPOINT ||
  "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function checkUserOrg(userId) {
  const query = `
    query GetUserOrg($userId: uuid!) {
      organizations(where: { org_members: { user_id: { _eq: $userId } } }) {
        id
        name
        quota_limit
        quota_used
        org_members(where: { user_id: { _eq: $userId } }) {
          id
          user_id
          role
        }
      }
      org_members(where: { user_id: { _eq: $userId } }) {
        id
        org_id
        user_id
        role
      }
    }
  `;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": adminSecret,
    },
    body: JSON.stringify({ query, variables: { userId } }),
  });

  const data = await res.json();
  console.log("User Org Membership Result:", JSON.stringify(data, null, 2));
}

checkUserOrg("fb336480-d1b5-4c6b-8d6d-8cd6015e9713");
