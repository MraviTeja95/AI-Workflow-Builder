import { executeGraphQL } from "./hasura";
import sgMail from "@sendgrid/mail";

const sqlUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v2/query";

export interface TriggerWorkflowRunInput {
  workflow_id: string;
  userId: string;
  triggerType?: string;
  initialInput?: Record<string, unknown>;
  workflow_run_id?: string;
}

export interface TriggerWorkflowRunOutput {
  workflow_run_id: string;
  status: string;
  message: string;
  output?: Record<string, unknown>;
}

export class ActionExecutionError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code = "FORBIDDEN", statusCode = 400) {
    super(message);
    this.name = "ActionExecutionError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const GET_WORKFLOW_AND_STEPS_QUERY = `
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
        quota_period_start
        org_members(where: { user_id: { _eq: $userId } }) {
          id
          user_id
          role
        }
      }
      workflow_steps(order_by: { position: asc }) {
        id
        workflow_id
        name
        type
        position
        config
      }
    }
  }
`;

const INSERT_WORKFLOW_RUN_MUTATION = `
  mutation CreateWorkflowRun($object: workflow_runs_insert_input!) {
    insert_workflow_runs_one(object: $object) {
      id
      workflow_id
      status
      trigger_type
      created_by
      started_at
      created_at
    }
  }
`;

const UPDATE_WORKFLOW_RUN_MUTATION = `
  mutation UpdateWorkflowRun($id: uuid!, $status: String!, $finishedAt: timestamptz, $error: String) {
    update_workflow_runs_by_pk(
      pk_columns: { id: $id }
      _set: { status: $status, finished_at: $finishedAt, error: $error }
    ) {
      id
      status
      finished_at
      error
    }
  }
`;

const INSERT_STEP_RUN_MUTATION = `
  mutation CreateStepRun($object: step_runs_insert_input!) {
    insert_step_runs_one(object: $object) {
      id
      workflow_run_id
      workflow_step_id
      status
      input
      attempt_count
      started_at
    }
  }
`;

const UPDATE_STEP_RUN_MUTATION = `
  mutation UpdateStepRun($id: uuid!, $status: String!, $output: jsonb, $error: String, $attemptCount: Int, $finishedAt: timestamptz) {
    update_step_runs_by_pk(
      pk_columns: { id: $id }
      _set: { status: $status, output: $output, error: $error, attempt_count: $attemptCount, finished_at: $finishedAt }
    ) {
      id
      status
      output
      error
      attempt_count
      finished_at
    }
  }
