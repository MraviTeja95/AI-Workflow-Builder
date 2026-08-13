import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const authUrl = "https://zggynlwwpraxjmbawiym.auth.ap-southeast-1.nhost.run/v1";
const graphqlUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";
const testWorkflowRunId = "cb2605ea-5a6a-4e67-ac28-d435426c4be8";

async function testHttpQueriesWithJwt() {
  // Sign in as admin.a.test@example.com (user_id: 169b1b47-7c24-4a54-b60c-e22f04c4cd75)
  const signInRes = await fetch(`${authUrl}/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin.a.test@example.com", password: "SecurePassword123!" }),
  });
  const signInData = await signInRes.json();
  const token = signInData.session?.accessToken;

  const query = `
    query TestQueries($runId: uuid!) {
      workflows {
        id
        name
      }
      workflow_runs {
        id
        workflow_id
        status
      }
      step_runs(where: { workflow_run_id: { _eq: $runId } }) {
        id
        workflow_run_id
        workflow_step_id
        status
      }
    }
  `;

  const res = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables: { runId: testWorkflowRunId } }),
  }).then((r) => r.json());

  console.log("HTTP GraphQL Result with User JWT:");
  console.log(JSON.stringify(res, null, 2));
}

testHttpQueriesWithJwt().catch(console.error);
