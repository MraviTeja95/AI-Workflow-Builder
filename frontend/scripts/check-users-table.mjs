import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const sqlUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v2/query";

async function checkUsers() {
  const sql = "SELECT id, email, email_verified, disabled, (password_hash IS NOT NULL) as has_password FROM auth.users;";
  const res = await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": env.HASURA_GRAPHQL_ADMIN_SECRET },
    body: JSON.stringify({ type: "run_sql", args: { source: "default", sql } }),
  }).then((r) => r.json());

  console.log("Users in auth.users:", res.result);
}

checkUsers().catch(console.error);
