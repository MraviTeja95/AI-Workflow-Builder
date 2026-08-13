import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const endpoint = env.HASURA_GRAPHQL_ENDPOINT;
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function inspectWorkflowsAndRuns() {
  // 1. Find all workflows to locate the exact ID
  const allWorkflowsQuery = `
    query {
      workflows(order_by: { updated_at: desc }, limit: 10) {
        id
        name
        org_id
        created_at
        updated_at
        workflow_steps(order_by: { position: asc }) {
          id
          name
          type
          position
          config
        }
      }
    }
  `;

  const wfRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ query: allWorkflowsQuery }),
  }).then((r) => r.json());

  console.log("=======================================================================");
  console.log("   RECENT WORKFLOWS IN DATABASE                                        ");
  console.log("=======================================================================");
  for (const wf of wfRes.data?.workflows || []) {
    console.log(`• Workflow: "${wf.name}" | ID: ${wf.id} | Steps: ${wf.workflow_steps?.length}`);
  }

  // 2. Query the latest workflow_runs across the database
  const runsQuery = `
    query {
      workflow_runs(order_by: { created_at: desc }, limit: 10) {
        id
        workflow_id
        status
        error
        trigger_type
        created_by
        started_at
        finished_at
        created_at
        workflow {
          id
          name
        }
        step_runs(order_by: { started_at: asc }) {
          id
          workflow_step_id
          status
          input
          output
          error
          attempt_count
          started_at
          finished_at
          workflow_step {
            id
            name
            type
            position
            config
          }
        }
      }
    }
  `;

  const runsRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ query: runsQuery }),
  }).then((r) => r.json());

  console.log("\n=======================================================================");
  console.log("   LATEST 10 WORKFLOW RUNS & STEP RUNS (ALL WORKFLOWS)                 ");
  console.log("=======================================================================");
  for (const run of runsRes.data?.workflow_runs || []) {
    console.log(`\n▶ Run ID: ${run.id}`);
    console.log(`  Workflow: "${run.workflow?.name}" (ID: ${run.workflow_id})`);
    console.log(`  Status: ${run.status} | Created By: ${run.created_by}`);
    console.log(`  Started: ${run.started_at} | Finished: ${run.finished_at}`);
    if (run.error) console.log(`  Error: ${run.error}`);
    console.log(`  Step Runs (${run.step_runs?.length || 0}):`);
    for (const sr of run.step_runs || []) {
      console.log(`    - Step: "${sr.workflow_step?.name}" (${sr.workflow_step?.type}) | Status: ${sr.status} | Attempts: ${sr.attempt_count}`);
      console.log(`      Started: ${sr.started_at} | Finished: ${sr.finished_at}`);
      if (sr.output) {
        const outStr = JSON.stringify(sr.output);
        console.log(`      Output: ${outStr.slice(0, 180)}${outStr.length > 180 ? "..." : ""}`);
      }
      if (sr.error) console.log(`      Error: ${sr.error}`);
    }
  }
}

inspectWorkflowsAndRuns().catch(console.error);
