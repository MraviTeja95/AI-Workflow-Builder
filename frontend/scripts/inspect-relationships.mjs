import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const metadataUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/metadata";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function checkRelationships() {
  const res = await fetch(metadataUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": adminSecret,
    },
    body: JSON.stringify({
      type: "export_metadata",
      version: 2,
      args: {},
    }),
  });

  const data = await res.json();
  const defaultSource = data.metadata?.sources?.[0];
  const tables = defaultSource?.tables || [];

  const targetTables = [
    "organizations",
    "org_members",
    "workflows",
    "workflow_steps",
    "workflow_triggers",
    "workflow_runs",
    "step_runs",
  ];

  console.log("=== TABLE RELATIONSHIPS IN HASURA ===");
  for (const t of tables) {
    const name = t.table?.name;
    if (targetTables.includes(name)) {
      console.log(`\nTable: ${name}`);
      console.log("  Object relationships:", JSON.stringify(t.object_relationships || [], null, 2));
      console.log("  Array relationships:", JSON.stringify(t.array_relationships || [], null, 2));
    }
  }
}

checkRelationships();
