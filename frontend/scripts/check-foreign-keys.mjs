import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const sqlUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v2/query";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function checkForeignKeys() {
  const runId = "cb2605ea-5a6a-4e67-ac28-d435426c4be8";

  const sql1 = `SELECT id, workflow_run_id, workflow_step_id FROM step_runs WHERE workflow_run_id = '${runId}';`;
  const res1 = await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ type: "run_sql", args: { source: "default", sql: sql1 } }),
  }).then((r) => r.json());
  console.log("1. step_runs rows:", res1.result);

  const sql2 = `SELECT id, workflow_id, created_by FROM workflow_runs WHERE id = '${runId}';`;
  const res2 = await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ type: "run_sql", args: { source: "default", sql: sql2 } }),
  }).then((r) => r.json());
  console.log("2. workflow_runs row:", res2.result);

  const wfId = res2.result?.[1]?.[1];
  const sql3 = `SELECT id, name, org_id FROM workflows WHERE id = '${wfId}';`;
  const res3 = await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ type: "run_sql", args: { source: "default", sql: sql3 } }),
  }).then((r) => r.json());
  console.log("3. workflows row:", res3.result);

  const orgId = res3.result?.[1]?.[2];
  const sql4 = `SELECT id, name FROM organizations WHERE id = '${orgId}';`;
  const res4 = await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ type: "run_sql", args: { source: "default", sql: sql4 } }),
  }).then((r) => r.json());
  console.log("4. organizations row:", res4.result);

  const sql5 = `SELECT id, org_id, user_id, role FROM org_members WHERE org_id = '${orgId}';`;
  const res5 = await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ type: "run_sql", args: { source: "default", sql: sql5 } }),
  }).then((r) => r.json());
  console.log("5. org_members rows:", res5.result);
}

checkForeignKeys().catch(console.error);
