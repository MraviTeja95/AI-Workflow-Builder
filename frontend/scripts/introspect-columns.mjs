import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const endpoint = env.HASURA_GRAPHQL_ENDPOINT;
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function checkColumns() {
  const query = `
    query IntrospectColumns {
      __type(name: "organizations") { fields { name } }
      org_members: __type(name: "org_members") { fields { name } }
      workflows: __type(name: "workflows") { fields { name } }
      workflow_steps: __type(name: "workflow_steps") { fields { name } }
      workflow_triggers: __type(name: "workflow_triggers") { fields { name } }
    }
  `;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ query }),
  });

  const data = await res.json();
  for (const [key, val] of Object.entries(data.data || {})) {
    console.log(`\nTable ${key}:`, val?.fields?.map((f) => f.name));
  }
}

checkColumns();
