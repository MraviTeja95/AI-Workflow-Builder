"use client";

import {
  ReactFlow,
  Background,
  Controls,
  ControlButton,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { WorkflowNode } from "@/components/WorkflowNode";
import { NodePropertiesPanel } from "@/components/NodePropertiesPanel";
import { ExecutionTimeline } from "@/components/ExecutionTimeline";
import { LoginScreen } from "@/components/LoginScreen";
import { WorkflowGuide } from "@/components/WorkflowGuide";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/context/AuthContext";
import { useMounted } from "@/hooks/useMounted";
import { useWorkflowStepRunsSubscription } from "@/hooks/useWorkflowStepRunsSubscription";
import {
  type WorkflowNodeData,
  type WorkflowNodeConfig,
  type NodeType,
  type StepRunStatus,
  DEFAULT_NODE_CONFIGS,
} from "@/types/workflow";

const initialNodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-1",
    type: "workflowNode",
    position: { x: 80, y: 180 },
    data: {
      label: "Trigger",
      icon: "⚡",
      nodeType: "trigger",
      config: JSON.parse(JSON.stringify(DEFAULT_NODE_CONFIGS.trigger.config)),
    },
  },
  {
    id: "ai-agent-2",
    type: "workflowNode",
    position: { x: 360, y: 180 },
    data: {
      label: "AI Agent",
      icon: "🤖",
      nodeType: "ai_agent",
      config: {
        aiAgent: {
          model: "Gemini",
          systemPrompt:
            "You are an intelligent workflow automation agent. Analyze incoming data and generate a clear evaluation decision.",
          userPrompt:
            "Analyze customer order ORD-9876 with amount $1,499. Respond with 'ORDER STATUS: APPROVED' followed by a short summary of the processing decision.",
          temperature: 0.7,
          maxTokens: 2048,
        },
      },
    },
  },
  {
    id: "condition-3",
    type: "workflowNode",
    position: { x: 640, y: 180 },
    data: {
      label: "Condition",
      icon: "◆",
      nodeType: "condition",
      config: {
        condition: {
          field: "content",
          operator: "contains",
          value: "APPROVED",
          expression: 'lastOutput.content && lastOutput.content.includes("APPROVED")',
        },
      },
    },
  },
  {
    id: "notify-4",
    type: "workflowNode",
    position: { x: 920, y: 180 },
    data: {
      label: "Notify",
      icon: "📢",
      nodeType: "notify",
      config: {
        notify: {
          channel: "Email",
          recipient: "delivered@resend.dev",
          message:
            "Workflow notification: Order processing completed. AI evaluation: {{steps.AI Agent.content}}",
        },
      },
    },
  },
];

const EDGE_STYLE = { stroke: "rgba(59,130,246,0.6)", strokeWidth: 1.5 };

const initialEdges: Edge[] = [
  {
    id: "e-trigger-ai",
    source: "trigger-1",
    target: "ai-agent-2",
    sourceHandle: "source",
    targetHandle: "target",
    animated: true,
    style: EDGE_STYLE,
  },
  {
    id: "e-ai-cond",
    source: "ai-agent-2",
    target: "condition-3",
    sourceHandle: "source",
    targetHandle: "target",
    animated: true,
    style: EDGE_STYLE,
  },
  {
    id: "e-cond-notify",
    source: "condition-3",
    target: "notify-4",
    sourceHandle: "source",
    targetHandle: "target",
    animated: true,
    style: EDGE_STYLE,
  },
];

const nodeTypes = {
  workflowNode: WorkflowNode,
};

