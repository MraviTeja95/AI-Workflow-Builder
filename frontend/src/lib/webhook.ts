import crypto from "node:crypto";
import { executeGraphQL } from "./hasura";
import { handleTriggerWorkflowRun, ActionExecutionError } from "./workflowExecution";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WebhookExecutionResult {
  success: boolean;
  workflow_run_id: string;
  status: string;
  message: string;
  output?: Record<string, unknown>;
}

export interface WebhookValidationResult {
  valid: boolean;
  statusCode?: number;
  error?: string;
  workflow?: {
    id: string;
    name: string;
    org_id: string;
    created_by: string;
    organization: {
      id: string;
      name: string;
      quota_limit: number;
      quota_used: number;
    };
    webhookTrigger: {
      id: string;
      config: Record<string, unknown>;
      secret?: string;
    };
  };
}

const GET_WORKFLOW_FOR_WEBHOOK_QUERY = `
  query GetWorkflowForWebhook($workflowId: uuid!) {
    workflows_by_pk(id: $workflowId) {
      id
      name
      org_id
      created_by
      organization {
        id
        name
        quota_limit
        quota_used
        quota_period_start
        org_members {
          id
          user_id
          role
        }
      }
      workflow_triggers {
        id
        type
        enabled
        config
      }
      workflow_steps(order_by: { position: asc }) {
        id
        name
        type
        position
      }
    }
  }
`;

/**
 * Constant-time string equality check to prevent timing attacks.
 */
function secureCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validates the workflow, active webhook trigger configuration, and secret token.
 */
export async function validateWebhookTrigger(
  workflowId: string,
  providedSecret?: string | null
): Promise<WebhookValidationResult> {
  // 1. UUID syntax validation
  if (!workflowId || !UUID_REGEX.test(workflowId)) {
    return {
      valid: false,
      statusCode: 400,
      error: "Bad Request: Invalid workflow ID format. Must be a valid UUID.",
    };
  }

  // 2. Fetch workflow and triggers using backend admin client
  let data: {
    workflows_by_pk: {
      id: string;
      name: string;
      org_id: string;
      created_by: string;
      organization: {
        id: string;
        name: string;
        quota_limit: number;
        quota_used: number;
        org_members: Array<{
          id: string;
          user_id: string;
          role: string;
        }>;
      } | null;
      workflow_triggers: Array<{
        id: string;
        type: string;
        enabled: boolean;
        config: Record<string, unknown>;
      }>;
      workflow_steps: Array<{
        id: string;
        name: string;
        type: string;
        position: number;
      }>;
    } | null;
  };

  try {
    data = await executeGraphQL(GET_WORKFLOW_FOR_WEBHOOK_QUERY, {
      workflowId,
    });
  } catch (err) {
    const error = err as Error;
    console.error("[Webhook Validator] GraphQL lookup error:", error.message);
    return {
      valid: false,
      statusCode: 500,
      error: "Internal Server Error: Failed to load workflow configuration.",
    };
  }

  const workflow = data?.workflows_by_pk;
  if (!workflow || !workflow.organization) {
    return {
      valid: false,
      statusCode: 404,
      error: "Workflow not found.",
    };
  }

  // 3. Find active Webhook trigger
  const triggers = workflow.workflow_triggers || [];
  const webhookTrigger = triggers.find(
    (t) => (t.type || "").toLowerCase() === "webhook" && t.enabled === true
  );

  if (!webhookTrigger) {
    // Check if trigger exists but is disabled
    const disabledTrigger = triggers.find(
      (t) => (t.type || "").toLowerCase() === "webhook"
    );
    if (disabledTrigger && !disabledTrigger.enabled) {
      return {
        valid: false,
        statusCode: 403,
        error: "Forbidden: Webhook trigger is disabled for this workflow.",
      };
    }

    return {
      valid: false,
      statusCode: 404,
      error: "Workflow does not have an active webhook trigger configured.",
    };
  }

  // 4. Extract configured secret from trigger config
  const triggerConfig = (webhookTrigger.config || {}) as {
    node_config?: {
      trigger?: {
        webhookSecret?: string;
      };
    };
    webhook_secret?: string;
    secret?: string;
  };

  const configuredSecret =
    triggerConfig.node_config?.trigger?.webhookSecret ||
    triggerConfig.webhook_secret ||
    triggerConfig.secret ||
    null;

  // 5. Authenticate Webhook Secret
  if (configuredSecret) {
    if (!providedSecret) {
      return {
        valid: false,
        statusCode: 401,
        error: "Unauthorized: Missing webhook secret. Provide x-webhook-secret header or Bearer token.",
      };
    }

    if (!secureCompare(providedSecret, configuredSecret)) {
      return {
        valid: false,
        statusCode: 401,
        error: "Unauthorized: Invalid webhook secret.",
      };
    }
  }

  // 6. Verify workflow creator has valid organization membership
  const members = workflow.organization.org_members || [];
  const creatorMembership = members.find((m) => m.user_id === workflow.created_by);
  const effectiveUserId = creatorMembership?.user_id || members.find(m => (m.role || "").toLowerCase() === "owner")?.user_id;

  if (!effectiveUserId) {
    return {
      valid: false,
      statusCode: 403,
      error: "Forbidden: Workflow organization has no valid active owner.",
    };
  }

  return {
    valid: true,
    workflow: {
      id: workflow.id,
      name: workflow.name,
      org_id: workflow.org_id,
      created_by: effectiveUserId,
      organization: {
        id: workflow.organization.id,
        name: workflow.organization.name,
        quota_limit: workflow.organization.quota_limit,
        quota_used: workflow.organization.quota_used,
      },
      webhookTrigger: {
        id: webhookTrigger.id,
        config: webhookTrigger.config,
        secret: configuredSecret || undefined,
      },
    },
  };
}

/**
 * Executes a validated webhook trigger by invoking the existing execution engine.
 */
export async function executeWebhookTrigger(
  workflow: NonNullable<WebhookValidationResult["workflow"]>,
  payload: Record<string, unknown>
): Promise<WebhookExecutionResult> {
  console.log(`[Webhook Trigger] Starting execution for workflow '${workflow.name}' (${workflow.id})`);

  try {
    const result = await handleTriggerWorkflowRun({
      workflow_id: workflow.id,
      userId: workflow.created_by,
      triggerType: "webhook",
      initialInput: payload,
    });

    return {
      success: true,
      workflow_run_id: result.workflow_run_id,
      status: result.status,
      message: result.message || "Workflow run triggered via webhook successfully.",
      output: result.output,
    };
  } catch (err) {
    if (err instanceof ActionExecutionError) {
      throw err;
    }
    const error = err as Error;
    throw new ActionExecutionError(
      error.message || "Failed to execute webhook-triggered workflow.",
      "INTERNAL_ERROR",
      500
    );
  }
}
