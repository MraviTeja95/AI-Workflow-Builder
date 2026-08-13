"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { WorkflowNodeData } from "@/types/workflow";

export function WorkflowNode({
  data,
  selected,
}: NodeProps<Node<WorkflowNodeData>>) {
  const isCondition = data.nodeType === "condition";
  const isTrigger = data.nodeType === "trigger";
  const status = data.executionStatus;

  const nodeTypeLabel =
    data.nodeType === "ai_agent"
      ? "AI Agent"
      : data.nodeType === "http_request"
      ? "HTTP Request"
      : data.nodeType === "database"
      ? "Database"
      : data.nodeType === "condition"
      ? "Condition"
      : data.nodeType === "notify"
      ? "Notify"
      : data.nodeType === "approval_gate"
      ? "Approval Gate"
      : data.nodeType === "trigger"
      ? "Trigger"
      : "Workflow node";

  // Dynamic border styling based on live execution status and selection
  const statusBorderClass =
    status === "running"
      ? "border-amber-500 ring-2 ring-amber-500/40 shadow-amber-500/20 shadow-lg"
      : status === "completed"
      ? "border-emerald-500/60 shadow-emerald-500/10 shadow-md"
      : status === "failed"
      ? "border-rose-500 ring-2 ring-rose-500/40 shadow-rose-500/20 shadow-lg"
      : status === "paused"
      ? "border-yellow-500 ring-2 ring-yellow-500/40 shadow-yellow-500/20 shadow-lg animate-pulse"
      : status === "skipped"
      ? "border-white/10 opacity-60"
      : status === "queued"
      ? "border-blue-500/40"
      : selected
      ? "border-blue-500 ring-2 ring-blue-500/40 shadow-blue-500/20"
      : "border-white/10 hover:border-white/25";

  return (
    <div
      className={`relative min-w-[200px] max-w-[280px] rounded-xl border bg-[#181818] shadow-xl transition-all duration-150 ${statusBorderClass}`}
    >
      {/* Target Handle for incoming connections */}
      {!isTrigger && (
        <Handle
          type="target"
          id="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-[#181818] !bg-blue-500 transition-transform hover:scale-125"
        />
      )}

      {/* Main Node Card Content */}
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-lg">
            {data.icon}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {data.label}
            </p>

            <p className="text-xs text-zinc-400">{nodeTypeLabel}</p>
          </div>
        </div>

        {/* Live Execution Status Indicator */}
        {status && (
          <div className="pt-1 border-t border-white/5 flex items-center justify-between">
            {status === "running" && (
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
                Running...
              </span>
            )}

            {status === "completed" && isCondition && (
              <span
                className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border ${
                  data.liveStepRun?.output?.evaluatedValue === true ||
                  data.liveStepRun?.output?.result === true ||
                  data.liveStepRun?.output?.selectedBranch === "true" ||
                  data.liveStepRun?.output?.branch === "true"
                    ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/40"
                    : "text-rose-400 bg-rose-500/15 border-rose-500/40"
                }`}
              >
                {data.liveStepRun?.output?.evaluatedValue === true ||
                data.liveStepRun?.output?.result === true ||
                data.liveStepRun?.output?.selectedBranch === "true" ||
                data.liveStepRun?.output?.branch === "true"
                  ? "✓ Branch: TRUE"
                  : "✕ Branch: FALSE"}
              </span>
            )}

            {status === "completed" && !isCondition && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                ✓ Completed
              </span>
            )}

            {status === "failed" && (
              <span
                title={data.executionError || "Step execution failed"}
                className="flex items-center gap-1 text-[11px] font-medium text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30 truncate max-w-[220px]"
              >
                ✕ Failed
              </span>
            )}

            {status === "paused" && (
              <div className="flex items-center justify-between gap-2 w-full">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/40 animate-pulse">
                  ⏸ Awaiting Approval
                </span>
                {(data.userRole === "owner" || data.userRole === "editor") && data.onApprove && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      data.onApprove?.(data.stepId, data.liveStepRun?.id);
                    }}
                    className="flex items-center gap-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 px-2.5 py-0.5 rounded shadow transition-all cursor-pointer"
                  >
                    Approve ✓
                  </button>
                )}
              </div>
            )}

            {status === "queued" && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-400 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                ⏱ Queued
              </span>
            )}

            {status === "skipped" && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 bg-white/5 px-2 py-0.5 rounded border border-white/5 line-through">
                ⏭ Skipped
              </span>
            )}

            {data.liveStepRun?.attempt_count && data.liveStepRun.attempt_count > 1 && (
              <span className="text-[10px] text-zinc-500 font-mono">
                att: {data.liveStepRun.attempt_count}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Condition Nodes: Two Source Handles (True / False branches) */}
      {isCondition ? (
        <>
          {/* True Branch Handle */}
          <div className="absolute right-0 top-[28%] flex items-center translate-x-full pr-1">
            <Handle
              type="source"
              id="true"
              position={Position.Right}
              className="!h-3 !w-3 !border-2 !border-[#181818] !bg-emerald-500 transition-transform hover:scale-125"
              style={{ top: "30%" }}
            />
          </div>

          {/* False Branch Handle */}
          <div className="absolute right-0 top-[72%] flex items-center translate-x-full pr-1">
            <Handle
              type="source"
              id="false"
              position={Position.Right}
              className="!h-3 !w-3 !border-2 !border-[#181818] !bg-rose-500 transition-transform hover:scale-125"
              style={{ top: "70%" }}
            />
          </div>
        </>
      ) : (
        /* Standard Single Source Handle */
        <Handle
          type="source"
          id="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-[#181818] !bg-blue-500 transition-transform hover:scale-125"
        />
      )}
    </div>
  );
}
