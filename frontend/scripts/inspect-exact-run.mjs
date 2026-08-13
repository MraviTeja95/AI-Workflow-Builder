import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const endpoint = env.HASURA_GRAPHQL_ENDPOINT;
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;
const workflowId = "cffee6d9-d7e2-494f-9702-bf1af4aefc0f";

async function inspectExactWorkflow() {
  const query = `
    query GetWorkflowAndRuns($workflowId: uuid!) {
      workflows_by_pk(id: $workflowId) {
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
        workflow_runs(order_by: { created_at: desc }, limit: 5) {
          id
          status
          error
          trigger_type
          created_by
          started_at
          finished_at
          created_at
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
            }
          }
        }
      }
    }
  `;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ query, variables: { workflowId } }),
  }).then((r) => r.json());

  const wf = res.data?.workflows_by_pk;
  console.log("=======================================================================");
  console.log(`   WORKFLOW DETAILS: "${wf?.name}" (ID: ${wf?.id})`);
  console.log("=======================================================================");
  console.log("Configured Steps:");
  for (const step of wf?.workflow_steps || []) {
    console.log(` - Step ${step.position}: "${step.name}" (${step.type})`);
    console.log(`   Config:`, JSON.stringify(step.config, null, 2));
  }

  const latestRun = wf?.workflow_runs?.[0];
  console.log("\n=======================================================================");
  console.log(`   LATEST WORKFLOW RUN: ${latestRun?.id}`);
  console.log("=======================================================================");
  console.log(`• Status:        ${latestRun?.status}`);
  console.log(`• Error:         ${latestRun?.error || "none (null)"}`);
  console.log(`• Trigger Type:  ${latestRun?.trigger_type}`);
  console.log(`• Created By:    ${latestRun?.created_by}`);
  console.log(`• Started At:    ${latestRun?.started_at}`);
  console.log(`• Finished At:   ${latestRun?.finished_at}`);

  console.log("\nStep Runs in Latest Run:");
  for (const sr of latestRun?.step_runs || []) {
    console.log(`\n  ▶ Step Run ID: ${sr.id}`);
    console.log(`    Step Name:     "${sr.workflow_step?.name}" (Type: ${sr.workflow_step?.type}, Position: ${sr.workflow_step?.position})`);
    console.log(`    Status:        ${sr.status}`);
    console.log(`    Attempt Count: ${sr.attempt_count}`);
    console.log(`    Started At:    ${sr.started_at}`);
    console.log(`    Finished At:   ${sr.finished_at}`);
    console.log(`    Error:         ${sr.error || "none (null)"}`);
    console.log(`    Input:        `, JSON.stringify(sr.input));
    console.log(`    Output:       `, JSON.stringify(sr.output, null, 2));
  }
}

inspectExactWorkflow().catch(console.error);
