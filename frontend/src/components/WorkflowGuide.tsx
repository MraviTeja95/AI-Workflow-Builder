"use client";

import React, { useState } from "react";

interface WorkflowGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

const GUIDE_STEPS = [
  {
    step: 1,
    title: "Add & Connect Nodes",
    badge: "Canvas Basics",
    icon: "⚡",
    description:
      "Click any node type in the left sidebar to add it to your workflow canvas. Connect nodes by dragging from an output handle (right) to an input handle (left).",
    highlight: "Condition nodes feature two output handles for TRUE and FALSE branching.",
  },
  {
    step: 2,
    title: "Configure Nodes",
    badge: "Inspector",
    icon: "⚙️",
    description:
      "Click any node on the canvas to open the Node Properties panel on the right. Customize Gemini AI prompts, HTTP URLs, comparison rules, or email recipients.",
    highlight: "Condition nodes feature a collapsible Advanced Expression editor for custom logic.",
  },
  {
    step: 3,
    title: "Run Workflow",
    badge: "Real-Time Engine",
    icon: "▶️",
    description:
      "Click 'Run' in the top header to execute the workflow. Live status indicators update on canvas nodes and the bottom Execution Timeline via real-time WebSocket streaming.",
    highlight: "The live progress bar updates step-by-step as each node completes execution.",
  },
  {
    step: 4,
    title: "Inspect Execution",
    badge: "Observability",
    icon: "📊",
    description:
      "Click any completed or running node to view live execution outputs, token counts, HTTP response data, or email delivery confirmations in the inspector panel.",
    highlight: "Real-time step outputs can be referenced by downstream nodes via variable interpolation.",
  },
  {
    step: 5,
    title: "Approvals & Locking",
    badge: "Governance & UX",
    icon: "🛡️",
    description:
      "Approval Gate nodes pause execution until authorized approval is granted. Use the node toolbar (🔒) to lock individual nodes, or use Canvas Lock in the bottom-left to freeze viewport panning.",
    highlight: "Canvas Lock freezes viewport panning while keeping node selection fully interactive.",
  },
];

export function WorkflowGuide({ isOpen, onClose }: WorkflowGuideProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"walkthrough" | "cheatsheet">("walkthrough");

  if (!isOpen) return null;

  const currentStep = GUIDE_STEPS[currentStepIndex];

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("has_seen_workflow_guide", "true");
      } catch {}
    }
    onClose();
  };

  const handleNext = () => {
    if (currentStepIndex < GUIDE_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      handleDismiss();
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
      onClick={handleDismiss}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/12 bg-[#121212] shadow-2xl overflow-hidden flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4 bg-[#161616]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600/20 border border-blue-500/30 text-xs font-bold text-blue-400">
              💡
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Workflow Guide</h3>
              <p className="text-[11px] text-zinc-400">Learn how to build and run workflows</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode((m) => (m === "walkthrough" ? "cheatsheet" : "walkthrough"))}
              className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer"
            >
              {viewMode === "walkthrough" ? "View All" : "Interactive Steps"}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        {viewMode === "walkthrough" ? (
          <div className="p-6 flex flex-col flex-1">
            {/* Step badge & progress */}
            <div className="flex items-center justify-between mb-4">
              <span className="rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-blue-400 uppercase tracking-wide">
                {currentStep.badge}
              </span>
              <span className="text-[11px] font-mono text-zinc-500">
                Step {currentStep.step} of {GUIDE_STEPS.length}
              </span>
            </div>

            {/* Step Card */}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 mb-5 flex-1">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{currentStep.icon}</span>
                <h4 className="text-base font-semibold text-white">{currentStep.title}</h4>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed mb-4">
                {currentStep.description}
              </p>
              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-[11px] text-zinc-400 flex items-start gap-2">
                <span className="text-blue-400 shrink-0 font-bold">Tip:</span>
                <span>{currentStep.highlight}</span>
              </div>
            </div>

            {/* Step Indicators */}
            <div className="flex items-center justify-center gap-1.5 mb-5">
              {GUIDE_STEPS.map((s, idx) => (
                <button
                  key={s.step}
                  type="button"
                  onClick={() => setCurrentStepIndex(idx)}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    idx === currentStepIndex
                      ? "w-6 bg-blue-500"
                      : "w-2 bg-white/20 hover:bg-white/40"
                  }`}
                />
              ))}
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={handleDismiss}
                className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                Skip Guide
              </button>

              <div className="flex items-center gap-2">
                {currentStepIndex > 0 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="rounded-xl border border-white/10 px-3.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/5 transition-all cursor-pointer"
                  >
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleNext}
                  className="rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-4 py-1.5 text-xs font-semibold text-white shadow-md shadow-blue-600/25 transition-all cursor-pointer"
                >
                  {currentStepIndex === GUIDE_STEPS.length - 1 ? "Got It ✓" : "Next →"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Cheatsheet / All-in-one view */
          <div className="p-6 space-y-3 max-h-[420px] overflow-y-auto">
            {GUIDE_STEPS.map((s) => (
              <div
                key={s.step}
                className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 hover:border-white/15 transition-all"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm">{s.icon}</span>
                  <h5 className="text-xs font-semibold text-white">{s.title}</h5>
                  <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-mono text-zinc-500">
                    {s.badge}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-300 leading-relaxed mb-1.5">{s.description}</p>
                <p className="text-[10px] text-blue-400 font-medium">{s.highlight}</p>
              </div>
            ))}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={handleDismiss}
                className="rounded-xl bg-blue-600 hover:bg-blue-500 px-5 py-2 text-xs font-semibold text-white transition-all cursor-pointer"
              >
                Close Quick Guide
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
