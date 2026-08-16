"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

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
  const modalRef = useRef<HTMLDivElement>(null);

  const handleDismiss = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("has_seen_workflow_guide", "true");
      } catch {}
    }
    onClose();
  }, [onClose]);

  const handleNext = useCallback(() => {
    if (currentStepIndex < GUIDE_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      handleDismiss();
    }
  }, [currentStepIndex, handleDismiss]);

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  }, [currentStepIndex]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleDismiss();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleDismiss]);

  // Focus trap — focus modal on open
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentStep = GUIDE_STEPS[currentStepIndex];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: "rgba(0,0,0,0.60)", backdropFilter: "blur(8px)" }}
      onClick={handleDismiss}
      role="dialog"
      aria-modal="true"
      aria-label="Workflow Guide"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-lg overflow-hidden flex flex-col animate-scale-in outline-none"
        style={{
          borderRadius: "var(--radius-sheet)",
          border: "1px solid var(--separator)",
          background: "var(--bg-secondary)",
          boxShadow: "var(--shadow-sheet)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{
          borderBottom: "1px solid var(--separator-light)",
          padding: "16px 24px",
          background: "var(--bg-tertiary)",
        }}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center text-xs" style={{
              borderRadius: "var(--radius-sm)",
              background: "var(--accent-dim)",
              color: "var(--accent)",
            }}>
              💡
            </div>
            <div>
              <h3 style={{ fontSize: "var(--text-subhead)", fontWeight: 600, color: "var(--text-primary)" }}>Workflow Guide</h3>
              <p style={{ fontSize: "var(--text-caption-2)", color: "var(--text-secondary)" }}>Learn how to build and run workflows</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode((m) => (m === "walkthrough" ? "cheatsheet" : "walkthrough"))}
              className="transition-colors cursor-pointer"
              style={{
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--separator-light)",
                padding: "4px 10px",
                fontSize: "var(--text-caption-2)",
                fontWeight: 500,
                color: "var(--text-secondary)",
                background: "transparent",
              }}
            >
              {viewMode === "walkthrough" ? "View All" : "Interactive Steps"}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Close guide"
              className="transition-colors cursor-pointer"
              style={{
                borderRadius: "var(--radius-sm)",
                padding: "6px",
                color: "var(--text-secondary)",
                background: "transparent",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        {viewMode === "walkthrough" ? (
          <div className="flex flex-col flex-1" style={{ padding: "24px" }}>
            {/* Step badge & progress */}
            <div className="flex items-center justify-between" style={{ marginBottom: "16px" }}>
              <span style={{
                borderRadius: "99px",
                background: "var(--accent-dim)",
                padding: "3px 10px",
                fontSize: "10px",
                fontWeight: 600,
                color: "var(--accent)",
                textTransform: "uppercase" as const,
                letterSpacing: "0.04em",
              }}>
                {currentStep.badge}
              </span>
              <span style={{ fontSize: "var(--text-caption-2)", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
                Step {currentStep.step} of {GUIDE_STEPS.length}
              </span>
            </div>

            {/* Step Card */}
            <div className="flex-1" style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--separator-light)",
              background: "rgba(255,255,255,0.02)",
              padding: "20px",
              marginBottom: "20px",
            }}>
              <div className="flex items-center gap-3" style={{ marginBottom: "12px" }}>
                <span style={{ fontSize: "24px" }}>{currentStep.icon}</span>
                <h4 style={{ fontSize: "var(--text-callout)", fontWeight: 600, color: "var(--text-primary)" }}>{currentStep.title}</h4>
              </div>
              <p style={{
                fontSize: "var(--text-footnote)",
                color: "var(--text-secondary)",
                lineHeight: 1.6,
                marginBottom: "16px",
              }}>
                {currentStep.description}
              </p>
              <div style={{
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--separator-light)",
                background: "rgba(255,255,255,0.02)",
                padding: "12px",
                fontSize: "var(--text-caption-2)",
                color: "var(--text-secondary)",
              }} className="flex items-start gap-2">
                <span style={{ color: "var(--accent)", fontWeight: 700 }} className="shrink-0">Tip:</span>
                <span>{currentStep.highlight}</span>
              </div>
            </div>

            {/* Step Indicators */}
            <div className="flex items-center justify-center gap-1.5" style={{ marginBottom: "20px" }}>
              {GUIDE_STEPS.map((s, idx) => (
                <button
                  key={s.step}
                  type="button"
                  onClick={() => setCurrentStepIndex(idx)}
                  aria-label={`Go to step ${s.step}`}
                  className="rounded-full transition-all cursor-pointer"
                  style={{
                    height: "6px",
                    width: idx === currentStepIndex ? "24px" : "8px",
                    background: idx === currentStepIndex ? "var(--accent)" : "rgba(255,255,255,0.15)",
                    border: "none",
                    padding: 0,
                  }}
                />
              ))}
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-between" style={{ paddingTop: "12px", borderTop: "1px solid var(--separator-light)" }}>
              <button
                type="button"
                onClick={handleDismiss}
                className="cursor-pointer transition-colors"
                style={{ fontSize: "var(--text-footnote)", color: "var(--text-tertiary)", background: "none", border: "none" }}
              >
                Skip Guide
              </button>

              <div className="flex items-center gap-2">
                {currentStepIndex > 0 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="cursor-pointer transition-all"
                    style={{
                      borderRadius: "var(--radius-button)",
                      border: "1px solid var(--separator-light)",
                      padding: "6px 14px",
                      fontSize: "var(--text-footnote)",
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                      background: "transparent",
                    }}
                  >
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleNext}
                  className="cursor-pointer transition-all text-white"
                  style={{
                    borderRadius: "var(--radius-button)",
                    padding: "6px 16px",
                    fontSize: "var(--text-footnote)",
                    fontWeight: 600,
                    background: "var(--accent)",
                    border: "none",
                  }}
                >
                  {currentStepIndex === GUIDE_STEPS.length - 1 ? "Got It ✓" : "Next →"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Cheatsheet / All-in-one view */
          <div className="space-y-3 max-h-[420px] overflow-y-auto" style={{ padding: "24px" }}>
            {GUIDE_STEPS.map((s) => (
              <div
                key={s.step}
                className="transition-all"
                style={{
                  borderRadius: "var(--radius-card)",
                  border: "1px solid var(--separator-light)",
                  background: "rgba(255,255,255,0.02)",
                  padding: "14px",
                }}
              >
                <div className="flex items-center gap-2" style={{ marginBottom: "6px" }}>
                  <span style={{ fontSize: "var(--text-subhead)" }}>{s.icon}</span>
                  <h5 style={{ fontSize: "var(--text-footnote)", fontWeight: 600, color: "var(--text-primary)" }}>{s.title}</h5>
                  <span className="ml-auto" style={{
                    borderRadius: "var(--radius-sm)",
                    background: "rgba(255,255,255,0.04)",
                    padding: "2px 6px",
                    fontSize: "9px",
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-tertiary)",
                  }}>
                    {s.badge}
                  </span>
                </div>
                <p style={{ fontSize: "var(--text-caption-2)", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "6px" }}>{s.description}</p>
                <p style={{ fontSize: "10px", color: "var(--accent)", fontWeight: 500 }}>{s.highlight}</p>
              </div>
            ))}
            <div style={{ paddingTop: "8px", textAlign: "center" as const }}>
              <button
                type="button"
                onClick={handleDismiss}
                className="cursor-pointer transition-all text-white"
                style={{
                  borderRadius: "var(--radius-button)",
                  padding: "8px 20px",
                  fontSize: "var(--text-footnote)",
                  fontWeight: 600,
                  background: "var(--accent)",
                  border: "none",
                }}
              >
                Close Guide
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
