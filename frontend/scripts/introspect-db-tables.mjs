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
const graphqlUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";
const sqlUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v2/query";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function checkSchema() {
  const res = await fetch(sqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": adminSecret,
    },
    body: JSON.stringify({
      type: "run_sql",
      args: {
        sql: `
          SELECT table_name, column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public'
          ORDER BY table_name, ordinal_position;
        `,
      },
    }),
  });
  const data = await res.json();
  console.log("SQL Schema Result:", JSON.stringify(data, null, 2));
}

checkSchema();
