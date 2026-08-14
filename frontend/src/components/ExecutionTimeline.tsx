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
    if (status === "running") {
      return (
        <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
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
          <span className={`text-[10px] font-bold ${isTrue ? "text-emerald-400" : "text-rose-400"}`}>
            {isTrue ? "✓ TRUE" : "✓ FALSE"}
          </span>
        );
      }
      return <span className="text-[10px] font-semibold text-emerald-400">✓ Done</span>;
    }
    if (status === "paused") {
      return <span className="text-[10px] font-semibold text-amber-300">⏸ Waiting</span>;
    }
    if (status === "failed") {
      return <span className="text-[10px] font-semibold text-rose-400">✕ Failed</span>;
    }
    if (status === "skipped") {
      return <span className="text-[10px] text-zinc-600 line-through">Skipped</span>;
    }
    return <span className="text-[10px] text-zinc-500 font-medium">○ Pending</span>;
  };

  return (
    <div className="w-full border-t border-white/[0.06] bg-[#0c0c0e] px-5 py-2.5 shrink-0 select-none">
      {/* Execution Status Header Row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
            Execution
          </span>
          <span className="text-[11px] font-mono text-zinc-300 font-medium">
            {completedSteps} / {totalSteps}
          </span>
          <span className="text-[11px] font-mono text-blue-400 font-semibold">
            {progressPercent}%
          </span>
          {workflowStatus === "running" && (
            <span className="flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-400">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-ping" />
              Executing
            </span>
          )}
          {workflowStatus === "paused" && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300">
              ⏸ Paused
            </span>
          )}
          {workflowStatus === "completed" && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
              ✓ Completed
            </span>
          )}
          {workflowStatus === "failed" && (
            <span className="flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-[10px] font-medium text-rose-400">
              ✕ Failed
            </span>
          )}
        </div>
      </div>

      {/* Thin live progress bar */}
      <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden mb-2.5">
        <div
          className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-300 ease-out rounded-full"
          style={{ width: `${progressPercent}%` }}
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

          const cardClass = isSelected
            ? "border-blue-500/60 bg-blue-500/8 ring-1 ring-blue-500/20"
            : isPaused
            ? "border-amber-500/40 bg-amber-500/6 ring-1 ring-amber-500/20"
            : status === "completed"
            ? "border-emerald-500/25 bg-emerald-500/[0.03] hover:border-emerald-500/40"
            : status === "running"
            ? "border-blue-500/40 bg-blue-500/6"
            : status === "failed"
            ? "border-rose-500/30 bg-rose-500/4"
            : "border-white/[0.06] bg-white/[0.015] opacity-60 hover:opacity-90 hover:border-white/12";

          return (
            <React.Fragment key={node.id}>
              {index > 0 && (
                <div className="h-px w-3 shrink-0 bg-white/10" />
              )}

              <div
                onClick={() => onSelectNode(node.id)}
                className={`group shrink-0 cursor-pointer rounded-xl border px-3 py-2 transition-all duration-150 min-w-[145px] max-w-[190px] ${cardClass}`}
              >
                {/* Header: icon + name + status pill */}
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs shrink-0 leading-none">{node.data.icon}</span>
                    <span className="text-[11px] font-medium text-white truncate">
                      {node.data.label}
                    </span>
                  </div>
                  <div className="shrink-0">
                    {renderStepStatusPill(status, isCondition, stepRun)}
                  </div>
                </div>

                {/* Summary / Result preview */}
                {summary && (
                  <p className="text-[10px] text-zinc-400 truncate font-mono mt-0.5">
                    {summary}
                  </p>
                )}

                {/* Inline approval action when paused */}
                {isPaused && (
                  <div className="mt-1.5 pt-1 border-t border-amber-500/20">
                    {isOwnerOrEditor ? (
                      <button
                        type="button"
                        disabled={isRunning}
                        onClick={(e) => {
                          e.stopPropagation();
                          onApproveStep?.(node.data.stepId, stepRun?.id);
                        }}
                        className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 py-0.5 text-[10px] font-bold text-white transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1"
                      >
                        Approve & Continue
                      </button>
                    ) : (
                      <span className="text-[9px] text-amber-400/60 block text-center">
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
