"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { BrandLogo } from "@/components/BrandLogo";

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDemoSubmitting, setIsDemoSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMessage("Please enter both email and password.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await login(email.trim(), password, false);
    } catch (err) {
      const error = err as Error;
      setErrorMessage(error.message || "Invalid credentials. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTryDemo = async () => {
    setIsDemoSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/auth/demo", { method: "POST" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Demo authentication is currently unavailable.");
      }
      const data = await res.json();
      if (!data.email || !data.password) throw new Error("Demo credentials not returned by server.");
      await login(data.email, data.password, true);
    } catch (err) {
      const error = err as Error;
      setErrorMessage(error.message || "Unable to start demo. Please try again.");
    } finally {
      setIsDemoSubmitting(false);
    }
  };

  const isBusy = isSubmitting || isDemoSubmitting;

  return (
    <div className="flex min-h-screen text-white overflow-hidden selection:bg-[var(--accent)]/20 selection:text-white"
         style={{ background: "var(--bg-primary)" }}>

      {/* ── LEFT PANEL — Product Presentation ── */}
      <div className="hidden lg:flex flex-[1.2] flex-col justify-between p-12 xl:p-16 relative overflow-hidden"
           style={{ background: "var(--bg-secondary)" }}>

        {/* Subtle ambient glow — restrained */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute -top-1/4 -left-1/4 w-[120%] h-[120%] opacity-20"
            style={{
              background: "radial-gradient(ellipse at 30% 30%, rgba(10,132,255,0.12) 0%, transparent 60%)",
            }}
          />
        </div>

        {/* Brand header */}
        <div className="relative z-10 flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-3">
            <BrandLogo size={32} />
            <span style={{ fontSize: "var(--text-subhead)", fontWeight: 600, color: "var(--text-primary)" }}>
              Workflow Builder
            </span>
          </div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-xl my-auto py-8 animate-fade-in-up">

          {/* Eyebrow */}
          <p style={{
            fontSize: "var(--text-caption)",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
            color: "var(--accent)",
            marginBottom: "var(--space-3)",
          }}>
            AI Workflow Automation
          </p>

          {/* Headline */}
          <h1 style={{
            fontSize: "clamp(28px, 3vw, 36px)",
            fontWeight: 600,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
            marginBottom: "var(--space-4)",
          }}>
            Build intelligent{"\u00A0"}AI{"\u00A0"}workflows visually.
          </h1>

          {/* Supporting text */}
          <p style={{
            fontSize: "var(--text-subhead)",
            lineHeight: 1.6,
            color: "var(--text-secondary)",
            maxWidth: "480px",
            marginBottom: "var(--space-8)",
          }}>
            Connect AI agents, conditions, approvals, APIs, databases, and notifications into one executable workflow.
          </p>

          {/* Workflow Preview — clean cards */}
          <div style={{
            borderRadius: "var(--radius-panel)",
            border: "1px solid var(--separator-light)",
            background: "rgba(255,255,255,0.02)",
            padding: "var(--space-4)",
            marginBottom: "var(--space-8)",
          }}>
            <div className="flex items-center justify-between gap-2">
              {[
                { icon: "⚡", label: "Trigger",   type: "Manual / Webhook" },
                { icon: "🤖", label: "AI Agent",   type: "Gemini Analysis" },
                { icon: "◆",  label: "Condition",  type: "Branch Logic" },
                { icon: "📢", label: "Notify",     type: "Email via SendGrid" },
              ].map((step, idx) => (
                <React.Fragment key={step.label}>
                  {idx > 0 && (
                    <div style={{ color: "var(--text-tertiary)", fontSize: "var(--text-caption)" }} className="shrink-0 px-1">→</div>
                  )}
                  <div className="flex-1 min-w-0" style={{
                    borderRadius: "var(--radius-button)",
                    border: "1px solid var(--separator-light)",
                    background: "rgba(0,0,0,0.3)",
                    padding: "10px",
                  }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-sm shrink-0">{step.icon}</span>
                      <span style={{ fontSize: "var(--text-footnote)", fontWeight: 600, color: "var(--text-primary)" }} className="truncate">{step.label}</span>
                    </div>
                    <p style={{ fontSize: "var(--text-caption-2)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }} className="truncate">{step.type}</p>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Feature row */}
          <div className="grid grid-cols-3 gap-6" style={{ paddingTop: "var(--space-6)", borderTop: "1px solid var(--separator-light)" }}>
            {[
              { title: "Gemini 2.5", sub: "AI Engine" },
              { title: "Real-Time", sub: "Live Execution" },
              { title: "RBAC", sub: "Tenant Security" },
            ].map((f) => (
              <div key={f.title}>
                <div style={{ fontSize: "var(--text-subhead)", fontWeight: 600, color: "var(--text-primary)" }}>{f.title}</div>
                <div style={{ fontSize: "var(--text-caption-2)", color: "var(--text-tertiary)", marginTop: "2px" }}>{f.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 animate-fade-in">
          <p style={{ fontSize: "var(--text-caption-2)", color: "var(--text-tertiary)" }}>
            Powered by Nhost &middot; Hasura GraphQL &middot; Google Gemini &middot; SendGrid
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL — Authentication ── */}
      <div className="flex w-full flex-col items-center justify-center lg:flex-1 lg:max-w-md xl:max-w-lg px-8 sm:px-12 py-16 relative"
           style={{ background: "var(--bg-primary)" }}>

        {/* Separator */}
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden lg:block w-px" style={{ background: "var(--separator-light)" }} />

        <div className="w-full max-w-[340px] animate-scale-in">

          {/* Mobile brand header */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandLogo size={28} />
            <span style={{ fontSize: "var(--text-subhead)", fontWeight: 600 }}>Workflow Builder</span>
          </div>

          <div className="mb-8">
            <h2 style={{ fontSize: "var(--text-title-3)", fontWeight: 600, letterSpacing: "-0.01em" }}>Sign In</h2>
            <p style={{ fontSize: "var(--text-footnote)", color: "var(--text-secondary)", marginTop: "var(--space-1)" }}>
              Enter your credentials or launch the instant demo
            </p>
          </div>

          {/* ── Try Demo — Primary CTA ── */}
          <button
            id="btn-try-demo"
            type="button"
            onClick={handleTryDemo}
            disabled={isBusy}
            className="w-full flex items-center justify-center gap-2.5 text-white disabled:opacity-50 transition-all cursor-pointer active:scale-[0.99]"
            style={{
              borderRadius: "var(--radius-card)",
              padding: "13px 20px",
              fontSize: "var(--text-subhead)",
              fontWeight: 600,
              background: "var(--accent)",
            }}
          >
            {isDemoSubmitting ? (
              <>
                <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Authenticating Demo…</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.97l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
                <span>Try Demo — Instant Access</span>
              </>
            )}
          </button>
          <p style={{
            fontSize: "var(--text-caption-2)",
            color: "var(--text-secondary)",
            textAlign: "center" as const,
            marginTop: "var(--space-2)",
            marginBottom: "var(--space-5)",
          }}>
            Instant demo access &middot; No setup required
          </p>

          {/* Divider */}
          <div className="relative flex items-center gap-3" style={{ marginBottom: "var(--space-5)" }}>
            <div className="flex-1 h-px" style={{ background: "var(--separator-light)" }} />
            <span style={{
              fontSize: "var(--text-caption-2)",
              fontWeight: 500,
              color: "var(--text-tertiary)",
              textTransform: "uppercase" as const,
              letterSpacing: "0.06em",
            }}>
              or email sign in
            </span>
            <div className="flex-1 h-px" style={{ background: "var(--separator-light)" }} />
          </div>

          {/* Error Alert */}
          {errorMessage && (
            <div className="animate-fade-in" style={{
              marginBottom: "var(--space-4)",
              borderRadius: "var(--radius-button)",
              border: "1px solid rgba(255,69,58,0.30)",
              background: "var(--destructive-dim)",
              padding: "10px 14px",
              fontSize: "var(--text-footnote)",
              color: "#FF6961",
            }}>
              <p style={{ fontWeight: 600, marginBottom: "2px" }}>Authentication error</p>
              <p style={{ opacity: 0.85 }}>{errorMessage}</p>
            </div>
          )}

          {/* Credential Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" style={{
                display: "block",
                fontSize: "var(--text-footnote)",
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: "var(--space-2)",
              }}>
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={isBusy}
                style={{
                  width: "100%",
                  borderRadius: "var(--radius-input)",
                  border: "1px solid var(--separator-light)",
                  background: "var(--bg-tertiary)",
                  padding: "10px 14px",
                  fontSize: "var(--text-subhead)",
                  color: "var(--text-primary)",
                  outline: "none",
                  transition: "border-color var(--transition-fast)",
                }}
                className="placeholder:text-[rgba(235,235,245,0.25)] focus:border-[var(--accent)] disabled:opacity-40"
              />
            </div>

            <div>
              <label htmlFor="login-password" style={{
                display: "block",
                fontSize: "var(--text-footnote)",
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: "var(--space-2)",
              }}>
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isBusy}
                style={{
                  width: "100%",
                  borderRadius: "var(--radius-input)",
                  border: "1px solid var(--separator-light)",
                  background: "var(--bg-tertiary)",
                  padding: "10px 14px",
                  fontSize: "var(--text-subhead)",
                  color: "var(--text-primary)",
                  outline: "none",
                  transition: "border-color var(--transition-fast)",
                }}
                className="placeholder:text-[rgba(235,235,245,0.25)] focus:border-[var(--accent)] disabled:opacity-40"
              />
            </div>

            <button
              id="btn-sign-in"
              type="submit"
              disabled={isBusy}
              className="w-full text-white disabled:opacity-40 transition-all cursor-pointer active:scale-[0.99] flex items-center justify-center gap-2"
              style={{
                borderRadius: "var(--radius-card)",
                padding: "11px 20px",
                fontSize: "var(--text-subhead)",
                fontWeight: 600,
                background: "var(--bg-tertiary)",
                border: "1px solid var(--separator-light)",
                marginTop: "var(--space-1)",
              }}
            >
              {isSubmitting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Signing In…</span>
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Footer */}
          <div style={{
            marginTop: "var(--space-6)",
            paddingTop: "var(--space-3)",
            borderTop: "1px solid var(--separator-light)",
            textAlign: "center" as const,
          }}>
            <p style={{ fontSize: "var(--text-caption-2)", color: "var(--text-tertiary)" }}>
              Singapore (ap-southeast-1) &middot; Encrypted Session
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
