import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const metadataUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/metadata";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function checkMetadata() {
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

  console.log("=== CURRENT HASURA PERMISSIONS ===");
  for (const t of tables) {
    const name = t.table?.name;
    const permissions = {
      select: t.select_permissions?.map((p) => ({ role: p.role, perm: p.permission })),
      insert: t.insert_permissions?.map((p) => ({ role: p.role, perm: p.permission })),
      update: t.update_permissions?.map((p) => ({ role: p.role, perm: p.permission })),
      delete: t.delete_permissions?.map((p) => ({ role: p.role, perm: p.permission })),
    };
    console.log(`\nTable: ${name}`);
    console.log("  Select:", JSON.stringify(permissions.select || []));
    console.log("  Insert:", JSON.stringify(permissions.insert || []));
    console.log("  Update:", JSON.stringify(permissions.update || []));
    console.log("  Delete:", JSON.stringify(permissions.delete || []));
  }
}

checkMetadata();
