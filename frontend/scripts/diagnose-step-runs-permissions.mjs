import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const sqlUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v2/query";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function checkStepRunsDataAndPermissions() {
  // Query raw step_runs in postgres
  const sql = `
    SELECT sr.id, sr.workflow_run_id, wr.workflow_id, w.org_id, om.user_id as member_user_id
    FROM step_runs sr
    JOIN workflow_runs wr ON wr.id = sr.workflow_run_id
    JOIN workflows w ON w.id = wr.workflow_id
    JOIN organizations o ON o.id = w.org_id
    JOIN org_members om ON om.org_id = o.id
    WHERE sr.workflow_run_id = 'cb2605ea-5a6a-4e67-ac28-d435426c4be8';
  `;

  const sqlRes = await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ type: "run_sql", args: { source: "default", sql } }),
  }).then((r) => r.json());

  console.log("SQL Join Query Result for Run cb2605ea-5a6a-4e67-ac28-d435426c4be8:");
  console.log(sqlRes.result);
}

checkStepRunsDataAndPermissions().catch(console.error);
