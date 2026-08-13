import fs from "node:fs";
import path from "node:path";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const content = fs.readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        env[key] = value;
      }
    }
  }
  return env;
}

const authUrl = "https://zggynlwwpraxjmbawiym.auth.ap-southeast-1.nhost.run/v1";

async function testAuthExtraction() {
  console.log("1. Signing in as user to get JWT token...");
  const signInRes = await fetch(`${authUrl}/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin.a.test@example.com", password: "SecurePassword123!" }),
  });
  const signInData = await signInRes.json();
  const token = signInData.session?.accessToken;
  const expectedUserId = signInData.session?.user?.id;

  console.log(`• Authenticated User ID: ${expectedUserId}`);
  console.log(`• Access Token available: ${Boolean(token)} (length: ${token?.length})`);

  // Decode JWT
  const parts = token.split(".");
  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
  console.log("• Decoded JWT claims keys:", Object.keys(payload));
  console.log("• hasura claims:", payload["https://hasura.io/jwt/claims"]);

  // Test GET /api/workflows/[id] with Bearer token
  const wfId = "ef7b923d-1419-4c7e-932d-0e5c78cf4303"; // Org A workflow
  console.log(`\n2. Testing GET /api/workflows/${wfId} with Authorization: Bearer <token>...`);
  const getRes = await fetch(`http://localhost:3000/api/workflows/${wfId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  console.log(`• Status: ${getRes.status}`);
  const getData = await getRes.json();
  console.log(`• Response workflow ID: ${getData.workflow?.id}, name: ${getData.workflow?.name}`);
  console.log(`• Nodes count: ${getData.nodes?.length}, edges count: ${getData.edges?.length}`);
}

testAuthExtraction().catch(console.error);
