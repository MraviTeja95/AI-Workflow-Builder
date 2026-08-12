"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { WorkflowNodeData } from "@/types/workflow";

export function WorkflowNode({
  data,
  selected,
}: NodeProps<Node<WorkflowNodeData>>) {
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

  return (
    <div
      className={`min-w-[190px] max-w-[260px] rounded-xl border bg-[#181818] shadow-xl transition-all duration-150 ${
        selected
          ? "border-blue-500 ring-2 ring-blue-500/40 shadow-blue-500/20"
          : "border-white/10 hover:border-white/25"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-[#181818] !bg-blue-500 transition-transform hover:scale-125"
      />

      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-lg">
          {data.icon}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {data.label}
          </p>

          <p className="text-xs text-zinc-400">
            {nodeTypeLabel}
          </p>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-[#181818] !bg-blue-500 transition-transform hover:scale-125"
      />
    </div>
  );
}
