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
        const value = trimmed.slice(idx + 1).trim();
        env[key] = value;
      }
    }
  }
  return env;
}

const env = loadEnv();
const endpoint =
  env.HASURA_GRAPHQL_ENDPOINT ||
  env.NHOST_GRAPHQL_URL ||
  "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

const query = `
query DetailedIntrospection {
  __schema {
    types {
      name
      kind
      fields {
        name
        type {
          name
          kind
          ofType {
            name
            kind
            ofType {
              name
              kind
              ofType {
                name
                kind
              }
            }
          }
        }
      }
    }
  }
}
`;

const sampleQuery = `
query CheckExistingData {
  organizations(limit: 5) {
    id
    name
  }
  workflows(limit: 5) {
    id
    name
    org_id
  }
}
`;

function unwrapType(type) {
  let isNonNull = false;
  let isList = false;
  let cur = type;

  while (cur && (cur.kind === "NON_NULL" || cur.kind === "LIST")) {
    if (cur.kind === "NON_NULL") isNonNull = true;
    if (cur.kind === "LIST") isList = true;
    cur = cur.ofType;
  }

  return {
    typeName: cur ? cur.name || "Unknown" : "Unknown",
    kind: cur ? cur.kind : "Unknown",
    isNonNull,
    isList,
  };
}

async function main() {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": adminSecret,
    },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();

  const dataRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": adminSecret,
    },
    body: JSON.stringify({ query: sampleQuery }),
  });
  const existingRecords = await dataRes.json();

  console.log("--- SCHEMA DETAILS ---");
  const targetTables = [
    "organizations",
    "org_members",
    "workflows",
    "workflow_steps",
    "workflow_triggers",
    "workflow_runs",
    "step_runs",
  ];

  const types = data.data.__schema.types;

  for (const tableName of targetTables) {
    const typeObj = types.find((t) => t.name === tableName);
    if (!typeObj) continue;

    console.log(`\n================== TABLE: ${tableName} ==================`);
    for (const f of typeObj.fields || []) {
      const info = unwrapType(f.type);
      const isRel = info.kind === "OBJECT" || info.isList;
      console.log(
        `  ${f.name.padEnd(28)} | Type: ${info.typeName.padEnd(16)} | Nullable: ${(!info.isNonNull).toString().padEnd(6)} | Kind: ${isRel ? (info.isList ? "List Relationship" : "Object Relationship") : "Column"}`
      );
    }
  }

  console.log("\n--- EXISTING DATA SAMPLES ---");
  console.log("Organizations in DB:", JSON.stringify(existingRecords.data?.organizations || [], null, 2));
  console.log("Workflows in DB:", JSON.stringify(existingRecords.data?.workflows || [], null, 2));
}

main();
