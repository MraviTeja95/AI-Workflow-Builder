"use client";

import type { Node } from "@xyflow/react";
import type {
  WorkflowNodeData,
  WorkflowNodeConfig,
  NodeType,
} from "@/types/workflow";

interface NodePropertiesPanelProps {
  selectedNode: Node<WorkflowNodeData> | null;
  onUpdateNodeName: (id: string, name: string) => void;
  onUpdateNodeConfig: <K extends keyof WorkflowNodeConfig>(
    id: string,
    configKey: K,
    configValue: Partial<NonNullable<WorkflowNodeConfig[K]>>
  ) => void;
  onDeselectNode: () => void;
}

export function NodePropertiesPanel({
  selectedNode,
  onUpdateNodeName,
  onUpdateNodeConfig,
  onDeselectNode,
}: NodePropertiesPanelProps) {
  if (!selectedNode) {
    return (
      <aside className="w-80 shrink-0 border-l border-white/10 p-5 bg-[#0a0a0a] flex flex-col">
        <h2 className="mb-5 text-sm font-semibold text-white">
          Node Properties
        </h2>

        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-zinc-400">
            ⚙️
          </div>
          <p className="text-sm font-medium text-zinc-300">
            No Node Selected
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Click any node on the canvas to configure its settings.
          </p>
        </div>
      </aside>
    );
  }

  const { id, data } = selectedNode;
  const config = data.config || {};
  const nodeType: NodeType = data.nodeType || "trigger";

  const getReadableType = (type: NodeType) => {
    switch (type) {
      case "trigger":
        return "Trigger";
      case "ai_agent":
        return "AI Agent";
      case "http_request":
        return "HTTP Request";
      case "database":
        return "Database";
      case "condition":
        return "Condition";
      case "notify":
        return "Notify";
      case "approval_gate":
        return "Approval Gate";
      default:
        return "Custom Node";
    }
  };

  return (
    <aside className="w-80 shrink-0 border-l border-white/10 p-5 bg-[#0a0a0a] overflow-y-auto max-h-[calc(100vh-4rem)] flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-base">
            {data.icon}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">
              {getReadableType(nodeType)}
            </h2>
            <p className="text-[11px] font-mono text-zinc-500 truncate max-w-[150px]">
              ID: {id}
            </p>
          </div>
        </div>

        <button
          onClick={onDeselectNode}
          title="Deselect Node"
          className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      {/* General Settings */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          General
        </h3>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-300">
            Node Name
          </label>
          <input
            type="text"
            value={data.label}
            onChange={(e) => onUpdateNodeName(id, e.target.value)}
            placeholder="Enter node name"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-300">
            Node Type
          </label>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs font-medium text-zinc-400">
            {getReadableType(nodeType)}
          </div>
        </div>
      </div>

      {/* Type-Specific Configuration */}
      <div className="space-y-4 border-t border-white/10 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Configuration
        </h3>

        {/* 1. TRIGGER NODE */}
        {nodeType === "trigger" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Trigger Type
              </label>
              <select
                value={config.trigger?.triggerType ?? "Manual"}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "trigger", {
                    triggerType: e.target.value as
                      | "Manual"
                      | "Webhook"
                      | "Schedule",
                  })
                }
                className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="Manual">Manual</option>
                <option value="Webhook">Webhook</option>
                <option value="Schedule">Schedule</option>
              </select>
            </div>
          </div>
        )}

        {/* 2. AI AGENT NODE */}
        {nodeType === "ai_agent" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                AI Model
              </label>
              <select
                value={config.aiAgent?.model ?? "Gemini"}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "aiAgent", {
                    model: e.target.value as "Gemini" | "OpenAI" | "Claude",
                  })
                }
                className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="Gemini">Gemini</option>
                <option value="OpenAI">OpenAI</option>
                <option value="Claude">Claude</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                System Prompt
              </label>
              <textarea
                rows={3}
                value={config.aiAgent?.systemPrompt ?? ""}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "aiAgent", {
                    systemPrompt: e.target.value,
                  })
                }
                placeholder="You are an AI workflow assistant..."
                className="w-full resize-y rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                User Prompt
              </label>
              <textarea
                rows={3}
                value={config.aiAgent?.userPrompt ?? ""}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "aiAgent", {
                    userPrompt: e.target.value,
                  })
                }
                placeholder="Process the input data..."
                className="w-full resize-y rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-300">
                  Temperature
                </label>
                <span className="text-xs font-mono text-blue-400">
                  {config.aiAgent?.temperature ?? 0.7}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={config.aiAgent?.temperature ?? 0.7}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "aiAgent", {
                    temperature: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Max Tokens
              </label>
              <input
                type="number"
                min="1"
                max="32768"
                step="64"
                value={config.aiAgent?.maxTokens ?? 2048}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "aiAgent", {
                    maxTokens: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* 3. HTTP REQUEST NODE */}
        {nodeType === "http_request" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                HTTP Method
              </label>
              <select
                value={config.httpRequest?.method ?? "GET"}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "httpRequest", {
                    method: e.target.value as
                      | "GET"
                      | "POST"
                      | "PUT"
                      | "DELETE",
                  })
                }
                className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Request URL
              </label>
              <input
                type="text"
                value={config.httpRequest?.url ?? ""}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "httpRequest", {
                    url: e.target.value,
                  })
                }
                placeholder="https://api.example.com/v1/resource"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Headers (JSON)
              </label>
              <textarea
                rows={3}
                value={config.httpRequest?.headers ?? ""}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "httpRequest", {
                    headers: e.target.value,
                  })
                }
                placeholder='{\n  "Authorization": "Bearer ..."\n}'
                className="w-full resize-y font-mono rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Request Body
              </label>
              <textarea
                rows={3}
                value={config.httpRequest?.body ?? ""}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "httpRequest", {
                    body: e.target.value,
                  })
                }
                placeholder='{\n  "query": "..."\n}'
                className="w-full resize-y font-mono rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* 4. DATABASE NODE */}
        {nodeType === "database" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Operation
              </label>
              <select
                value={config.database?.operation ?? "SELECT"}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "database", {
                    operation: e.target.value as
                      | "SELECT"
                      | "INSERT"
                      | "UPDATE"
                      | "DELETE",
                  })
                }
                className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="SELECT">SELECT</option>
                <option value="INSERT">INSERT</option>
                <option value="UPDATE">UPDATE</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Table Name
              </label>
              <input
                type="text"
                value={config.database?.tableName ?? ""}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "database", {
                    tableName: e.target.value,
                  })
                }
                placeholder="e.g. users or orders"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Query / Configuration
              </label>
              <textarea
                rows={4}
                value={config.database?.query ?? ""}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "database", {
                    query: e.target.value,
                  })
                }
                placeholder="SELECT * FROM users WHERE active = true;"
                className="w-full resize-y font-mono rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* 5. CONDITION NODE */}
        {nodeType === "condition" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Condition Expression
              </label>
              <textarea
                rows={4}
                value={config.condition?.expression ?? ""}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "condition", {
                    expression: e.target.value,
                  })
                }
                placeholder='{{steps.ai_agent.response}} !== ""'
                className="w-full resize-y font-mono rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-[11px] text-zinc-500">
                JavaScript expression evaluated at runtime to branch workflow.
              </p>
            </div>
          </div>
        )}

        {/* 6. NOTIFY NODE */}
        {nodeType === "notify" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Channel / Provider
              </label>
              <select
                value={config.notify?.channel ?? "Email"}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "notify", {
                    channel: e.target.value as "Email" | "Slack" | "Webhook",
                  })
                }
                className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="Email">Email</option>
                <option value="Slack">Slack</option>
                <option value="Webhook">Webhook</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Recipient / Target
              </label>
              <input
                type="text"
                value={config.notify?.recipient ?? ""}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "notify", {
                    recipient: e.target.value,
                  })
                }
                placeholder="user@example.com or #channel or URL"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Message Template
              </label>
              <textarea
                rows={4}
                value={config.notify?.message ?? ""}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "notify", {
                    message: e.target.value,
                  })
                }
                placeholder="Workflow execution finished: {{steps.ai_agent.response}}"
                className="w-full resize-y rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* 7. APPROVAL GATE NODE */}
        {nodeType === "approval_gate" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Approval Message
              </label>
              <textarea
                rows={3}
                value={config.approvalGate?.message ?? ""}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "approvalGate", {
                    message: e.target.value,
                  })
                }
                placeholder="Please review and approve this workflow step..."
                className="w-full resize-y rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Required Role
              </label>
              <select
                value={config.approvalGate?.requiredRole ?? "Owner"}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "approvalGate", {
                    requiredRole: e.target.value as
                      | "Owner"
                      | "Admin"
                      | "Member",
                  })
                }
                className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="Owner">Owner</option>
                <option value="Admin">Admin</option>
                <option value="Member">Member</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Timeout (Hours)
              </label>
              <input
                type="number"
                min="1"
                max="168"
                value={config.approvalGate?.timeoutHours ?? 24}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "approvalGate", {
                    timeoutHours: parseInt(e.target.value, 10) || 1,
                  })
                }
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
