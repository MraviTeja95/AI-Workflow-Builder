import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const endpoint = env.HASURA_GRAPHQL_ENDPOINT;
const authUrl = "https://zggynlwwpraxjmbawiym.auth.ap-southeast-1.nhost.run/v1";

async function signIn(email, password) {
  const res = await fetch(`${authUrl}/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return {
    userId: data.session.user.id,
    token: data.session.accessToken,
  };
}

async function debugAdmin() {
  const adminA = await signIn("admin.a.test@example.com", "SecurePassword123!");
  console.log("Admin A:", adminA);

  // Check what workflows Admin A sees
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminA.token}`,
    },
    body: JSON.stringify({
      query: `
        query {
          organizations {
            id
            name
            org_members { id user_id role }
            workflows { id name workflow_steps { id name } }
          }
          workflows {
            id
            name
            workflow_steps { id name }
          }
          workflow_steps {
            id
            name
          }
        }
      `,
    }),
  }).then((r) => r.json());

  console.log("Admin A Query Result:", JSON.stringify(res, null, 2));
}

debugAdmin();
