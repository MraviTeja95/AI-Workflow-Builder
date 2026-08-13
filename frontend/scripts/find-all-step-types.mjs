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

const prefixes = ["", "ai_", "llm_", "agent_", "custom_", "step_", "workflow_", "db_", "data_"];
const bases = [
  "agent", "generate", "generation", "prompt", "chat", "completion", "inference", "reasoning",
  "http", "http_request", "api", "request", "webhook", "rest", "graphql",
  "database", "db", "query", "sql", "postgres", "insert", "update", "select", "delete",
  "condition", "conditional", "branch", "router", "switch", "if", "filter", "evaluate",
  "output", "response", "return", "result", "send", "notify", "email", "slack",
  "approval", "approval_gate", "human", "manual_approval", "wait", "gate",
  "transform", "code", "script", "function", "json", "mapper", "delay"
];

async function main() {
  const words = [];
  for (const p of prefixes) {
    for (const b of bases) {
      words.push(`${p}${b}`);
    }
  }

  const valid = [];
  for (const w of words) {
    if (await testStepType(w)) {
      console.log(`FOUND VALID STEP TYPE: "${w}"`);
      valid.push(w);
    }
  }

  console.log("\nALL VALID STEP TYPES FOUND:", valid);
}

main();