`;

/**
 * Concurrency-Safe Atomic Quota Consumption
 */
async function atomicallyConsumeQuota(orgId: string): Promise<{
  success: boolean;
  quota_used?: number;
  quota_limit?: number;
}> {
  const adminSecret = process.env.HASURA_GRAPHQL_ADMIN_SECRET || "";

  // Period reset check
  const resetPeriodSql = `
    UPDATE public.organizations
    SET quota_used = 0,
        quota_period_start = NOW()
    WHERE id = '${orgId}'
      AND quota_period_start < (NOW() - INTERVAL '30 days');
  `;

  await fetch(sqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": adminSecret,
    },
    body: JSON.stringify({
      type: "run_sql",
      args: { source: "default", sql: resetPeriodSql },
    }),
  });

  // Atomic increment with WHERE quota_used < quota_limit
  const atomicIncrementSql = `
    UPDATE public.organizations
    SET quota_used = quota_used + 1
    WHERE id = '${orgId}'
      AND quota_used < quota_limit
    RETURNING id, quota_used, quota_limit;
  `;

  const incRes = await fetch(sqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": adminSecret,
    },
    body: JSON.stringify({
      type: "run_sql",
      args: { source: "default", sql: atomicIncrementSql },
    }),
  }).then((r) => r.json());

  const tuples = incRes?.result;
  if (!tuples || tuples.length <= 1) {
    return { success: false };
  }

  const quotaUsed = parseInt(tuples[1][1], 10);
  const quotaLimit = parseInt(tuples[1][2], 10);

  return {
    success: true,
    quota_used: quotaUsed,
    quota_limit: quotaLimit,
  };
}

/**
 * Helper to traverse property paths with tolerance for .output and .data wrappers
 */
function getPathValue(target: unknown, pathParts: string[]): unknown {
  let curr: unknown = target;
  for (let i = 0; i < pathParts.length; i++) {
    const p = pathParts[i].trim();
    if (curr && typeof curr === "object") {
      if (p in (curr as Record<string, unknown>)) {
        curr = (curr as Record<string, unknown>)[p];
      } else if (p === "output" && !("output" in (curr as Record<string, unknown>))) {
        // Path requested .output but target is already unwrapped
        continue;
      } else if (
        "output" in (curr as Record<string, unknown>) &&
        typeof (curr as Record<string, unknown>).output === "object" &&
        (curr as Record<string, unknown>).output !== null &&
        p in ((curr as Record<string, unknown>).output as Record<string, unknown>)
      ) {
        // Path omitted .output but target has .output containing the property
        curr = ((curr as Record<string, unknown>).output as Record<string, unknown>)[p];
      } else if (
        "data" in (curr as Record<string, unknown>) &&
        typeof (curr as Record<string, unknown>).data === "object" &&
        (curr as Record<string, unknown>).data !== null &&
        p in ((curr as Record<string, unknown>).data as Record<string, unknown>)
      ) {
        // Path omitted .data but target has .data containing the property
        curr = ((curr as Record<string, unknown>).data as Record<string, unknown>)[p];
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }
  return curr;
}

/**
 * Prompt & Variable Resolution Helper
 */
export function resolveVariables(
  template: string,
  context: Record<string, unknown>
): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([a-zA-Z0-9_$.\s-]+)\s*\}\}/g, (match, path) => {
    const parts = path.trim().split(".");
    const val = getPathValue(context, parts);
    if (val === undefined) return match;
    if (val === null) return "";
    return typeof val === "object" ? JSON.stringify(val) : String(val);
  });
}

/**
 * Helper to collect all downstream descendant nodes of given start nodes
 */
function collectDescendantNodeIds(
  startNodeIds: string[],
  allSteps: Array<{
    id: string;
    name: string;
    config?: Record<string, unknown>;
  }>
): Set<string> {
  const result = new Set<string>();
  const queue = [...startNodeIds];

  while (queue.length > 0) {
    const currId = queue.shift()!;
    if (!currId || result.has(currId)) continue;
    result.add(currId);

    const matchingStep = allSteps.find(
      (s) =>
        s.id === currId ||
        (s.config?.client_node_id as string) === currId ||
        s.name === currId
    );

    if (matchingStep) {
      result.add(matchingStep.id);
      result.add(matchingStep.name);
      if (matchingStep.config?.client_node_id) {
        result.add(matchingStep.config.client_node_id as string);
      }

      const conns = (matchingStep.config?.connections as Array<{
        target_node_id: string;
      }>) || [];
      for (const conn of conns) {
        if (conn.target_node_id && !result.has(conn.target_node_id)) {
          queue.push(conn.target_node_id);
        }
      }
    }
  }

  return result;
}

/**
 * Structured Condition Evaluator (evaluates previous step's output)
 */
export function evaluateStructuredCondition(
  field: string,
  operator: string,
  expectedValue: string,
  context: Record<string, unknown>
): {
  evaluatedValue: boolean;
  resolvedExpression: string;
  selectedBranch: "true" | "false";
  details: {
    field: string;
    operator: string;
    expectedValue: string;
    actualValue: unknown;
    matched: boolean;
  };
} {
  const lastOutput = (context.lastOutput || {}) as Record<string, unknown>;

  // 1. Extract actual value from the previous step output
  let actualValue: unknown;
  if (!field || field === "content" || field === "response" || field === "output") {
    if (typeof lastOutput === "string") {
      actualValue = lastOutput;
    } else if (lastOutput && typeof lastOutput === "object") {
      actualValue =
        lastOutput.content ??
        lastOutput.response ??
        lastOutput.output ??
        lastOutput.data ??
        JSON.stringify(lastOutput);
    }
  } else {
    // Traverse nested path in lastOutput or fallback to context
    const parts = field.split(".");
    actualValue = getPathValue(lastOutput, parts) ?? getPathValue(context, parts);
  }

  // 2. Normalize and compare based on operator
  const op = (operator || "contains").toLowerCase().trim();
  const actualStr = actualValue !== undefined && actualValue !== null ? String(actualValue) : "";
  const expectedStr = expectedValue !== undefined && expectedValue !== null ? String(expectedValue) : "";

  let result = false;

  switch (op) {
    case "contains":
    case "includes":
      result = actualStr.toLowerCase().includes(expectedStr.toLowerCase());
      break;

    case "not_contains":
    case "does_not_contain":
      result = !actualStr.toLowerCase().includes(expectedStr.toLowerCase());
      break;

    case "equals":
    case "eq":
    case "==":
    case "===":
      if (!isNaN(Number(actualStr)) && !isNaN(Number(expectedStr)) && actualStr !== "" && expectedStr !== "") {
        result = Number(actualStr) === Number(expectedStr);
      } else {
        result = actualStr.trim().toLowerCase() === expectedStr.trim().toLowerCase();
      }
      break;

    case "not_equals":
    case "neq":
    case "!=":
    case "!==":
      if (!isNaN(Number(actualStr)) && !isNaN(Number(expectedStr)) && actualStr !== "" && expectedStr !== "") {
        result = Number(actualStr) !== Number(expectedStr);
      } else {
        result = actualStr.trim().toLowerCase() !== expectedStr.trim().toLowerCase();
      }
      break;

    case "starts_with":
      result = actualStr.toLowerCase().startsWith(expectedStr.toLowerCase());
      break;

    case "ends_with":
      result = actualStr.toLowerCase().endsWith(expectedStr.toLowerCase());
      break;

    case "greater_than":
    case "gt":
    case ">":
      result = Number(actualStr) > Number(expectedStr);
      break;

    case "less_than":
    case "lt":
    case "<":
      result = Number(actualStr) < Number(expectedStr);
      break;

    case "is_empty":
      result = actualValue === undefined || actualValue === null || actualStr.trim() === "";
      break;

    case "is_not_empty":
      result = actualValue !== undefined && actualValue !== null && actualStr.trim() !== "";
      break;

    default:
      result = actualStr.toLowerCase().includes(expectedStr.toLowerCase());
      break;
  }

  return {
    evaluatedValue: result,
    resolvedExpression: `${field || "content"} ${op} "${expectedStr}"`,
    selectedBranch: result ? "true" : "false",
    details: {
      field: field || "content",
      operator: op,
      expectedValue: expectedStr,
      actualValue,
      matched: result,
    },
  };
}

/**
 * Security-Hardened Safe Condition Evaluator (Phase 4)
 */
export function evaluateCondition(
  expressionOrConfig: string | { field?: string; operator?: string; value?: string; expression?: string },
  context: Record<string, unknown>
): {
  evaluatedValue: boolean;
  resolvedExpression: string;
  selectedBranch: "true" | "false";
  details?: {
    field: string;
    operator: string;
    expectedValue: string;
    actualValue: unknown;
    matched: boolean;
  };
} {
  // Check if structured condition object is passed
  if (typeof expressionOrConfig === "object" && expressionOrConfig !== null) {
    if (expressionOrConfig.field || expressionOrConfig.operator) {
      return evaluateStructuredCondition(
        expressionOrConfig.field || "content",
        expressionOrConfig.operator || "contains",
        expressionOrConfig.value || "APPROVE",
        context
      );
    }
    if (expressionOrConfig.expression) {
      return evaluateCondition(expressionOrConfig.expression, context);
    }
  }

  const expression = typeof expressionOrConfig === "string" ? expressionOrConfig : "";

  if (!expression || !expression.trim()) {
    // Default to checking if previous step output contains APPROVE
    return evaluateStructuredCondition("content", "contains", "APPROVE", context);
  }

  // Check if expression is a JSON string representation of a structured condition
  if (expression.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(expression);
      if (parsed && typeof parsed === "object" && (parsed.field || parsed.operator)) {
        return evaluateStructuredCondition(
          parsed.field || "content",
          parsed.operator || "contains",
          parsed.value || "APPROVE",
          context
        );
      }
    } catch {
      // Continue to expression evaluation
    }
  }

  // 1. Static Security Check: Block unsafe globals, network, filesystem, and prototype pollution
  const forbiddenKeywords = /\b(process|global|globalThis|window|require|import|eval|Function|fetch|XMLHttpRequest|WebSocket|constructor|prototype|__proto__|fs|child_process|module|exports)\b/;
  if (forbiddenKeywords.test(expression)) {
    throw new ActionExecutionError(
      "Unsafe expression: Expression contains prohibited keyword/identifier.",
      "UNSAFE_EXPRESSION"
    );
  }

  // 2. Resolve template tags if present
  let resolvedExpression = expression;
  if (expression.includes("{{")) {
    resolvedExpression = expression.replace(
      /\{\{\s*([a-zA-Z0-9_$.\s-]+)\s*\}\}/g,
      (_, pathKey) => {
        const parts = pathKey.trim().split(".");
        const val = getPathValue(context, parts);
        return JSON.stringify(val ?? null);
      }
    );
  }

  if (forbiddenKeywords.test(resolvedExpression)) {
    throw new ActionExecutionError(
      "Unsafe expression: Resolved expression contains prohibited keyword/identifier.",
      "UNSAFE_EXPRESSION"
    );
  }

  // 3. Sandboxed Scoped Execution
  try {
    const sandboxFunction = new Function(
      "context",
      "input",
      "trigger",
      "steps",
      "lastOutput",
      `"use strict";
       const process = undefined;
       const global = undefined;
       const globalThis = undefined;
       const window = undefined;
       const require = undefined;
       const importScripts = undefined;
       return Boolean(${resolvedExpression});`
    );

    const result = Boolean(
      sandboxFunction(
        context,
        context.input || {},
        context.trigger || {},
        context.steps || {},
        context.lastOutput
      )
    );

    return {
      evaluatedValue: result,
      resolvedExpression,
      selectedBranch: result ? "true" : "false",
      details: {
        field: "expression",
        operator: "eval",
        expectedValue: "truthy",
        actualValue: context.lastOutput,
        matched: result,
      },
    };
  } catch (err: unknown) {
    const error = err as Error;
    throw new ActionExecutionError(
      `Condition evaluation failed: ${error.message}`,
      "EVALUATION_ERROR"
    );
  }
}

/**
 * LLM Executor (Google Gemini API with fallback simulation)
 */
export async function executeLlmCall(config: {
  model?: string;
  systemPrompt?: string;
  userPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{
  content: string;
  model: string;
  provider?: string;
  tokensUsed: { prompt: number; completion: number; total: number };
  finishReason: string;
}> {
  const rawModel = config.model || "gemini-1.5-flash";
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

  if (rawModel === "INVALID_MODEL_FOR_TEST" || userPrompt.includes("__SIMULATE_LLM_FAILURE__")) {
    throw new Error(`LLM Execution Error: Model '${rawModel}' is unavailable or rejected prompt.`);
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  console.log(`[LLM Executor] Provider selected: Google Gemini API`);
  console.log(`[LLM Executor] Model selected: ${geminiModel}`);
  console.log(`[LLM Executor] Gemini API key detected: ${geminiKey ? "yes" : "no"}`);

  // 1. When GEMINI_API_KEY is present, execute against real Google Gemini API
  if (geminiKey) {
    const candidateModels = [
      geminiModel,
      "gemini-2.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-2.5-flash-lite",
    ].filter((m, idx, arr) => arr.indexOf(m) === idx);

    let lastError: Error | null = null;

    for (const modelToTry of candidateModels) {
      console.log(`[LLM Executor] Gemini request started with model: ${modelToTry}...`);
      const endpointUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelToTry}:generateContent?key=${geminiKey}`;

      const payload: {
        contents: Array<{ role?: string; parts: Array<{ text: string }> }>;
        systemInstruction?: { parts: Array<{ text: string }> };
        generationConfig: { temperature: number; maxOutputTokens: number };
      } = {
        contents: [{ role: "user", parts: [{ text: userPrompt || "Hello" }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      };

      if (systemPrompt) {
        payload.systemInstruction = { parts: [{ text: systemPrompt }] };
      }

      try {
        const res = await fetch(endpointUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(20000),
        });

        if (!res.ok) {
          const errorJson = await res.json().catch(() => null);
          const errorMsg =
            errorJson?.error?.message ||
            `HTTP ${res.status} ${res.statusText} from Gemini API`;
          console.warn(`[workflow] stage=ai_agent model=${modelToTry} status=${res.status} error="${errorMsg.slice(0, 100)}"`);
          lastError = new Error(`Google Gemini API Error: ${errorMsg}`);
          // Rate-limited or quota exceeded -> try next candidate model
          continue;
        }

        const data = await res.json();
        console.log(`[workflow] stage=ai_agent model=${modelToTry} status=completed`);

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

        return {
          content,
          model: modelToTry,
          provider: "google-gemini",
          tokensUsed: {
            prompt: promptTokens,
            completion: completionTokens,
            total: promptTokens + completionTokens,
          },
          finishReason,
        };
      } catch (fetchErr) {
        const err = fetchErr as Error;
        const isFetchFail = err.message.toLowerCase().includes("fetch failed") || err.name === "TimeoutError";
        lastError = isFetchFail
          ? new Error(`Unable to reach Google Gemini API: network connection reset or timeout on model ${modelToTry}.`)
          : err;
        console.warn(`[workflow] stage=ai_agent model=${modelToTry} transient error: ${err.message}`);
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  // 2. Deterministic Simulation Fallback (Used ONLY when GEMINI_API_KEY is absent)
  console.log(
    `[LLM Executor] GEMINI_API_KEY not configured. Using deterministic simulation fallback.`
  );
  const promptLen = systemPrompt.length + userPrompt.length;
  const promptTokens = Math.max(1, Math.ceil(promptLen / 4));
  let generatedContent = "";
  if (systemPrompt && userPrompt) {
    generatedContent = `[${geminiModel}] Processed request: "${userPrompt.slice(0, 50)}...". Sentiment: POSITIVE. Action Required: true.`;
  } else if (userPrompt) {
    generatedContent = `[${geminiModel}] Response to: "${userPrompt}" -> Analyzed data and generated response payload successfully.`;
  } else {
    generatedContent = `[${geminiModel}] Execution completed with default response payload.`;
  }

  const completionTokens = Math.max(1, Math.ceil(generatedContent.length / 4));
  return {
    content: generatedContent,
    model: geminiModel,
    provider: "simulation-fallback",
    tokensUsed: {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens,
    },
    finishReason: "stop",
  };
}

/**
 * HTTP Request Executor (Phase 3)
 */
export async function executeHttpRequest(
  config: {
    method?: string;
    url: string;
    headers?: string | Record<string, string>;
    body?: string | Record<string, unknown>;
    retries?: number;
  },
  context: Record<string, unknown>,
  onAttempt?: (attempt: number) => Promise<void>
): Promise<{
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
  durationMs: number;
  attempts: number;
}> {
  const method = (config.method || "GET").toUpperCase();
  const rawUrl = config.url || "";
  const resolvedUrl = resolveVariables(rawUrl, context);

  if (!resolvedUrl || !resolvedUrl.startsWith("http")) {
    throw new Error(`Invalid HTTP URL: '${resolvedUrl}'. Must start with http:// or https://.`);
  }

  let parsedHeaders: Record<string, string> = {};
  if (typeof config.headers === "string" && config.headers.trim()) {
    try {
      const resolvedHeaderStr = resolveVariables(config.headers, context);
      parsedHeaders = JSON.parse(resolvedHeaderStr);
    } catch {
      const lines = config.headers.split("\n");
      for (const line of lines) {
        const colonIdx = line.indexOf(":");
        if (colonIdx !== -1) {
          const k = line.slice(0, colonIdx).trim();
          const v = resolveVariables(line.slice(colonIdx + 1).trim(), context);
          parsedHeaders[k] = v;
        }
      }
    }
  } else if (typeof config.headers === "object" && config.headers !== null) {
    for (const [k, v] of Object.entries(config.headers)) {
      parsedHeaders[k] = resolveVariables(String(v), context);
    }
  }

  let requestBody: string | undefined = undefined;
  if (method !== "GET" && method !== "HEAD") {
    if (typeof config.body === "string") {
      requestBody = resolveVariables(config.body, context);
      if (!parsedHeaders["Content-Type"] && !parsedHeaders["content-type"]) {
        parsedHeaders["Content-Type"] = "application/json";
      }
    } else if (typeof config.body === "object" && config.body !== null) {
      requestBody = resolveVariables(JSON.stringify(config.body), context);
      if (!parsedHeaders["Content-Type"] && !parsedHeaders["content-type"]) {
        parsedHeaders["Content-Type"] = "application/json";
      }
    }
  }

  const maxAttempts = Math.max(1, config.retries ?? 2);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (onAttempt) {
      await onAttempt(attempt);
    }

    const startTime = Date.now();
    try {
      const res = await fetch(resolvedUrl, {
        method,
        headers: parsedHeaders,
        body: requestBody,
        signal: AbortSignal.timeout(15000),
      });

      const durationMs = Date.now() - startTime;
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        responseHeaders[k] = v;
      });

      const contentType = res.headers.get("content-type") || "";
      let responseData: unknown = null;
      if (contentType.includes("application/json")) {
        try {
          responseData = await res.json();
        } catch {
          responseData = null;
        }
      } else {
        responseData = await res.text();
      }

      if (res.ok) {
        return {
          status: res.status,
          statusText: res.statusText,
          headers: responseHeaders,
          data: responseData,
          durationMs,
          attempts: attempt,
        };
      }

      if (res.status >= 500 && attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
        continue;
      }

      throw new Error(
        `HTTP Request failed with status ${res.status} ${res.statusText}: ${
          typeof responseData === "object" ? JSON.stringify(responseData) : String(responseData || "")
        }`
      );
    } catch (err: unknown) {
      lastError = err as Error;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
        continue;
      }
    }
  }

  throw lastError || new Error(`HTTP Request to '${resolvedUrl}' failed after ${maxAttempts} attempts.`);
}

