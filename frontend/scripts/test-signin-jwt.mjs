import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const sqlUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v2/query";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function verifyUserA() {
  // Check User A in auth.users
  const sqlRes = await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({
      type: "run_sql",
      args: {
        source: "default",
        sql: `
          SELECT id, email, email_verified, disabled FROM auth.users WHERE email = 'mraviteja876@gmail.com';
        `,
      },
    }),
  }).then((r) => r.json());

  console.log("User A in auth.users:", sqlRes);
}

verifyUserA();
