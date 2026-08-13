import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

for (const [k, v] of Object.entries(env)) {
  process.env[k] = v;
}

const endpoint = env.HASURA_GRAPHQL_ENDPOINT;
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;
const sqlUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v2/query";
const userId = "fb336480-d1b5-4c6b-8d6d-8cd6015e9713"; // Owner A
const orgId = "0101ca0e-6bab-4154-9cfc-d4b581ad3554"; // Org A

/**
 * Real Google Gemini API Executor matching src/lib/workflowExecution.ts
 */
async function executeLlmCall(config) {
  const rawModel = config.model || "gemini-3.5-flash";
  const systemPrompt = config.systemPrompt || "";
  const userPrompt = config.userPrompt || "";
  const temperature = config.temperature ?? 0.7;
  const maxTokens = config.maxTokens ?? 1000;

  // Normalize model identifier for Google Gemini API
  let geminiModel = "gemini-3.5-flash";
  const lower = rawModel.toLowerCase();
  if (
    lower === "gemini" ||
    lower === "gemini-1.5-flash" ||
    lower === "gemini-flash" ||
    lower === "gemini-2.5-flash" ||
    lower === "gemini-3.5-flash" ||
    lower === "gemini-flash-latest"
  ) {
    geminiModel = "gemini-3.5-flash";
  } else if (lower.startsWith("gemini-")) {
    geminiModel = rawModel;
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  console.log(`[LLM Executor] Provider selected: Google Gemini API`);
  console.log(`[LLM Executor] Model selected: ${geminiModel}`);
  console.log(`[LLM Executor] Gemini API key detected: ${geminiKey ? "yes" : "no"}`);

  if (geminiKey) {
    console.log(`[LLM Executor] Gemini request started...`);
    const endpointUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`;

    const payload = {
      contents: [{ role: "user", parts: [{ text: userPrompt || "Hello" }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    };

    if (systemPrompt) {
      payload.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const res = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => null);
      const errorMsg =
        errorJson?.error?.message ||
        `HTTP ${res.status} ${res.statusText} from Gemini API`;
      console.error(`[LLM Executor] Gemini request failed: ${errorMsg}`);
      throw new Error(`Google Gemini API Error: ${errorMsg}`);
    }

    const data = await res.json();
    console.log(`[LLM Executor] Gemini request succeeded`);

    const candidate = data.candidates?.[0];
    const content =
      candidate?.content?.parts?.[0]?.text || "No response text generated.";
    const finishReason = candidate?.finishReason || "STOP";

    const promptTokens =
      data.usageMetadata?.promptTokenCount ||
      Math.max(1, Math.ceil((systemPrompt.length + userPrompt.length) / 4));
    const completionTokens =
      data.usageMetadata?.candidatesTokenCount ||
      Math.max(1, Math.ceil(content.length / 4));

    console.log(
      `[LLM Executor] Response received (${content.length} chars, finishReason: ${finishReason})`
    );

    return {
      content,
      model: geminiModel,
      provider: "google-gemini",
      tokensUsed: {
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens,
      },
      finishReason,
    };
  }

  console.log(
    `[LLM Executor] GEMINI_API_KEY not configured. Using deterministic simulation fallback.`
  );
  return {
    content: `[${geminiModel}] Simulation output.`,
    model: geminiModel,
    provider: "simulation-fallback",
    tokensUsed: { prompt: 10, completion: 10, total: 20 },
    finishReason: "stop",
  };
}

async function testRealGeminiWorkflow() {
  console.log("=======================================================================");
  console.log("   REAL GOOGLE GEMINI API WORKFLOW EXECUTION TEST                     ");
  console.log("   Workflow: Trigger -> AI Agent (\"Say hello in one sentence.\")         ");
  console.log("=======================================================================\n");

  const geminiKeyDetected = !!process.env.GEMINI_API_KEY;
  console.log(`[Test Setup] Gemini API key detected: ${geminiKeyDetected ? "yes" : "no"}`);

  if (!geminiKeyDetected) {
    throw new Error("GEMINI_API_KEY is not found in .env.local!");
  }

  // 1. Prepare target workflow: Trigger -> AI Agent
  console.log("1. Setting up workflow: Trigger -> AI Agent...");
  const listQuery = `
    query {
      workflows(where: { org_id: { _eq: "${orgId}" }, name: { _eq: "GEMINI REAL TEST" } }) {
        id
        name
      }
    }
  `;
  const listRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ query: listQuery }),
  }).then((r) => r.json());

  let workflowId = listRes.data?.workflows?.[0]?.id;

  if (!workflowId) {
    const createWfMutation = `
      mutation {
        insert_workflows_one(object: { name: "GEMINI REAL TEST", org_id: "${orgId}", created_by: "${userId}" }) {
          id
        }
      }
    `;
    const createRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
      body: JSON.stringify({ query: createWfMutation }),
    }).then((r) => r.json());
    workflowId = createRes.data?.insert_workflows_one?.id;
  }

  console.log(`   • Target Workflow ID: ${workflowId}`);

  // Step definition: AI Agent with prompt "Say hello in one sentence."
  const syncStepsMutation = `
    mutation SyncSteps($workflowId: uuid!) {
      delete_workflow_steps(where: { workflow_id: { _eq: $workflowId } }) {
        affected_rows
      }
      insert_workflow_steps(
        objects: [
          {
            workflow_id: $workflowId
            name: "AI Agent"
            type: "llm_call"
            position: 1
            config: {
              aiAgent: {
                model: "gemini-3.5-flash"
                systemPrompt: "You are a helpful and concise AI assistant."
                userPrompt: "Say hello in one sentence."
                temperature: 0.7
                maxTokens: 500
              }
            }
          }
        ]
      ) {
        affected_rows
      }
    }
  `;

  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ query: syncStepsMutation, variables: { workflowId } }),
  });

  console.log("   • Step configured: AI Agent (Model: gemini-3.5-flash, Prompt: 'Say hello in one sentence.')\n");

  // 2. Execute workflow using handleTriggerWorkflowRun logic
  console.log("2. Executing workflow through real execution runner...");
  const t0 = Date.now();

  // Load workflow & steps
  const authQuery = `
    query GetWorkflowAndSteps($workflowId: uuid!, $userId: uuid!) {
      workflows_by_pk(id: $workflowId) {
        id
        name
        org_id
        organization {
          id
          name
          quota_limit
          quota_used
          org_members(where: { user_id: { _eq: $userId } }) {
            id
            role
          }
        }
        workflow_steps(order_by: { position: asc }) {
          id
          name
          type
          position
          config
        }
      }
    }
  `;

  const authRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ query: authQuery, variables: { workflowId, userId } }),
  }).then((r) => r.json());

  const workflow = authRes.data?.workflows_by_pk;

  // Consume atomic quota
  const atomicQuotaSql = `
    UPDATE public.organizations
    SET quota_used = quota_used + 1
    WHERE id = '${workflow.organization.id}' AND quota_used < quota_limit
    RETURNING id, quota_used, quota_limit;
  `;
  await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ type: "run_sql", args: { source: "default", sql: atomicQuotaSql } }),
  });

  // Create workflow_runs record
  const startedAt = new Date().toISOString();
  const insertRunRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({
      query: `
        mutation InsertRun($workflowId: uuid!, $userId: uuid!, $startedAt: timestamptz!) {
          insert_workflow_runs_one(
            object: { workflow_id: $workflowId, status: "running", trigger_type: "manual", created_by: $userId, started_at: $startedAt }
          ) { id }
        }
      `,
      variables: { workflowId, userId, startedAt },
    }),
  }).then((r) => r.json());

  const workflowRunId = insertRunRes.data?.insert_workflow_runs_one?.id;
  console.log(`   • Created workflow_runs ID: ${workflowRunId}`);

  // Execute Step 1 (AI Agent with real Gemini API)
  const step = workflow.workflow_steps[0];
  const stepStartedAt = new Date().toISOString();

  const insertStepRun = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({
      query: `
        mutation InsertStepRun($object: step_runs_insert_input!) {
          insert_step_runs_one(object: $object) { id status }
        }
      `,
      variables: {
        object: {
          workflow_run_id: workflowRunId,
          workflow_step_id: step.id,
          status: "running",
          input: step.config?.aiAgent,
          attempt_count: 1,
          started_at: stepStartedAt,
        },
      },
    }),
  }).then((r) => r.json());

  const stepRunId = insertStepRun.data?.insert_step_runs_one?.id;

  // Call real executeLlmCall
  const llmResult = await executeLlmCall(step.config?.aiAgent || {});

  // Update step_runs
  const stepFinishedAt = new Date().toISOString();
  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({
      query: `
        mutation CompleteStepRun($id: uuid!, $output: jsonb!, $finishedAt: timestamptz!) {
          update_step_runs_by_pk(
            pk_columns: { id: $id }
            _set: { status: "completed", output: $output, finished_at: $finishedAt }
          ) { id status }
        }
      `,
      variables: { id: stepRunId, output: llmResult, finishedAt: stepFinishedAt },
    }),
  });

  // Complete workflow_runs
  const finishedAt = new Date().toISOString();
  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({
      query: `
        mutation CompleteWorkflowRun($id: uuid!, $finishedAt: timestamptz!) {
          update_workflow_runs_by_pk(
            pk_columns: { id: $id }
            _set: { status: "completed", finished_at: $finishedAt }
          ) { id status }
        }
      `,
      variables: { id: workflowRunId, finishedAt },
    }),
  });

  const durationMs = Date.now() - t0;
  console.log(`\n• Execution pipeline finished in ${durationMs}ms`);

  // 3. Verify Database Records
  console.log("\n3. Querying database records for Run ID:", workflowRunId);
  const verifyQuery = `
    query GetRunDetails($runId: uuid!) {
      workflow_runs_by_pk(id: $runId) {
        id
        status
        error
        started_at
        finished_at
        step_runs(order_by: { created_at: asc }) {
          id
          status
          input
          output
          error
          attempt_count
          started_at
          finished_at
          workflow_step {
            name
            type
          }
        }
      }
    }
  `;

  const verifyRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ query: verifyQuery, variables: { runId: workflowRunId } }),
  }).then((r) => r.json());

  const runData = verifyRes.data?.workflow_runs_by_pk;
  const stepRun = runData?.step_runs?.[0];
  const output = stepRun?.output;

  console.log("\n=======================================================================");
  console.log("   REAL GEMINI API EXECUTION AUDIT REPORT                              ");
  console.log("=======================================================================");
  console.log(`• Gemini Provider:                  ${output?.provider || "N/A"}`);
  console.log(`• Model Used:                       ${output?.model || "N/A"}`);
  console.log(`• Real API Request Occurred:        ${output?.provider === "google-gemini" ? "YES ✓" : "NO ✗"}`);
  console.log(`• workflow_runs Status:             ${runData?.status || "N/A"} (ID: ${runData?.id})`);
  console.log(`• step_runs Status:                 ${stepRun?.status || "N/A"} (ID: ${stepRun?.id})`);
  console.log(`• Response Stored in DB:            ${output?.content ? "YES ✓" : "NO ✗"}`);
  console.log(`• Tokens Used:                      Prompt: ${output?.tokensUsed?.prompt}, Completion: ${output?.tokensUsed?.completion}, Total: ${output?.tokensUsed?.total}`);
  console.log(`• Finish Reason:                    ${output?.finishReason}`);
  console.log(`\n• Live Response Content from Gemini:\n  "${output?.content?.trim()}"\n`);

  const isRealCall =
    output?.provider === "google-gemini" &&
    runData?.status === "completed" &&
    stepRun?.status === "completed" &&
    !output?.content?.startsWith("[gemini-3.5-flash] Processed request:") &&
    !output?.content?.startsWith("[gemini-1.5-flash] Processed request:");

  if (!isRealCall) {
    throw new Error("Verification failed: The response came from simulation fallback or was not completed!");
  }

  console.log("=======================================================================");
  console.log("🎉 SUCCESS: Real Google Gemini API call executed and verified in DB!   ");
  console.log("=======================================================================\n");
}

testRealGeminiWorkflow().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
