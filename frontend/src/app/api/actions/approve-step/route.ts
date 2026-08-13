import { NextResponse } from "next/server";
import {
  handleApproveStep,
  ActionExecutionError,
} from "@/lib/workflowExecution";
import { extractUserId } from "@/lib/auth";

interface HasuraActionRequestBody {
  action?: { name: string };
  input?: { workflow_run_id?: string; workflowRunId?: string; step_id?: string; stepId?: string };
  session_variables?: Record<string, string>;
  workflow_run_id?: string;
  workflowRunId?: string;
  step_id?: string;
  stepId?: string;
  userId?: string;
}

export async function POST(request: Request) {
  try {
    const body: HasuraActionRequestBody = await request.json().catch(() => ({}));

    // Extract user ID strictly from Hasura session_variables, Bearer JWT, or authenticated headers
    const userId = extractUserId(request, body as Record<string, unknown>);

    const workflowRunId =
      body.input?.workflow_run_id ||
      body.input?.workflowRunId ||
      body.workflow_run_id ||
      body.workflowRunId;

    const stepId =
      body.input?.step_id ||
      body.input?.stepId ||
      body.step_id ||
      body.stepId;

    if (!userId) {
      return NextResponse.json(
        {
          message: "Unauthorized: Missing authenticated session context.",
          extensions: { code: "UNAUTHORIZED" },
        },
        { status: 401 }
      );
    }

    if (!workflowRunId) {
      return NextResponse.json(
        {
          message: "Bad Request: workflow_run_id is required.",
          extensions: { code: "BAD_REQUEST" },
        },
        { status: 400 }
      );
    }

    const result = await handleApproveStep({
      workflow_run_id: workflowRunId,
      step_id: stepId,
      userId,
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
    console.error("Error approving workflow step:", error);
    return NextResponse.json(
      {
        message: error.message || "Failed to approve workflow step.",
        extensions: { code: "INTERNAL_ERROR" },
      },
      { status: 500 }
    );
  }
}
