import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const sqlUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v2/query";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function checkAllStepRuns() {
  const sql = `
    SELECT sr.id, sr.workflow_run_id, wr.workflow_id, wr.status as run_status, sr.status as step_status
    FROM step_runs sr
    JOIN workflow_runs wr ON wr.id = sr.workflow_run_id
    ORDER BY sr.created_at DESC
    LIMIT 10;
  `;
  const res = await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ type: "run_sql", args: { source: "default", sql } }),
  }).then((r) => r.json());
  console.log(res.result);
}

checkAllStepRuns().catch(console.error);