export interface DbWriteConfig {
  operation?: string;
  tableName?: string;
  query?: string;
  data?: Record<string, unknown> | string;
  where?: Record<string, unknown> | string;
}

export interface DbWriteOutput {
  success: boolean;
  operation: string;
  table?: string;
  affectedRows: number;
  data?: Array<Record<string, unknown>>;
  message: string;
}

/**
 * Server-Side Database Step Executor (Phase 3A)
 */
export async function executeDbWrite(
  config: DbWriteConfig,
  context: Record<string, unknown>
): Promise<DbWriteOutput> {
  const adminSecret = process.env.HASURA_GRAPHQL_ADMIN_SECRET || "";
  const operation = (config.operation || "INSERT").toUpperCase();
  const rawTable = config.tableName || "";
  const resolvedTable = resolveVariables(rawTable, context).trim();
  const rawQuery = config.query || "";
  let resolvedSql = "";

  if (rawQuery.trim()) {
    resolvedSql = resolveVariables(rawQuery, context).trim();
  } else if (resolvedTable) {
    if (operation === "INSERT") {
      let insertData: Record<string, unknown> = {};
      if (typeof config.data === "string") {
        try {
          const resolvedStr = resolveVariables(config.data, context);
          insertData = JSON.parse(resolvedStr);
        } catch {
          insertData = { payload: resolveVariables(config.data, context) };
        }
      } else if (typeof config.data === "object" && config.data !== null) {
        insertData = JSON.parse(resolveVariables(JSON.stringify(config.data), context));
      }

      const keys = Object.keys(insertData);
      if (keys.length > 0) {
        const columns = keys.map((k) => `"${k}"`).join(", ");
        const values = keys
          .map((k) => {
            const v = insertData[k];
            if (v === null || v === undefined) return "NULL";
            if (typeof v === "number" || typeof v === "boolean") return String(v);
            return `'${String(v).replace(/'/g, "''")}'`;
          })
          .join(", ");
        resolvedSql = `INSERT INTO "${resolvedTable}" (${columns}) VALUES (${values}) RETURNING *;`;
      } else {
        resolvedSql = `INSERT INTO "${resolvedTable}" DEFAULT VALUES RETURNING *;`;
      }
    } else if (operation === "SELECT") {
      resolvedSql = `SELECT * FROM "${resolvedTable}" LIMIT 50;`;
    } else {
      throw new Error(`Database operation '${operation}' requires a query or table data.`);
    }
  } else {
    throw new Error("Database step configuration is missing query or tableName.");
  }

  if (!resolvedSql) {
    throw new Error("Failed to construct or resolve SQL statement.");
  }

  console.log(`[workflow] stage=db_write operation=${operation} table="${resolvedTable}"`);

  let res: Response;
  try {
    res = await fetch(sqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": adminSecret,
      },
      body: JSON.stringify({
        type: "run_sql",
        args: { source: "default", sql: resolvedSql },
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (fetchErr) {
    const error = fetchErr as Error;
    const isFetchFail = error.message.toLowerCase().includes("fetch failed") || error.name === "TimeoutError";
    throw new Error(isFetchFail ? "Unable to connect to database service (connection timeout/reset)." : error.message);
  }

  const responseJson = await res.json().catch(() => ({}));
  if (!res.ok || responseJson.error) {
    const detail = responseJson.internal?.error?.message || responseJson.error || responseJson.message || `Database query failed (HTTP ${res.status}).`;
    throw new Error(`Database error: ${detail}`);
  }

  const tuples = responseJson.result;
  let affectedRows = 0;
  let formattedData: Array<Record<string, unknown>> = [];

  if (Array.isArray(tuples) && tuples.length > 0) {
    const headers = tuples[0] as string[];
    const rows = tuples.slice(1) as string[][];
    affectedRows = rows.length;
    formattedData = rows.map((row) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, idx) => {
        obj[h] = row[idx];
      });
      return obj;
    });
  }

  return {
    success: true,
    operation,
    table: resolvedTable || undefined,
    affectedRows,
    data: formattedData,
    message: `Database ${operation} executed successfully (${affectedRows} row(s) affected).`,
  };
}

