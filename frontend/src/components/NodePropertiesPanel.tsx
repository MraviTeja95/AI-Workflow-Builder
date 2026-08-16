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

/* ── Shared style helpers ─────────────────────────────────────────────── */

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--text-caption)",
  fontWeight: 500,
  color: "var(--text-secondary)",
  marginBottom: "6px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: "var(--radius-input)",
  border: "1px solid var(--separator-light)",
  background: "var(--bg-tertiary)",
  padding: "8px 12px",
  fontSize: "var(--text-footnote)",
  color: "var(--text-primary)",
  outline: "none",
  fontFamily: "inherit",
  transition: "border-color var(--transition-fast)",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical" as const,
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-caption)",
  lineHeight: 1.5,
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: "var(--text-caption-2)",
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  color: "var(--text-tertiary)",
};

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
        className="flex items-center gap-1.5 disabled:opacity-40 transition-all cursor-pointer"
        style={{
          borderRadius: "var(--radius-sm)",
          border: `1px solid ${
            saveStatus === "saved" ? "rgba(48,209,88,0.30)"
            : saveStatus === "error" ? "rgba(255,69,58,0.30)"
            : "var(--separator-light)"
          }`,
          background: saveStatus === "saved" ? "var(--success-dim)"
            : saveStatus === "error" ? "var(--destructive-dim)"
            : "transparent",
          padding: "3px 10px",
          fontSize: "var(--text-caption-2)",
          fontWeight: 500,
          color: saveStatus === "saved" ? "var(--success)"
            : saveStatus === "error" ? "var(--destructive)"
            : "var(--text-secondary)",
        }}
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
      <aside className="w-80 shrink-0 flex flex-col" style={{
        borderLeft: "1px solid var(--separator-light)",
        padding: "var(--space-5)",
        background: "var(--bg-primary)",
      }}>
        <div className="flex items-center justify-between" style={{
          borderBottom: "1px solid var(--separator-light)",
          paddingBottom: "var(--space-4)",
          marginBottom: "var(--space-5)",
        }}>
          <h2 style={{ fontSize: "var(--text-footnote)", fontWeight: 600, color: "var(--text-primary)" }}>
            Node Properties
          </h2>
          {renderSaveButton()}
        </div>

        <div className="flex flex-col items-center justify-center text-center" style={{
          borderRadius: "var(--radius-card)",
          border: "1px dashed var(--separator-light)",
          background: "rgba(255,255,255,0.015)",
          padding: "var(--space-8)",
        }}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full mb-3" style={{ background: "rgba(255,255,255,0.04)" }}>
            <span style={{ fontSize: "var(--text-callout)", color: "var(--text-tertiary)" }}>⚙️</span>
          </div>
          <p style={{ fontSize: "var(--text-footnote)", fontWeight: 500, color: "var(--text-secondary)" }}>
            No Node Selected
          </p>
          <p style={{ fontSize: "var(--text-caption)", color: "var(--text-tertiary)", marginTop: "var(--space-1)" }}>
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
      case "trigger":       return "Trigger";
      case "ai_agent":      return "AI Agent";
      case "http_request":  return "HTTP Request";
      case "database":      return "Database";
      case "condition":     return "Condition";
      case "notify":        return "Notify";
      case "approval_gate": return "Approval Gate";
      default:              return "Custom Node";
    }
  };

  return (
    <aside className="w-80 shrink-0 overflow-y-auto flex flex-col gap-6" style={{
      borderLeft: "1px solid var(--separator-light)",
      padding: "var(--space-5)",
      background: "var(--bg-primary)",
      maxHeight: "calc(100vh - 3rem)",
    }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{
        borderBottom: "1px solid var(--separator-light)",
        paddingBottom: "var(--space-4)",
      }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center text-base" style={{
            borderRadius: "var(--radius-button)",
            background: "rgba(255,255,255,0.04)",
          }}>
            {data.icon}
          </div>
          <div className="min-w-0">
            <h2 className="truncate" style={{ fontSize: "var(--text-footnote)", fontWeight: 600, color: "var(--text-primary)" }}>
              {getReadableType(nodeType)}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {renderSaveButton()}

          <button
            onClick={onDeselectNode}
            title="Deselect Node"
            className="transition-colors cursor-pointer"
            style={{
              borderRadius: "var(--radius-sm)",
              padding: "4px",
              color: "var(--text-tertiary)",
              background: "transparent",
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Lock status callout */}
      {data.locked && (
        <div className="flex items-center gap-2" style={{
          borderRadius: "var(--radius-button)",
          border: "1px solid rgba(255,159,10,0.25)",
          background: "var(--warning-dim)",
          padding: "8px 12px",
          fontSize: "var(--text-caption)",
          color: "var(--warning)",
        }}>
          🔒 <span>Node is <strong>locked</strong>. Unlock via the canvas toolbar to delete or drag.</span>
        </div>
      )}

      {/* General Settings */}
      <div className="space-y-4">
        <h3 style={sectionHeaderStyle}>General</h3>

        <div>
          <label style={labelStyle}>Node Name</label>
          <input
            type="text"
            value={data.label}
            onChange={(e) => onUpdateNodeName(id, e.target.value)}
            placeholder="Enter node name"
            style={inputStyle}
            className="placeholder:text-[rgba(235,235,245,0.20)] focus:border-[var(--accent)]"
          />
        </div>

        <div>
          <label style={labelStyle}>Node Type</label>
          <div style={{
            borderRadius: "var(--radius-input)",
            border: "1px solid var(--separator-light)",
            background: "rgba(255,255,255,0.02)",
            padding: "8px 12px",
            fontSize: "var(--text-caption)",
            fontWeight: 500,
            color: "var(--text-tertiary)",
          }}>
            {getReadableType(nodeType)}
          </div>
        </div>
      </div>

      {/* Type-Specific Configuration */}
      <div className="space-y-4" style={{ borderTop: "1px solid var(--separator-light)", paddingTop: "var(--space-4)" }}>
        <h3 style={sectionHeaderStyle}>Configuration</h3>

        {/* 1. TRIGGER NODE */}
        {nodeType === "trigger" && (
          <div className="space-y-4">
            <div>
              <label style={labelStyle}>Trigger Type</label>
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
                style={selectStyle}
                className="disabled:opacity-50 focus:border-[var(--accent)]"
              >
                <option value="Manual">Manual</option>
                <option value="Webhook">Webhook</option>
                <option value="Schedule">Schedule</option>
              </select>
            </div>

            {data.userRole && data.userRole.toLowerCase() !== "owner" && (
              <div style={{
                borderRadius: "var(--radius-button)",
                border: "1px solid rgba(255,159,10,0.20)",
                background: "var(--warning-dim)",
                padding: "8px 12px",
                fontSize: "var(--text-caption)",
                color: "var(--warning)",
              }}>
                🛡️ Webhook configuration is restricted to organization Owners.
              </div>
            )}

            {config.trigger?.triggerType === "Webhook" && (
              <div className="space-y-3" style={{
                borderRadius: "var(--radius-card)",
                border: "1px solid var(--separator-light)",
                background: "rgba(255,255,255,0.02)",
                padding: "12px",
              }}>
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: "var(--text-caption)", fontWeight: 600, color: "var(--text-primary)" }}>Webhook Settings</span>
                  <span style={{
                    borderRadius: "var(--radius-sm)",
                    background: "var(--accent-dim)",
                    padding: "2px 6px",
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                    color: "var(--accent)",
                  }}>
                    Active
                  </span>
                </div>

                <div>
                  <label style={{ ...labelStyle, fontSize: "var(--text-caption-2)" }}>Webhook Secret Token</label>
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
                      style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)" }}
                      className="placeholder:text-[rgba(235,235,245,0.20)] disabled:opacity-50 focus:border-[var(--accent)]"
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
                        className="shrink-0 transition-all cursor-pointer"
                        style={{
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--separator-light)",
                          padding: "6px 8px",
                          fontSize: "var(--text-caption)",
                          color: "var(--text-secondary)",
                          background: "transparent",
                        }}
                      >
                        🔄
                      </button>
                    )}
                  </div>
                  <p style={{ marginTop: "4px", fontSize: "10px", color: "var(--text-tertiary)" }}>
                    Required in <code style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>x-webhook-secret</code> or <code style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>Bearer</code> header.
                  </p>
                </div>

                <div style={{
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--separator-light)",
                  background: "rgba(0,0,0,0.3)",
                  padding: "8px",
                }}>
                  <div style={{ fontSize: "var(--text-caption-2)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>HTTP Inbound Request:</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--accent)", wordBreak: "break-all" as const }}>
                    POST /api/triggers/webhook/[workflow-id]
                  </div>
                  <div style={{ marginTop: "4px", fontSize: "10px", color: "var(--text-tertiary)" }}>
                    Downstream steps can reference payload fields via <code style={{ color: "var(--text-secondary)" }}>{"{{ trigger.data.event }}"}</code> or <code style={{ color: "var(--text-secondary)" }}>{"{{ trigger.data.your_key }}"}</code>.
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
              <label style={labelStyle}>AI Model</label>
              <select
                value={config.aiAgent?.model ?? "Gemini"}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "aiAgent", {
                    model: e.target.value as "Gemini" | "OpenAI" | "Claude",
                  })
                }
                style={selectStyle}
                className="focus:border-[var(--accent)]"
              >
                <option value="Gemini">Gemini</option>
                <option value="OpenAI">OpenAI</option>
                <option value="Claude">Claude</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>System Prompt</label>
              <textarea
                rows={3}
                value={config.aiAgent?.systemPrompt ?? ""}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "aiAgent", {
                    systemPrompt: e.target.value,
                  })
                }
                placeholder="You are an AI workflow assistant..."
                style={{ ...textareaStyle, fontFamily: "inherit" }}
                className="placeholder:text-[rgba(235,235,245,0.20)] focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label style={labelStyle}>User Prompt</label>
              <textarea
                rows={3}
                value={config.aiAgent?.userPrompt ?? ""}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "aiAgent", {
                    userPrompt: e.target.value,
                  })
                }
                placeholder="Process the input data..."
                style={{ ...textareaStyle, fontFamily: "inherit" }}
                className="placeholder:text-[rgba(235,235,245,0.20)] focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between" style={{ marginBottom: "6px" }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Temperature</label>
                <span style={{ fontSize: "var(--text-caption)", fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
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
                className="w-full cursor-pointer"
                style={{ accentColor: "var(--accent)" }}
              />
            </div>

            <div>
              <label style={labelStyle}>Max Tokens</label>
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
                style={inputStyle}
                className="focus:border-[var(--accent)]"
              />
            </div>
          </div>
        )}

        {/* 3. HTTP REQUEST NODE */}
        {nodeType === "http_request" && (
          <div className="space-y-4">
            <div>
              <label style={labelStyle}>HTTP Method</label>
              <select
                value={config.httpRequest?.method ?? "GET"}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "httpRequest", {
                    method: e.target.value as "GET" | "POST" | "PUT" | "DELETE",
                  })
                }
                style={selectStyle}
                className="focus:border-[var(--accent)]"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Request URL</label>
              <input
                type="text"
                value={config.httpRequest?.url ?? ""}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "httpRequest", {
                    url: e.target.value,
                  })
                }
                placeholder="https://api.example.com/v1/resource"
                style={inputStyle}
                className="placeholder:text-[rgba(235,235,245,0.20)] focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label style={labelStyle}>Headers (JSON)</label>
              <textarea
                rows={3}
                value={config.httpRequest?.headers ?? ""}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "httpRequest", {
                    headers: e.target.value,
                  })
                }
                placeholder={'{\n  "Authorization": "Bearer ..."\n}'}
                style={textareaStyle}
                className="placeholder:text-[rgba(235,235,245,0.20)] focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label style={labelStyle}>Request Body</label>
              <textarea
                rows={3}
                value={config.httpRequest?.body ?? ""}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "httpRequest", {
                    body: e.target.value,
                  })
                }
                placeholder={'{\n  "query": "..."\n}'}
                style={textareaStyle}
                className="placeholder:text-[rgba(235,235,245,0.20)] focus:border-[var(--accent)]"
              />
            </div>
          </div>
        )}

        {/* 4. DATABASE NODE */}
        {nodeType === "database" && (
          <div className="space-y-4">
            {data.userRole && data.userRole.toLowerCase() !== "owner" && (
              <div style={{
                borderRadius: "var(--radius-button)",
                border: "1px solid rgba(255,159,10,0.20)",
                background: "var(--warning-dim)",
                padding: "8px 12px",
                fontSize: "var(--text-caption)",
                color: "var(--warning)",
              }}>
                🛡️ Database write configuration is restricted to organization Owners.
              </div>
            )}

            <div>
              <label style={labelStyle}>Operation</label>
              <select
                value={config.database?.operation ?? "INSERT"}
                disabled={data.userRole ? data.userRole.toLowerCase() !== "owner" : false}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "database", {
                    operation: e.target.value as "SELECT" | "INSERT" | "UPDATE" | "DELETE",
                  })
                }
                style={selectStyle}
                className="disabled:opacity-50 focus:border-[var(--accent)]"
              >
                <option value="INSERT">INSERT</option>
                <option value="UPDATE">UPDATE</option>
                <option value="DELETE">DELETE</option>
                <option value="SELECT">SELECT</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Table Name</label>
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
                style={inputStyle}
                className="placeholder:text-[rgba(235,235,245,0.20)] disabled:opacity-50 focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label style={labelStyle}>Query / SQL Expression</label>
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
                style={textareaStyle}
                className="placeholder:text-[rgba(235,235,245,0.20)] disabled:opacity-50 focus:border-[var(--accent)]"
              />
              <p style={{ marginTop: "4px", fontSize: "10px", color: "var(--text-tertiary)" }}>
                Supports workflow variables like <code style={{ color: "var(--text-secondary)" }}>{"{{ trigger.data.field }}"}</code> or <code style={{ color: "var(--text-secondary)" }}>{"{{ steps.StepName.output }}"}</code>.
              </p>
            </div>
          </div>
        )}

        {/* 5. CONDITION NODE */}
        {nodeType === "condition" && (
          <div className="space-y-4">
            <div>
              <label style={labelStyle}>Target Field</label>
              <input
                type="text"
                value={config.condition?.field ?? "content"}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "condition", {
                    field: e.target.value,
                  })
                }
                placeholder="e.g. content, status, or data.result"
                style={inputStyle}
                className="placeholder:text-[rgba(235,235,245,0.20)] focus:border-[var(--accent)]"
              />
              <p style={{ marginTop: "4px", fontSize: "var(--text-caption-2)", color: "var(--text-tertiary)" }}>
                Field from the previous step output to evaluate (e.g. &quot;content&quot;).
              </p>
            </div>

            <div>
              <label style={labelStyle}>Comparison Operator</label>
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
                style={selectStyle}
                className="focus:border-[var(--accent)]"
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
              <label style={labelStyle}>Comparison Value</label>
              <input
                type="text"
                value={config.condition?.value ?? "APPROVE"}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "condition", {
                    value: e.target.value,
                  })
                }
                placeholder="e.g. APPROVE"
                style={inputStyle}
                className="placeholder:text-[rgba(235,235,245,0.20)] focus:border-[var(--accent)]"
              />
            </div>

            {/* Advanced Options Disclosure */}
            <div style={{ paddingTop: "8px", borderTop: "1px solid var(--separator-light)" }}>
              <button
                type="button"
                onClick={() => setIsAdvancedConditionOpen((v) => !v)}
                className="flex items-center justify-between w-full text-left cursor-pointer group"
                style={{ padding: "4px 0", fontSize: "var(--text-caption)", color: "var(--text-secondary)" }}
              >
                <span className="flex items-center gap-1.5" style={{ fontWeight: 500 }}>
                  <svg
                    className={`h-3 w-3 transition-transform duration-150 ${
                      isAdvancedConditionOpen ? "rotate-90" : ""
                    }`}
                    style={{ color: isAdvancedConditionOpen ? "var(--accent)" : "var(--text-tertiary)" }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <span>Advanced Expression</span>
                </span>
                <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
                  {config.condition?.expression ? "Configured" : "Optional"}
                </span>
              </button>

              {isAdvancedConditionOpen && (
                <div className="mt-2.5 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <label style={{ ...labelStyle, marginBottom: 0 }}>JavaScript Expression</label>
                    <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>returns boolean</span>
                  </div>
                  <div style={{
                    borderRadius: "var(--radius-input)",
                    border: "1px solid var(--separator-light)",
                    background: "rgba(0,0,0,0.3)",
                    transition: "border-color var(--transition-fast)",
                  }} className="focus-within:border-[var(--accent)]">
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
                      style={{
                        width: "100%",
                        resize: "vertical" as const,
                        fontFamily: "var(--font-mono)",
                        background: "transparent",
                        padding: "10px 12px",
                        fontSize: "var(--text-caption)",
                        color: "var(--accent)",
                        outline: "none",
                        lineHeight: 1.6,
                        border: "none",
                      }}
                      className="placeholder:text-[rgba(235,235,245,0.20)]"
                    />
                  </div>
                  <p style={{ fontSize: "10px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                    Evaluated when standard operator is insufficient. Available scope: <code style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>lastOutput</code>, <code style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>steps</code>, <code style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>input</code>.
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
              <div style={{
                borderRadius: "var(--radius-button)",
                border: "1px solid rgba(255,159,10,0.20)",
                background: "var(--warning-dim)",
                padding: "8px 12px",
                fontSize: "var(--text-caption)",
                color: "var(--warning)",
              }}>
                🛡️ Notification configuration is restricted to organization Owners.
              </div>
            )}

            <div>
              <label style={labelStyle}>Channel / Provider</label>
              <select
                value={config.notify?.channel ?? "Email"}
                disabled={data.userRole ? data.userRole.toLowerCase() !== "owner" : false}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "notify", {
                    channel: e.target.value as "Email" | "Slack" | "Webhook",
                  })
                }
                style={selectStyle}
                className="disabled:opacity-50 focus:border-[var(--accent)]"
              >
                <option value="Email">Email</option>
                <option value="Slack">Slack</option>
                <option value="Webhook">Webhook</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Recipient / Target</label>
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
                style={inputStyle}
                className="placeholder:text-[rgba(235,235,245,0.20)] disabled:opacity-50 focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label style={labelStyle}>Message Template</label>
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
                style={{ ...textareaStyle, fontFamily: "inherit" }}
                className="placeholder:text-[rgba(235,235,245,0.20)] disabled:opacity-50 focus:border-[var(--accent)]"
              />
              <p style={{ marginTop: "4px", fontSize: "10px", color: "var(--text-tertiary)" }}>
                Supports workflow variables like <code style={{ color: "var(--text-secondary)" }}>{"{{ trigger.data.email }}"}</code> or <code style={{ color: "var(--text-secondary)" }}>{"{{ steps.AI Agent.output }}"}</code>.
              </p>
            </div>
          </div>
        )}

        {/* 7. APPROVAL GATE NODE */}
        {nodeType === "approval_gate" && (
          <div className="space-y-4">
            <div>
              <label style={labelStyle}>Approval Message</label>
              <textarea
                rows={3}
                value={config.approvalGate?.message ?? ""}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "approvalGate", {
                    message: e.target.value,
                  })
                }
                placeholder="Please review and approve this workflow step..."
                style={{ ...textareaStyle, fontFamily: "inherit" }}
                className="placeholder:text-[rgba(235,235,245,0.20)] focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label style={labelStyle}>Required Role</label>
              <select
                value={config.approvalGate?.requiredRole ?? "Owner"}
                onChange={(e) =>
                  onUpdateNodeConfig(id, "approvalGate", {
                    requiredRole: e.target.value as "Owner" | "Editor" | "Viewer",
                  })
                }
                style={selectStyle}
                className="focus:border-[var(--accent)]"
              >
                <option value="Owner">Owner</option>
                <option value="Editor">Editor</option>
                <option value="Viewer">Viewer</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Timeout (Hours)</label>
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
                style={inputStyle}
                className="focus:border-[var(--accent)]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Live Step Execution & Observability Section */}
      {(data.executionStatus || data.liveStepRun) && (
        <div className="space-y-3.5" style={{ borderTop: "1px solid var(--separator-light)", paddingTop: "var(--space-4)" }}>
          <div className="flex items-center justify-between">
            <h3 style={sectionHeaderStyle}>Execution Output</h3>
            {data.executionStatus === "completed" && (
              <span style={{ borderRadius: "var(--radius-sm)", background: "var(--success-dim)", border: "1px solid rgba(48,209,88,0.30)", padding: "2px 8px", fontSize: "10px", fontWeight: 600, color: "var(--success)" }}>
                ✓ Completed
              </span>
            )}
            {data.executionStatus === "running" && (
              <span className="animate-subtle-pulse" style={{ borderRadius: "var(--radius-sm)", background: "var(--accent-dim)", border: "1px solid rgba(10,132,255,0.30)", padding: "2px 8px", fontSize: "10px", fontWeight: 600, color: "var(--accent)" }}>
                ▶ Running...
              </span>
            )}
            {data.executionStatus === "paused" && (
              <span className="animate-subtle-pulse" style={{ borderRadius: "var(--radius-sm)", background: "var(--warning-dim)", border: "1px solid rgba(255,159,10,0.30)", padding: "2px 8px", fontSize: "10px", fontWeight: 600, color: "var(--warning)" }}>
                ⏸ Awaiting Approval
              </span>
            )}
            {data.executionStatus === "failed" && (
              <span style={{ borderRadius: "var(--radius-sm)", background: "var(--destructive-dim)", border: "1px solid rgba(255,69,58,0.30)", padding: "2px 8px", fontSize: "10px", fontWeight: 600, color: "var(--destructive)" }}>
                ✕ Failed
              </span>
            )}
          </div>

          {/* AI Agent Output */}
          {(nodeType === "ai_agent" || nodeType === ("llm_call" as NodeType)) && (
            <>
              {/* Completed / Active Output State */}
              {Boolean(data.liveStepRun?.output || data.liveStepRun?.status === "completed" || data.executionStatus === "completed") && (
                <div className="text-xs space-y-3" style={{
                  borderRadius: "var(--radius-card)",
                  border: "1px solid rgba(10,132,255,0.25)",
                  background: "rgba(10,132,255,0.04)",
                  padding: "14px",
                  boxShadow: "var(--shadow-subtle)",
                }}>
                  {/* Metadata Header */}
                  <div className="grid grid-cols-2 gap-2 text-[11px]" style={{ paddingBottom: "10px", borderBottom: "1px solid var(--separator-light)" }}>
                    <div>
                      <span style={{ display: "block", fontSize: "10px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "var(--text-tertiary)" }}>
                        Model
                      </span>
                      <span className="block truncate" style={{ fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--text-primary)" }}>
                        {String(
                          (data.liveStepRun?.output as Record<string, unknown> | undefined)?.model ||
                            config.aiAgent?.model ||
                            "Gemini"
                        )}
                      </span>
                    </div>
                    <div>
                      <span style={{ display: "block", fontSize: "10px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "var(--text-tertiary)" }}>
                        Status
                      </span>
                      <span className="inline-flex items-center gap-1" style={{ fontWeight: 600, color: "var(--success)" }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--success)" }} />
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
                              <label style={{ fontSize: "var(--text-caption-2)", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "var(--text-secondary)" }}>
                                Response
                              </label>
                              <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
                                ({responseText.length} chars)
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setIsAiOutputExpanded(!isAiOutputExpanded)}
                                title={isAiOutputExpanded ? "Collapse View" : "Expand View"}
                                className="flex items-center gap-1 transition-all cursor-pointer"
                                style={{
                                  borderRadius: "var(--radius-sm)",
                                  border: "1px solid var(--separator-light)",
                                  background: "transparent",
                                  padding: "2px 8px",
                                  fontSize: "10px",
                                  fontWeight: 500,
                                  color: "var(--text-secondary)",
                                }}
                              >
                                {isAiOutputExpanded ? "⤡ Collapse" : "⤢ Expand"}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleCopy(responseText)}
                                className="flex items-center gap-1 transition-all cursor-pointer text-white"
                                style={{
                                  borderRadius: "var(--radius-sm)",
                                  padding: "2px 10px",
                                  fontSize: "10px",
                                  fontWeight: 600,
                                  background: copied ? "var(--success-dim)" : "var(--accent)",
                                  color: copied ? "var(--success)" : "#fff",
                                  border: copied ? "1px solid rgba(48,209,88,0.35)" : "none",
                                }}
                              >
                                {copied ? "✓ Copied" : "📋 Copy"}
                              </button>
                            </div>
                          </div>

                          <div
                            className={`select-text whitespace-pre-wrap break-words ${
                              isAiOutputExpanded
                                ? "max-h-[500px] overflow-y-auto"
                                : "max-h-56 overflow-y-auto"
                            }`}
                            style={{
                              borderRadius: "var(--radius-input)",
                              border: "1px solid var(--separator-light)",
                              background: "rgba(0,0,0,0.5)",
                              padding: "12px",
                              fontSize: "var(--text-caption)",
                              color: "var(--text-primary)",
                              lineHeight: 1.6,
                            }}
                          >
                            {responseText}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Token & Finish Reason Footer */}
                  <div className="flex items-center justify-between" style={{
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-tertiary)",
                    paddingTop: "8px",
                    borderTop: "1px solid var(--separator-light)",
                  }}>
                    {Boolean(
                      (data.liveStepRun?.output as Record<string, unknown> | undefined)?.tokensUsed
                    ) ? (
                      <span>
                        Tokens:{" "}
                        <span style={{ color: "var(--text-secondary)" }}>
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
                        <span style={{ color: "var(--text-secondary)" }}>
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
                <div className="text-xs space-y-2.5" style={{
                  borderRadius: "var(--radius-card)",
                  border: "1px solid rgba(255,69,58,0.25)",
                  background: "var(--destructive-dim)",
                  padding: "14px",
                  boxShadow: "var(--shadow-subtle)",
                }}>
                  <div className="grid grid-cols-2 gap-2 text-[11px]" style={{ paddingBottom: "8px", borderBottom: "1px solid rgba(255,69,58,0.20)" }}>
                    <div>
                      <span style={{ display: "block", fontSize: "10px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "var(--text-tertiary)" }}>
                        Model
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--text-secondary)" }}>
                        {config.aiAgent?.model || "Gemini"}
                      </span>
                    </div>
                    <div>
                      <span style={{ display: "block", fontSize: "10px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "var(--text-tertiary)" }}>
                        Status
                      </span>
                      <span className="inline-flex items-center gap-1" style={{ fontWeight: 600, color: "var(--destructive)" }}>
                        ✕ Failed
                      </span>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "var(--destructive)", marginBottom: "4px" }}>
                      Error
                    </label>
                    <div className="select-text whitespace-pre-wrap break-words max-h-48 overflow-y-auto" style={{
                      borderRadius: "var(--radius-input)",
                      border: "1px solid rgba(255,69,58,0.25)",
                      background: "rgba(0,0,0,0.4)",
                      padding: "10px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-caption-2)",
                      color: "#FF6961",
                      lineHeight: 1.5,
                    }}>
                      {data.executionError || data.liveStepRun?.error || "AI Agent execution failed."}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* HTTP Request Output */}
          {nodeType === "http_request" && data.liveStepRun?.output && (
            <div className="space-y-2 text-xs" style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--separator-light)",
              background: "rgba(255,255,255,0.02)",
              padding: "12px",
            }}>
              <div className="flex items-center justify-between text-[11px]">
                <span style={{ fontWeight: 600, color: "var(--success)" }}>
                  HTTP {String(data.liveStepRun.output.status || 200)} {String(data.liveStepRun.output.statusText || "OK")}
                </span>
                {typeof data.liveStepRun.output.durationMs === "number" && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)" }}>
                    {data.liveStepRun.output.durationMs}ms
                  </span>
                )}
              </div>
              <div>
                <label style={{ display: "block", fontSize: "var(--text-caption-2)", fontWeight: 500, color: "var(--text-tertiary)", marginBottom: "4px" }}>Response Data:</label>
                <pre className="whitespace-pre-wrap max-h-40 overflow-y-auto" style={{
                  borderRadius: "var(--radius-input)",
                  border: "1px solid var(--separator-light)",
                  background: "rgba(0,0,0,0.3)",
                  padding: "10px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "var(--accent)",
                }}>
                  {JSON.stringify(data.liveStepRun.output.data || data.liveStepRun.output, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Database Output */}
          {nodeType === "database" && data.liveStepRun?.output && (
            <div className="space-y-2 text-xs" style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--separator-light)",
              background: "rgba(255,255,255,0.02)",
              padding: "12px",
            }}>
              <div className="flex items-center justify-between text-[11px]">
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--text-secondary)" }}>
                  {String(data.liveStepRun.output.operation || "DB")} • {String(data.liveStepRun.output.table || config.database?.tableName || "table")}
                </span>
                <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--success)" }}>
                  {String(data.liveStepRun.output.rowCount ?? data.liveStepRun.output.affected_rows ?? 1)} row(s)
                </span>
              </div>
              {Boolean(data.liveStepRun.output.rows) && (
                <div>
                  <label style={{ display: "block", fontSize: "var(--text-caption-2)", fontWeight: 500, color: "var(--text-tertiary)", marginBottom: "4px" }}>Result Rows:</label>
                  <pre className="whitespace-pre-wrap max-h-36 overflow-y-auto" style={{
                    borderRadius: "var(--radius-input)",
                    border: "1px solid var(--separator-light)",
                    background: "rgba(0,0,0,0.3)",
                    padding: "10px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    color: "var(--text-secondary)",
                  }}>
                    {JSON.stringify(data.liveStepRun.output.rows, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Condition Output */}
          {nodeType === "condition" && data.liveStepRun?.output && (
            <div className="text-xs" style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--separator-light)",
              background: "rgba(255,255,255,0.02)",
              padding: "12px",
            }}>
              <div className="flex items-center justify-between">
                <span style={{ color: "var(--text-tertiary)" }}>Evaluated Branch:</span>
                <span style={{ fontWeight: 600, color: "var(--success)" }}>
                  {data.liveStepRun.output.evaluatedValue === true || data.liveStepRun.output.result === true || data.liveStepRun.output.selectedBranch === "true"
                    ? "✓ TRUE"
                    : "✕ FALSE"}
                </span>
              </div>
            </div>
          )}

          {/* Notify Output */}
          {nodeType === "notify" && data.liveStepRun?.output && (
            <div className="space-y-1.5 text-xs" style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--separator-light)",
              background: "rgba(255,255,255,0.02)",
              padding: "12px",
            }}>
              <div className="flex items-center justify-between text-[11px]">
                <span style={{ color: "var(--text-tertiary)" }}>Channel:</span>
                <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>{String(data.liveStepRun.output.channel || config.notify?.channel || "Webhook")}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span style={{ color: "var(--text-tertiary)" }}>Delivery ID:</span>
                <span className="truncate max-w-[140px]" style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)" }}>{String(data.liveStepRun.output.messageId || "confirmed")}</span>
              </div>
            </div>
          )}

          {/* Approval Gate Output */}
          {nodeType === "approval_gate" && (
            <div className="space-y-3 text-xs" style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid rgba(255,159,10,0.20)",
              background: "rgba(255,159,10,0.04)",
              padding: "12px",
            }}>
              {data.executionStatus === "paused" ? (
                <div className="space-y-2">
                  <p style={{ fontSize: "var(--text-caption-2)", fontWeight: 500, color: "var(--warning)" }}>
                    ⏸ Workflow is paused at this step. Downstream steps have not executed.
                  </p>
                  {(data.userRole === "owner" || data.userRole === "editor") ? (
                    <button
                      type="button"
                      onClick={() => onApproveStep?.(data.stepId, data.liveStepRun?.id)}
                      className="w-full flex items-center justify-center gap-1.5 text-white transition-all cursor-pointer"
                      style={{
                        borderRadius: "var(--radius-button)",
                        background: "var(--success)",
                        padding: "8px",
                        fontSize: "var(--text-caption)",
                        fontWeight: 700,
                        boxShadow: "var(--shadow-subtle)",
                      }}
                    >
                      Approve & Continue ✓
                    </button>
                  ) : (
                    <div style={{
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid rgba(255,159,10,0.25)",
                      background: "var(--warning-dim)",
                      padding: "8px",
                      fontSize: "10px",
                      color: "var(--warning)",
                    }}>
                      🛡️ Approval requires organization Owner or Editor privileges.
                    </div>
                  )}
                </div>
              ) : data.liveStepRun?.approved_by ? (
                <div className="space-y-1 text-[11px]">
                  <div style={{ fontWeight: 500, color: "var(--success)" }}>✓ Step Approved</div>
                  <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
                    By: {data.liveStepRun.approved_by}
                  </div>
                  {data.liveStepRun.approved_at && (
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
                      At: {new Date(data.liveStepRun.approved_at).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* Execution Error (if failed) */}
          {(data.executionError || (data.executionStatus === "failed" && data.liveStepRun?.error)) && (
            <div style={{
              borderRadius: "var(--radius-button)",
              border: "1px solid rgba(255,69,58,0.25)",
              background: "var(--destructive-dim)",
              padding: "10px",
              fontSize: "var(--text-caption)",
              color: "var(--destructive)",
            }}>
              <span style={{ fontWeight: 600, display: "block", marginBottom: "2px" }}>Error:</span>
              <span className="break-words" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-caption-2)" }}>{data.executionError || data.liveStepRun?.error}</span>
            </div>
          )}
        </div>
      )}

      {/* Delete Node Action */}
      <div className="mt-auto" style={{ borderTop: "1px solid var(--separator-light)", paddingTop: "var(--space-4)" }}>
        <button
          onClick={() => { if (!data.locked) onDeleteNode(id); }}
          disabled={Boolean(data.locked)}
          title={data.locked ? "Unlock the node first to delete it" : "Delete this node"}
          className="w-full flex items-center justify-center gap-2 transition-all"
          style={{
            borderRadius: "var(--radius-button)",
            border: data.locked ? "1px solid var(--separator-light)" : "1px solid rgba(255,69,58,0.25)",
            background: data.locked ? "transparent" : "var(--destructive-dim)",
            padding: "10px 16px",
            fontSize: "var(--text-footnote)",
            fontWeight: 500,
            color: data.locked ? "var(--text-tertiary)" : "var(--destructive)",
            cursor: data.locked ? "not-allowed" : "pointer",
            opacity: data.locked ? 0.5 : 1,
          }}
        >
          {data.locked ? "🔒 Locked — Cannot Delete" : "🗑️ Delete Node"}
        </button>
        {!data.locked && (
          <p style={{ marginTop: "6px", textAlign: "center" as const, fontSize: "10px", color: "var(--text-tertiary)" }}>
            Or press Delete / Backspace key
          </p>
        )}
      </div>
    </aside>
  );
}
