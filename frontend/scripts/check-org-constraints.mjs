import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const sqlUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v2/query";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function checkConstraints() {
  const query = `
    SELECT conname, pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE conrelid = 'public.org_members'::regclass;
  `;

  const res = await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ type: "run_sql", args: { source: "default", sql: query } }),
  }).then((r) => r.json());

  console.log("org_members constraints:", JSON.stringify(res, null, 2));
}

checkConstraints();