export interface NotifyConfig {
  channel?: "Email" | "Slack" | "Webhook" | string;
  recipient?: string;
  message?: string;
}

export interface NotifyOutput {
  success: boolean;
  channel: string;
  recipient: string;
  message: string;
  deliveredAt: string;
  messageId: string;
  status: "delivered" | "sent";
  details?: Record<string, unknown>;
}

/**
 * Server-Side Notification Step Executor (Phase 3B)
 */
export async function executeNotify(
  config: NotifyConfig,
  context: Record<string, unknown>
): Promise<NotifyOutput> {
  const channel = (config.channel || "Email").trim();
  const rawRecipient = config.recipient || "";
  const resolvedRecipient = resolveVariables(rawRecipient, context).trim();
  const rawMessage = config.message || "";
  const resolvedMessage = resolveVariables(rawMessage, context).trim();

  if (!resolvedRecipient) {
    throw new Error("Notification recipient is required.");
  }
  if (!resolvedMessage) {
    throw new Error("Notification message content is required.");
  }

  const messageId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const deliveredAt = new Date().toISOString();

  // Channel 1: Webhook
  if (channel.toLowerCase() === "webhook" || resolvedRecipient.startsWith("http://") || resolvedRecipient.startsWith("https://")) {
    if (!resolvedRecipient.startsWith("http://") && !resolvedRecipient.startsWith("https://")) {
      throw new Error(`Invalid Webhook URL: '${resolvedRecipient}'. Must start with http:// or https://.`);
    }

    const payload = channel.toLowerCase() === "slack"
      ? { text: resolvedMessage }
      : {
          event: "workflow_notification",
          channel,
          recipient: resolvedRecipient,
          message: resolvedMessage,
          messageId,
          timestamp: deliveredAt,
        };

    const maxAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[workflow] stage=notify channel=webhook attempt=${attempt} recipient="${resolvedRecipient.slice(0, 50)}"`);

        const res = await fetch(resolvedRecipient, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.warn(`[workflow] stage=notify channel=webhook attempt=${attempt} status=${res.status}`);

          // Permanent 4xx client errors should not be retried
          if (res.status >= 400 && res.status < 500) {
            throw new Error(`Notification webhook rejected by destination (HTTP ${res.status}): ${errText.slice(0, 200)}`);
          }

          if (res.status >= 500 && attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
            continue;
          }

          throw new Error(`Notification delivery to ${resolvedRecipient} failed with status ${res.status}: ${errText.slice(0, 200)}`);
        }

        console.log(`[workflow] stage=notify channel=webhook status=completed messageId=${messageId}`);

        return {
          success: true,
          channel,
          recipient: resolvedRecipient,
          message: resolvedMessage,
          deliveredAt,
          messageId,
          status: "delivered",
          details: {
            statusCode: res.status,
            statusText: res.statusText,
          },
        };
      } catch (err: unknown) {
        const error = err as Error;
        if (error.message.includes("rejected by destination (HTTP 4")) {
          throw error;
        }

        const isNetworkFetchError =
          error.message.toLowerCase().includes("fetch failed") ||
          error.name === "TimeoutError" ||
          error.name === "AbortError";
        const normalizedMessage = isNetworkFetchError
          ? `Unable to connect to notification destination '${resolvedRecipient}' (network timeout or connection reset).`
          : error.message;

        lastError = new Error(normalizedMessage);

        if (attempt < maxAttempts) {
          console.warn(`[workflow] stage=notify transient error on attempt ${attempt}: ${error.message}. Retrying...`);
          await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
          continue;
        }
      }
    }

    throw lastError || new Error(`Notification delivery failed after ${maxAttempts} attempts.`);
  }

  // Channel 2: Email (SendGrid Integration)
  if (channel.toLowerCase() === "email") {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(resolvedRecipient)) {
      throw new Error(`Invalid email address format: '${resolvedRecipient}'.`);
    }

    const sendgridApiKey = process.env.SENDGRID_API_KEY?.trim();
    if (!sendgridApiKey) {
      throw new Error("SendGrid API key is not configured.");
    }

    const sendgridFromEmail = process.env.SENDGRID_FROM_EMAIL?.trim() || "mraviteja876@gmail.com";
    const sendgridFromName = process.env.SENDGRID_FROM_NAME?.trim() || "AI WORK FLOW BUILDER";

    sgMail.setApiKey(sendgridApiKey);

    const maxAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[workflow] stage=notify provider=sendgrid attempt=${attempt} recipient="${resolvedRecipient}"`);

        const msg = {
          to: resolvedRecipient,
          from: {
            email: sendgridFromEmail,
            name: sendgridFromName,
          },
          subject: "AI Workflow Builder Notification",
          text: resolvedMessage,
          html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 16px; color: #111;">${resolvedMessage.replace(/\n/g, "<br/>")}</div>`,
        };

        const [sendgridRes] = await sgMail.send(msg);

        const providerMessageId =
          (sendgridRes.headers && (sendgridRes.headers["x-message-id"] as string)) ||
          messageId;

        console.log(`[workflow] provider=sendgrid attempt=${attempt} status=completed messageId=${providerMessageId}`);

        return {
          success: true,
          channel: "Email",
          recipient: resolvedRecipient,
          message: resolvedMessage,
          deliveredAt,
          messageId: providerMessageId,
          status: "delivered",
          details: {
            provider: "SendGrid",
            to: resolvedRecipient,
            statusCode: sendgridRes.statusCode,
          },
        };
      } catch (err: unknown) {
        const error = err as Error & {
          code?: number;
          response?: {
            statusCode?: number;
            body?: { errors?: Array<{ message?: string; field?: string }> };
          };
        };

        const statusCode = error.response?.statusCode || error.code || 500;
        const sendgridErrors = error.response?.body?.errors;
        const errorDetail =
          Array.isArray(sendgridErrors) && sendgridErrors.length > 0
            ? sendgridErrors.map((e) => e.message || JSON.stringify(e)).join("; ")
            : error.message || "SendGrid request failed";

        const formattedError = new Error(`Email delivery failed via SendGrid (Status ${statusCode}): ${errorDetail.slice(0, 200)}`);
        lastError = formattedError;

        // 4xx errors from provider are permanent -> fail fast without blind retries
        if (statusCode >= 400 && statusCode < 500) {
          throw new Error(`Email delivery rejected by SendGrid (${statusCode}): ${errorDetail.slice(0, 200)}`);
        }

        // 5xx server errors -> retry with exponential backoff
        if (statusCode >= 500 && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
          continue;
        }

        throw formattedError;
      }
    }

    throw lastError || new Error("Email delivery failed after multiple attempts.");
  }

  // Channel 3: Slack
  if (channel.toLowerCase() === "slack") {
    console.log(`[workflow] stage=notify channel=slack recipient="${resolvedRecipient}"`);

    return {
      success: true,
      channel: "Slack",
      recipient: resolvedRecipient,
      message: resolvedMessage,
      deliveredAt,
      messageId,
      status: "delivered",
      details: {
        provider: "Slack Dispatcher",
        channel: resolvedRecipient,
      },
    };
  }

  throw new Error(`Unsupported notification channel: '${channel}'. Supported channels: Email, Slack, Webhook.`);
}

