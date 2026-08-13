"use client";

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import { useState, useCallback, useEffect, useRef } from "react";
import { WorkflowNode } from "@/components/WorkflowNode";
import { NodePropertiesPanel } from "@/components/NodePropertiesPanel";
import { ExecutionTimeline } from "@/components/ExecutionTimeline";
import { LoginScreen } from "@/components/LoginScreen";
import { useAuth } from "@/context/AuthContext";
import { useMounted } from "@/hooks/useMounted";
import { useWorkflowStepRunsSubscription } from "@/hooks/useWorkflowStepRunsSubscription";
import {
  type WorkflowNodeData,
  type WorkflowNodeConfig,
  type NodeType,
  DEFAULT_NODE_CONFIGS,
} from "@/types/workflow";

const initialNodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-1",
    type: "workflowNode",
    position: { x: 100, y: 180 },
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
    position: { x: 380, y: 180 },
    data: {
      label: "AI Agent",
      icon: "🤖",
      nodeType: "ai_agent",
      config: JSON.parse(JSON.stringify(DEFAULT_NODE_CONFIGS.ai_agent.config)),
    },
  },
  {
    id: "http-request-3",
    type: "workflowNode",
    position: { x: 660, y: 180 },
    data: {
      label: "HTTP Request",
      icon: "🌐",
      nodeType: "http_request",
      config: JSON.parse(
        JSON.stringify(DEFAULT_NODE_CONFIGS.http_request.config)
      ),
    },
  },
];

