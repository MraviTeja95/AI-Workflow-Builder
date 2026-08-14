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

  /* ── Border / ring ────────────────────────────────────────────────── */
  const ringClass =
    status === "running"
      ? "border-amber-500/70 ring-1 ring-amber-500/30 shadow-amber-500/10 shadow-lg"
      : status === "completed"
      ? "border-emerald-500/50"
      : status === "failed"
      ? "border-rose-500/70 ring-1 ring-rose-500/30 shadow-rose-500/10 shadow-lg"
      : status === "paused"
      ? "border-amber-400/60 ring-1 ring-amber-400/25 animate-pulse"
      : status === "skipped"
      ? "border-white/5 opacity-50"
      : status === "queued"
      ? "border-blue-500/30"
      : selected
      ? "border-blue-500/80 ring-2 ring-blue-500/25 shadow-lg shadow-blue-500/10"
      : isLocked
      ? "border-amber-500/30"
      : "border-white/[0.08] hover:border-white/20";

  /* ── Status badge ─────────────────────────────────────────────────── */
  const renderStatusBadge = () => {
    if (!status) return null;
    if (status === "running") return (
      <span className="flex items-center gap-1.5 rounded-md bg-amber-500/12 border border-amber-500/25 px-2 py-0.5 text-[11px] font-medium text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
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
        <span className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border ${
          isTrue
            ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
            : "text-rose-400 bg-rose-500/10 border-rose-500/30"
        }`}>
          {isTrue ? "→ TRUE" : "→ FALSE"}
        </span>
      );
    }
    if (status === "completed") return (
      <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
        ✓ Done
      </span>
    );
    if (status === "failed") return (
      <span title={data.executionError || "Step failed"} className="rounded-md bg-rose-500/10 border border-rose-500/25 px-2 py-0.5 text-[11px] font-medium text-rose-400 truncate max-w-[160px]">
        ✕ Failed
      </span>
    );
    if (status === "paused") return (
      <div className="flex items-center justify-between gap-2 w-full">
        <span className="flex items-center gap-1.5 rounded-md bg-amber-500/12 border border-amber-500/30 px-2 py-0.5 text-[11px] font-medium text-amber-300">
          ⏸ Waiting
        </span>
        {(data.userRole === "owner" || data.userRole === "editor") && data.onApprove && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); data.onApprove?.(data.stepId, data.liveStepRun?.id); }}
            className="flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 px-2.5 py-0.5 text-[11px] font-semibold text-white transition-all cursor-pointer shadow-sm"
          >
            Approve
          </button>
        )}
      </div>
    );
    if (status === "queued") return (
      <span className="rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
        ⏱ Queued
      </span>
    );
    if (status === "skipped") return (
      <span className="rounded-md bg-white/5 border border-white/5 px-2 py-0.5 text-[11px] font-medium text-zinc-600 line-through">
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
          className="flex items-center gap-1 rounded-xl border border-white/15 bg-[#181818]/95 px-2 py-1 shadow-2xl backdrop-blur-md select-none whitespace-nowrap transition-all"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            title={isLocked ? "Unlock node (allows dragging)" : "Lock node (prevents dragging & deletion)"}
            onClick={(e) => { e.stopPropagation(); data.onLockToggle?.(id); }}
            className={`flex h-7 items-center gap-1 px-2 rounded-lg text-[11px] font-medium transition-all duration-150 cursor-pointer ${
              isLocked
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
                : "text-zinc-300 hover:bg-white/10 hover:text-white"
            }`}
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

          <div className="h-4 w-px bg-white/10 mx-0.5" />

          <button
            type="button"
            title={isLocked ? "Node is locked — unlock first to delete" : "Delete node"}
            onClick={(e) => { e.stopPropagation(); if (!isLocked) data.onDeleteNode?.(id); }}
            disabled={isLocked}
            className={`flex h-7 items-center gap-1 px-2 rounded-lg text-[11px] font-medium transition-all duration-150 ${
              isLocked
                ? "cursor-not-allowed text-zinc-600 opacity-50"
                : "text-zinc-300 hover:bg-rose-500/15 hover:text-rose-400 cursor-pointer"
            }`}
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
          className="!h-2.5 !w-2.5 !border-2 !border-[#181818] !bg-blue-500/80 transition-transform hover:scale-125"
        />
      )}

      {/* ── Node Card ─────────────────────────────────────────────── */}
      <div
        className={`relative min-w-[200px] max-w-[270px] rounded-2xl border bg-[#181818] shadow-xl transition-all duration-150 ${ringClass}`}
      >
        <div className="flex flex-col gap-2 p-3.5">

          {/* Header row */}
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg transition-all ${
              selected ? "bg-blue-500/12" : "bg-white/[0.04]"
            }`}>
              {data.icon}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-snug text-white">
                {data.label}
              </p>
              <p className="text-[11px] text-zinc-500 leading-none mt-0.5">{typeLabel}</p>
            </div>

            {/* Lock pill */}
            {isLocked && (
              <span className="shrink-0 flex items-center gap-1 rounded-md bg-amber-500/12 border border-amber-500/25 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                Locked
              </span>
            )}
          </div>

          {/* Status row */}
          {status && (
            <div className="border-t border-white/[0.05] pt-2 flex items-center justify-between gap-2">
              {renderStatusBadge()}
              {data.liveStepRun?.attempt_count && data.liveStepRun.attempt_count > 1 && (
                <span className="text-[10px] text-zinc-600 font-mono ml-auto shrink-0">
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
              className="!h-2.5 !w-2.5 !border-2 !border-[#181818] !bg-emerald-500/80 transition-transform hover:scale-125"
              style={{ top: "30%" }}
            />
          </div>
          <div className="absolute right-0 top-[70%] flex items-center translate-x-full pr-1">
            <Handle
              type="source"
              id="false"
              position={Position.Right}
              className="!h-2.5 !w-2.5 !border-2 !border-[#181818] !bg-rose-500/80 transition-transform hover:scale-125"
              style={{ top: "70%" }}
            />
          </div>
        </>
      ) : (
        <Handle
          type="source"
          id="source"
          position={Position.Right}
          className="!h-2.5 !w-2.5 !border-2 !border-[#181818] !bg-blue-500/80 transition-transform hover:scale-125"
        />
      )}
    </>
  );
}
