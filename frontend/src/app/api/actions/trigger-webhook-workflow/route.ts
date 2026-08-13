import { NextResponse } from "next/server";
import {
  validateWebhookTrigger,
  executeWebhookTrigger,
} from "@/lib/webhook";
import { ActionExecutionError } from "@/lib/workflowExecution";

interface HasuraWebhookActionRequestBody {
  action?: { name: string };
  input?: {
    workflow_id: string;
    secret?: string;
    event?: string;
    payload?: Record<string, unknown>;
  };
  session_variables?: Record<string, string>;
}

export async function POST(request: Request) {
  try {
    const body: HasuraWebhookActionRequestBody = await request.json();

    const workflowId = body.input?.workflow_id;
    if (!workflowId) {
      return NextResponse.json(
        {
          message: "Bad Request: workflow_id is required.",
          extensions: { code: "BAD_REQUEST" },
        },
        { status: 400 }
      );
    }

    // Extract secret from Hasura action input or forwarded headers
    const rawAuth = request.headers.get("authorization") || "";
    const bearerSecret = rawAuth.toLowerCase().startsWith("bearer ")
      ? rawAuth.slice(7).trim()
      : null;
    const headerSecret = request.headers.get("x-webhook-secret");
    const providedSecret = body.input?.secret || headerSecret || bearerSecret || null;

    // Construct trigger payload
    const payload =
      body.input?.payload ||
      (body.input?.event ? { event: body.input.event } : {});

    // 1. Validate workflow existence, active webhook trigger, and secret token
    const validation = await validateWebhookTrigger(workflowId, providedSecret);
    if (!validation.valid || !validation.workflow) {
      return NextResponse.json(
        {
          message: validation.error || "Webhook validation failed.",
          extensions: { code: "UNAUTHORIZED" },
        },
        { status: validation.statusCode || 401 }
      );
    }

    // 2. Delegate to existing execution engine
    const executionResult = await executeWebhookTrigger(
      validation.workflow,
      payload
    );

    return NextResponse.json({
      workflow_run_id: executionResult.workflow_run_id,
      status: executionResult.status,
      message: executionResult.message,
    });
  } catch (err) {
    if (err instanceof ActionExecutionError) {
      return NextResponse.json(
        {
          message: err.message,
          extensions: { code: err.code },
        },
        { status: err.statusCode }
      );
    }

    const error = err as Error;
    console.error("[Hasura Webhook Action] Uncaught error:", error.message);
    return NextResponse.json(
      {
        message: error.message || "Failed to trigger webhook workflow.",
        extensions: { code: "INTERNAL_ERROR" },
      },
      { status: 500 }
    );
  }
}
