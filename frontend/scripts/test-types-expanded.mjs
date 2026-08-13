import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

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
  return msg.includes("foreign key constraint");
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
  return msg.includes("foreign key constraint");
}

const stepNames = [
  "ai", "agent", "ai_agent", "llm", "ai_generation", "ai_model", "model",
  "openai", "gemini", "claude", "anthropic", "gpt", "chat", "chat_completion",
  "prompt", "ai_prompt", "agent_execution", "agent_step", "generate_text",
  "httpRequest", "http", "http_request", "api_call", "api", "rest_api", "webhook",
  "database", "db", "db_query", "postgres", "sql", "database_operation", "query",
  "condition", "if", "branch", "router", "switch", "logic", "conditional",
  "output", "response", "end", "return", "result", "finish",
  "approval", "approval_gate", "human_approval", "wait_for_approval",
  "script", "code", "transform", "custom_function", "function"
];

const triggerNames = [
  "manual", "webhook", "schedule", "scheduled", "cron", "timer", "interval",
  "event", "api", "poll", "database_event", "hasura_event", "pubsub"
];

async function main() {
  console.log("Testing step names...");
  for (const s of stepNames) {
    if (await testStepType(s)) {
      console.log(`  VALID STEP: "${s}"`);
    }
  }

  console.log("\nTesting trigger names...");
  for (const t of triggerNames) {
    if (await testTriggerType(t)) {
      console.log(`  VALID TRIGGER: "${t}"`);
    }
  }
}

main();
