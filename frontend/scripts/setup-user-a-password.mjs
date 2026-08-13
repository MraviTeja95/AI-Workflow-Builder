import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const sqlUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v2/query";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;
const authUrl = "https://zggynlwwpraxjmbawiym.auth.ap-southeast-1.nhost.run/v1";

async function setupUserAPassword() {
  // Let's get the password_hash from User B and copy it to User A so User A has the same known test password
  const copyPasswordSql = `
    UPDATE auth.users
    SET password_hash = (SELECT password_hash FROM auth.users WHERE email = 'owner.b.isolation.test@example.com'),
        email_verified = true,
        disabled = false
    WHERE email = 'mraviteja876@gmail.com';
  `;

  const sqlRes = await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({
      type: "run_sql",
      args: {
        source: "default",
        sql: copyPasswordSql,
      },
    }),
  }).then((r) => r.json());

  console.log("Password hash set for User A:", sqlRes);

  const signInRes = await fetch(`${authUrl}/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "mraviteja876@gmail.com",
      password: "SecurePassword123!",
    }),
  }).then((r) => r.json());

  console.log("Sign-in result for User A:", {
    userId: signInRes.session?.user?.id,
    hasToken: !!signInRes.session?.accessToken,
    tokenPreview: signInRes.session?.accessToken?.slice(0, 40) + "...",
  });

  return signInRes.session?.accessToken;
}

setupUserAPassword();
