"use client";

import { Handle, Position, type NodeProps, type Node, NodeToolbar } from "@xyflow/react";
import type { WorkflowNodeData } from "@/types/workflow";

// Readable label map
const NODE_TYPE_LABELS: Record<string, string> = {
  ai_agent:      "AI Agent",
  http_request:  "HTTP Request",
  database:      "Database",
  condition:     "Condition",
  notify:        "Notify",
  approval_gate: "Approval Gate",
  trigger:       "Trigger",
};

export function WorkflowNode({
  id,
  data,
  selected,
}: NodeProps<Node<WorkflowNodeData>>) {
  const isCondition = data.nodeType === "condition";
  const isTrigger   = data.nodeType === "trigger";
  const status      = data.executionStatus;
  const isLocked    = Boolean(data.locked);
  const typeLabel   = NODE_TYPE_LABELS[data.nodeType] ?? "Node";

  /* ── Border / ring — Apple-style subtle indicators ───────────────── */
  const cardBorderColor = (() => {
    if (status === "running")   return "var(--accent)";
    if (status === "completed") return "var(--success)";
    if (status === "failed")    return "var(--destructive)";
    if (status === "paused")    return "var(--warning)";
    if (status === "skipped")   return "transparent";
    if (status === "queued")    return "rgba(10,132,255,0.25)";
    if (selected)               return "var(--accent)";
    if (isLocked)               return "rgba(255,159,10,0.25)";
    return "var(--separator-light)";
  })();

  const cardBoxShadow = (() => {
    if (status === "running") return "0 0 0 1px rgba(10,132,255,0.25)";
    if (status === "failed")  return "0 0 0 1px rgba(255,69,58,0.25)";
    if (status === "paused")  return "0 0 0 1px rgba(255,159,10,0.20)";
    if (selected)             return "0 0 0 2px rgba(10,132,255,0.20)";
    return "var(--shadow-subtle)";
  })();

  const cardOpacity = status === "skipped" ? 0.5 : 1;

  /* ── Status badge ─────────────────────────────────────────────────── */
  const renderStatusBadge = () => {
    if (!status) return null;

    const badgeBase: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      borderRadius: "var(--radius-sm)",
      padding: "2px 8px",
      fontSize: "var(--text-caption-2)",
      fontWeight: 500,
    };

    if (status === "running") return (
      <span style={{ ...badgeBase, background: "var(--accent-dim)", color: "var(--accent)" }}>
        <span className="h-1.5 w-1.5 rounded-full animate-subtle-pulse" style={{ background: "var(--accent)" }} />
        Running
      </span>
    );

    if (status === "completed" && isCondition) {
      const isTrue =
        data.liveStepRun?.output?.evaluatedValue === true ||
        data.liveStepRun?.output?.result === true ||
        data.liveStepRun?.output?.selectedBranch === "true" ||
        data.liveStepRun?.output?.branch === "true";
      return (
        <span style={{
          ...badgeBase,
          background: isTrue ? "var(--success-dim)" : "var(--destructive-dim)",
          color: isTrue ? "var(--success)" : "var(--destructive)",
          fontWeight: 600,
        }}>
          {isTrue ? "→ TRUE" : "→ FALSE"}
        </span>
      );
    }

    if (status === "completed") return (
      <span style={{ ...badgeBase, background: "var(--success-dim)", color: "var(--success)" }}>
        ✓ Done
      </span>
    );

    if (status === "failed") return (
      <span title={data.executionError || "Step failed"} style={{ ...badgeBase, background: "var(--destructive-dim)", color: "var(--destructive)" }} className="truncate max-w-[160px]">
        ✕ Failed
      </span>
    );

    if (status === "paused") return (
      <div className="flex items-center justify-between gap-2 w-full">
        <span style={{ ...badgeBase, background: "var(--warning-dim)", color: "var(--warning)" }}>
          ⏸ Waiting
        </span>
        {(data.userRole === "owner" || data.userRole === "editor") && data.onApprove && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); data.onApprove?.(data.stepId, data.liveStepRun?.id); }}
            className="flex items-center gap-1 text-white transition-all cursor-pointer"
            style={{
              borderRadius: "var(--radius-sm)",
              background: "var(--success)",
              padding: "2px 10px",
              fontSize: "var(--text-caption-2)",
              fontWeight: 600,
            }}
          >
            Approve
          </button>
        )}
      </div>
    );

    if (status === "queued") return (
      <span style={{ ...badgeBase, background: "rgba(255,255,255,0.04)", color: "var(--text-tertiary)" }}>
        ⏱ Queued
      </span>
    );

    if (status === "skipped") return (
      <span style={{ ...badgeBase, background: "rgba(255,255,255,0.03)", color: "var(--text-tertiary)", textDecoration: "line-through" }}>
        Skipped
      </span>
    );

    return null;
  };

  return (
    <>
      {/* ── Contextual Toolbar ─────────────────────────────────────── */}
      <NodeToolbar
        isVisible={selected}
        position={Position.Top}
        align="center"
        offset={10}
      >
        <div
          className="flex items-center gap-1 select-none whitespace-nowrap"
          style={{
            borderRadius: "var(--radius-card)",
            borderWidth: "1px",
            borderStyle: "solid",
            borderColor: "var(--separator)",
            background: "rgba(28,28,30,0.94)",
            backdropFilter: "blur(16px)",
            padding: "4px 6px",
            boxShadow: "var(--shadow-elevated)",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            title={isLocked ? "Unlock node (allows dragging)" : "Lock node (prevents dragging & deletion)"}
            onClick={(e) => { e.stopPropagation(); data.onLockToggle?.(id); }}
            className="flex items-center gap-1 cursor-pointer transition-all"
            style={{
              height: "28px",
              padding: "0 8px",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--text-caption-2)",
              fontWeight: 500,
              background: isLocked ? "var(--warning-dim)" : "transparent",
              color: isLocked ? "var(--warning)" : "var(--text-secondary)",
              borderWidth: "1px",
              borderStyle: "solid",
              borderColor: isLocked ? "rgba(255,159,10,0.30)" : "transparent",
            }}
          >
            {isLocked ? (
              <>
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                <span>Unlock</span>
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" /></svg>
                <span>Lock</span>
              </>
            )}
          </button>

          <div style={{ width: "1px", height: "16px", background: "var(--separator-light)", margin: "0 2px" }} />

          <button
            type="button"
            title={isLocked ? "Node is locked — unlock first to delete" : "Delete node"}
            onClick={(e) => { e.stopPropagation(); if (!isLocked) data.onDeleteNode?.(id); }}
            disabled={isLocked}
            className="flex items-center gap-1 transition-all"
            style={{
              height: "28px",
              padding: "0 8px",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--text-caption-2)",
              fontWeight: 500,
              color: isLocked ? "var(--text-tertiary)" : "var(--text-secondary)",
              cursor: isLocked ? "not-allowed" : "pointer",
              opacity: isLocked ? 0.5 : 1,
            }}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Delete</span>
          </button>
        </div>
      </NodeToolbar>

      {/* ── Target Handle ─────────────────────────────────────────── */}
      {!isTrigger && (
        <Handle
          type="target"
          id="target"
          position={Position.Left}
          className="!h-2.5 !w-2.5 !border-2 !bg-[var(--accent)] transition-transform hover:scale-125"
          style={{ borderColor: "var(--bg-secondary)" }}
        />
      )}

      {/* ── Node Card ─────────────────────────────────────────────── */}
      <div
        className="relative min-w-[200px] max-w-[270px] transition-all"
        style={{
          borderRadius: "var(--radius-card)",
          borderWidth: "1px",
          borderStyle: "solid",
          borderColor: cardBorderColor,
          background: "var(--bg-secondary)",
          boxShadow: cardBoxShadow,
          opacity: cardOpacity,
          transitionDuration: "150ms",
        }}
      >
        <div className="flex flex-col gap-2" style={{ padding: "14px" }}>

          {/* Header row */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center text-lg transition-all"
                 style={{
                   borderRadius: "var(--radius-button)",
                   background: selected ? "var(--accent-dim)" : "rgba(255,255,255,0.04)",
                 }}>
              {data.icon}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate" style={{ fontSize: "var(--text-footnote)", fontWeight: 600, lineHeight: 1.3, color: "var(--text-primary)" }}>
                {data.label}
              </p>
              <p style={{ fontSize: "var(--text-caption-2)", color: "var(--text-tertiary)", lineHeight: 1, marginTop: "2px" }}>{typeLabel}</p>
            </div>

            {/* Lock indicator — small, subtle */}
            {isLocked && (
              <span className="shrink-0 flex items-center gap-1" style={{
                borderRadius: "var(--radius-sm)",
                background: "var(--warning-dim)",
                padding: "2px 6px",
                fontSize: "10px",
                fontWeight: 500,
                color: "var(--warning)",
              }}>
                <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
              </span>
            )}
          </div>

          {/* Status row */}
          {status && (
            <div className="flex items-center justify-between gap-2" style={{ borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: "var(--separator-light)", paddingTop: "8px" }}>
              {renderStatusBadge()}
              {data.liveStepRun?.attempt_count && data.liveStepRun.attempt_count > 1 && (
                <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }} className="ml-auto shrink-0">
                  ×{data.liveStepRun.attempt_count}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Source Handles ─────────────────────────────────────────── */}
      {isCondition ? (
        <>
          <div className="absolute right-0 top-[30%] flex items-center translate-x-full pr-1">
            <Handle
              type="source"
              id="true"
              position={Position.Right}
              className="!h-2.5 !w-2.5 !border-2 transition-transform hover:scale-125"
              style={{ borderColor: "var(--bg-secondary)", background: "var(--success)" }}
            />
          </div>
          <div className="absolute right-0 top-[70%] flex items-center translate-x-full pr-1">
            <Handle
              type="source"
              id="false"
              position={Position.Right}
              className="!h-2.5 !w-2.5 !border-2 transition-transform hover:scale-125"
              style={{ borderColor: "var(--bg-secondary)", background: "var(--destructive)" }}
            />
          </div>
        </>
      ) : (
        <Handle
          type="source"
          id="source"
          position={Position.Right}
          className="!h-2.5 !w-2.5 !border-2 !bg-[var(--accent)] transition-transform hover:scale-125"
          style={{ borderColor: "var(--bg-secondary)" }}
        />
      )}
    </>
  );
}
