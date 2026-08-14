"use client";

import { useState } from "react";
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
  onDeleteNode: (nodeId: string) => void;
  onApproveStep?: (stepId?: string, stepRunId?: string) => void;
  onSave?: () => void;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  isSavingDisabled?: boolean;
}

export function NodePropertiesPanel({
  selectedNode,
  onUpdateNodeName,
  onUpdateNodeConfig,
  onDeselectNode,
  onDeleteNode,
  onApproveStep,
  onSave,
  saveStatus = "idle",
  isSavingDisabled = false,
}: NodePropertiesPanelProps) {
  const [isAiOutputExpanded, setIsAiOutputExpanded] = useState(false);
  const [isAdvancedConditionOpen, setIsAdvancedConditionOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    if (!text) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const renderSaveButton = () => {
    if (!onSave) return null;
    return (
      <button
        id="btn-save"
        type="button"
        onClick={onSave}
        disabled={saveStatus === "saving" || isSavingDisabled}
        className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all flex items-center gap-1.5 disabled:opacity-40 cursor-pointer ${
          saveStatus === "saved"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            : saveStatus === "error"
            ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
            : "border-white/15 bg-white/5 text-zinc-300 hover:border-white/30 hover:text-white"
        }`}
      >
        {saveStatus === "saving" ? (
          <>
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Saving…</span>
          </>
        ) : saveStatus === "saved" ? (
          "✓ Saved"
        ) : (
          "Save"
        )}
      </button>
    );
  };

  if (!selectedNode) {
    return (
      <aside className="w-80 shrink-0 border-l border-white/10 p-5 bg-[#0a0a0a] flex flex-col">
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
          <h2 className="text-sm font-semibold text-white">
            Node Properties
          </h2>
          {renderSaveButton()}
        </div>

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
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-base">
            {data.icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white truncate">
              {getReadableType(nodeType)}
            </h2>
            <p className="text-[10px] font-mono text-zinc-500 truncate">
              ID: {id}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {renderSaveButton()}

          <button
            onClick={onDeselectNode}
            title="Deselect Node"
            className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Lock status callout */}
      {data.locked && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 flex items-center gap-2">
          🔒 <span>Node is <strong>locked</strong>. Unlock via the canvas toolbar to delete or drag.</span>
        </div>
      )}

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
                disabled={data.userRole ? data.userRole.toLowerCase() !== "owner" : false}
                onChange={(e) => {
                  const newType = e.target.value as "Manual" | "Webhook" | "Schedule";
                  const existingSecret = config.trigger?.webhookSecret;
                  const autoSecret =
                    newType === "Webhook" && !existingSecret
                      ? `whsec_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`
                      : existingSecret;

                  onUpdateNodeConfig(id, "trigger", {
                    triggerType: newType,
                    webhookSecret: autoSecret,
                  });
                }}
                className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="Manual">Manual</option>
                <option value="Webhook">Webhook</option>
                <option value="Schedule">Schedule</option>
              </select>
            </div>

            {data.userRole && data.userRole.toLowerCase() !== "owner" && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5 text-xs text-amber-300">
                🛡️ Webhook configuration is restricted to organization Owners.
              </div>
            )}

            {config.trigger?.triggerType === "Webhook" && (
              <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200">Webhook Settings</span>
                  <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-mono text-blue-300">
                    Active
                  </span>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-zinc-400">
                    Webhook Secret Token
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="password"
                      value={config.trigger?.webhookSecret || ""}
                      readOnly={data.userRole ? data.userRole.toLowerCase() !== "owner" : false}
                      onChange={(e) =>
                        onUpdateNodeConfig(id, "trigger", {
                          triggerType: "Webhook",
                          webhookSecret: e.target.value,
                        })
                      }
                      placeholder="whsec_..."
                      className="w-full rounded-lg border border-white/10 bg-[#141414] px-2.5 py-1.5 text-xs font-mono text-white outline-none focus:border-blue-500 placeholder:text-zinc-600 disabled:opacity-50"
                    />
                    {(!data.userRole || data.userRole.toLowerCase() === "owner") && (
                      <button
                        type="button"
                        onClick={() => {
                          const newSecret = `whsec_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
                          onUpdateNodeConfig(id, "trigger", {
                            triggerType: "Webhook",
                            webhookSecret: newSecret,
                          });
                        }}
                        title="Regenerate Secret"
                        className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        🔄
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-500">
                    Required in <code className="text-zinc-400">x-webhook-secret</code> or <code className="text-zinc-400">Bearer</code> header.
                  </p>
                </div>

                <div className="rounded border border-white/5 bg-black/40 p-2 text-[11px] text-zinc-400">
                  <div className="font-semibold text-zinc-300 mb-1">HTTP Inbound Request:</div>
                  <div className="font-mono text-[10px] text-blue-300 break-all">
                    POST /api/triggers/webhook/[workflow-id]
                  </div>
                  <div className="mt-1 text-[10px] text-zinc-500">
                    Downstream steps can reference payload fields via <code className="text-zinc-300">{"{{ trigger.data.event }}"}</code> or <code className="text-zinc-300">{"{{ trigger.data.your_key }}"}</code>.
                  </div>
                </div>
              </div>
            )}
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
            {data.userRole && data.userRole.toLowerCase() !== "owner" && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5 text-xs text-amber-300">
                🛡️ Database write configuration is restricted to organization Owners.
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Operation
              </label>
              <select
                value={config.database?.operation ?? "INSERT"}
                disabled={data.userRole ? data.userRole.toLowerCase() !== "owner" : false}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "database", {
                    operation: e.target.value as
                      | "SELECT"
                      | "INSERT"
                      | "UPDATE"
                      | "DELETE",
                  })
                }
                className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="INSERT">INSERT</option>
                <option value="UPDATE">UPDATE</option>
                <option value="DELETE">DELETE</option>
                <option value="SELECT">SELECT</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Table Name
              </label>
              <input
                type="text"
                value={config.database?.tableName ?? ""}
                readOnly={data.userRole ? data.userRole.toLowerCase() !== "owner" : false}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "database", {
                    tableName: e.target.value,
                  })
                }
                placeholder="e.g. audit_logs or records"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Query / SQL Expression
              </label>
              <textarea
                rows={4}
                value={config.database?.query ?? ""}
                readOnly={data.userRole ? data.userRole.toLowerCase() !== "owner" : false}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "database", {
                    query: e.target.value,
                  })
                }
                placeholder="INSERT INTO audit_logs (event, user_id) VALUES ('{{trigger.data.action}}', '{{trigger.data.userId}}');"
                className="w-full resize-y font-mono rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
              <p className="mt-1 text-[10px] text-zinc-500">
                Supports workflow variables like <code className="text-zinc-300">{"{{ trigger.data.field }}"}</code> or <code className="text-zinc-300">{"{{ steps.StepName.output }}"}</code>.
              </p>
            </div>
          </div>
        )}

        {/* 5. CONDITION NODE */}
        {nodeType === "condition" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Evaluation Target Field
              </label>
              <input
                type="text"
                value={config.condition?.field ?? "content"}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "condition", {
                    field: e.target.value,
                  })
                }
                placeholder="e.g. content, status, or data.result"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-[11px] text-zinc-500">
                Field from the previous step output to evaluate (e.g. &quot;content&quot;).
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Comparison Operator
              </label>
              <select
                value={config.condition?.operator ?? "contains"}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "condition", {
                    operator: e.target.value as
                      | "contains"
                      | "not_contains"
                      | "equals"
                      | "not_equals"
                      | "starts_with"
                      | "ends_with"
                      | "greater_than"
                      | "less_than"
                      | "is_empty"
                      | "is_not_empty",
                  })
                }
                className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="contains">contains</option>
                <option value="not_contains">does not contain</option>
                <option value="equals">equals</option>
                <option value="not_equals">not equals</option>
                <option value="starts_with">starts with</option>
                <option value="ends_with">ends with</option>
                <option value="greater_than">greater than (&gt;)</option>
                <option value="less_than">less than (&lt;)</option>
                <option value="is_empty">is empty</option>
                <option value="is_not_empty">is not empty</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Comparison Value
              </label>
              <input
                type="text"
                value={config.condition?.value ?? "APPROVE"}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "condition", {
                    value: e.target.value,
                  })
                }
                placeholder="e.g. APPROVE"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Advanced Options Disclosure */}
            <div className="pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => setIsAdvancedConditionOpen((v) => !v)}
                className="flex items-center justify-between w-full text-left py-1 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer group"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <svg
                    className={`h-3 w-3 text-zinc-500 transition-transform duration-150 ${
                      isAdvancedConditionOpen ? "rotate-90 text-blue-400" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <span>Advanced Expression</span>
                </span>
                <span className="text-[10px] text-zinc-500 group-hover:text-zinc-400 font-mono">
                  {config.condition?.expression ? "Configured" : "Optional"}
                </span>
              </button>

              {isAdvancedConditionOpen && (
                <div className="mt-2.5 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-medium text-zinc-300">
                      JavaScript Expression
                    </label>
                    <span className="text-[10px] text-zinc-500 font-mono">returns boolean</span>
                  </div>
                  <div className="relative rounded-lg border border-white/10 bg-[#0d0d0d] focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                    <textarea
                      rows={3}
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                      value={config.condition?.expression ?? ""}
                      onChange={(e) =>
                        onUpdateNodeConfig(id, "condition", {
                          expression: e.target.value,
                        })
                      }
                      placeholder='lastOutput?.content?.includes("APPROVE")'
                      className="w-full resize-y font-mono bg-transparent p-2.5 text-xs text-blue-300 outline-none placeholder:text-zinc-600 leading-relaxed"
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    Evaluated when standard operator is insufficient. Available scope: <code className="text-zinc-400 font-mono">lastOutput</code>, <code className="text-zinc-400 font-mono">steps</code>, <code className="text-zinc-400 font-mono">input</code>.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 6. NOTIFY NODE */}
        {nodeType === "notify" && (
          <div className="space-y-4">
            {data.userRole && data.userRole.toLowerCase() !== "owner" && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5 text-xs text-amber-300">
                🛡️ Notification configuration is restricted to organization Owners.
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Channel / Provider
              </label>
              <select
                value={config.notify?.channel ?? "Email"}
                disabled={data.userRole ? data.userRole.toLowerCase() !== "owner" : false}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "notify", {
                    channel: e.target.value as "Email" | "Slack" | "Webhook",
                  })
                }
                className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
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
                readOnly={data.userRole ? data.userRole.toLowerCase() !== "owner" : false}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "notify", {
                    recipient: e.target.value,
                  })
                }
                placeholder="user@example.com or #channel or URL"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Message Template
              </label>
              <textarea
                rows={4}
                value={config.notify?.message ?? ""}
                readOnly={data.userRole ? data.userRole.toLowerCase() !== "owner" : false}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "notify", {
                    message: e.target.value,
                  })
                }
                placeholder="Workflow execution finished: {{steps.ai_agent.response}}"
                className="w-full resize-y rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
              <p className="mt-1 text-[10px] text-zinc-500">
                Supports workflow variables like <code className="text-zinc-300">{"{{ trigger.data.email }}"}</code> or <code className="text-zinc-300">{"{{ steps.AI Agent.output }}"}</code>.
              </p>
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
                      | "Editor"
                      | "Viewer",
                  })
                }
                className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="Owner">Owner</option>
                <option value="Editor">Editor</option>
                <option value="Viewer">Viewer</option>
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

      {/* Live Step Execution & Observability Section */}
      {(data.executionStatus || data.liveStepRun) && (
        <div className="space-y-3.5 border-t border-white/10 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Execution Output
            </h3>
            {data.executionStatus === "completed" && (
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30">
                ✓ Completed
              </span>
            )}
            {data.executionStatus === "running" && (
              <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-400 border border-blue-500/30 animate-pulse">
                ▶ Running...
              </span>
            )}
            {data.executionStatus === "paused" && (
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/30 animate-pulse">
                ⏸ Awaiting Approval
              </span>
            )}
            {data.executionStatus === "failed" && (
              <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-400 border border-rose-500/30">
                ✕ Failed
              </span>
            )}
          </div>

          {/* AI Agent Output */}
          {(nodeType === "ai_agent" || nodeType === ("llm_call" as NodeType)) && (
            <>
              {/* Completed / Active Output State */}
              {Boolean(data.liveStepRun?.output || data.liveStepRun?.status === "completed" || data.executionStatus === "completed") && (
                <div className="rounded-xl border border-blue-500/30 bg-gradient-to-b from-blue-950/20 to-black/50 p-3.5 text-xs space-y-3 shadow-lg">
                  {/* Metadata Header */}
                  <div className="grid grid-cols-2 gap-2 pb-2.5 border-b border-white/10 text-[11px]">
                    <div>
                      <span className="text-zinc-400 block text-[10px] uppercase font-semibold tracking-wider">
                        Model
                      </span>
                      <span className="font-mono text-zinc-100 font-medium truncate block">
                        {String(
                          (data.liveStepRun?.output as Record<string, unknown> | undefined)?.model ||
                            config.aiAgent?.model ||
                            "Gemini"
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-400 block text-[10px] uppercase font-semibold tracking-wider">
                        Status
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Completed
                      </span>
                    </div>
                  </div>

                  {/* Response Section */}
                  <div>
                    {(() => {
                      const out = data.liveStepRun?.output as
                        | Record<string, unknown>
                        | string
                        | undefined;
                      const responseText = (() => {
                        if (!out) return "Execution completed (empty output payload).";
                        if (typeof out === "string") return out;
                        const text =
                          out.content ??
                          out.text ??
                          out.response ??
                          out.raw ??
                          out.message ??
                          out.result;
                        if (typeof text === "string" && text.length > 0) return text;
                        return JSON.stringify(out, null, 2);
                      })();

                      return (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-200">
                                Response
                              </label>
                              <span className="text-[10px] font-mono text-zinc-500">
                                ({responseText.length} chars)
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setIsAiOutputExpanded(!isAiOutputExpanded)}
                                title={isAiOutputExpanded ? "Collapse View" : "Expand View"}
                                className="rounded bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer flex items-center gap-1 border border-white/10"
                              >
                                {isAiOutputExpanded ? "⤡ Collapse" : "⤢ Expand"}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleCopy(responseText)}
                                className={`rounded px-2.5 py-0.5 text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                                  copied
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                    : "bg-blue-600 hover:bg-blue-500 text-white shadow-sm"
                                }`}
                              >
                                {copied ? "✓ Copied" : "📋 Copy Response"}
                              </button>
                            </div>
                          </div>

                          <div
                            className={`rounded-lg border border-white/10 bg-black/70 p-3 font-sans text-xs text-zinc-100 whitespace-pre-wrap break-words leading-relaxed select-text transition-all ${
                              isAiOutputExpanded
                                ? "max-h-[500px] overflow-y-auto ring-1 ring-blue-500/30 shadow-inner"
                                : "max-h-56 overflow-y-auto"
                            }`}
                          >
                            {responseText}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Token & Finish Reason Footer */}
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-2 border-t border-white/5">
                    {Boolean(
                      (data.liveStepRun?.output as Record<string, unknown> | undefined)?.tokensUsed
                    ) ? (
                      <span>
                        Tokens:{" "}
                        <span className="text-zinc-300">
                          {String(
                            ((data.liveStepRun?.output as Record<string, unknown>)
                              ?.tokensUsed as Record<string, number>)?.total ||
                              ((data.liveStepRun?.output as Record<string, unknown>)
                                ?.tokensUsed as Record<string, number>)?.completion ||
                              0
                          )}
                        </span>
                      </span>
                    ) : (
                      <span />
                    )}

                    {Boolean(
                      (data.liveStepRun?.output as Record<string, unknown> | undefined)?.finishReason
                    ) && (
                      <span>
                        Finish:{" "}
                        <span className="text-zinc-300">
                          {String(
                            (data.liveStepRun?.output as Record<string, unknown> | undefined)
                              ?.finishReason
                          )}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Failed AI Execution State */}
              {(data.executionStatus === "failed" || data.liveStepRun?.status === "failed") && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3.5 text-xs space-y-2.5 shadow-lg">
                  <div className="grid grid-cols-2 gap-2 pb-2 border-b border-rose-500/20 text-[11px]">
                    <div>
                      <span className="text-zinc-400 block text-[10px] uppercase font-semibold tracking-wider">
                        Model
                      </span>
                      <span className="font-mono text-zinc-200 font-medium">
                        {config.aiAgent?.model || "Gemini"}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-400 block text-[10px] uppercase font-semibold tracking-wider">
                        Status
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-rose-400">
                        ✕ Failed
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-rose-300 mb-1">
                      Error
                    </label>
                    <div className="rounded-lg border border-rose-500/30 bg-black/60 p-2.5 font-mono text-[11px] text-rose-200 whitespace-pre-wrap break-words leading-relaxed select-text max-h-48 overflow-y-auto">
                      {data.executionError || data.liveStepRun?.error || "AI Agent execution failed."}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* HTTP Request Output */}
          {nodeType === "http_request" && data.liveStepRun?.output && (
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-emerald-400">
                  HTTP {String(data.liveStepRun.output.status || 200)} {String(data.liveStepRun.output.statusText || "OK")}
                </span>
                {typeof data.liveStepRun.output.durationMs === "number" && (
                  <span className="font-mono text-[10px] text-zinc-400">
                    {data.liveStepRun.output.durationMs}ms
                  </span>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Response Data:</label>
                <pre className="rounded-lg border border-white/5 bg-black/50 p-2.5 font-mono text-[10px] text-blue-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {JSON.stringify(data.liveStepRun.output.data || data.liveStepRun.output, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Database Output */}
          {nodeType === "database" && data.liveStepRun?.output && (
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-mono text-zinc-300 font-medium">
                  {String(data.liveStepRun.output.operation || "DB")} • {String(data.liveStepRun.output.table || config.database?.tableName || "table")}
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">
                  {String(data.liveStepRun.output.rowCount ?? data.liveStepRun.output.affected_rows ?? 1)} row(s)
                </span>
              </div>
              {Boolean(data.liveStepRun.output.rows) && (
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">Result Rows:</label>
                  <pre className="rounded-lg border border-white/5 bg-black/50 p-2.5 font-mono text-[10px] text-zinc-300 whitespace-pre-wrap max-h-36 overflow-y-auto">
                    {JSON.stringify(data.liveStepRun.output.rows, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Condition Output */}
          {nodeType === "condition" && data.liveStepRun?.output && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Evaluated Branch:</span>
                <span className="font-semibold text-emerald-400">
                  {data.liveStepRun.output.evaluatedValue === true || data.liveStepRun.output.result === true || data.liveStepRun.output.selectedBranch === "true"
                    ? "✓ TRUE"
                    : "✕ FALSE"}
                </span>
              </div>
            </div>
          )}

          {/* Notify Output */}
          {nodeType === "notify" && data.liveStepRun?.output && (
            <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">Channel:</span>
                <span className="font-medium text-zinc-200">{String(data.liveStepRun.output.channel || config.notify?.channel || "Webhook")}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">Delivery ID:</span>
                <span className="font-mono text-[10px] text-zinc-400 truncate max-w-[140px]">{String(data.liveStepRun.output.messageId || "confirmed")}</span>
              </div>
            </div>
          )}

          {/* Approval Gate Output */}
          {nodeType === "approval_gate" && (
            <div className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs">
              {data.executionStatus === "paused" ? (
                <div className="space-y-2">
                  <p className="text-amber-300 text-[11px] font-medium">
                    ⏸ Workflow is paused at this step. Downstream steps have not executed.
                  </p>
                  {(data.userRole === "owner" || data.userRole === "editor") ? (
                    <button
                      type="button"
                      onClick={() => onApproveStep?.(data.stepId, data.liveStepRun?.id)}
                      className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 py-2 text-xs font-semibold text-white transition-all shadow-md flex items-center justify-center gap-1.5"
                    >
                      Approve & Continue ✓
                    </button>
                  ) : (
                    <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] text-amber-300">
                      🛡️ Approval requires organization Owner or Editor privileges.
                    </div>
                  )}
                </div>
              ) : data.liveStepRun?.approved_by ? (
                <div className="space-y-1 text-[11px]">
                  <div className="text-emerald-400 font-medium">✓ Step Approved</div>
                  <div className="text-[10px] text-zinc-400 font-mono">
                    By: {data.liveStepRun.approved_by}
                  </div>
                  {data.liveStepRun.approved_at && (
                    <div className="text-[10px] text-zinc-500">
                      At: {new Date(data.liveStepRun.approved_at).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* Execution Error (if failed) */}
          {(data.executionError || (data.executionStatus === "failed" && data.liveStepRun?.error)) && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
              <span className="font-semibold block mb-0.5">Error:</span>
              <span className="font-mono text-[11px] break-words">{data.executionError || data.liveStepRun?.error}</span>
            </div>
          )}
        </div>
      )}

      {/* Delete Node Action */}
      <div className="border-t border-white/10 pt-4 mt-auto">
        <button
          onClick={() => { if (!data.locked) onDeleteNode(id); }}
          disabled={Boolean(data.locked)}
          title={data.locked ? "Unlock the node first to delete it" : "Delete this node"}
          className={`w-full rounded-lg border px-4 py-2.5 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            data.locked
              ? "border-white/5 bg-white/[0.02] text-zinc-600 cursor-not-allowed"
              : "border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/50"
          }`}
        >
          {data.locked ? "🔒 Locked — Cannot Delete" : "🗑️ Delete Node"}
        </button>
        {!data.locked && (
          <p className="mt-1.5 text-center text-[10px] text-zinc-500">
            Or press Delete / Backspace key
          </p>
        )}
      </div>
    </aside>
  );
}
