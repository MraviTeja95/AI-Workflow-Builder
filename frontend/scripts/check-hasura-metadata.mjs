import fs from "node:fs";
import path from "node:path";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const content = fs.readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        env[key] = value;
      }
    }
  }
  return env;
}

const env = loadEnv();
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
      args: {},
    }),
  });
  const data = await res.json();
  const tables = data.sources?.[0]?.tables || [];
  console.log("Tracked Hasura Tables and Permissions:");
  for (const t of tables) {
    console.log(`\nTable: ${t.table?.name}`);
    console.log("  Object Relationships:", t.object_relationships?.map(r => r.name));
    console.log("  Array Relationships:", t.array_relationships?.map(r => r.name));
    console.log("  Select Permissions Roles:", t.select_permissions?.map(p => p.role));
    console.log("  Insert Permissions Roles:", t.insert_permissions?.map(p => p.role));
    console.log("  Update Permissions Roles:", t.update_permissions?.map(p => p.role));
    console.log("  Delete Permissions Roles:", t.delete_permissions?.map(p => p.role));
  }
}

checkMetadata();