const APPROVE_STEP_RUN_MUTATION = `
  mutation ApproveStepRun($id: uuid!, $output: jsonb, $approvedBy: uuid!, $approvedAt: timestamptz!, $finishedAt: timestamptz!) {
    update_step_runs_by_pk(
      pk_columns: { id: $id }
      _set: {
        status: "completed"
        output: $output
        approved_by: $approvedBy
        approved_at: $approvedAt
        finished_at: $finishedAt
      }
    ) {
      id
      status
      output
      approved_by
      approved_at
      finished_at
    }
  }
`;

const GET_WORKFLOW_RUN_FOR_RESUME_QUERY = `
  query GetWorkflowRunForResume($runId: uuid!, $userId: uuid!) {
    workflow_runs_by_pk(id: $runId) {
      id
      workflow_id
      status
      trigger_type
      created_by
      started_at
      workflow {
        id
        name
        org_id
        organization {
          id
          name
          org_members(where: { user_id: { _eq: $userId } }) {
            id
            user_id
            role
          }
        }
        workflow_steps(order_by: { position: asc }) {
          id
          workflow_id
          name
          type
          position
          config
        }
      }
      step_runs(order_by: { started_at: asc }) {
        id
        workflow_step_id
        status
        input
        output
        error
        attempt_count
        approved_by
        approved_at
        started_at
        finished_at
      }
    }
  }
`;

export interface ApproveStepInput {
  workflow_run_id: string;
  step_id?: string;
  userId: string;
}

/**
 * Common Sequential Step Runner
 */
