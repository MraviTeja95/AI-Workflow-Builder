import { NextResponse } from "next/server";
import {
  executeGraphQL,
  WORKFLOW_QUERIES,
  DEFAULT_ORGANIZATION_ID,
  DEFAULT_USER_ID,
} from "@/lib/hasura";
import type { Node, Edge } from "@xyflow/react";
import type { WorkflowNodeData } from "@/types/workflow";

interface SaveWorkflowRequestBody {
  id?: string | null;
  name: string;
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
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
    const body: SaveWorkflowRequestBody = await request.json();
    const { id, name, nodes = [], edges = [] } = body;

    // 1. Validate workflow name
    const trimmedName = name?.trim();
    if (!trimmedName) {
      return NextResponse.json(
        { error: "Workflow name cannot be empty." },
        { status: 400 }
      );
    }

    let workflowId = id;
    let workflowRecord: Record<string, unknown>;

    // 2. Create or Update Workflow Record
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
          org_id: DEFAULT_ORGANIZATION_ID,
          created_by: DEFAULT_USER_ID,
          updated_at: new Date().toISOString(),
        },
      });

      workflowRecord = createRes.insert_workflows_one;
      workflowId = workflowRecord.id as string;
    }

    // 3. Prepare Step Rows (filter out trigger nodes as they persist to workflow_triggers)
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

    // 4. Synchronize Workflow Steps
    await executeGraphQL(WORKFLOW_QUERIES.SYNC_WORKFLOW_STEPS, {
      workflowId,
      steps: stepRows,
    });

    // 5. Synchronize Workflow Triggers
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
