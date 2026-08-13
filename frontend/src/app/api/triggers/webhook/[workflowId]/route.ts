import { NextResponse } from "next/server";
import {
  validateWebhookTrigger,
  executeWebhookTrigger,
} from "@/lib/webhook";
import { ActionExecutionError } from "@/lib/workflowExecution";

export async function POST(
  request: Request,
  props: { params: Promise<{ workflowId: string }> }
) {
  try {
    const { workflowId } = await props.params;

    // Extract secret token from headers
    const rawAuth = request.headers.get("authorization") || "";
    const bearerSecret = rawAuth.toLowerCase().startsWith("bearer ")
      ? rawAuth.slice(7).trim()
      : null;
    const headerSecret = request.headers.get("x-webhook-secret");
    const providedSecret = headerSecret || bearerSecret || null;

    // Parse incoming payload safely
    let payload: Record<string, unknown> = {};
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        const text = await request.text();
        if (text.trim()) {
          payload = JSON.parse(text);
        }
      } catch {
        return NextResponse.json(
          { error: "Bad Request: Invalid JSON payload." },
          { status: 400 }
        );
      }
    }

    // 1. Validate workflow existence, active webhook trigger, and secret token
    const validation = await validateWebhookTrigger(workflowId, providedSecret);
    if (!validation.valid || !validation.workflow) {
      return NextResponse.json(
        { error: validation.error || "Webhook validation failed." },
        { status: validation.statusCode || 400 }
      );
    }

    // 2. Delegate to existing execution engine
    const executionResult = await executeWebhookTrigger(
      validation.workflow,
      payload
    );

    return NextResponse.json(executionResult, { status: 200 });
  } catch (err) {
    if (err instanceof ActionExecutionError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
        },
        { status: err.statusCode }
      );
    }

    const error = err as Error;
    console.error("[Webhook Endpoint] Uncaught error:", error.message);
    return NextResponse.json(
      {
        error: error.message || "Internal server error processing webhook.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
