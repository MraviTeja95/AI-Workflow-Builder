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

import { useState, useCallback, useEffect } from "react";
import { WorkflowNode } from "@/components/WorkflowNode";
import { NodePropertiesPanel } from "@/components/NodePropertiesPanel";
import { LoginScreen } from "@/components/LoginScreen";
import { useAuth } from "@/context/AuthContext";
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
    animated: true,
    style: { stroke: "#3b82f6", strokeWidth: 2 },
  },
  {
    id: "e-ai-http",
    source: "ai-agent-2",
    target: "http-request-3",
    animated: true,
    style: { stroke: "#3b82f6", strokeWidth: 2 },
  },
];

const nodeTypes = {
  workflowNode: WorkflowNode,
};

export default function Home() {
  const { user, organization, role, isLoading, isAuthenticated, logout } =
    useAuth();

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

  // Read ?id= from URL on mount and load workflow
  useEffect(() => {
    let ignore = false;

    async function fetchWorkflow(id: string) {
      setIsLoadingWorkflow(true);
      setStatusMessage("Loading workflow...");

      try {
        const response = await fetch(`/api/workflows/${id}`);
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

    if (typeof window !== "undefined" && isAuthenticated) {
      const params = new URLSearchParams(window.location.search);
      const idParam = params.get("id");
      if (idParam) {
        fetchWorkflow(idParam);
      }
    }

    return () => {
      ignore = true;
    };
  }, [isAuthenticated, setEdges, setNodes]);

  // Connect handles
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) =>
        addEdge(
          {
            ...connection,
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

  // Save workflow handler
  const handleSaveWorkflow = async () => {
    if (!workflowName.trim()) {
      setSaveStatus("error");
      setStatusMessage("Please enter a workflow name before saving.");
      return;
    }

    setSaveStatus("saving");
    setStatusMessage(null);

    try {
      const response = await fetch("/api/workflows", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: workflowId,
          name: workflowName.trim(),
          nodes,
          edges,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save workflow.");
      }

      setWorkflowId(data.workflow.id);
      setSaveStatus("saved");
      setStatusMessage("Workflow saved successfully!");

      // Update browser URL query parameter without full reload
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

  const selectedNode =
    nodes.find((node) => node.id === selectedNodeId) || null;

  // 1. Loading State
  if (isLoading) {
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

          <button
            onClick={handleSaveWorkflow}
            disabled={saveStatus === "saving" || isLoadingWorkflow}
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

          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20">
            Run Workflow
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

        {/* Canvas */}
        <section className="flex-1 relative">
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
        </section>

        {/* Node Properties Panel */}
        <NodePropertiesPanel
          selectedNode={selectedNode}
          onUpdateNodeName={handleUpdateNodeName}
          onUpdateNodeConfig={handleUpdateNodeConfig}
          onDeselectNode={() => setSelectedNodeId(null)}
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