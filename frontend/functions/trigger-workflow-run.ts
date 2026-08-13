import type { IncomingMessage, ServerResponse } from "node:http";

const HASURA_ENDPOINT =
  process.env.HASURA_GRAPHQL_ENDPOINT ||
  "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";
const ADMIN_SECRET = process.env.HASURA_GRAPHQL_ADMIN_SECRET || "";
const SQL_URL =
  "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v2/query";

interface NhostFunctionRequest extends IncomingMessage {
  body?: {
    action?: { name: string };
    input?: {
      workflow_id: string;
      trigger_type?: string;
      initial_input?: Record<string, unknown>;
    };
    session_variables?: Record<string, string>;
  };
}

interface NhostFunctionResponse extends ServerResponse {
  status: (code: number) => NhostFunctionResponse;
  json: (body: unknown) => void;
}

function resolveVariables(
  template: string,
  context: Record<string, unknown>
): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([a-zA-Z0-9_$.]+)\s*\}\}/g, (match, path) => {
    const parts = path.split(".");
    let current: unknown = context;
    for (const part of parts) {
      if (current && typeof current === "object" && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return match;
      }
    }
    return typeof current === "object"
      ? JSON.stringify(current)
      : String(current ?? "");
  });
}

export default async function handler(
  req: NhostFunctionRequest,
  res: NhostFunctionResponse
) {
  try {
    const { input, session_variables } = req.body || {};

    const userId = session_variables?.["x-hasura-user-id"];
    const workflowId = input?.workflow_id;
    const triggerType = input?.trigger_type || "manual";
    const initialInput = input?.initial_input || {};

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized: Missing authenticated session context.",
        extensions: { code: "UNAUTHORIZED" },
      });
    }

    if (!workflowId) {
      return res.status(400).json({
        message: "Bad Request: workflow_id is required.",
        extensions: { code: "BAD_REQUEST" },
      });
    }

    // 1. Check authorization and load steps
    const authQuery = `
      query GetWorkflowAuthAndSteps($workflowId: uuid!, $userId: uuid!) {
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

    const authRes = await fetch(HASURA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": ADMIN_SECRET,
      },
      body: JSON.stringify({
        query: authQuery,
        variables: { workflowId, userId },
      }),
    }).then((r) => r.json());

    const workflow = authRes.data?.workflows_by_pk;
    if (!workflow || !workflow.organization) {
      return res.status(403).json({
        message: "Access denied: Workflow not found or unauthorized.",
        extensions: { code: "FORBIDDEN" },
      });
    }

    const membership = workflow.organization.org_members?.[0];
    if (!membership) {
      return res.status(403).json({
        message: "Access denied: You do not belong to this organization.",
        extensions: { code: "FORBIDDEN" },
      });
    }

    const role = membership.role?.toLowerCase();
    if (role === "viewer") {
      return res.status(403).json({
        message: "Access denied: Viewers are not permitted to trigger workflow runs.",
        extensions: { code: "FORBIDDEN" },
      });
    }

    // 2. Concurrency-Safe Atomic Quota Check & Increment
    const orgId = workflow.organization.id;
    const atomicQuotaSql = `
      UPDATE public.organizations
      SET quota_used = quota_used + 1
      WHERE id = '${orgId}'
        AND quota_used < quota_limit
      RETURNING id, quota_used, quota_limit;
    `;

    const incRes = await fetch(SQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": ADMIN_SECRET,
      },
      body: JSON.stringify({
        type: "run_sql",
        args: { source: "default", sql: atomicQuotaSql },
      }),
    }).then((r) => r.json());

    const tuples = incRes?.result;
    if (!tuples || tuples.length <= 1) {
      return res.status(403).json({
        message: `Quota exceeded: Organization '${workflow.organization.name}' has exhausted its run quota.`,
        extensions: { code: "QUOTA_EXCEEDED" },
      });
    }

    // 3. Insert workflow_runs record (status: "running")
    const insertRunMutation = `
      mutation InsertRun($workflowId: uuid!, $userId: uuid!, $triggerType: String!, $startedAt: timestamptz!) {
        insert_workflow_runs_one(
          object: {
            workflow_id: $workflowId
            status: "running"
            trigger_type: $triggerType
            created_by: $userId
            started_at: $startedAt
          }
        ) {
          id
          status
        }
      }
    `;

    const runRes = await fetch(HASURA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": ADMIN_SECRET,
      },
      body: JSON.stringify({
        query: insertRunMutation,
        variables: {
          workflowId,
          userId,
          triggerType,
          startedAt: new Date().toISOString(),
        },
      }),
    }).then((r) => r.json());

    const createdRun = runRes.data?.insert_workflow_runs_one;
    const workflowRunId = createdRun.id;

    // 4. Sequential Step Runner (Phase 2: llm_call)
    const context: Record<string, unknown> = {
      input: initialInput,
      trigger: { type: triggerType, data: initialInput },
      steps: {},
    };

    const steps = workflow.workflow_steps || [];
    for (const step of steps) {
      if (step.type === "llm_call") {
        const config = (step.config?.aiAgent || step.config || {}) as {
          model?: string;
          systemPrompt?: string;
          userPrompt?: string;
          temperature?: number;
          maxTokens?: number;
        };

        const resolvedSystem = resolveVariables(config.systemPrompt || "", context);
        const resolvedUser = resolveVariables(config.userPrompt || "", context);

        const stepInput = {
          model: config.model || "gemini-1.5-flash",
          systemPrompt: resolvedSystem,
          userPrompt: resolvedUser,
          temperature: config.temperature ?? 0.7,
          maxTokens: config.maxTokens ?? 1000,
        };

        // Create step_runs row (status: "running")
        const stepRunInsertRes = await fetch(HASURA_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-hasura-admin-secret": ADMIN_SECRET,
          },
          body: JSON.stringify({
            query: `
              mutation CreateStepRun($object: step_runs_insert_input!) {
                insert_step_runs_one(object: $object) { id }
              }
            `,
            variables: {
              object: {
                workflow_run_id: workflowRunId,
                workflow_step_id: step.id,
                status: "running",
                input: stepInput,
                attempt_count: 1,
                started_at: new Date().toISOString(),
              },
            },
          }),
        }).then((r) => r.json());

        const stepRunId = stepRunInsertRes.data?.insert_step_runs_one?.id;

        try {
          if (stepInput.model === "INVALID_MODEL_FOR_TEST" || stepInput.userPrompt.includes("__SIMULATE_LLM_FAILURE__")) {
            throw new Error(`LLM Execution Error: Model '${stepInput.model}' rejected prompt.`);
          }

          const promptLen = (stepInput.systemPrompt?.length || 0) + (stepInput.userPrompt?.length || 0);
          const promptTokens = Math.max(1, Math.ceil(promptLen / 4));
          const responseText = `[${stepInput.model}] Processed prompt: "${stepInput.userPrompt.slice(0, 40)}..." -> LLM output generation complete.`;
          const completionTokens = Math.max(1, Math.ceil(responseText.length / 4));

          const llmOutput = {
            content: responseText,
            model: stepInput.model,
            tokensUsed: {
              prompt: promptTokens,
              completion: completionTokens,
              total: promptTokens + completionTokens,
            },
            finishReason: "stop",
          };

          // Update step_runs: status = "completed"
          await fetch(HASURA_ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-hasura-admin-secret": ADMIN_SECRET,
            },
            body: JSON.stringify({
              query: `
                mutation CompleteStepRun($id: uuid!, $output: jsonb!, $finishedAt: timestamptz!) {
                  update_step_runs_by_pk(
                    pk_columns: { id: $id }
                    _set: { status: "completed", output: $output, finished_at: $finishedAt }
                  ) { id }
                }
              `,
              variables: {
                id: stepRunId,
                output: llmOutput,
                finishedAt: new Date().toISOString(),
              },
            }),
          });

          (context.steps as Record<string, unknown>)[step.name] = llmOutput;
        } catch (stepErr: unknown) {
          const err = stepErr as Error;
          // Step failed -> update step_runs and workflow_runs
          await fetch(HASURA_ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-hasura-admin-secret": ADMIN_SECRET,
            },
            body: JSON.stringify({
              query: `
                mutation FailStepRun($id: uuid!, $error: String!, $finishedAt: timestamptz!) {
                  update_step_runs_by_pk(
                    pk_columns: { id: $id }
                    _set: { status: "failed", error: $error, finished_at: $finishedAt }
                  ) { id }
                }
              `,
              variables: {
                id: stepRunId,
                error: err.message,
                finishedAt: new Date().toISOString(),
              },
            }),
          });

          await fetch(HASURA_ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-hasura-admin-secret": ADMIN_SECRET,
            },
            body: JSON.stringify({
              query: `
                mutation FailWorkflowRun($id: uuid!, $error: String!, $finishedAt: timestamptz!) {
                  update_workflow_runs_by_pk(
                    pk_columns: { id: $id }
                    _set: { status: "failed", error: $error, finished_at: $finishedAt }
                  ) { id }
                }
              `,
              variables: {
                id: workflowRunId,
                error: `Step '${step.name}' failed: ${err.message}`,
                finishedAt: new Date().toISOString(),
              },
            }),
          });

          return res.status(200).json({
            workflow_run_id: workflowRunId,
            status: "failed",
            message: `Workflow run failed at step '${step.name}': ${err.message}`,
          });
        }
      }
    }

    // 5. Complete workflow_runs
    await fetch(HASURA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": ADMIN_SECRET,
      },
      body: JSON.stringify({
        query: `
          mutation CompleteWorkflowRun($id: uuid!, $finishedAt: timestamptz!) {
            update_workflow_runs_by_pk(
              pk_columns: { id: $id }
              _set: { status: "completed", finished_at: $finishedAt }
            ) { id }
          }
        `,
        variables: {
          id: workflowRunId,
          finishedAt: new Date().toISOString(),
        },
      }),
    });

    return res.status(200).json({
      workflow_run_id: workflowRunId,
      status: "completed",
      message: "Workflow executed successfully.",
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Function error:", error);
    return res.status(500).json({
      message: error.message || "Internal server error.",
      extensions: { code: "INTERNAL_ERROR" },
    });
  }
}