const initialEdges: Edge[] = [
  {
    id: "e-trigger-ai",
    source: "trigger-1",
    target: "ai-agent-2",
    sourceHandle: "source",
    targetHandle: "target",
    animated: true,
    style: { stroke: "#3b82f6", strokeWidth: 2 },
  },
  {
    id: "e-ai-http",
    source: "ai-agent-2",
    target: "http-request-3",
    sourceHandle: "source",
    targetHandle: "target",
    animated: true,
    style: { stroke: "#3b82f6", strokeWidth: 2 },
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
    accessToken,
    logout,
  } = useAuth();
  const isMounted = useMounted();

  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState("");
  const [nodes, setNodes, onNodesChange] =
    useNodesState<Node<WorkflowNodeData>>(initialNodes);
  const [edges, setEdges, onEdgesChange] =
    useEdgesState<Edge>(initialEdges);
  const [nodeCounter, setNodeCounter] = useState(3);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(false);
  const [isRunningWorkflow, setIsRunningWorkflow] = useState(false);

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

  // Live Workflow Run Subscription state
  const [activeWorkflowRunId, setActiveWorkflowRunId] = useState<string | null>(
    null
  );

  const {
    stepRuns: liveStepRuns,
    isConnected: isSubConnected,
    error: subError,
  } = useWorkflowStepRunsSubscription({
    workflowRunId: activeWorkflowRunId,
    accessToken,
  });

  // Read ?id= from URL on mount and load workflow
  useEffect(() => {
    let ignore = false;

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
      const params = new URLSearchParams(window.location.search);
      const idParam = params.get("id");
      if (idParam) {
        fetchWorkflow(idParam);
      }
    }

    return () => {
      ignore = true;
    };
  }, [isLoading, isAuthenticated, accessToken, setEdges, setNodes]);

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
            style: {
              stroke: "#3b82f6",
              strokeWidth: 2,
            },
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

  // Delete selected node and its connected edges
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((currentNodes) => currentNodes.filter((n) => n.id !== nodeId));
      setEdges((currentEdges) =>
        currentEdges.filter((e) => e.source !== nodeId && e.target !== nodeId)
      );
      setSelectedNodeId(null);
    },
    [setNodes, setEdges]
  );

  // Save workflow handler
  const handleSaveWorkflow = async () => {
    if (!workflowName.trim()) {
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
          name: workflowName.trim(),
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
  }, [liveStepRuns, role, setNodes]);

  // Run workflow handler with Live Subscription integration
  const handleRunWorkflow = async () => {
    let currentId = workflowId;

    if (!currentId) {
      if (!workflowName.trim()) {
        setSaveStatus("error");
        setStatusMessage("Please name and save your workflow before running.");
        return;
      }

      setSaveStatus("saving");
      setStatusMessage("Saving workflow before execution...");

      if (!accessToken) {
        setSaveStatus("error");
        setStatusMessage("Authentication token missing. Please sign in again.");
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
            name: workflowName.trim(),
            nodes,
            edges,
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || `Failed to save workflow (${response.status}).`);
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
        setStatusMessage(`Save error: ${error.message}`);
        return;
      }
    }

    // Reset previous execution status indicators on canvas nodes
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          executionStatus: undefined,
          executionError: null,
          liveStepRun: undefined,
          userRole: role,
          onApprove: (...args: Parameters<typeof handleApproveStep>) => approveStepRef.current(...args),
        },
      }))
    );

    setIsRunningWorkflow(true);
    setWorkflowRunStatus("running");
    setWorkflowSummary(null);
    setStatusMessage("Executing workflow steps in sequence...");

    try {
      const runRes = await fetch("/api/actions/trigger-workflow-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: { name: "triggerWorkflowRun" },
          input: { workflow_id: currentId, trigger_type: "manual" },
          session_variables: {
            "x-hasura-user-id": user?.id,
            "x-hasura-role": role || "owner",
          },
        }),
      });

      const data = await runRes.json().catch(() => ({}));

      // Connect subscription to active run ID for live updates
      if (data.workflow_run_id) {
        setActiveWorkflowRunId(data.workflow_run_id);
      }

      if (!runRes.ok || data.status === "failed") {
        setSaveStatus("error");
        setWorkflowRunStatus("failed");
        setStatusMessage(
          data.message || data.error || `Workflow run failed at step.`
        );
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

      setSaveStatus("saved");
      setWorkflowRunStatus("completed");
      setWorkflowSummary({
        completedCount: nodes.length,
        totalCount: nodes.length,
        finalOutput: typeof data.output === "string" ? data.output : JSON.stringify(data.output),
      });
      setStatusMessage("Workflow run completed successfully!");
    } catch (err) {
      const error = err as Error;
      console.error("Run workflow error:", error);
      setSaveStatus("error");
      setWorkflowRunStatus("failed");
      setStatusMessage(`Run error: ${error.message}`);
    } finally {
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

  // Keyboard Delete/Backspace handler for selected nodes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Delete/Backspace when no input/textarea is focused
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId) {
        e.preventDefault();
        handleDeleteNode(selectedNodeId);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeId, handleDeleteNode]);

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
    <main className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-8">
        <div className="flex items-center gap-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 font-bold shadow-lg shadow-blue-500/20">
            AI
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold">AI Workflow Builder</h1>
              {workflowId && (
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
                  ID: {workflowId.slice(0, 8)}...
                </span>
              )}
              {activeWorkflowRunId && (
                <span
                  title={isSubConnected ? "Live WebSocket Stream Active" : "Connecting..."}
                  className="flex items-center gap-1 rounded bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 text-[10px] font-mono text-blue-300"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${isSubConnected ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
                  Run: {activeWorkflowRunId.slice(0, 8)}...
                </span>
              )}
            </div>

            <p className="text-xs text-zinc-500">
              Build intelligent workflows
            </p>
          </div>
        </div>

        {/* User, Organization & Actions */}
        <div className="flex items-center gap-4">
          {/* User & Org Badge */}
          <div className="flex items-center gap-3 border-r border-white/10 pr-4">
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-xs font-medium text-white truncate max-w-[180px]">
                  {user?.email || "Authenticated User"}
                </span>
                {role && (
                  <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-400 border border-blue-500/20">
                    {role}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 flex items-center justify-end gap-1">
                <span>🏢</span>
                <span className="truncate max-w-[160px]">
                  {organization?.name || "AI Workflow Builder"}
                </span>
              </p>
            </div>

            <button
              onClick={logout}
              title="Sign Out"
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-white transition-colors"
            >
              Logout
            </button>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <span
              className={`text-xs font-medium transition-all ${
                saveStatus === "error"
                  ? "text-rose-400"
                  : saveStatus === "saved"
                  ? "text-emerald-400"
                  : "text-zinc-400"
              }`}
            >
              {statusMessage}
            </span>
          )}

          {subError && (
            <span className="text-xs font-medium text-amber-400">
              (Live stream: {subError})
            </span>
          )}

          <button
            onClick={handleSaveWorkflow}
            disabled={saveStatus === "saving" || isLoadingWorkflow || isRunningWorkflow}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all flex items-center gap-2 ${
              saveStatus === "saved"
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                : saveStatus === "error"
                ? "border-rose-500/50 bg-rose-500/10 text-rose-300"
                : "border-white/10 text-zinc-300 hover:bg-white/5"
            } disabled:opacity-50`}
          >
            {saveStatus === "saving" ? (
              <>
                <svg
                  className="h-3.5 w-3.5 animate-spin text-blue-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Saving...
              </>
            ) : saveStatus === "saved" ? (
              "Saved ✓"
            ) : (
              "Save"
            )}
          </button>

          <button
            onClick={handleRunWorkflow}
            disabled={isRunningWorkflow || saveStatus === "saving"}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-lg shadow-blue-600/20 flex items-center gap-2"
          >
            {isRunningWorkflow ? (
              <>
                <svg
                  className="h-3.5 w-3.5 animate-spin text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Running...
              </>
            ) : (
              "Run Workflow"
            )}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 border-r border-white/10 p-5 bg-[#0a0a0a] overflow-y-auto">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Workflow
          </h2>

          <input
            value={workflowName}
            onChange={(e) => {
              setWorkflowName(e.target.value);
              if (saveStatus === "error") {
                setSaveStatus("idle");
                setStatusMessage(null);
              }
            }}
            placeholder="Workflow name"
            className="mb-6 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
          />

          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Add Nodes
          </h2>

          <div className="space-y-2">
            <button
              onClick={() => addWorkflowNode("trigger")}
              className="node-button"
            >
              ⚡ Trigger
            </button>

            <button
              onClick={() => addWorkflowNode("ai_agent")}
              className="node-button"
            >
              🤖 AI Agent
            </button>

            <button
              onClick={() => addWorkflowNode("http_request")}
              className="node-button"
            >
              🌐 HTTP Request
            </button>

            <button
              onClick={() => addWorkflowNode("database")}
              className="node-button"
            >
              🗄️ Database
            </button>

            <button
              onClick={() => addWorkflowNode("condition")}
              className="node-button"
            >
              ◆ Condition
            </button>

            <button
              onClick={() => addWorkflowNode("notify")}
              className="node-button"
            >
              📢 Notify
            </button>

            <button
              onClick={() => addWorkflowNode("approval_gate")}
              className="node-button"
            >
              🛡️ Approval Gate
            </button>
          </div>
        </aside>

        {/* Canvas & Timeline Section */}
        <section className="flex-1 relative flex flex-col min-w-0">
          {/* Prominent Floating Banner: APPROVAL REQUIRED */}
          {effectiveWorkflowStatus === "paused" && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-2xl rounded-2xl border border-amber-500/50 bg-[#161208]/95 backdrop-blur-xl p-4 shadow-2xl shadow-amber-500/15 animate-in fade-in slide-in-from-top-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-2xl text-amber-300 shadow-inner">
                    ⏸
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold tracking-wide text-amber-300">
                        APPROVAL REQUIRED
                      </h4>
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-mono text-amber-200 uppercase font-semibold">
                        Paused
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 mt-0.5">
                      Execution is paused at <span className="font-semibold text-white">&quot;{pausedStepName}&quot;</span>. Downstream steps will not execute until authorized approval is granted.
                    </p>
                  </div>
                </div>

                {(role === "owner" || role === "editor") ? (
                  <button
                    type="button"
                    onClick={() => handleApproveStep(pausedStepId)}
                    disabled={isRunningWorkflow}
                    className="shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isRunningWorkflow ? "Resuming..." : "Approve & Continue ✓"}
                  </button>
                ) : (
                  <div className="shrink-0 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-[11px] text-amber-300 font-medium">
                    🛡️ Requires Owner / Editor
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Prominent Floating Banner: WORKFLOW COMPLETED */}
          {effectiveWorkflowStatus === "completed" && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-2xl rounded-2xl border border-emerald-500/40 bg-[#0a140d]/95 backdrop-blur-xl p-3.5 shadow-2xl shadow-emerald-500/15 animate-in fade-in slide-in-from-top-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-lg text-emerald-400">
                  ✓
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-400">
                    WORKFLOW COMPLETED
                  </h4>
                  <p className="text-xs text-zinc-300 mt-0.5">
                    All workflow steps executed successfully!
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWorkflowRunStatus("idle")}
                className="text-zinc-400 hover:text-white text-xs px-2.5 py-1 rounded hover:bg-white/5 transition-colors cursor-pointer"
              >
                ✕ Dismiss
              </button>
            </div>
          )}

          {/* Prominent Floating Banner: WORKFLOW FAILED */}
          {effectiveWorkflowStatus === "failed" && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-2xl rounded-2xl border border-rose-500/40 bg-[#160a0c]/95 backdrop-blur-xl p-3.5 shadow-2xl shadow-rose-500/15 animate-in fade-in slide-in-from-top-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-lg text-rose-400">
                  ✕
                </div>
                <div>
                  <h4 className="text-sm font-bold text-rose-400">
                    WORKFLOW EXECUTION FAILED
                  </h4>
                  <p className="text-xs text-zinc-300 mt-0.5">
                    {failedStepRun?.error || statusMessage || "Workflow execution failed at step."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWorkflowRunStatus("idle")}
                className="text-zinc-400 hover:text-white text-xs px-2.5 py-1 rounded hover:bg-white/5 transition-colors cursor-pointer"
              >
                ✕ Dismiss
              </button>
            </div>
          )}

          <div className="flex-1 relative">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              fitView
              className="bg-[#0d0d0d]"
            >
              <Background gap={24} size={1} color="#222" />

              <Controls className="!bg-[#181818] !border-white/10 [&>button]:!border-white/10 [&>button]:!bg-[#181818] [&>button]:!fill-white [&>button:hover]:!bg-white/10" />

              <MiniMap
                nodeColor="#3b82f6"
                maskColor="rgba(0, 0, 0, 0.7)"
                className="!bg-[#141414] !border !border-white/10 rounded-lg overflow-hidden"
              />
            </ReactFlow>
          </div>

          {/* Execution Timeline Panel */}
          <ExecutionTimeline
            nodes={nodes}
            selectedNodeId={selectedNodeId}
            onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
            onApproveStep={handleApproveStep}
            userRole={role}
            isRunning={isRunningWorkflow}
            workflowStatus={effectiveWorkflowStatus}
            activeRunId={activeWorkflowRunId}
          />
        </section>

        {/* Node Properties Panel */}
        <NodePropertiesPanel
          selectedNode={selectedNode}
          onUpdateNodeName={handleUpdateNodeName}
          onUpdateNodeConfig={handleUpdateNodeConfig}
          onDeselectNode={() => setSelectedNodeId(null)}
          onDeleteNode={handleDeleteNode}
          onApproveStep={handleApproveStep}
        />
      </div>

      <style jsx>{`
        .node-button {
          width: 100%;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
          text-align: left;
          font-size: 14px;
          transition: all 0.2s;
          color: #ededed;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .node-button:hover {
          border-color: rgba(59, 130, 246, 0.6);
          background: rgba(59, 130, 246, 0.08);
          color: #ffffff;
        }
      `}</style>
    </main>
  );
}