export default function Home() {
  const {
    user,
    organization,
    role,
    isLoading,
    isAuthenticated,
    isDemo,
    accessToken,
    logout,
  } = useAuth();
  const isMounted = useMounted();

  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState(() => (isDemo ? "AI Workflow Demo" : ""));
  const [nodes, setNodes, onNodesChange] =
    useNodesState<Node<WorkflowNodeData>>(initialNodes);
  const [edges, setEdges, onEdgesChange] =
    useEdgesState<Edge>(initialEdges);
  const [nodeCounter, setNodeCounter] = useState(4);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isCanvasLocked, setIsCanvasLocked] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(false);
  const [isRunningWorkflow, setIsRunningWorkflow] = useState(false);
  const isRunningWorkflowRef = useRef(false);

  // Overall Workflow Execution Observability State
  const [workflowRunStatus, setWorkflowRunStatus] = useState<
    "idle" | "running" | "paused" | "completed" | "failed"
  >("idle");
  const [workflowSummary, setWorkflowSummary] = useState<{
    pausedStepName?: string;
    pausedStepId?: string;
    finalOutput?: string;
    completedCount?: number;
    totalCount?: number;
    durationSec?: number;
  } | null>(null);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);

  // Live Workflow Run Subscription state
  const [activeWorkflowRunId, setActiveWorkflowRunId] = useState<string | null>(
    null
  );

  const {
    stepRuns: liveStepRuns,
    error: subError,
  } = useWorkflowStepRunsSubscription({
    workflowRunId: activeWorkflowRunId,
    accessToken,
  });

  // Read ?id= from URL on mount and load workflow (for normal users, or reset to clean demo on demo refresh)
  useEffect(() => {
    let ignore = false;

    async function resetDemoSession() {
      const params = new URLSearchParams(window.location.search);
      if (params.has("id")) {
        window.history.replaceState(null, "", window.location.pathname);
      }
      if (!ignore) {
        setWorkflowId(null);
        setWorkflowName("AI Workflow Demo");
        setNodes(JSON.parse(JSON.stringify(initialNodes)));
        setEdges(JSON.parse(JSON.stringify(initialEdges)));
        setNodeCounter(4);
        setSelectedNodeId(null);
        setStatusMessage(null);
        setSaveStatus("idle");
        setIsBannerDismissed(true);
        setActiveWorkflowRunId(null);
        setWorkflowRunStatus("idle");
      }
    }

    async function fetchWorkflow(id: string) {
      if (!accessToken) return;

      setIsLoadingWorkflow(true);
      setStatusMessage("Loading workflow...");
      setActiveWorkflowRunId(null);

      try {
        const response = await fetch(`/api/workflows/${id}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load workflow.");
        }

        if (!ignore) {
          setWorkflowId(data.workflow.id);
          setWorkflowName(data.workflow.name || "");
          if (Array.isArray(data.nodes) && data.nodes.length > 0) {
            setNodes(data.nodes);
          }
          if (Array.isArray(data.edges)) {
            setEdges(data.edges);
          }
          setNodeCounter(data.nodes?.length || 3);
          setSelectedNodeId(null);
          setStatusMessage(null);
        }
      } catch (err) {
        const error = err as Error;
        console.error("Load workflow error:", error);
        if (!ignore) {
          setStatusMessage(`Load error: ${error.message}`);
          setSaveStatus("error");
        }
      } finally {
        if (!ignore) {
          setIsLoadingWorkflow(false);
        }
      }
    }

    if (typeof window !== "undefined" && !isLoading && isAuthenticated && accessToken) {
      if (isDemo) {
        resetDemoSession();
        return;
      }

      // Normal non-demo user workflow loading
      const params = new URLSearchParams(window.location.search);
      const idParam = params.get("id");
      if (idParam) {
        fetchWorkflow(idParam);
      }
    }

    return () => {
      ignore = true;
    };
  }, [isLoading, isAuthenticated, isDemo, accessToken, setEdges, setNodes]);

  // Connect handles
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) =>
        addEdge(
          {
            ...connection,
            sourceHandle: connection.sourceHandle || "source",
            targetHandle: connection.targetHandle || "target",
            animated: true,
            style: EDGE_STYLE,
          },
          currentEdges
        )
      );
    },
    [setEdges]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<WorkflowNodeData>) => {
      setSelectedNodeId(node.id);
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleUpdateNodeName = useCallback(
    (id: string, name: string) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              data: {
                ...node.data,
                label: name,
              },
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  const handleUpdateNodeConfig = useCallback(
    <K extends keyof WorkflowNodeConfig>(
      id: string,
      configKey: K,
      configValue: Partial<NonNullable<WorkflowNodeConfig[K]>>
    ) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id === id) {
            const currentConfig = node.data.config || {};
            const currentSection = (currentConfig[configKey] ||
              {}) as NonNullable<WorkflowNodeConfig[K]>;
            return {
              ...node,
              data: {
                ...node.data,
                config: {
                  ...currentConfig,
                  [configKey]: {
                    ...currentSection,
                    ...configValue,
                  },
                },
              },
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  const addWorkflowNode = useCallback(
    (nodeType: NodeType) => {
      const template = DEFAULT_NODE_CONFIGS[nodeType];
      const newCounter = nodeCounter + 1;
      const newNodeId = `${nodeType.replaceAll("_", "-")}-${newCounter}`;

      const newNode: Node<WorkflowNodeData> = {
        id: newNodeId,
        type: "workflowNode",
        position: {
          x: 180 + (nodes.length % 3) * 220,
          y: 120 + Math.floor(nodes.length / 3) * 140,
        },
        data: {
          label: template.label,
          icon: template.icon,
          nodeType,
          config: JSON.parse(JSON.stringify(template.config)),
        },
      };

      setNodes((currentNodes) => [...currentNodes, newNode]);
      setNodeCounter(newCounter);
      setSelectedNodeId(newNodeId);
    },
    [nodeCounter, nodes.length, setNodes]
  );

  // Delete selected node and its connected edges (respects locked state)
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((currentNodes) => {
        const target = currentNodes.find((n) => n.id === nodeId);
        if (target?.data?.locked) return currentNodes; // locked — ignore
        return currentNodes.filter((n) => n.id !== nodeId);
      });
      setEdges((currentEdges) =>
        currentEdges.filter((e) => e.source !== nodeId && e.target !== nodeId)
      );
      setSelectedNodeId((prev) => (prev === nodeId ? null : prev));
    },
    [setNodes, setEdges]
  );

  // Toggle locked state on an individual node
  const handleLockNode = useCallback(
    (nodeId: string) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, locked: !node.data.locked } }
            : node
        )
      );
    },
    [setNodes]
  );

  // Save workflow handler
  const handleSaveWorkflow = async () => {
    const effectiveName = workflowName.trim() || (isDemo ? "AI Workflow Demo" : "");
    if (!effectiveName) {
      setSaveStatus("error");
      setStatusMessage("Please enter a workflow name before saving.");
      return;
    }

    if (!accessToken) {
      setSaveStatus("error");
      setStatusMessage("Authentication token missing. Please sign in again.");
      return;
    }

    setSaveStatus("saving");
    setStatusMessage(null);

    try {
      const response = await fetch("/api/workflows", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          id: workflowId || null,
          name: effectiveName,
          nodes,
          edges,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || `Failed to save workflow (${response.status}).`);
      }

      setWorkflowId(data.workflow.id);
      setSaveStatus("saved");
      setStatusMessage("Workflow saved successfully!");

      if (typeof window !== "undefined") {
        const newUrl = `${window.location.pathname}?id=${data.workflow.id}`;
        window.history.replaceState(null, "", newUrl);
      }

      setTimeout(() => {
        setSaveStatus("idle");
        setStatusMessage(null);
      }, 3500);
    } catch (err) {
      const error = err as Error;
      console.error("Save workflow error:", error);
      setSaveStatus("error");
      setStatusMessage(error.message || "Failed to save workflow.");
    }
  };

  // Approve step handler for approval_gate nodes
  const handleApproveStep = useCallback(
    async (stepId?: string) => {
      if (!activeWorkflowRunId) return;

      setIsBannerDismissed(false);
      setIsRunningWorkflow(true);
      setWorkflowRunStatus("running");
      setStatusMessage("Approving step and resuming workflow execution...");

      try {
        const approveRes = await fetch("/api/actions/approve-step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: { name: "approveStep" },
            input: {
              workflow_run_id: activeWorkflowRunId,
              step_id: stepId,
            },
            session_variables: {
              "x-hasura-user-id": user?.id,
              "x-hasura-role": role || "owner",
            },
          }),
        });

        const data = await approveRes.json().catch(() => ({}));
        if (!approveRes.ok || data.status === "failed") {
          setSaveStatus("error");
          setWorkflowRunStatus("failed");
          setStatusMessage(
            data.message || data.error || "Failed to approve workflow step."
          );
          return;
        }

        if (data.status === "paused") {
          setWorkflowRunStatus("paused");
          setWorkflowSummary((prev) => ({
            ...prev,
            pausedStepName: data.output?.pausedStepName || "Approval Gate",
            pausedStepId: data.output?.pausedStepId,
          }));
          setStatusMessage("Step approved! Workflow paused at next approval gate.");
        } else {
          setSaveStatus("saved");
          setWorkflowRunStatus("completed");
          setWorkflowSummary({
            completedCount: nodes.length,
            totalCount: nodes.length,
            finalOutput: typeof data.output === "string" ? data.output : JSON.stringify(data.output),
          });
          setStatusMessage("Step approved! Workflow resumed and completed successfully!");
        }
      } catch (err) {
        const error = err as Error;
        console.error("Approve step error:", error);
        setSaveStatus("error");
        setWorkflowRunStatus("failed");
        setStatusMessage(`Approval error: ${error.message}`);
      } finally {
        setIsRunningWorkflow(false);
      }
    },
    [activeWorkflowRunId, user, role, nodes.length]
  );

  // Stable ref for handleApproveStep to avoid triggering re-renders in the live step_runs effect
  const approveStepRef = useRef(handleApproveStep);
  useEffect(() => {
    approveStepRef.current = handleApproveStep;
  });

  // Map live step_runs from WebSocket subscription to canvas workflow nodes
  useEffect(() => {
    if (!liveStepRuns || liveStepRuns.length === 0) return;

    setNodes((currentNodes) => {
      let hasChanges = false;

      const newNodes = currentNodes.map((node) => {
        if (node.data.nodeType === "trigger") {
          // When live step runs are active/received, the Trigger has fired and completed
          const triggerStatus: StepRunStatus = "completed";
          const triggerRunId = `trigger-run-${activeWorkflowRunId || "active"}`;
          const isTriggerEqual =
            node.data.executionStatus === triggerStatus &&
            node.data.liveStepRun?.id === triggerRunId &&
            node.data.userRole === role;

          if (isTriggerEqual) return node;

          hasChanges = true;
          return {
            ...node,
            data: {
              ...node.data,
              executionStatus: triggerStatus,
              executionError: null,
              liveStepRun: {
                id: triggerRunId,
                workflow_run_id: activeWorkflowRunId || "",
                workflow_step_id: node.id,
                status: triggerStatus,
                input: { triggerType: node.data.config?.trigger?.triggerType || "Manual" },
                output: { message: "Trigger executed successfully", channel: node.data.config?.trigger?.triggerType || "Manual" },
                attempt_count: 1,
                started_at: new Date().toISOString(),
                finished_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
              },
              userRole: role,
              onApprove: (...args: Parameters<typeof handleApproveStep>) => approveStepRef.current(...args),
            },
          };
        }

        const matchingStepRun = liveStepRuns.find((sr) => {
          const clientNodeId = (sr.workflow_step?.config as Record<string, unknown> | undefined)?.client_node_id;
          if (clientNodeId && clientNodeId === node.id) return true;
          if (sr.workflow_step_id === node.data.stepId || sr.workflow_step_id === node.id) return true;
          if (sr.workflow_step?.name && sr.workflow_step.name === node.data.label) return true;
          if (node.data.nodeType !== "trigger" && sr.workflow_step_id && node.id.includes(sr.workflow_step_id)) return true;
          return false;
        });

        if (!matchingStepRun) {
          if (node.data.userRole !== role) {
            hasChanges = true;
            return {
              ...node,
              data: {
                ...node.data,
                userRole: role,
                onApprove: (...args: Parameters<typeof handleApproveStep>) => approveStepRef.current(...args),
              },
            };
          }
          return node;
        }

        const isStatusEqual =
          node.data.executionStatus === matchingStepRun.status &&
          node.data.executionError === matchingStepRun.error &&
          node.data.liveStepRun?.id === matchingStepRun.id &&
          node.data.userRole === role;

        if (isStatusEqual) {
          return node;
        }

        hasChanges = true;
        return {
          ...node,
          data: {
            ...node.data,
            executionStatus: matchingStepRun.status,
            executionError: matchingStepRun.error,
            liveStepRun: matchingStepRun,
            userRole: role,
            onApprove: (...args: Parameters<typeof handleApproveStep>) => approveStepRef.current(...args),
          },
        };
      });

      return hasChanges ? newNodes : currentNodes;
    });
  }, [liveStepRuns, activeWorkflowRunId, role, setNodes]);

  // Run workflow handler with Live Subscription integration
  const handleRunWorkflow = async () => {
    if (isRunningWorkflowRef.current || isRunningWorkflow) {
      console.warn("[Run Workflow] Execution already in progress. Ignoring duplicate click.");
      return;
    }
    isRunningWorkflowRef.current = true;
    setIsRunningWorkflow(true);

    let currentId = workflowId;
    const effectiveName = workflowName.trim() || (isDemo ? "AI Workflow Demo" : "");

    // Phase A: Auto-save workflow before run if it has not been saved yet
    if (!currentId) {
      if (!effectiveName) {
        setSaveStatus("error");
        setStatusMessage("Please name and save your workflow before running.");
        isRunningWorkflowRef.current = false;
        setIsRunningWorkflow(false);
        return;
      }

      setSaveStatus("saving");
      setStatusMessage("Saving workflow before execution...");

      if (!accessToken) {
        setSaveStatus("error");
        setStatusMessage("Authentication token missing. Please sign in again.");
        isRunningWorkflowRef.current = false;
        setIsRunningWorkflow(false);
        return;
      }

      try {
        const response = await fetch("/api/workflows", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            id: null,
            name: effectiveName,
            nodes,
            edges,
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const saveErrMsg = data?.error || `Failed to save workflow (HTTP ${response.status}).`;
          setSaveStatus("error");
          setStatusMessage(`Could not save workflow: ${saveErrMsg}`);
          isRunningWorkflowRef.current = false;
          setIsRunningWorkflow(false);
          return;
        }

        currentId = data.workflow.id;
        setWorkflowId(currentId);
        setSaveStatus("saved");

        if (typeof window !== "undefined") {
          const newUrl = `${window.location.pathname}?id=${currentId}`;
          window.history.replaceState(null, "", newUrl);
        }
      } catch (err) {
        const error = err as Error;
        console.error("Auto-save before run error:", error);
        setSaveStatus("error");
        const isFetch = error.message.toLowerCase().includes("fetch failed");
        setStatusMessage(`Could not save workflow: ${isFetch ? "Network connection to server failed." : error.message}`);
        isRunningWorkflowRef.current = false;
        setIsRunningWorkflow(false);
        return;
      }
    }

    // Phase B: Start execution
    setIsBannerDismissed(false);
    const newRunId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `run-${Date.now()}`;
    setActiveWorkflowRunId(newRunId);

    // Reset previous execution status indicators and mark Trigger as running
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          executionStatus: (node.data.nodeType === "trigger" ? "running" : undefined) as StepRunStatus | undefined,
          executionError: null,
          liveStepRun: node.data.nodeType === "trigger" ? {
            id: `trigger-run-${newRunId}`,
            workflow_run_id: newRunId,
            workflow_step_id: node.id,
            status: "running" as StepRunStatus,
            input: { triggerType: node.data.config?.trigger?.triggerType || "Manual" },
            output: undefined,
            attempt_count: 1,
            started_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          } : undefined,
          userRole: role,
          onApprove: (...args: Parameters<typeof handleApproveStep>) => approveStepRef.current(...args),
        },
      }))
    );

    setWorkflowRunStatus("running");
    setWorkflowSummary(null);
    setStatusMessage("Executing workflow steps in sequence...");

    try {
      const runRes = await fetch("/api/actions/trigger-workflow-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: { name: "triggerWorkflowRun" },
          input: {
            workflow_id: currentId,
            trigger_type: "manual",
            workflow_run_id: newRunId,
          },
          workflow_run_id: newRunId,
          session_variables: {
            "x-hasura-user-id": user?.id,
            "x-hasura-role": role || "owner",
          },
        }),
      });

      const data = await runRes.json().catch(() => ({}));

      // Fallback: connect subscription to returned run ID if different
      if (data.workflow_run_id && data.workflow_run_id !== newRunId) {
        setActiveWorkflowRunId(data.workflow_run_id);
      }

      if (!runRes.ok || data.status === "failed") {
        setWorkflowRunStatus("failed");
        const failureMsg = data.message || data.error?.message || data.error || `Workflow execution failed (HTTP ${runRes.status}).`;
        setStatusMessage(failureMsg);
        return;
      }

      if (data.status === "paused") {
        setWorkflowRunStatus("paused");
        setWorkflowSummary({
          pausedStepName: data.output?.pausedStepName || "Approval Gate",
          pausedStepId: data.output?.pausedStepId,
          completedCount: 2,
          totalCount: nodes.length,
        });
        setStatusMessage("Workflow paused at Approval Gate. Action required.");
        return;
      }

      setWorkflowRunStatus("completed");
      setWorkflowSummary({
        completedCount: nodes.length,
        totalCount: nodes.length,
        finalOutput: typeof data.output === "string" ? data.output : JSON.stringify(data.output),
      });
      // Ensure all unfailed nodes are marked completed on final completion
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            executionStatus: node.data.executionStatus === "failed" ? "failed" : (node.data.executionStatus || "completed"),
          },
        }))
      );
      setStatusMessage("Workflow run completed successfully!");
    } catch (err) {
      const error = err as Error;
      console.error("Run workflow error:", error);
      setWorkflowRunStatus("failed");
      const isFetch = error.message.toLowerCase().includes("fetch failed");
      setStatusMessage(isFetch ? "Network connection to workflow engine timed out." : `Execution error: ${error.message}`);
    } finally {
      isRunningWorkflowRef.current = false;
      setIsRunningWorkflow(false);
    }
  };

  const rawSelectedNode =
    nodes.find((node) => node.id === selectedNodeId) || null;

  // Direct live step run resolution for selected node to prevent rendering lag
  const selectedNodeStepRun = rawSelectedNode
    ? liveStepRuns?.find((sr) => {
        const clientNodeId = (sr.workflow_step?.config as Record<string, unknown> | undefined)?.client_node_id;
        if (clientNodeId && clientNodeId === rawSelectedNode.id) return true;
        if (sr.workflow_step_id === rawSelectedNode.data.stepId || sr.workflow_step_id === rawSelectedNode.id) return true;
        if (sr.workflow_step?.name && sr.workflow_step.name === rawSelectedNode.data.label) return true;
        if (rawSelectedNode.data.nodeType !== "trigger" && sr.workflow_step_id && rawSelectedNode.id.includes(sr.workflow_step_id)) return true;
        return false;
      })
    : null;

  const selectedNode = rawSelectedNode
    ? {
        ...rawSelectedNode,
        data: {
          ...rawSelectedNode.data,
          liveStepRun: selectedNodeStepRun || rawSelectedNode.data.liveStepRun,
          executionStatus: selectedNodeStepRun?.status || rawSelectedNode.data.executionStatus,
          executionError: selectedNodeStepRun?.error || rawSelectedNode.data.executionError,
          userRole: role,
        },
      }
    : null;

  // Derive live execution status and paused step info directly during render
  const pausedStepRun = liveStepRuns?.find((sr) => sr.status === "paused");
  const failedStepRun = liveStepRuns?.find((sr) => sr.status === "failed");
  const isAllCompleted =
    activeWorkflowRunId &&
    liveStepRuns.length > 0 &&
    liveStepRuns.every((sr) => sr.status === "completed");

  const effectiveWorkflowStatus: "idle" | "running" | "paused" | "completed" | "failed" =
    isRunningWorkflow
      ? "running"
      : pausedStepRun
      ? "paused"
      : failedStepRun
      ? "failed"
      : isAllCompleted
      ? "completed"
      : workflowRunStatus;

  const pausedNode = pausedStepRun
    ? nodes.find(
        (n) =>
          n.data.stepId === pausedStepRun.workflow_step_id ||
          n.id === pausedStepRun.workflow_step_id
      )
    : null;
  const pausedStepName =
    pausedNode?.data.label || workflowSummary?.pausedStepName || "Approval Gate";
  const pausedStepId =
    pausedStepRun?.workflow_step_id || workflowSummary?.pausedStepId;

  // Stable refs for toolbar callbacks so they don't trigger node re-renders
  const lockNodeRef = useRef(handleLockNode);
  const deleteNodeRef = useRef(handleDeleteNode);
  useEffect(() => { lockNodeRef.current = handleLockNode; });
  useEffect(() => { deleteNodeRef.current = handleDeleteNode; });

  // Inject toolbar callbacks + draggable flag into each node's data for render
  const nodesWithCallbacks = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        // Prevent drag when locked
        draggable: !node.data.locked,
        data: {
          ...node.data,
          onLockToggle: (nodeId: string) => lockNodeRef.current(nodeId),
          onDeleteNode: (nodeId: string) => deleteNodeRef.current(nodeId),
        },
      })),
    [nodes]
  );

  // Keyboard Delete/Backspace handler for selected nodes — respects locked state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Delete/Backspace when no input/textarea is focused
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      const isEditable = (e.target as HTMLElement)?.isContentEditable;
      if (isEditable) return;

      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId) {
        const targetNode = nodes.find((n) => n.id === selectedNodeId);
        if (targetNode?.data?.locked) return; // silently block deletion of locked nodes
        e.preventDefault();
        handleDeleteNode(selectedNodeId);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeId, nodes, handleDeleteNode]);

  // 1. Loading State (Deterministic on initial SSR and hydration)
  if (!isMounted || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-xs text-zinc-400">Authenticating session...</p>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated State -> Show Login Screen
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  // 3. Authenticated State -> Show Workflow Editor
  return (
    <main className="min-h-screen bg-[#090909] text-white flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] px-5 bg-[#090909]/95 backdrop-blur-sm">

        {/* Left: Brand logo + workflow name */}
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex items-center gap-2.5 shrink-0">
            <BrandLogo size={28} />
            <span className="text-[13px] font-semibold text-white/80 hidden sm:block">Workflow Builder</span>
          </div>

          <div className="h-4 w-px bg-white/[0.08] hidden sm:block shrink-0" />

          {/* Workflow name — editable */}
          <div className="flex items-center gap-2 min-w-0">
            <input
              value={workflowName}
              onChange={(e) => {
                setWorkflowName(e.target.value);
                if (saveStatus === "error") { setSaveStatus("idle"); setStatusMessage(null); }
              }}
              placeholder="Untitled workflow"
              className="bg-transparent text-[13px] font-medium text-white outline-none placeholder:text-white/25 border-b border-transparent focus:border-white/20 transition-colors min-w-0 max-w-[220px] truncate pb-0.5"
            />
          </div>
        </div>

        {/* Right: Status + Save + Run + User */}
        <div className="flex items-center gap-2.5 shrink-0">

          {/* Save status */}
          {statusMessage && !activeWorkflowRunId && (
            <span className={`hidden lg:block text-[11px] font-medium transition-all ${
              saveStatus === "error" ? "text-rose-400" : saveStatus === "saved" ? "text-emerald-400" : "text-zinc-500"
            }`}>
              {statusMessage}
            </span>
          )}

          {subError && (
            <span className="text-[11px] text-amber-400 hidden lg:block">⚡ {subError}</span>
          )}

          {/* Workflow Guide Button */}
          <button
            id="btn-guide"
            type="button"
            onClick={() => setIsGuideOpen(true)}
            title="Open Workflow Guide"
            className="rounded-lg border border-white/[0.09] bg-white/[0.03] hover:bg-white/[0.07] px-2.5 py-1.5 text-[12px] font-medium text-zinc-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span className="text-blue-400 font-bold">💡</span>
            <span>Guide</span>
          </button>

          {/* Run Workflow — primary CTA */}
          <button
            id="btn-run"
            onClick={handleRunWorkflow}
            disabled={isRunningWorkflow || saveStatus === "saving"}
            className="rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-4 py-1.5 text-[12px] font-semibold text-white shadow-md shadow-blue-600/20 disabled:opacity-40 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            {isRunningWorkflow ? (
              <>
                <svg className="h-3 w-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Running…
              </>
            ) : (
              <>
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
                Run
              </>
            )}
          </button>

          <div className="h-4 w-px bg-white/[0.08]" />

          {/* User + Org */}
          <div className="flex items-center gap-2">
            <div className="text-right hidden lg:block">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-[12px] font-medium text-white/75 truncate max-w-[160px]">
                  {user?.displayName || user?.email?.split("@")[0] || "User"}
                </span>
                {role && (
                  <span className="rounded-md bg-blue-500/10 border border-blue-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-400">
                    {role}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-white/25 text-right truncate max-w-[160px]">
                {organization?.name || "AI Workflow Builder"}
              </p>
            </div>

            <button
              onClick={logout}
              title="Sign out"
              className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-zinc-500 hover:bg-white/5 hover:text-white transition-all"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <aside className="w-56 shrink-0 border-r border-white/[0.06] bg-[#090909] overflow-y-auto flex flex-col">
          <div className="p-4 flex-1">

            {/* Nodes section */}
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Add Nodes
            </p>

            <div className="space-y-1">
              {([
                { type: "trigger",      icon: "⚡", label: "Trigger",       desc: "Start of pipeline" },
                { type: "ai_agent",     icon: "🤖", label: "AI Agent",       desc: "Gemini generation" },
                { type: "http_request", icon: "🌐", label: "HTTP Request",   desc: "Call external API" },
                { type: "database",     icon: "🗄️", label: "Database",       desc: "Read or write data" },
                { type: "condition",    icon: "◆",  label: "Condition",      desc: "Branch true/false" },
                { type: "notify",       icon: "📢", label: "Notify",         desc: "Email / Slack / hook" },
                { type: "approval_gate",icon: "🛡️", label: "Approval Gate",  desc: "Pause for approval" },
              ] as const).map(({ type, icon, label, desc }) => (
                <button
                  key={type}
                  onClick={() => addWorkflowNode(type)}
                  className="node-button group"
                  title={desc}
                >
                  <span className="text-base shrink-0 w-5 text-center leading-none">{icon}</span>
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium leading-none text-zinc-200 group-hover:text-white transition-colors">{label}</div>
                    <div className="text-[10px] text-zinc-600 mt-0.5 group-hover:text-zinc-500 transition-colors">{desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Canvas Lock hint */}
          <div className="border-t border-white/[0.06] p-4">
            <p className="text-[9px] text-zinc-700 leading-relaxed">
              Select a node to edit its properties. Use the canvas lock to freeze the viewport position.
            </p>
          </div>
        </aside>

        {/* ── Canvas & Timeline ────────────────────────────────────────── */}
        <section className="flex-1 relative flex flex-col min-w-0">

          {/* ── Execution banners ── */}
          {effectiveWorkflowStatus === "paused" && !isBannerDismissed && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-xl rounded-2xl border border-amber-500/35 bg-[#14110a]/95 backdrop-blur-xl px-4 py-3 shadow-2xl shadow-amber-500/10 animate-fade-in-up">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300 text-sm">
                    ⏸
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-amber-300">Approval Required</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Paused at <span className="text-white font-medium">&quot;{pausedStepName}&quot;</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(role === "owner" || role === "editor") ? (
                    <button
                      type="button"
                      onClick={() => handleApproveStep(pausedStepId)}
                      disabled={isRunningWorkflow}
                      className="shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 px-3.5 py-2 text-[11px] font-bold text-white shadow-sm transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isRunningWorkflow ? "Resuming…" : "Approve & Continue"}
                    </button>
                  ) : (
                    <span className="shrink-0 text-[10px] text-amber-400/60">Owner / Editor required</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsBannerDismissed(true)}
                    className="text-zinc-400 hover:text-white text-[11px] px-2.5 py-1 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {effectiveWorkflowStatus === "completed" && !isBannerDismissed && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-xl rounded-2xl border border-emerald-500/25 bg-[#0a120d]/95 backdrop-blur-xl px-4 py-3 shadow-xl shadow-emerald-500/8 animate-fade-in-up flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 text-sm font-bold">
                  ✓
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-emerald-400">Workflow Completed</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">All steps executed successfully</p>
                </div>
              </div>
              <button
                type="button"
                id="btn-dismiss-completed"
                onClick={() => setIsBannerDismissed(true)}
                className="text-zinc-400 hover:text-white text-[11px] px-2.5 py-1 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {effectiveWorkflowStatus === "failed" && !isBannerDismissed && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-xl rounded-2xl border border-rose-500/25 bg-[#120a0c]/95 backdrop-blur-xl px-4 py-3 shadow-xl shadow-rose-500/8 animate-fade-in-up flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400 text-sm font-bold">
                  ✕
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-rose-400">Execution Failed</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5 truncate max-w-[340px]">
                    {failedStepRun?.error || statusMessage || "A workflow step encountered an error."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="btn-dismiss-failed"
                onClick={() => setIsBannerDismissed(true)}
                className="text-zinc-400 hover:text-white text-[11px] px-2.5 py-1 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* ── ReactFlow Canvas ── */}
          <div className="flex-1 relative">
            <ReactFlow
              nodes={nodesWithCallbacks}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              fitView
              attributionPosition="bottom-left"
              // Canvas lock: only freezes pan & scroll-zoom; node selection and per-node locks remain independent
              panOnDrag={!isCanvasLocked}
              zoomOnScroll={!isCanvasLocked}
              panOnScroll={false}
              className="bg-[#090909]"
            >
              {/* Subtle dot grid */}
              <Background
                gap={28}
                size={1}
                color="rgba(255,255,255,0.06)"
              />

              {/* Controls — Canvas Lock seamlessly integrated as a unified ControlButton */}
              <Controls showInteractive={false} className="!bg-[#141414]/90 !border-white/[0.08] !rounded-xl !p-0.5">
                <ControlButton
                  onClick={() => setIsCanvasLocked((v) => !v)}
                  title={isCanvasLocked ? "Canvas locked — click to unlock viewport navigation" : "Lock canvas viewport position"}
                  aria-label={isCanvasLocked ? "Unlock canvas" : "Lock canvas"}
                  className={isCanvasLocked ? "!text-amber-400 !bg-amber-500/20" : "!text-zinc-400 hover:!text-white"}
                >
                  {isCanvasLocked ? (
                    <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 20 20">
                      <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
                    </svg>
                  )}
                </ControlButton>
              </Controls>

              <MiniMap
                nodeColor="rgba(59,130,246,0.35)"
                maskColor="rgba(0,0,0,0.75)"
                className="!bg-[#111111]/80 !border-white/[0.06] !rounded-xl !shadow-none opacity-80 hover:opacity-100 transition-opacity"
              />
            </ReactFlow>
          </div>

          {/* ── Execution Timeline ── */}
          <ExecutionTimeline
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
            onApproveStep={handleApproveStep}
            userRole={role}
            isRunning={isRunningWorkflow}
            workflowStatus={effectiveWorkflowStatus}
            activeRunId={activeWorkflowRunId}
          />
        </section>

        {/* ── Properties Panel ── */}
        <NodePropertiesPanel
          selectedNode={selectedNode}
          onUpdateNodeName={handleUpdateNodeName}
          onUpdateNodeConfig={handleUpdateNodeConfig}
          onDeselectNode={() => setSelectedNodeId(null)}
          onDeleteNode={handleDeleteNode}
          onApproveStep={handleApproveStep}
          onSave={handleSaveWorkflow}
          saveStatus={saveStatus}
          isSavingDisabled={isLoadingWorkflow || isRunningWorkflow}
        />
      </div>

      {/* ── Interactive Workflow Walkthrough Modal ── */}
      <WorkflowGuide
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />
    </main>
  );
}