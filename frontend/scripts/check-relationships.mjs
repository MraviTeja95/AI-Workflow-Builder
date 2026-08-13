import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const metadataUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/metadata";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function checkRelationships() {
  const res = await fetch(metadataUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ type: "export_metadata", version: 2, args: {} }),
  }).then((r) => r.json());

  const tables = res.metadata?.sources?.[0]?.tables || [];
  const orgs = tables.find((t) => t.table?.name === "organizations");
  const wfRuns = tables.find((t) => t.table?.name === "workflow_runs");

  console.log("Organizations Relationships:");
  console.log(" - Array Relationships:", JSON.stringify(orgs?.array_relationships, null, 2));
  console.log(" - Object Relationships:", JSON.stringify(orgs?.object_relationships, null, 2));

  console.log("Workflow Runs Relationships:");
  console.log(" - Object Relationships:", JSON.stringify(wfRuns?.object_relationships, null, 2));
  console.log(" - Array Relationships:", JSON.stringify(wfRuns?.array_relationships, null, 2));
}

checkRelationships().catch(console.error);
