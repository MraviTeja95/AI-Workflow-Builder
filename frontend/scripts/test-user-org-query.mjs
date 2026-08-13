import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

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
