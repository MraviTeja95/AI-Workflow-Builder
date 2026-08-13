import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const authUrl = "https://zggynlwwpraxjmbawiym.auth.ap-southeast-1.nhost.run/v1";

async function inspectJwt() {
  const signInRes = await fetch(`${authUrl}/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin.a.test@example.com", password: "SecurePassword123!" }),
  });
  const signInData = await signInRes.json();
  const token = signInData.session?.accessToken;

  const parts = token.split(".");
  const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
  console.log("JWT Claims Structure (Sanitized):");
  console.log(" - Issuer:", payload.iss);
  console.log(" - Sub (User ID):", payload.sub);
  console.log(" - Hasura Claims:", JSON.stringify(payload["https://hasura.io/jwt/claims"], null, 2));
}

inspectJwt().catch(console.error);
