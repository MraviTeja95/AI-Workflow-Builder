import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const endpoint =
  env.HASURA_GRAPHQL_ENDPOINT ||
  "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

// Check if auth schema or auth users are accessible
const checkAuthQuery = `
query CheckAuthUsers {
  users {
    id
    email
  }
}
`;

async function main() {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": adminSecret,
    },
    body: JSON.stringify({ query: checkAuthQuery }),
  });
  const data = await res.json();
  console.log("Auth users result:", JSON.stringify(data, null, 2));
}

main();
