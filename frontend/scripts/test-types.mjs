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
  const msg = data.errors ? data.errors[0]?.message : "OK";
  if (msg.includes("foreign key constraint")) {
    return true; // PASSED check constraint!
  }
  return false;
}

async function testTriggerType(typeStr) {
  const query = `
    mutation TestTrigger($type: String!) {
      insert_workflow_triggers_one(object: {
        workflow_id: "00000000-0000-0000-0000-000000000000",
        type: $type,
        enabled: true,
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
  const msg = data.errors ? data.errors[0]?.message : "OK";
  if (msg.includes("foreign key constraint")) {
    return true; // PASSED check constraint!
  }
  return false;
}

async function main() {
  const candidates = [
    // Step types
    "http_request",
    "approval_gate",
    "gemini_agent",
    "openai_agent",
    "claude_agent",
    "ai_generate",
    "ai_agent_step",
    "agent_step",
    "llm_step",
    "ai_prompt",
    "prompt",
    "gemini",
    "openai",
    "claude",
    "condition_step",
    "if_else",
    "if_condition",
    "database_query",
    "db_query",
    "postgres",
    "postgresql",
    "hasura",
    "output_response",
    "return_response",
    "send_email",
    "email",
    "slack",
    "custom_code",
    "code",
    "function",
    "javascript",
    "transform",
    "delay",
    "filter",
    "action"
  ];

  console.log("=== STEP TYPE TESTS ===");
  for (const c of candidates) {
    const passed = await testStepType(c);
    if (passed) {
      console.log(`  VALID STEP TYPE: "${c}"`);
    }
  }

  const triggerCandidates = [
    "manual", "Manual", "MANUAL",
    "webhook", "Webhook", "WEBHOOK",
    "schedule", "Schedule", "SCHEDULE",
    "event", "Event",
    "cron", "Cron",
    "api", "API"
  ];

  console.log("\n=== TRIGGER TYPE TESTS ===");
  for (const t of triggerCandidates) {
    const passed = await testTriggerType(t);
    if (passed) {
      console.log(`  VALID TRIGGER TYPE: "${t}"`);
    }
  }
}

main();
