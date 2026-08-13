"use client";

import React from "react";
import type { Node } from "@xyflow/react";
import type { WorkflowNodeData, StepRun, NodeType } from "@/types/workflow";

interface ExecutionTimelineProps {
  nodes: Node<WorkflowNodeData>[];
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
  selectedNodeId,
  onSelectNode,
  onApproveStep,
  userRole,
  isRunning,
  workflowStatus,
  activeRunId,
}: ExecutionTimelineProps) {
  if (!activeRunId && workflowStatus === "idle") {
    return null;
  }

  const isOwnerOrEditor =
    userRole?.toLowerCase() === "owner" || userRole?.toLowerCase() === "editor";

  const getStepSummary = (node: Node<WorkflowNodeData>, stepRun?: StepRun) => {
    if (!stepRun || !stepRun.output) return null;
    const type: NodeType = node.data.nodeType;

    switch (type) {
      case "ai_agent": {
        const text =
          stepRun.output.content ||
          stepRun.output.text ||
          stepRun.output.response ||
          (typeof stepRun.output === "string" ? stepRun.output : null);
        if (typeof text === "string") {
          return text.length > 60 ? `${text.slice(0, 60)}...` : text;
        }
        return "AI response generated";
      }
      case "http_request": {
        const status = stepRun.output.status || 200;
        const method = (stepRun.input?.method as string) || "HTTP";
        return `${method} -> ${status} OK`;
      }
      case "database": {
        const op = stepRun.output.operation || "DB";
        const rows = stepRun.output.rowCount ?? stepRun.output.affected_rows ?? 1;
        return `${op} -> ${rows} row(s) affected`;
      }
      case "condition": {
        const val =
          stepRun.output.evaluatedValue ??
          stepRun.output.result ??
          stepRun.output.selectedBranch;
        return `Evaluated -> Branch ${val === true || val === "true" ? "TRUE" : "FALSE"}`;
      }
      case "notify": {
        const channel = stepRun.output.channel || "Webhook";
        const msgId = stepRun.output.messageId || "sent";
        return `${channel} delivered (${msgId})`;
      }
      case "approval_gate": {
        if (stepRun.status === "completed") {
          return `Approved by ${stepRun.approved_by ? stepRun.approved_by.slice(0, 8) + "..." : "Authorized User"}`;
        }
        return "Waiting for manager review";
      }
      default:
        return null;
    }
  };

  return (
    <div className="w-full border-t border-white/10 bg-[#0e0e0e]/95 backdrop-blur-md px-5 py-3 transition-all">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Execution Timeline
          </span>

          {workflowStatus === "running" && (
            <span className="flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 text-[11px] font-medium text-blue-400">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-ping" />
              Running Steps...
            </span>
          )}

          {workflowStatus === "paused" && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[11px] font-medium text-amber-300 animate-pulse">
              ⏸ Paused at Approval Gate
            </span>
          )}

          {workflowStatus === "completed" && (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
              ✓ Completed Successfully
            </span>
          )}

          {workflowStatus === "failed" && (
            <span className="flex items-center gap-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 text-[11px] font-medium text-rose-400">
              ✕ Execution Failed
            </span>
          )}
        </div>

        {activeRunId && (
          <span className="text-[11px] font-mono text-zinc-500 truncate max-w-[240px]">
            Run ID: {activeRunId}
          </span>
        )}
      </div>

      {/* Horizontal Step Sequence */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-thin">
        {nodes.map((node, index) => {
          const stepRun = node.data.liveStepRun;
          const status = node.data.executionStatus;
          const isSelected = selectedNodeId === node.id;
          const summary = getStepSummary(node, stepRun);
          const isPaused = status === "paused";

          return (
            <React.Fragment key={node.id}>
              {index > 0 && (
                <div className="h-[1px] w-4 shrink-0 bg-white/10" />
              )}

              <div
                onClick={() => onSelectNode(node.id)}
                className={`group shrink-0 cursor-pointer rounded-xl border p-2.5 transition-all min-w-[170px] max-w-[220px] ${
                  isSelected
                    ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/50 shadow-md"
                    : isPaused
                    ? "border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-500/30 animate-pulse"
                    : status === "completed"
                    ? "border-emerald-500/30 bg-white/[0.02] hover:border-emerald-500/60"
                    : status === "failed"
                    ? "border-rose-500/30 bg-rose-500/5 hover:border-rose-500/60"
                    : status === "running"
                    ? "border-blue-500/40 bg-blue-500/5 ring-1 ring-blue-500/20"
                    : "border-white/10 bg-white/[0.01] opacity-70 hover:opacity-100 hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-xs">{node.data.icon}</span>
                    <span className="text-xs font-medium text-white truncate">
                      {node.data.label}
                    </span>
                  </div>

                  {/* Status Indicator */}
                  {status === "completed" && (
                    <span className="shrink-0 text-[10px] font-semibold text-emerald-400 bg-emerald-500/20 rounded px-1.5 py-0.2">
                      ✓ Done
                    </span>
                  )}
                  {status === "running" && (
                    <span className="shrink-0 text-[10px] font-semibold text-blue-400 bg-blue-500/20 rounded px-1.5 py-0.2 animate-pulse">
                      ▶ Running
                    </span>
                  )}
                  {status === "paused" && (
                    <span className="shrink-0 text-[10px] font-semibold text-amber-300 bg-amber-500/20 rounded px-1.5 py-0.2">
                      ⏸ Waiting
                    </span>
                  )}
                  {status === "failed" && (
                    <span className="shrink-0 text-[10px] font-semibold text-rose-400 bg-rose-500/20 rounded px-1.5 py-0.2">
                      ✕ Failed
                    </span>
                  )}
                  {status === "skipped" && (
                    <span className="shrink-0 text-[10px] font-semibold text-zinc-500 bg-white/5 rounded px-1.5 py-0.2">
                      ⏭ Skipped
                    </span>
                  )}
                  {!status && (
                    <span className="shrink-0 text-[10px] font-medium text-zinc-600">
                      ○ Upcoming
                    </span>
                  )}
                </div>

                {/* Subtitle / summary info */}
                {summary && (
                  <p className="text-[10px] text-zinc-400 truncate mt-0.5 font-mono">
                    {summary}
                  </p>
                )}

                {/* Inline Action for Approval Gate */}
                {isPaused && (
                  <div className="mt-2 pt-1.5 border-t border-amber-500/20 flex flex-col gap-1">
                    {isOwnerOrEditor ? (
                      <button
                        type="button"
                        disabled={isRunning}
                        onClick={(e) => {
                          e.stopPropagation();
                          onApproveStep?.(node.data.stepId, stepRun?.id);
                        }}
                        className="w-full rounded bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 py-1 text-[11px] font-semibold text-white transition-all shadow cursor-pointer flex items-center justify-center gap-1"
                      >
                        Approve & Continue ✓
                      </button>
                    ) : (
                      <span className="text-[9px] text-amber-300/80 italic">
                        Requires Owner/Editor role
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
