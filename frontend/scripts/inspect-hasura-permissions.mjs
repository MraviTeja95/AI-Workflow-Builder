import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const metadataUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/metadata";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function inspectHasuraPermissions() {
  console.log("=======================================================================");
  console.log("   INSPECTING HASURA PERMISSIONS FOR step_runs & workflow_runs        ");
  console.log("=======================================================================\n");

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
  }).then((r) => r.json());

  const tables = res.metadata?.sources?.[0]?.tables || [];
  
  const stepRunsTable = tables.find((t) => t.table?.name === "step_runs");
  const workflowRunsTable = tables.find((t) => t.table?.name === "workflow_runs");
  const workflowsTable = tables.find((t) => t.table?.name === "workflows");

  console.log("1. step_runs Table Configuration:");
  console.log("   • Select Permissions:", JSON.stringify(stepRunsTable?.select_permissions, null, 2));
  console.log("   • Relationships:", JSON.stringify(stepRunsTable?.object_relationships, null, 2));

  console.log("\n2. workflow_runs Table Configuration:");
  console.log("   • Select Permissions:", JSON.stringify(workflowRunsTable?.select_permissions, null, 2));

  console.log("\n3. workflows Table Configuration:");
  console.log("   • Select Permissions:", JSON.stringify(workflowsTable?.select_permissions, null, 2));
}

inspectHasuraPermissions().catch(console.error);
