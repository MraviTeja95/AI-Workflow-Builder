import { NextResponse } from "next/server";
import { executeGraphQL, WORKFLOW_QUERIES } from "@/lib/hasura";
import {
  extractUserId,
  getUserMembership,
  validatePrivilegedOperations,
  getWorkflowOrg,
} from "@/lib/auth";
import type { Node, Edge } from "@xyflow/react";
import type { WorkflowNodeData } from "@/types/workflow";

interface SaveWorkflowRequestBody {
  id?: string | null;
  name: string;
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  session_variables?: Record<string, string>;
  userId?: string;
}

function mapNodeTypeToBackend(uiType: string): string {
  switch (uiType) {
    case "ai_agent":
      return "llm_call";
    case "http_request":
      return "http_request";
    case "database":
      return "db_write";
    case "condition":
      return "conditional_branch";
    case "notify":
      return "notify";
    case "approval_gate":
      return "approval_gate";
    default:
      return uiType;
  }
}

export async function POST(request: Request) {
  try {
    const body: SaveWorkflowRequestBody = await request.json().catch(() => ({}));
    const { id, name, nodes = [], edges = [] } = body;

    // 1. Authenticate caller server-side
    const userId = extractUserId(request, body as unknown as Record<string, unknown>);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized: Missing authenticated session context." },
        { status: 401 }
      );
    }

    // 2. Resolve user's organization membership and role directly from database
    const membership = await getUserMembership(userId);
    if (!membership) {
      return NextResponse.json(
        { error: "Access denied: You do not belong to any organization." },
        { status: 403 }
      );
    }

    // Layer 1 RBAC: Viewer cannot create or modify workflows
    if (membership.role === "viewer") {
      return NextResponse.json(
        { error: "Access denied: Viewers are not permitted to create or modify workflows." },
        { status: 403 }
      );
    }

    // 3. Validate workflow name
    const trimmedName = name?.trim();
    if (!trimmedName) {
      return NextResponse.json(
        { error: "Workflow name cannot be empty." },
        { status: 400 }
      );
    }

    let workflowId = id;
    let workflowRecord: Record<string, unknown>;

    // 4. Verify existing workflow ownership for updates (Layer 1 Isolation)
    if (workflowId) {
      const existingWf = await getWorkflowOrg(workflowId);
      if (!existingWf) {
        return NextResponse.json(
          { error: `Workflow with ID "${workflowId}" was not found.` },
          { status: 404 }
        );
      }

      if (existingWf.org_id !== membership.orgId) {
        return NextResponse.json(
          { error: "Access denied: You do not have permission to modify workflows in another organization." },
          { status: 403 }
        );
      }
    }

    // 5. Prepare Step Rows
    const actionNodes = nodes.filter(
      (node) => node.data.nodeType !== "trigger"
    );

    const stepRows = actionNodes.map((node, index) => {
      const outgoingEdges = edges.filter((edge) => edge.source === node.id);
      const connections = outgoingEdges.map((edge) => ({
        target_node_id: edge.target,
        source_handle: edge.sourceHandle || "source",
        target_handle: edge.targetHandle || "target",
      }));

      const stepConfig = {
        client_node_id: node.id,
        ui_position: {
          x: Math.round(node.position.x),
          y: Math.round(node.position.y),
        },
        node_config: node.data.config || {},
        connections,
      };

      const backendType = mapNodeTypeToBackend(node.data.nodeType || "http_request");

      return {
        workflow_id: workflowId,
        name: node.data.label || "Step",
        type: backendType,
        position: index,
        config: stepConfig,
      };
    });

    // 6. Prepare Trigger Rows
    const triggerNodes = nodes.filter(
      (node) => node.data.nodeType === "trigger"
    );

    const triggerRows = triggerNodes.map((triggerNode) => {
      const rawType = (
        triggerNode.data.config?.trigger?.triggerType || "manual"
      ).toLowerCase();
      const triggerType =
        rawType === "schedule" ? "scheduled" : rawType;

      const triggerOutgoingEdges = edges.filter(
        (edge) => edge.source === triggerNode.id
      );
      const triggerConnections = triggerOutgoingEdges.map((edge) => ({
        target_node_id: edge.target,
        source_handle: edge.sourceHandle || "source",
        target_handle: edge.targetHandle || "target",
      }));

      return {
        workflow_id: workflowId,
        type: triggerType,
        enabled: true,
        config: {
          client_node_id: triggerNode.id,
          ui_position: {
            x: Math.round(triggerNode.position.x),
            y: Math.round(triggerNode.position.y),
          },
          node_config: triggerNode.data.config || {},
          connections: triggerConnections,
        },
      };
    });

    // 7. Layer 2 Security: Verify Privileged Operations (db_write, notify, webhook trigger)
    const privCheck = validatePrivilegedOperations(stepRows, triggerRows, membership.role);
    if (!privCheck.allowed) {
      return NextResponse.json(
        { error: privCheck.reason },
        { status: 403 }
      );
    }

    // 8. Create or Update Workflow Record strictly under caller's organization
    if (workflowId) {
      const updateRes = await executeGraphQL<{
        update_workflows_by_pk: Record<string, unknown> | null;
      }>(WORKFLOW_QUERIES.UPDATE_WORKFLOW, {
        id: workflowId,
        name: trimmedName,
        updated_at: new Date().toISOString(),
      });

      if (!updateRes.update_workflows_by_pk) {
        return NextResponse.json(
          { error: `Workflow with ID ${workflowId} was not found to update.` },
          { status: 404 }
        );
      }

      workflowRecord = updateRes.update_workflows_by_pk;
    } else {
      const createRes = await executeGraphQL<{
        insert_workflows_one: Record<string, unknown>;
      }>(WORKFLOW_QUERIES.CREATE_WORKFLOW, {
        object: {
          name: trimmedName,
          org_id: membership.orgId,
          created_by: userId,
          updated_at: new Date().toISOString(),
        },
      });

      workflowRecord = createRes.insert_workflows_one;
      workflowId = workflowRecord.id as string;
    }

    // Attach newly generated workflowId to step and trigger rows
    stepRows.forEach((s) => {
      s.workflow_id = workflowId;
    });
    triggerRows.forEach((t) => {
      t.workflow_id = workflowId;
    });

    // 9. Synchronize Workflow Steps
    await executeGraphQL(WORKFLOW_QUERIES.SYNC_WORKFLOW_STEPS, {
      workflowId,
      steps: stepRows,
    });

    // 10. Synchronize Workflow Triggers
    await executeGraphQL(WORKFLOW_QUERIES.SYNC_WORKFLOW_TRIGGERS, {
      workflowId,
      triggers: triggerRows,
    });

    return NextResponse.json({
      success: true,
      workflow: workflowRecord,
      message: "Workflow saved successfully.",
    });
  } catch (error) {
    const err = error as Error;
    console.error("Error saving workflow:", err);
    return NextResponse.json(
      { error: err.message || "Failed to save workflow." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const userId = extractUserId(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized: Missing authenticated session context." },
        { status: 401 }
      );
    }

    const membership = await getUserMembership(userId);
    if (!membership) {
      return NextResponse.json(
        { error: "Access denied: You do not belong to any organization." },
        { status: 403 }
      );
    }

    const res = await executeGraphQL<{
      workflows: Array<Record<string, unknown>>;
    }>(
      `
        query GetOrgWorkflows($orgId: uuid!) {
          workflows(where: { org_id: { _eq: $orgId } }, order_by: { updated_at: desc }) {
            id
            name
            description
            org_id
            created_by
            created_at
            updated_at
          }
        }
      `,
      { orgId: membership.orgId }
    );

    return NextResponse.json({
      workflows: res.workflows || [],
    });
  } catch (error) {
    const err = error as Error;
    console.error("Error listing workflows:", err);
    return NextResponse.json(
      { error: err.message || "Failed to list workflows." },
      { status: 500 }
    );
  }
}