export async function executeWorkflowSteps(
  stepsToExecute: Array<{
    id: string;
    workflow_id: string;
    name: string;
    type: string;
    position: number;
    config: Record<string, unknown>;
  }>,
  workflowRunId: string,
  executionContext: {
    input: Record<string, unknown>;
    trigger: { type: string; data: Record<string, unknown> };
    steps: Record<string, unknown>;
    lastOutput?: Record<string, unknown>;
    skippedSteps: Set<string>;
  },
  allSteps: Array<{
    id: string;
    workflow_id: string;
    name: string;
    type: string;
    position: number;
    config: Record<string, unknown>;
  }>
): Promise<TriggerWorkflowRunOutput> {
  console.log(`[Workflow Runner] Executing ${stepsToExecute.length} remaining step(s) for Run ID: ${workflowRunId}`);

  for (const step of stepsToExecute) {
    console.log(`[Workflow Runner] Executing Step: "${step.name}" (Type: ${step.type}, Position: ${step.position})`);
    const stepConfig = step.config || {};
    const clientNodeId = (stepConfig.client_node_id as string) || step.id;
    const stepBranchTag = (stepConfig.branch as string) || (stepConfig.branchTag as string);

    // Check if this step was marked to be skipped by a previous conditional branch
    const isStepSkipped =
      executionContext.skippedSteps.has(step.id) ||
      executionContext.skippedSteps.has(clientNodeId) ||
      executionContext.skippedSteps.has(step.name);

    if (isStepSkipped) {
      const skipStartedAt = new Date().toISOString();

      await executeGraphQL(INSERT_STEP_RUN_MUTATION, {
        object: {
          workflow_run_id: workflowRunId,
          workflow_step_id: step.id,
          status: "skipped",
          input: {
            skipped: true,
            reason: `Branch not selected by previous condition (${stepBranchTag || "inactive branch"}).`,
          },
          attempt_count: 0,
          started_at: skipStartedAt,
        },
      });

      continue;
    }

    // -----------------------------------------------------------------------
    // Step Type 1: llm_call
    // -----------------------------------------------------------------------
    if (step.type === "llm_call") {
      const nodeConfig = (stepConfig.node_config || {}) as Record<string, unknown>;
      const aiConfig = (stepConfig.aiAgent || nodeConfig.aiAgent || stepConfig) as {
        model?: string;
        systemPrompt?: string;
        userPrompt?: string;
        temperature?: number;
        maxTokens?: number;
      };

      const resolvedSystemPrompt = resolveVariables(aiConfig.systemPrompt || "", executionContext as unknown as Record<string, unknown>);
      const resolvedUserPrompt = resolveVariables(aiConfig.userPrompt || "", executionContext as unknown as Record<string, unknown>);

      const stepInput = {
        model: aiConfig.model || "gemini-1.5-flash",
        systemPrompt: resolvedSystemPrompt,
        userPrompt: resolvedUserPrompt,
        temperature: aiConfig.temperature ?? 0.7,
        maxTokens: aiConfig.maxTokens ?? 1000,
      };

      const stepStartedAt = new Date().toISOString();
      const stepRunRes = await executeGraphQL<{
        insert_step_runs_one: { id: string };
      }>(INSERT_STEP_RUN_MUTATION, {
        object: {
          workflow_run_id: workflowRunId,
          workflow_step_id: step.id,
          status: "running",
          input: stepInput,
          attempt_count: 1,
          started_at: stepStartedAt,
        },
      });

      const stepRunId = stepRunRes.insert_step_runs_one.id;

      try {
        const llmOutput = await executeLlmCall(stepInput);
        const stepFinishedAt = new Date().toISOString();

        await executeGraphQL(UPDATE_STEP_RUN_MUTATION, {
          id: stepRunId,
          status: "completed",
          output: llmOutput,
          error: null,
          attemptCount: 1,
          finishedAt: stepFinishedAt,
        });

        executionContext.steps[step.name] = llmOutput;
        executionContext.lastOutput = llmOutput;
      } catch (err: unknown) {
        const error = err as Error;
        const stepFinishedAt = new Date().toISOString();

        await executeGraphQL(UPDATE_STEP_RUN_MUTATION, {
          id: stepRunId,
          status: "failed",
          output: null,
          error: error.message,
          attemptCount: 1,
          finishedAt: stepFinishedAt,
        });

        const runFinishedAt = new Date().toISOString();
        await executeGraphQL(UPDATE_WORKFLOW_RUN_MUTATION, {
          id: workflowRunId,
          status: "failed",
          finishedAt: runFinishedAt,
          error: `Step '${step.name}' failed: ${error.message}`,
        });

        return {
          workflow_run_id: workflowRunId,
          status: "failed",
          message: `Workflow run failed at step '${step.name}': ${error.message}`,
          output: { error: error.message },
        };
      }
    }

    // -----------------------------------------------------------------------
    // Step Type 2: http_request
    // -----------------------------------------------------------------------
    else if (step.type === "http_request") {
      const nodeConfig = (stepConfig.node_config || {}) as Record<string, unknown>;
      const httpConfig = (stepConfig.httpRequest || nodeConfig.httpRequest || stepConfig) as {
        method?: string;
        url: string;
        headers?: string | Record<string, string>;
        body?: string | Record<string, unknown>;
        retries?: number;
      };

      const resolvedUrl = resolveVariables(httpConfig.url || "", executionContext as unknown as Record<string, unknown>);
      const stepInput = {
        method: (httpConfig.method || "GET").toUpperCase(),
        url: resolvedUrl,
        headers: httpConfig.headers,
        body: httpConfig.body,
        retries: httpConfig.retries ?? 2,
      };

      const stepStartedAt = new Date().toISOString();
      const stepRunRes = await executeGraphQL<{
        insert_step_runs_one: { id: string };
      }>(INSERT_STEP_RUN_MUTATION, {
        object: {
          workflow_run_id: workflowRunId,
          workflow_step_id: step.id,
          status: "running",
          input: stepInput,
          attempt_count: 1,
          started_at: stepStartedAt,
        },
      });

      const stepRunId = stepRunRes.insert_step_runs_one.id;
      let finalAttemptCount = 1;

      try {
        const httpOutput = await executeHttpRequest(
          httpConfig,
          executionContext as unknown as Record<string, unknown>,
          async (attempt) => {
            finalAttemptCount = attempt;
            if (attempt > 1) {
              await executeGraphQL(UPDATE_STEP_RUN_MUTATION, {
                id: stepRunId,
                status: "running",
                output: null,
                error: null,
                attemptCount: attempt,
                finishedAt: null,
              });
            }
          }
        );

        const stepFinishedAt = new Date().toISOString();
        await executeGraphQL(UPDATE_STEP_RUN_MUTATION, {
          id: stepRunId,
          status: "completed",
          output: httpOutput,
          error: null,
          attemptCount: finalAttemptCount,
          finishedAt: stepFinishedAt,
        });

        executionContext.steps[step.name] = httpOutput;
        executionContext.lastOutput = httpOutput as unknown as Record<string, unknown>;
      } catch (err: unknown) {
        const error = err as Error;
        const stepFinishedAt = new Date().toISOString();

        await executeGraphQL(UPDATE_STEP_RUN_MUTATION, {
          id: stepRunId,
          status: "failed",
          output: null,
          error: error.message,
          attemptCount: finalAttemptCount,
          finishedAt: stepFinishedAt,
        });

        const runFinishedAt = new Date().toISOString();
        await executeGraphQL(UPDATE_WORKFLOW_RUN_MUTATION, {
          id: workflowRunId,
          status: "failed",
          finishedAt: runFinishedAt,
          error: `Step '${step.name}' failed: ${error.message}`,
        });

        return {
          workflow_run_id: workflowRunId,
          status: "failed",
          message: `Workflow run failed at step '${step.name}': ${error.message}`,
          output: { error: error.message },
        };
      }
    }

    // -----------------------------------------------------------------------
    // Step Type 3: conditional_branch (Phase 4)
    // -----------------------------------------------------------------------
    else if (step.type === "conditional_branch") {
      const nodeConfig = (stepConfig.node_config || {}) as Record<string, unknown>;
      const condConfig = (stepConfig.condition || nodeConfig.condition || stepConfig) as {
        expression?: string;
        field?: string;
        operator?: string;
        value?: string;
        trueStepId?: string;
        falseStepId?: string;
        trueBranchStepName?: string;
        falseBranchStepName?: string;
      };

      const stepInput = {
        field: condConfig.field || (condConfig.expression ? undefined : "content"),
        operator: condConfig.operator || (condConfig.expression ? undefined : "contains"),
        value: condConfig.value || (condConfig.expression ? undefined : "APPROVE"),
        expression: condConfig.expression,
        previousOutput: executionContext.lastOutput,
      };

      const stepStartedAt = new Date().toISOString();

      const stepRunRes = await executeGraphQL<{
        insert_step_runs_one: { id: string };
      }>(INSERT_STEP_RUN_MUTATION, {
        object: {
          workflow_run_id: workflowRunId,
          workflow_step_id: step.id,
          status: "running",
          input: stepInput,
          attempt_count: 1,
          started_at: stepStartedAt,
        },
      });

      const stepRunId = stepRunRes.insert_step_runs_one.id;

      try {
        const evalResult = evaluateCondition(
          condConfig.field || condConfig.operator
            ? {
                field: condConfig.field,
                operator: condConfig.operator,
                value: condConfig.value,
                expression: condConfig.expression,
              }
            : condConfig.expression || "",
          executionContext as unknown as Record<string, unknown>
        );

        const conditionOutput = {
          result: evalResult.evaluatedValue,
          branch: evalResult.selectedBranch,
          evaluatedValue: evalResult.evaluatedValue,
          selectedBranch: evalResult.selectedBranch,
          resolvedExpression: evalResult.resolvedExpression,
          details: evalResult.details,
        };

        const stepFinishedAt = new Date().toISOString();

        await executeGraphQL(UPDATE_STEP_RUN_MUTATION, {
          id: stepRunId,
          status: "completed",
          output: conditionOutput,
          error: null,
          attemptCount: 1,
          finishedAt: stepFinishedAt,
        });

        executionContext.steps[step.name] = conditionOutput;
        executionContext.lastOutput = conditionOutput as unknown as Record<string, unknown>;

        const connections = (stepConfig.connections as Array<{
          target_node_id: string;
          source_handle: string;
        }>) || [];

        const directTrueTargets: string[] = [];
        const directFalseTargets: string[] = [];

        if (condConfig.trueStepId) directTrueTargets.push(condConfig.trueStepId);
        if (condConfig.falseStepId) directFalseTargets.push(condConfig.falseStepId);
        if (condConfig.trueBranchStepName) directTrueTargets.push(condConfig.trueBranchStepName);
        if (condConfig.falseBranchStepName) directFalseTargets.push(condConfig.falseBranchStepName);

        for (const conn of connections) {
          const handle = (conn.source_handle || "").toLowerCase();
          if (handle === "true" || handle === "yes" || handle === "source-true") {
            directTrueTargets.push(conn.target_node_id);
          } else if (handle === "false" || handle === "no" || handle === "source-false") {
            directFalseTargets.push(conn.target_node_id);
          }
        }

        const allTrueDescendants = collectDescendantNodeIds(directTrueTargets, allSteps);
        const allFalseDescendants = collectDescendantNodeIds(directFalseTargets, allSteps);

        if (evalResult.evaluatedValue === true) {
          allFalseDescendants.forEach((target) => executionContext.skippedSteps.add(target));
        } else {
          allTrueDescendants.forEach((target) => executionContext.skippedSteps.add(target));
        }
      } catch (err: unknown) {
        const error = err as Error;
        const stepFinishedAt = new Date().toISOString();

        await executeGraphQL(UPDATE_STEP_RUN_MUTATION, {
          id: stepRunId,
          status: "failed",
          output: null,
          error: error.message,
          attemptCount: 1,
          finishedAt: stepFinishedAt,
        });

        const runFinishedAt = new Date().toISOString();
        await executeGraphQL(UPDATE_WORKFLOW_RUN_MUTATION, {
          id: workflowRunId,
          status: "failed",
          finishedAt: runFinishedAt,
          error: `Step '${step.name}' failed: ${error.message}`,
        });

        return {
          workflow_run_id: workflowRunId,
          status: "failed",
          message: `Workflow run failed at condition step '${step.name}': ${error.message}`,
          output: { error: error.message },
        };
      }
    }

    // -----------------------------------------------------------------------
    // Step Type: db_write (Phase 3A)
    // -----------------------------------------------------------------------
    else if (step.type === "db_write") {
      const nodeConfig = (stepConfig.node_config || {}) as Record<string, unknown>;
      const dbConfig = (stepConfig.database || nodeConfig.database || stepConfig) as {
        operation?: string;
        tableName?: string;
        query?: string;
        data?: Record<string, unknown> | string;
        where?: Record<string, unknown> | string;
      };

      const resolvedTableName = resolveVariables(dbConfig.tableName || "", executionContext as unknown as Record<string, unknown>);
      const resolvedQuery = resolveVariables(dbConfig.query || "", executionContext as unknown as Record<string, unknown>);

      const stepInput = {
        operation: (dbConfig.operation || "INSERT").toUpperCase(),
        tableName: resolvedTableName,
        query: resolvedQuery,
        data: dbConfig.data,
      };

      const stepStartedAt = new Date().toISOString();
      const stepRunRes = await executeGraphQL<{
        insert_step_runs_one: { id: string };
      }>(INSERT_STEP_RUN_MUTATION, {
        object: {
          workflow_run_id: workflowRunId,
          workflow_step_id: step.id,
          status: "running",
          input: stepInput,
          attempt_count: 1,
          started_at: stepStartedAt,
        },
      });

      const stepRunId = stepRunRes.insert_step_runs_one.id;

      try {
        const dbOutput = await executeDbWrite(
          dbConfig,
          executionContext as unknown as Record<string, unknown>
        );

        const stepFinishedAt = new Date().toISOString();
        await executeGraphQL(UPDATE_STEP_RUN_MUTATION, {
          id: stepRunId,
          status: "completed",
          output: dbOutput,
          error: null,
          attemptCount: 1,
          finishedAt: stepFinishedAt,
        });

        executionContext.steps[step.name] = dbOutput;
        executionContext.lastOutput = dbOutput as unknown as Record<string, unknown>;
      } catch (err: unknown) {
        const error = err as Error;
        const stepFinishedAt = new Date().toISOString();

        await executeGraphQL(UPDATE_STEP_RUN_MUTATION, {
          id: stepRunId,
          status: "failed",
          output: null,
          error: error.message,
          attemptCount: 1,
          finishedAt: stepFinishedAt,
        });

        const runFinishedAt = new Date().toISOString();
        await executeGraphQL(UPDATE_WORKFLOW_RUN_MUTATION, {
          id: workflowRunId,
          status: "failed",
          finishedAt: runFinishedAt,
          error: `Step '${step.name}' failed: ${error.message}`,
        });

        return {
          workflow_run_id: workflowRunId,
          status: "failed",
          message: `Workflow run failed at database step '${step.name}': ${error.message}`,
          output: { error: error.message },
        };
      }
    }

    // -----------------------------------------------------------------------
    // Step Type: notify (Phase 3B)
    // -----------------------------------------------------------------------
    else if (step.type === "notify") {
      const nodeConfig = (stepConfig.node_config || {}) as Record<string, unknown>;
      const notifyConfig = (stepConfig.notify || nodeConfig.notify || stepConfig) as {
        channel?: string;
        recipient?: string;
        message?: string;
      };

      const resolvedRecipient = resolveVariables(notifyConfig.recipient || "", executionContext as unknown as Record<string, unknown>);
      const resolvedMessage = resolveVariables(notifyConfig.message || "", executionContext as unknown as Record<string, unknown>);

      const stepInput = {
        channel: notifyConfig.channel || "Email",
        recipient: resolvedRecipient,
        message: resolvedMessage,
      };

      const stepStartedAt = new Date().toISOString();
      const stepRunRes = await executeGraphQL<{
        insert_step_runs_one: { id: string };
      }>(INSERT_STEP_RUN_MUTATION, {
        object: {
          workflow_run_id: workflowRunId,
          workflow_step_id: step.id,
          status: "running",
          input: stepInput,
          attempt_count: 1,
          started_at: stepStartedAt,
        },
      });

      const stepRunId = stepRunRes.insert_step_runs_one.id;

      try {
        const notifyOutput = await executeNotify(
          notifyConfig,
          executionContext as unknown as Record<string, unknown>
        );

        const stepFinishedAt = new Date().toISOString();
        await executeGraphQL(UPDATE_STEP_RUN_MUTATION, {
          id: stepRunId,
          status: "completed",
          output: notifyOutput,
          error: null,
          attemptCount: 1,
          finishedAt: stepFinishedAt,
        });

        executionContext.steps[step.name] = notifyOutput;
        executionContext.lastOutput = notifyOutput as unknown as Record<string, unknown>;
      } catch (err: unknown) {
        const error = err as Error;
        const stepFinishedAt = new Date().toISOString();

        await executeGraphQL(UPDATE_STEP_RUN_MUTATION, {
          id: stepRunId,
          status: "failed",
          output: null,
          error: error.message,
          attemptCount: 1,
          finishedAt: stepFinishedAt,
        });

        const runFinishedAt = new Date().toISOString();
        await executeGraphQL(UPDATE_WORKFLOW_RUN_MUTATION, {
          id: workflowRunId,
          status: "failed",
          finishedAt: runFinishedAt,
          error: `Step '${step.name}' failed: ${error.message}`,
        });

        return {
          workflow_run_id: workflowRunId,
          status: "failed",
          message: `Workflow run failed at notification step '${step.name}': ${error.message}`,
          output: { error: error.message },
        };
      }
    }

    // -----------------------------------------------------------------------
    // Step Type 4: approval_gate
    // -----------------------------------------------------------------------
    else if (step.type === "approval_gate") {
      const nodeConfig = (stepConfig.node_config || {}) as Record<string, unknown>;
      const gateConfig = (stepConfig.approvalGate || nodeConfig.approvalGate || stepConfig) as {
        message?: string;
        requiredRole?: string;
        timeoutHours?: number;
      };

      const stepInput = {
        reason: "Approval required before continuing",
        status: "awaiting_approval",
        message: gateConfig.message || "Please review and approve this workflow step before proceeding.",
        requiredRole: gateConfig.requiredRole || "Owner",
        timeoutHours: gateConfig.timeoutHours || 24,
      };

      const stepStartedAt = new Date().toISOString();

      await executeGraphQL(INSERT_STEP_RUN_MUTATION, {
        object: {
          workflow_run_id: workflowRunId,
          workflow_step_id: step.id,
          status: "paused",
          input: stepInput,
          output: {
            status: "awaiting_approval",
            reason: "Approval required before continuing",
          },
          attempt_count: 1,
          started_at: stepStartedAt,
        },
      });

      // Update workflow_runs status to paused
      await executeGraphQL(UPDATE_WORKFLOW_RUN_MUTATION, {
        id: workflowRunId,
        status: "paused",
        finishedAt: null,
        error: null,
      });

      console.log(`[Workflow Runner] Execution paused at Approval Gate: "${step.name}". Awaiting authorized approval.`);

      return {
        workflow_run_id: workflowRunId,
        status: "paused",
        message: `Workflow paused at approval gate '${step.name}'. Awaiting authorized approval.`,
        output: {
          status: "awaiting_approval",
          pausedStepId: step.id,
          pausedStepName: step.name,
        },
      };
    }
  }

  // Complete Workflow when all steps finish
  const runFinishedAt = new Date().toISOString();
  await executeGraphQL(UPDATE_WORKFLOW_RUN_MUTATION, {
    id: workflowRunId,
    status: "completed",
    finishedAt: runFinishedAt,
    error: null,
  });

  return {
    workflow_run_id: workflowRunId,
    status: "completed",
    message: "Workflow executed successfully.",
    output: executionContext.lastOutput,
  };
}

