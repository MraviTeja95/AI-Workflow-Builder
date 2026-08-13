import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;


async function inspectRuns() {
  const query = `
    query GetLatestRuns {
      workflow_runs(order_by: { created_at: desc }, limit: 6) {
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
        step_runs(order_by: { created_at: asc }) {
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

  const res = await fetch(env.HASURA_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": env.HASURA_GRAPHQL_ADMIN_SECRET,
    },
    body: JSON.stringify({ query }),
  }).then((r) => r.json());

  console.log("=======================================================================");
  console.log("   LATEST WORKFLOW RUNS & STEP RUNS INSPECTION                         ");
  console.log("=======================================================================");

  for (const run of res.data?.workflow_runs || []) {
    console.log(`\n▶ Workflow Run: ${run.id}`);
    console.log(`  Workflow: "${run.workflow?.name}" (${run.workflow_id})`);
    console.log(`  Status: ${run.status} | Created By: ${run.created_by}`);
    console.log(`  Started: ${run.started_at} | Finished: ${run.finished_at}`);
    if (run.error) {
      console.log(`  Error: ${run.error}`);
    }
    console.log(`  Step Runs Count: ${run.step_runs?.length || 0}`);
    for (const stepRun of run.step_runs || []) {
      console.log(`    - Step Run: ${stepRun.id}`);
      console.log(`      Step Name: "${stepRun.workflow_step?.name}" (${stepRun.workflow_step?.type})`);
      console.log(`      Status: ${stepRun.status} | Attempt Count: ${stepRun.attempt_count}`);
      console.log(`      Started: ${stepRun.started_at} | Finished: ${stepRun.finished_at}`);
      if (stepRun.input) console.log(`      Input:`, JSON.stringify(stepRun.input).slice(0, 150));
      if (stepRun.output) console.log(`      Output:`, JSON.stringify(stepRun.output).slice(0, 150));
      if (stepRun.error) console.log(`      Error: ${stepRun.error}`);
    }
  }
}

inspectRuns().catch(console.error);
