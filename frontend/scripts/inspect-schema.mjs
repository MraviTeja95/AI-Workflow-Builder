import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const endpoint =
  env.HASURA_GRAPHQL_ENDPOINT ||
  env.NHOST_GRAPHQL_URL ||
  "https://zggynlwwpraxjmbawiym.graphql.ap-southeast-1.nhost.run/v1";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

if (!adminSecret) {
  console.log("⚠️ HASURA_GRAPHQL_ADMIN_SECRET is not set in frontend/.env.local yet.");
  console.log("Please paste your admin secret into frontend/.env.local and run this check again.");
  process.exit(2);
}

const introspectionQuery = `
query IntrospectTables {
  __schema {
    queryType {
      name
      fields {
        name
        type {
          name
          kind
          ofType {
            name
            kind
          }
        }
      }
    }
    types {
      name
      kind
      fields {
        name
        description
        type {
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
`;

async function main() {
  console.log(`🔍 Connecting to GraphQL endpoint: ${endpoint}`);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": adminSecret,
      },
      body: JSON.stringify({ query: introspectionQuery }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`❌ HTTP Error ${res.status} (${res.statusText}):\n${text}`);
      process.exit(1);
    }

    const data = await res.json();
    if (data.errors) {
      console.error("❌ GraphQL Errors:", JSON.stringify(data.errors, null, 2));
      process.exit(1);
    }

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

    console.log("\n=======================================================");
    console.log("             NHOST / HASURA SCHEMA INSPECTION          ");
    console.log("=======================================================\n");

    for (const tableName of targetTables) {
      // Look for the type definition (usually matching table name or capitalized)
      const typeObj = types.find(
        (t) =>
          t.name.toLowerCase() === tableName.toLowerCase() ||
          t.name.toLowerCase() === `${tableName.toLowerCase()}_table`
      );

      if (!typeObj) {
        console.log(`⚠️ Table type "${tableName}" not found in GraphQL schema.`);
        continue;
      }

      console.log(`\n📋 Table: ${tableName} (${typeObj.name})`);
      console.log("-------------------------------------------------------");

      if (typeObj.fields) {
        for (const field of typeObj.fields) {
          const typeName =
            field.type.name ||
            (field.type.ofType && field.type.ofType.name) ||
            (field.type.ofType &&
              field.type.ofType.ofType &&
              field.type.ofType.ofType.name) ||
            "Unknown";
          const kind = field.type.kind;
          const isRelationship =
            kind === "OBJECT" ||
            kind === "LIST" ||
            (field.type.ofType && field.type.ofType.kind === "OBJECT") ||
            (field.type.ofType && field.type.ofType.kind === "LIST");

          console.log(
            `  • ${field.name.padEnd(24)} : ${typeName.padEnd(16)} ${
              isRelationship ? "[Relationship]" : "[Column]"
            }`
          );
        }
      }
    }

    console.log("\n=======================================================");
    console.log("               SCHEMA INSPECTION COMPLETE              ");
    console.log("=======================================================\n");
  } catch (err) {
    console.error("❌ Connection failed:", err.message);
    process.exit(1);
  }
}

main();
