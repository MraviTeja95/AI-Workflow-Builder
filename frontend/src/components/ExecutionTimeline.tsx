"use client";

import React, { useMemo } from "react";
import type { Node, Edge } from "@xyflow/react";
import type { WorkflowNodeData, StepRun, NodeType } from "@/types/workflow";
import { getTopologicallySortedNodes } from "@/lib/graphOrder";

interface ExecutionTimelineProps {
  nodes: Node<WorkflowNodeData>[];
  edges?: Edge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onApproveStep?: (stepId?: string, stepRunId?: string) => void;
  userRole?: string | null;
  isRunning: boolean;
  workflowStatus: "idle" | "running" | "paused" | "completed" | "failed";
  activeRunId: string | null;
}

export function ExecutionTimeline({
  nodes,
  edges = [],
  selectedNodeId,
  onSelectNode,
  onApproveStep,
  userRole,
  isRunning,
  workflowStatus,
}: ExecutionTimelineProps) {
  const orderedNodes = useMemo(
    () => (nodes && nodes.length > 0 ? getTopologicallySortedNodes(nodes, edges) : []),
    [nodes, edges]
  );

  // If there are no nodes, do not render timeline
  if (!nodes || nodes.length === 0 || orderedNodes.length === 0) return null;

  const totalSteps = orderedNodes.length;
  const completedSteps = orderedNodes.filter(
    (n) => n.data.executionStatus === "completed" || n.data.executionStatus === "skipped"
  ).length;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const isOwnerOrEditor =
    userRole?.toLowerCase() === "owner" || userRole?.toLowerCase() === "editor";

  const getStepSummary = (node: Node<WorkflowNodeData>, stepRun?: StepRun): string | null => {
    if (node.data.nodeType === "trigger") {
      const ch = (node.data.config?.trigger?.triggerType as string) || "Manual";
      return `${ch} Trigger`;
    }
    if (!stepRun?.output) return null;
    const type: NodeType = node.data.nodeType;
    const out = stepRun.output;

    switch (type) {
      case "ai_agent": {
        const text =
          out.content ?? out.text ?? out.response ??
          (typeof out === "string" ? out : null);
        if (typeof text === "string") return text.length > 40 ? `${text.slice(0, 40)}…` : text;
        return "AI generated";
      }
      case "http_request": {
        const s = out.status || 200;
        const m = (stepRun.input?.method as string) || "HTTP";
        return `${m} → ${s}`;
      }
      case "database": {
        const op = out.operation || "DB";
        const rows = out.rowCount ?? out.affected_rows ?? 1;
        return `${op} → ${rows} row(s)`;
      }
      case "condition": {
        const val = out.evaluatedValue ?? out.result ?? out.selectedBranch;
        return `Branch → ${val === true || val === "true" ? "TRUE" : "FALSE"}`;
      }
      case "notify": {
        const ch = out.channel || "Email";
        return `${ch} delivered`;
      }
      case "approval_gate":
        return stepRun.status === "completed"
          ? "Approved"
          : "Awaiting approval";
      default:
        return null;
    }
  };

  const renderStepStatusPill = (status?: string, isCondition?: boolean, liveStepRun?: StepRun) => {
    const pillBase: React.CSSProperties = {
      fontSize: "10px",
      fontWeight: 600,
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
    };

    if (status === "running") {
      return (
        <span style={{ ...pillBase, color: "var(--accent)" }}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "var(--accent)" }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "var(--accent)" }} />
          </span>
          Running
        </span>
      );
    }
    if (status === "completed") {
      if (isCondition) {
        const isTrue =
          liveStepRun?.output?.evaluatedValue === true ||
          liveStepRun?.output?.result === true ||
          liveStepRun?.output?.selectedBranch === "true" ||
          liveStepRun?.output?.branch === "true";
        return (
          <span style={{ ...pillBase, fontWeight: 700, color: isTrue ? "var(--success)" : "var(--destructive)" }}>
            {isTrue ? "✓ TRUE" : "✓ FALSE"}
          </span>
        );
      }
      return <span style={{ ...pillBase, color: "var(--success)" }}>✓ Done</span>;
    }
    if (status === "paused") {
      return <span style={{ ...pillBase, color: "var(--warning)" }}>⏸ Waiting</span>;
    }
    if (status === "failed") {
      return <span style={{ ...pillBase, color: "var(--destructive)" }}>✕ Failed</span>;
    }
    if (status === "skipped") {
      return <span style={{ ...pillBase, color: "var(--text-tertiary)", textDecoration: "line-through" }}>Skipped</span>;
    }
    return <span style={{ ...pillBase, color: "var(--text-tertiary)" }}>○ Pending</span>;
  };

  // Workflow status pill style
  const statusPill = (label: string, color: string, dimColor: string, pulseDot?: boolean) => (
    <span className="flex items-center gap-1.5" style={{
      borderRadius: "99px",
      background: dimColor,
      border: `1px solid ${color}25`,
      padding: "2px 10px",
      fontSize: "10px",
      fontWeight: 500,
      color,
    }}>
      {pulseDot && <span className="h-1.5 w-1.5 rounded-full animate-ping" style={{ background: color }} />}
      {label}
    </span>
  );

  return (
    <div className="w-full shrink-0 select-none" style={{
      borderTop: "1px solid var(--separator-light)",
      background: "var(--bg-secondary)",
      padding: "10px 20px",
    }}>
      {/* Execution Status Header Row */}
      <div className="flex items-center justify-between" style={{ marginBottom: "6px" }}>
        <div className="flex items-center gap-3">
          <span style={{
            fontSize: "10px",
            fontWeight: 600,
            textTransform: "uppercase" as const,
            letterSpacing: "0.06em",
            color: "var(--text-secondary)",
          }}>
            Execution
          </span>
          <span style={{ fontSize: "var(--text-caption-2)", fontFamily: "var(--font-mono)", color: "var(--text-primary)", fontWeight: 500 }}>
            {completedSteps} / {totalSteps}
          </span>
          <span style={{ fontSize: "var(--text-caption-2)", fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 600 }}>
            {progressPercent}%
          </span>
          {workflowStatus === "running" && statusPill("Executing", "var(--accent)", "var(--accent-dim)", true)}
          {workflowStatus === "paused" && statusPill("⏸ Paused", "var(--warning)", "var(--warning-dim)")}
          {workflowStatus === "completed" && statusPill("✓ Completed", "var(--success)", "var(--success-dim)")}
          {workflowStatus === "failed" && statusPill("✕ Failed", "var(--destructive)", "var(--destructive-dim)")}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full overflow-hidden" style={{
        height: "3px",
        background: "rgba(255,255,255,0.06)",
        borderRadius: "99px",
        marginBottom: "10px",
      }}>
        <div
          className="h-full transition-all"
          style={{
            width: `${progressPercent}%`,
            background: "var(--accent)",
            borderRadius: "99px",
            transitionDuration: "300ms",
            transitionTimingFunction: "ease-out",
          }}
        />
      </div>

      {/* Horizontal step sequence */}
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        {orderedNodes.map((node, index) => {
          const stepRun = node.data.liveStepRun;
          const status = node.data.executionStatus;
          const isSelected = selectedNodeId === node.id;
          const summary = getStepSummary(node, stepRun);
          const isPaused = status === "paused";
          const isCondition = node.data.nodeType === "condition";

          const cardBorder = isSelected
            ? "var(--accent)"
            : isPaused
            ? "var(--warning)"
            : status === "completed"
            ? "rgba(48,209,88,0.25)"
            : status === "running"
            ? "rgba(10,132,255,0.35)"
            : status === "failed"
            ? "rgba(255,69,58,0.25)"
            : "var(--separator-light)";

          const cardBg = isSelected
            ? "var(--accent-dim)"
            : isPaused
            ? "var(--warning-dim)"
            : status === "completed"
            ? "var(--success-dim)"
            : status === "running"
            ? "var(--accent-dim)"
            : status === "failed"
            ? "var(--destructive-dim)"
            : "rgba(255,255,255,0.02)";

          return (
            <React.Fragment key={node.id}>
              {index > 0 && (
                <div className="shrink-0" style={{ width: "12px", height: "1px", background: "var(--separator-light)" }} />
              )}

              <div
                onClick={() => onSelectNode(node.id)}
                className="group shrink-0 cursor-pointer transition-all"
                style={{
                  borderRadius: "var(--radius-button)",
                  border: `1px solid ${cardBorder}`,
                  background: cardBg,
                  padding: "8px 12px",
                  minWidth: "145px",
                  maxWidth: "190px",
                  opacity: !status && !isSelected ? 0.6 : 1,
                  transitionDuration: "150ms",
                }}
              >
                {/* Header: icon + name + status pill */}
                <div className="flex items-center justify-between gap-1.5" style={{ marginBottom: "4px" }}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="shrink-0 leading-none" style={{ fontSize: "var(--text-caption)" }}>{node.data.icon}</span>
                    <span className="truncate" style={{ fontSize: "var(--text-caption-2)", fontWeight: 500, color: "var(--text-primary)" }}>
                      {node.data.label}
                    </span>
                  </div>
                  <div className="shrink-0">
                    {renderStepStatusPill(status, isCondition, stepRun)}
                  </div>
                </div>

                {/* Summary / Result preview */}
                {summary && (
                  <p className="truncate" style={{
                    fontSize: "10px",
                    color: "var(--text-tertiary)",
                    fontFamily: "var(--font-mono)",
                    marginTop: "2px",
                  }}>
                    {summary}
                  </p>
                )}

                {/* Inline approval action when paused */}
                {isPaused && (
                  <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: "1px solid rgba(255,159,10,0.20)" }}>
                    {isOwnerOrEditor ? (
                      <button
                        type="button"
                        disabled={isRunning}
                        onClick={(e) => {
                          e.stopPropagation();
                          onApproveStep?.(node.data.stepId, stepRun?.id);
                        }}
                        className="w-full flex items-center justify-center gap-1 text-white transition-all cursor-pointer disabled:opacity-50"
                        style={{
                          borderRadius: "var(--radius-sm)",
                          background: "var(--success)",
                          padding: "3px 0",
                          fontSize: "10px",
                          fontWeight: 700,
                        }}
                      >
                        Approve & Continue
                      </button>
                    ) : (
                      <span style={{ fontSize: "9px", color: "rgba(255,159,10,0.50)", display: "block", textAlign: "center" as const }}>
                        Requires Owner / Editor
                      </span>
                    )}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