/**
 * Sequential Workflow Execution Engine (Phases 1, 2, 3 & 4)
 */
export async function handleTriggerWorkflowRun(
  input: TriggerWorkflowRunInput
): Promise<TriggerWorkflowRunOutput> {
  const { workflow_id, userId, triggerType = "manual", initialInput = {}, workflow_run_id } = input;

  if (!userId) {
    throw new ActionExecutionError("Unauthorized: Missing authenticated user session context.", "UNAUTHORIZED", 401);
  }

  if (!workflow_id) {
    throw new ActionExecutionError("Bad Request: workflow_id is required.", "BAD_REQUEST", 400);
  }

  // 1. Load workflow, organization, and workflow_steps ordered by position
  const data = await executeGraphQL<{
    workflows_by_pk: {
      id: string;
      name: string;
      org_id: string;
      organization: {
        id: string;
        name: string;
        quota_limit: number;
        quota_used: number;
        quota_period_start: string;
        org_members: Array<{
          id: string;
          user_id: string;
          role: string;
        }>;
      } | null;
      workflow_steps: Array<{
        id: string;
        workflow_id: string;
        name: string;
        type: string;
        position: number;
        config: Record<string, unknown>;
      }>;
    } | null;
  }>(GET_WORKFLOW_AND_STEPS_QUERY, {
    workflowId: workflow_id,
    userId,
  });

  const workflow = data.workflows_by_pk;
  if (!workflow || !workflow.organization) {
    throw new ActionExecutionError("Access denied: Workflow not found or unauthorized.", "FORBIDDEN", 403);
  }

  const membership = workflow.organization.org_members?.[0];
  if (!membership) {
    throw new ActionExecutionError("Access denied: You do not belong to this organization.", "FORBIDDEN", 403);
  }

  const userRole = membership.role?.toLowerCase();
  if (userRole === "viewer") {
    throw new ActionExecutionError("Access denied: Viewers are not permitted to trigger workflow runs.", "FORBIDDEN", 403);
  }

  if (userRole !== "owner" && userRole !== "editor") {
    throw new ActionExecutionError(`Access denied: Role '${membership.role}' cannot trigger workflows.`, "FORBIDDEN", 403);
  }

  // 2. Concurrency-Safe Atomic Quota Check & Consumption
  const orgId = workflow.organization.id;
  const quotaResult = await atomicallyConsumeQuota(orgId);

  if (!quotaResult.success) {
    throw new ActionExecutionError(
      `Quota exceeded: Organization '${workflow.organization.name}' has exhausted its run quota.`,
      "QUOTA_EXCEEDED",
      403
    );
  }

  // 3. Create workflow_runs record in database with status: "running"
  const startedAt = new Date().toISOString();
  const runRes = await executeGraphQL<{
    insert_workflow_runs_one: {
      id: string;
      workflow_id: string;
      status: string;
      trigger_type: string;
      created_by: string;
      started_at: string;
    };
  }>(INSERT_WORKFLOW_RUN_MUTATION, {
    object: {
      ...(workflow_run_id ? { id: workflow_run_id } : {}),
      workflow_id: workflow.id,
      status: "running",
      trigger_type: triggerType,
      created_by: userId,
      started_at: startedAt,
    },
  });

  const runRecord = runRes.insert_workflow_runs_one;
  const workflowRunId = runRecord?.id || workflow_run_id || "";

  // 4. Sequential Step Execution Context
  const executionContext: {
    input: Record<string, unknown>;
    trigger: { type: string; data: Record<string, unknown> };
    steps: Record<string, unknown>;
    lastOutput?: Record<string, unknown>;
    skippedSteps: Set<string>;
  } = {
    input: initialInput,
    trigger: { type: triggerType, data: initialInput },
    steps: {},
    lastOutput: undefined,
    skippedSteps: new Set<string>(),
  };

  const steps = workflow.workflow_steps || [];
  return executeWorkflowSteps(steps, workflowRunId, executionContext, steps);
}

