import { NextResponse } from "next/server";
import {
  handleTriggerWorkflowRun,
  ActionExecutionError,
} from "@/lib/workflowExecution";

interface HasuraActionRequestBody {
  action?: { name: string };
  input?: { workflow_id: string; trigger_type?: string };
  session_variables?: Record<string, string>;
}

export async function POST(request: Request) {
  try {
    const body: HasuraActionRequestBody = await request.json();

    // Extract user ID strictly from Hasura session_variables (never client body)
    const userId =
      body.session_variables?.["x-hasura-user-id"] ||
      request.headers.get("x-hasura-user-id");

    const workflowId = body.input?.workflow_id;
    const triggerType = body.input?.trigger_type || "manual";

    if (!userId) {
      return NextResponse.json(
        {
          message: "Unauthorized: Missing authenticated session context.",
          extensions: { code: "UNAUTHORIZED" },
        },
        { status: 401 }
      );
    }

    if (!workflowId) {
      return NextResponse.json(
        {
          message: "Bad Request: workflow_id is required.",
          extensions: { code: "BAD_REQUEST" },
        },
        { status: 400 }
      );
    }

    const result = await handleTriggerWorkflowRun({
      workflow_id: workflowId,
      userId,
      triggerType,
    });

    return NextResponse.json(result);
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
    console.error("Error triggering workflow run:", error);
    return NextResponse.json(
      {
        message: error.message || "Failed to trigger workflow run.",
        extensions: { code: "INTERNAL_ERROR" },
      },
      { status: 500 }
    );
  }
}
