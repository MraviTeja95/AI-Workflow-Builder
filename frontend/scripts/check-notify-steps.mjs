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
        const value = trimmed.slice(idx + 1).trim();
        env[key] = value;
      }
    }
  }
  return env;
}

const env = loadEnv();
const endpoint =
  env.HASURA_GRAPHQL_ENDPOINT ||
  "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function checkNotifySteps() {
  const query = `
    query CheckNotifySteps {
      workflow_steps(where: { type: { _eq: "notify" } }) {
        id
        name
        type
        workflow_id
        config
        created_at
      }
      all_steps: workflow_steps {
        id
        name
        type
        workflow_id
      }
    }
  `;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": adminSecret,
    },
    body: JSON.stringify({ query }),
  });

  const data = await res.json();
  console.log("=== NOTIFY STEPS INSPECTION ===");
  console.log("Steps with type='notify':", JSON.stringify(data.data?.workflow_steps, null, 2));
  console.log("\nAll existing steps in DB:", JSON.stringify(data.data?.all_steps, null, 2));
}

checkNotifySteps();