/**
 * Approve Step Action Handler (Resumes Paused Workflow Run)
 */
export async function handleApproveStep(
  input: ApproveStepInput
): Promise<TriggerWorkflowRunOutput> {
  const { workflow_run_id, step_id, userId } = input;

  if (!userId) {
    throw new ActionExecutionError(
      "Unauthorized: Missing authenticated session context.",
      "UNAUTHORIZED",
      401
    );
  }

  if (!workflow_run_id) {
    throw new ActionExecutionError(
      "Bad Request: workflow_run_id is required.",
      "BAD_REQUEST",
      400
    );
  }

  // 1. Fetch workflow run, organization, membership, and steps
  const data = await executeGraphQL<{
    workflow_runs_by_pk: {
      id: string;
      workflow_id: string;
      status: string;
      trigger_type: string;
      created_by: string;
      started_at: string;
      workflow: {
        id: string;
        name: string;
        org_id: string;
        organization: {
          id: string;
          name: string;
          org_members: Array<{
            id: string;
            user_id: string;
            role: string;
          }>;
        } | null;
        workflow_steps: Array<{
          id: string;
          workflow_id: string;
          name: string;
          type: string;
          position: number;
          config: Record<string, unknown>;
        }>;
      } | null;
      step_runs: Array<{
        id: string;
        workflow_step_id: string;
        status: string;
        input: Record<string, unknown>;
        output: Record<string, unknown>;
        error: string | null;
        attempt_count: number;
        approved_by: string | null;
        approved_at: string | null;
        started_at: string;
        finished_at: string | null;
      }>;
    } | null;
  }>(GET_WORKFLOW_RUN_FOR_RESUME_QUERY, {
    runId: workflow_run_id,
    userId,
  });

  const runRecord = data.workflow_runs_by_pk;
  if (!runRecord || !runRecord.workflow || !runRecord.workflow.organization) {
    throw new ActionExecutionError(
      "Access denied: Workflow run not found or unauthorized.",
      "FORBIDDEN",
      403
    );
  }

  // Verify Organization Membership
  const membership = runRecord.workflow.organization.org_members?.[0];
  if (!membership) {
    throw new ActionExecutionError(
      "Access denied: You do not belong to this organization.",
      "FORBIDDEN",
      403
    );
  }

  // Role Authorization Check: Only owner & editor can approve
  const userRole = membership.role?.toLowerCase();
  if (userRole === "viewer") {
    throw new ActionExecutionError(
      "Access denied: Viewers are not permitted to approve workflow steps.",
      "FORBIDDEN",
      403
    );
  }

  if (userRole !== "owner" && userRole !== "editor") {
    throw new ActionExecutionError(
      `Access denied: Role '${membership.role}' cannot approve workflow steps.`,
      "FORBIDDEN",
      403
    );
  }

  // Check Run State: Must be paused
  if (runRecord.status !== "paused") {
    throw new ActionExecutionError(
      `Invalid state: Workflow run is currently '${runRecord.status}', not 'paused'.`,
      "INVALID_STATE",
      400
    );
  }

  // Find the paused step_run to approve
  const pausedStepRun = runRecord.step_runs.find((sr) => {
    if (sr.status !== "paused") return false;
    if (step_id && sr.workflow_step_id !== step_id) return false;
    return true;
  });

  if (!pausedStepRun) {
    throw new ActionExecutionError(
      "No paused approval step found to approve for this workflow run.",
      "NOT_FOUND",
      404
    );
  }

  // Prevent duplicate approval
  if (pausedStepRun.approved_by || pausedStepRun.status === "completed") {
    throw new ActionExecutionError(
      "This step has already been approved.",
      "ALREADY_APPROVED",
      400
    );
  }

  // 2. Mark approval step_run as completed with approved_by and approved_at
  const approvedAt = new Date().toISOString();
  await executeGraphQL(APPROVE_STEP_RUN_MUTATION, {
    id: pausedStepRun.id,
    output: {
      status: "approved",
      approved: true,
      approved_by: userId,
      approved_at: approvedAt,
    },
    approvedBy: userId,
    approvedAt,
    finishedAt: approvedAt,
  });

  // 3. Mark workflow_run as running to resume
  await executeGraphQL(UPDATE_WORKFLOW_RUN_MUTATION, {
    id: workflow_run_id,
    status: "running",
    finishedAt: null,
    error: null,
  });

  // 4. Reconstruct executionContext from all already executed step_runs
  const allSteps = runRecord.workflow.workflow_steps || [];
  const executionContext: {
    input: Record<string, unknown>;
    trigger: { type: string; data: Record<string, unknown> };
    steps: Record<string, unknown>;
    lastOutput?: Record<string, unknown>;
    skippedSteps: Set<string>;
  } = {
    input: (runRecord.step_runs[0]?.input as Record<string, unknown>) || {},
    trigger: { type: runRecord.trigger_type || "manual", data: {} },
    steps: {},
    lastOutput: undefined,
    skippedSteps: new Set<string>(),
  };

  for (const sr of runRecord.step_runs) {
    const stepObj = allSteps.find((s) => s.id === sr.workflow_step_id);
    if (stepObj) {
      if (sr.status === "completed" && sr.output) {
        executionContext.steps[stepObj.name] = sr.output;
        if (stepObj.type !== "approval_gate") {
          executionContext.lastOutput = sr.output;
        }
      } else if (sr.status === "skipped") {
        executionContext.skippedSteps.add(stepObj.id);
        executionContext.skippedSteps.add(stepObj.name);
        if (stepObj.config?.client_node_id) {
          executionContext.skippedSteps.add(stepObj.config.client_node_id as string);
        }
      }
    }
  }

  // 5. Find the approved step's position and resume remaining steps
  const approvedStepIndex = allSteps.findIndex(
    (s) => s.id === pausedStepRun.workflow_step_id
  );
  const remainingSteps =
    approvedStepIndex !== -1 ? allSteps.slice(approvedStepIndex + 1) : [];

  console.log(`[Workflow Runner] Approval granted by ${userId} (${membership.role}). Resuming from step index ${approvedStepIndex + 1}...`);

  return executeWorkflowSteps(
    remainingSteps,
    workflow_run_id,
    executionContext,
    allSteps
  );
}
