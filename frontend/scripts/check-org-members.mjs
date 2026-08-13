import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const endpoint = env.HASURA_GRAPHQL_ENDPOINT;
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function checkOrgMembers() {
  const query = `
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
      workflows(where: { id: { _eq: "cffee6d9-d7e2-494f-9702-bf1af4aefc0f" } }) {
        id
        name
        org_id
        organization {
          id
          name
          org_members {
            id
            user_id
            role
          }
        }
      }
    }
  `;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ query }),
  }).then((r) => r.json());

  console.log("GraphQL Response:", JSON.stringify(res, null, 2));
}

checkOrgMembers().catch(console.error);
