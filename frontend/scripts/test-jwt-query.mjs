import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const endpoint = env.HASURA_GRAPHQL_ENDPOINT;
const authUrl = "https://zggynlwwpraxjmbawiym.auth.ap-southeast-1.nhost.run/v1";

async function testUserBGuessingOrgAWorkflow() {
  const signInRes = await fetch(`${authUrl}/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "owner.b.isolation.test@example.com",
      password: "SecurePassword123!",
    }),
  }).then((r) => r.json());

  const token = signInRes.session?.accessToken;

  // Try to query Org A's workflow UUID
  const query = `
    query GetOrgAWorkflow($id: uuid!) {
      workflows_by_pk(id: $id) {
        id
        name
        org_id
        organization {
          id
          name
        }
      }
    }
  `;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query,
      variables: { id: "efab066b-82db-4d72-adfa-f3c06a5a1200" },
    }),
  }).then((r) => r.json());

  console.log("User B trying to fetch Org A's workflow by exact UUID:");
  console.log(JSON.stringify(res, null, 2));
}

testUserBGuessingOrgAWorkflow();
