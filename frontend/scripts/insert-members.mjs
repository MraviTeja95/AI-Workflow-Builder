import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const endpoint = env.HASURA_GRAPHQL_ENDPOINT;
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;
const orgAId = "0101ca0e-6bab-4154-9cfc-d4b581ad3554";

async function insertMembers() {
  const mutation = `
    mutation {
      insert_org_members(
        objects: [
          { org_id: "${orgAId}", user_id: "169b1b47-7c24-4a54-b60c-e22f04c4cd75", role: "editor" },
          { org_id: "${orgAId}", user_id: "440246b1-84ce-4e04-844f-3851af26c3b8", role: "viewer" }
        ]
        on_conflict: { constraint: org_members_org_id_user_id_key, update_columns: [role] }
      ) {
        affected_rows
        returning {
          id
          org_id
          user_id
          role
        }
      }
    }
  `;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ query: mutation }),
  }).then((r) => r.json());

  console.log("Insert result:", JSON.stringify(res, null, 2));
}

insertMembers();
