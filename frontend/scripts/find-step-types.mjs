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

// Let's test inserting a dummy step with different type strings or check trigger constraint
async function testStepType(typeStr) {
  const query = `
    mutation TestStep($type: String!) {
      insert_workflow_steps_one(object: {
        workflow_id: "00000000-0000-0000-0000-000000000000",
        name: "Test",
        type: $type,
        position: 0,
        config: {}
      }) {
        id
      }
    }
  `;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": adminSecret,
    },
    body: JSON.stringify({ query, variables: { type: typeStr } }),
  });
  const data = await res.json();
  console.log(`Type: "${typeStr}" =>`, data.errors ? data.errors[0]?.message : "Success / FK error");
}

async function main() {
  const candidates = [
    "trigger", "TRIGGER", "Trigger",
    "ai_agent", "AI_AGENT", "ai-agent", "agent", "llm", "ai", "AI Agent",
    "http_request", "HTTP_REQUEST", "http", "http-request", "webhook", "api", "HTTP Request",
    "database", "DATABASE", "db", "sql", "Database",
    "condition", "CONDITION", "branch", "router", "Condition",
    "output", "OUTPUT", "response", "Output",
    "approval", "APPROVAL", "approval_gate", "human_in_the_loop", "Approval Gate"
  ];
  for (const c of candidates) {
    await testStepType(c);
  }
}

main();
