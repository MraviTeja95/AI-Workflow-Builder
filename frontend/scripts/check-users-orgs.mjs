import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const endpoint = env.HASURA_GRAPHQL_ENDPOINT;
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function checkExistingUsersAndOrgs() {
  const query = `
    query GetUsersAndOrgs {
      users {
        id
        email
        displayName
      }
      organizations {
        id
        name
        org_members {
          id
          user_id
          role
        }
        workflows {
          id
          name
        }
      }
    }
  `;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ query }),
  });

  const data = await res.json();
  console.log("Users:", JSON.stringify(data.data?.users, null, 2));
  console.log("Organizations:", JSON.stringify(data.data?.organizations, null, 2));
}

checkExistingUsersAndOrgs();
