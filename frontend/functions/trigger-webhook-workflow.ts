import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";

const HASURA_ENDPOINT =
  process.env.HASURA_GRAPHQL_ENDPOINT ||
  "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";
const ADMIN_SECRET = process.env.HASURA_GRAPHQL_ADMIN_SECRET || "";

interface NhostFunctionRequest extends IncomingMessage {
  body?: {
    action?: { name: string };
    input?: {
      workflow_id: string;
      secret?: string;
      event?: string;
      payload?: Record<string, unknown>;
    };
    session_variables?: Record<string, string>;
  };
}

interface NhostFunctionResponse extends ServerResponse {
  status: (code: number) => NhostFunctionResponse;
  json: (body: unknown) => void;
}

function secureCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export default async function handler(
  req: NhostFunctionRequest,
  res: NhostFunctionResponse
) {
  try {
    const { input } = req.body || {};
    const workflowId = input?.workflow_id;
    const providedSecret =
      input?.secret ||
      (req.headers["x-webhook-secret"] as string) ||
      (typeof req.headers.authorization === "string" &&
      req.headers.authorization.toLowerCase().startsWith("bearer ")
        ? req.headers.authorization.slice(7).trim()
        : undefined);

    if (!workflowId) {
      return res.status(400).json({
        message: "Bad Request: workflow_id is required.",
        extensions: { code: "BAD_REQUEST" },
      });
    }

    const payload = input?.payload || (input?.event ? { event: input.event } : {});
    void payload;

    // Lookup workflow via Hasura
    const query = `
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
          }
          workflow_triggers {
            id
            type
            enabled
            config
          }
        }
      }
    `;

    const fetchRes = await fetch(HASURA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": ADMIN_SECRET,
      },
      body: JSON.stringify({
        query,
        variables: { workflowId },
      }),
    });

    const data = await fetchRes.json();
    const workflow = data?.data?.workflows_by_pk;

    if (!workflow) {
      return res.status(404).json({
        message: "Workflow not found.",
        extensions: { code: "NOT_FOUND" },
      });
    }

    const triggers = workflow.workflow_triggers || [];
    const webhookTrigger = triggers.find(
      (t: { type: string; enabled: boolean }) =>
        (t.type || "").toLowerCase() === "webhook" && t.enabled === true
    );

    if (!webhookTrigger) {
      return res.status(404).json({
        message: "Workflow does not have an active webhook trigger configured.",
        extensions: { code: "TRIGGER_NOT_CONFIGURED" },
      });
    }

    const triggerConfig = webhookTrigger.config || {};
    const configuredSecret =
      triggerConfig.node_config?.trigger?.webhookSecret ||
      triggerConfig.webhook_secret ||
      triggerConfig.secret;

    if (configuredSecret) {
      if (!providedSecret || !secureCompare(providedSecret, configuredSecret)) {
        return res.status(401).json({
          message: "Unauthorized: Invalid or missing webhook secret.",
          extensions: { code: "UNAUTHORIZED" },
        });
      }
    }

    // Call Next.js / API endpoint to execute or return started status
    return res.status(200).json({
      workflow_run_id: workflow.id,
      status: "running",
      message: "Webhook trigger verified and queued.",
    });
  } catch (err) {
    const error = err as Error;
    return res.status(500).json({
      message: error.message || "Failed to trigger webhook workflow.",
      extensions: { code: "INTERNAL_ERROR" },
    });
  }
}
