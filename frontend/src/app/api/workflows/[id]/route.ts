import { NextResponse } from "next/server";
import { executeGraphQL, WORKFLOW_QUERIES } from "@/lib/hasura";
import { extractUserId, getUserMembership } from "@/lib/auth";
import {
  type WorkflowNodeData,
  type NodeType,
  DEFAULT_NODE_CONFIGS,
} from "@/types/workflow";
import type { Node, Edge } from "@xyflow/react";

interface DatabaseStepConfig {
  client_node_id?: string;
  ui_position?: { x: number; y: number };
  node_config?: WorkflowNodeData["config"];
  connections?: Array<{
    target_node_id: string;
    source_handle?: string;
    target_handle?: string;
  }>;
}

interface DatabaseStep {
  id: string;
  name: string;
  type: string;
  position: number;
  config: DatabaseStepConfig;
}

interface DatabaseTrigger {
  id: string;
  type: string;
  enabled: boolean;
  config: DatabaseStepConfig;
}

interface DatabaseWorkflow {
  id: string;
  name: string;
  description?: string | null;
  org_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  workflow_steps: DatabaseStep[];
  workflow_triggers: DatabaseTrigger[];
}

function mapBackendToNodeType(backendType: string): NodeType {
  switch (backendType) {
    case "llm_call":
      return "ai_agent";
    case "http_request":
      return "http_request";
    case "db_write":
      return "database";
    case "conditional_branch":
      return "condition";
    case "notify":
      return "notify";
    case "approval_gate":
      return "approval_gate";
    default:
      return (backendType as NodeType) || "http_request";
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Workflow ID is required." },
        { status: 400 }
      );
    }

    // 1. Authenticate caller server-side
    const userId = extractUserId(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized: Missing authenticated session context." },
        { status: 401 }
      );
    }

    // 2. Resolve caller's organization from database
    const membership = await getUserMembership(userId);
    if (!membership) {
      return NextResponse.json(
        { error: "Access denied: You do not belong to any organization." },
        { status: 403 }
      );
    }

    // 3. Fetch workflow from database
    const res = await executeGraphQL<{
      workflows_by_pk: DatabaseWorkflow | null;
    }>(WORKFLOW_QUERIES.GET_WORKFLOW_BY_ID, { id });

    const workflow = res.workflows_by_pk;

    if (!workflow) {
      return NextResponse.json(
        { error: `Workflow with ID "${id}" was not found.` },
        { status: 404 }
      );
    }

    // 4. Layer 1 Tenant Isolation Check: Cross-Org rejection
    if (workflow.org_id !== membership.orgId) {
      return NextResponse.json(
        { error: "Access denied: You do not have permission to view workflows in another organization." },
        { status: 403 }
      );
    }

    const nodes: Node<WorkflowNodeData>[] = [];
    const edges: Edge[] = [];

    // Reconstruct Trigger Nodes from workflow_triggers
    workflow.workflow_triggers.forEach((trigger, idx) => {
      const triggerConfig = trigger.config || {};
      const clientNodeId = triggerConfig.client_node_id || `trigger-${idx + 1}`;
      const uiPos = triggerConfig.ui_position || { x: 100, y: 180 };
      const rawType = trigger.type || "manual";
      const triggerTypeCapitalized =
        rawType.toLowerCase() === "scheduled"
          ? "Schedule"
          : rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase();

      // Sanitize secret for non-owners
      const rawNodeConfig = (triggerConfig.node_config || {}) as {
        trigger?: { webhookSecret?: string; triggerType?: string };
        [key: string]: unknown;
      };
      const safeNodeConfig = JSON.parse(JSON.stringify(rawNodeConfig));
      if (membership.role.toLowerCase() !== "owner" && safeNodeConfig.trigger?.webhookSecret) {
        safeNodeConfig.trigger.webhookSecret = "••••••••";
      }

      nodes.push({
        id: clientNodeId,
        type: "workflowNode",
        position: uiPos,
        data: {
          label: "Trigger",
          icon: "⚡",
          nodeType: "trigger",
          userRole: membership.role,
          config: safeNodeConfig.trigger
            ? safeNodeConfig
            : {
                trigger: {
                  triggerType: triggerTypeCapitalized as
                    | "Manual"
                    | "Webhook"
                    | "Schedule",
                },
              },
        },
      });

      // Restore Trigger outgoing connections
      (triggerConfig.connections || []).forEach((conn, connIdx) => {
        edges.push({
          id: `e-${clientNodeId}-${conn.target_node_id}-${connIdx}`,
          source: clientNodeId,
          target: conn.target_node_id,
          sourceHandle: conn.source_handle || "source",
          targetHandle: conn.target_handle || "target",
          animated: true,
          style: { stroke: "#3b82f6", strokeWidth: 2 },
        });
      });
    });

    // Reconstruct Action Nodes from workflow_steps
    workflow.workflow_steps.forEach((step, idx) => {
      const stepConfig = step.config || {};
      const clientNodeId = stepConfig.client_node_id || step.id;
      const uiPos = stepConfig.ui_position || {
        x: 380 + (idx % 3) * 280,
        y: 180 + Math.floor(idx / 3) * 150,
      };
      const nodeType = mapBackendToNodeType(step.type);
      const template =
        DEFAULT_NODE_CONFIGS[nodeType] || DEFAULT_NODE_CONFIGS.http_request;

      nodes.push({
        id: clientNodeId,
        type: "workflowNode",
        position: uiPos,
        data: {
          label: step.name || template.label,
          icon: template.icon,
          nodeType: nodeType,
          config: stepConfig.node_config || template.config,
          stepId: step.id,
        },
      });

      // Restore Step outgoing connections
      (stepConfig.connections || []).forEach((conn, connIdx) => {
        edges.push({
          id: `e-${clientNodeId}-${conn.target_node_id}-${connIdx}`,
          source: clientNodeId,
          target: conn.target_node_id,
          sourceHandle: conn.source_handle || "source",
          targetHandle: conn.target_handle || "target",
          animated: true,
          style: { stroke: "#3b82f6", strokeWidth: 2 },
        });
      });
    });

    return NextResponse.json({
      workflow: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        org_id: workflow.org_id,
        created_by: workflow.created_by,
        created_at: workflow.created_at,
        updated_at: workflow.updated_at,
      },
      nodes,
      edges,
    });
  } catch (error) {
    const err = error as Error;
    console.error("Error loading workflow:", err);
    return NextResponse.json(
      { error: err.message || "Failed to retrieve workflow." },
      { status: 500 }
    );
  }
}
