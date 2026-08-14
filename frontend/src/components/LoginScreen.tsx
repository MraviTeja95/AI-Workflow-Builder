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
    <div className="flex min-h-screen bg-[#080808] text-white overflow-hidden selection:bg-blue-500/30 selection:text-white">

      {/* ── LEFT PANEL (58% / Product Presentation) ── */}
      <div className="hidden lg:flex flex-[1.2] flex-col justify-between p-10 xl:p-14 relative overflow-hidden bg-[#0a0a0d]">

        {/* Sliced diagonal / curved background glow layer */}
        <div className="pointer-events-none absolute inset-0">
          {/* Subtle diagonal split panel overlay */}
          <div
            className="absolute -top-1/4 -left-1/4 w-[150%] h-[150%] opacity-40"
            style={{
              background: "radial-gradient(ellipse at 25% 25%, rgba(37,99,235,0.18) 0%, rgba(79,70,229,0.08) 35%, transparent 70%)",
            }}
          />
          {/* Sliced subtle geometric angle */}
          <div
            className="absolute top-0 right-0 w-full h-full opacity-[0.03]"
            style={{
              backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(45deg, rgba(255,255,255,0.2) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
        </div>

        {/* Brand header with primary AI mark + secondary intelligence orbit badge */}
        <div className="relative z-10 flex items-center justify-between animate-fade-in">
          {/* Primary Brand Mark */}
          <div className="flex items-center gap-3">
            <BrandLogo size={32} />
            <span className="text-sm font-semibold tracking-tight text-white/90">
              Workflow Builder
            </span>
          </div>

          {/* Secondary Complementary AI Intelligence Badge */}
          <div className="flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 px-3 py-1 text-[11px] font-medium text-blue-400 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            <span>Gemini 2.5 Engine</span>
          </div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-xl my-auto py-6 animate-fade-in-up">

          {/* Small eyebrow */}
          <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-400 mb-3">
            AI WORKFLOW AUTOMATION
          </p>

          {/* Main headline */}
          <h1 className="mb-4 text-3xl xl:text-[2.6rem] font-semibold leading-[1.15] tracking-tight text-white">
            Build intelligent<br />
            AI workflows visually.
          </h1>

          {/* Supporting text */}
          <p className="text-sm leading-relaxed text-zinc-400 max-w-lg mb-8">
            Connect AI agents, conditions, approvals, APIs, databases, and notifications into one executable workflow.
          </p>

          {/* ── Workflow Preview (Trigger → AI Agent → Condition → Notify) ── */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 mb-8 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-1.5">
              {[
                { icon: "⚡", label: "Trigger", type: "Manual / Webhook", color: "border-blue-500/30 bg-blue-500/10 text-blue-400" },
                { icon: "🤖", label: "AI Agent", type: "Gemini Analysis", color: "border-violet-500/30 bg-violet-500/10 text-violet-400" },
                { icon: "◆", label: "Condition", type: "Branch Logic", color: "border-amber-500/30 bg-amber-500/10 text-amber-400" },
                { icon: "📢", label: "Notify", type: "Email via Resend", color: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
              ].map((step, idx) => (
                <React.Fragment key={step.label}>
                  {idx > 0 && (
                    <div className="flex items-center justify-center text-zinc-600 text-xs shrink-0 px-1">
                      →
                    </div>
                  )}
                  <div className="flex-1 min-w-0 rounded-xl border border-white/[0.06] bg-black/40 p-2.5 hover:border-white/15 transition-all">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-sm shrink-0">{step.icon}</span>
                      <span className="text-xs font-semibold text-white truncate">{step.label}</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 truncate font-mono">{step.type}</p>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Feature Metrics */}
          <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/[0.07]">
            <div>
              <div className="text-sm font-semibold text-white">Gemini 2.5</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">AI Engine</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Real-Time</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Live Execution</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-white">RBAC</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Tenant Security</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 animate-fade-in">
          <p className="text-[11px] text-zinc-600">
            Powered by Nhost &middot; Hasura GraphQL &middot; Google Gemini &middot; Resend
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL (42% / Authentication Surface) ── */}
      <div className="flex w-full flex-col items-center justify-center lg:flex-1 lg:max-w-md xl:max-w-lg px-6 sm:px-10 py-12 relative bg-[#0e0e11]">
        {/* Subtle separator border */}
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden lg:block w-px bg-white/[0.06]" />

        <div className="w-full max-w-[340px] animate-scale-in">

          {/* Mobile brand header */}
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <BrandLogo size={28} />
            <span className="text-sm font-semibold text-white">Workflow Builder</span>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold tracking-tight text-white">Sign In</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Enter your credentials or launch the instant demo
            </p>
          </div>

          {/* ── Primary Action: Try Demo ── */}
          <button
            id="btn-try-demo"
            type="button"
            onClick={handleTryDemo}
            disabled={isBusy}
            className="group w-full relative flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-950/40 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.99] disabled:opacity-50 transition-all duration-150 cursor-pointer overflow-hidden"
          >
            {/* Shimmer overlay */}
            <div className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/15 to-transparent" />

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
          <p className="mt-2 mb-5 text-center text-[11px] text-zinc-400 font-medium">
            Instant demo access &middot; No setup required
          </p>

          {/* Divider */}
          <div className="relative mb-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-white/[0.07]" />
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">
              or email sign in
            </span>
            <div className="flex-1 h-px bg-white/[0.07]" />
          </div>

          {/* Error Alert */}
          {errorMessage && (
            <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300 animate-fade-in">
              <p className="font-semibold mb-0.5">Authentication error</p>
              <p className="text-rose-300/80">{errorMessage}</p>
            </div>
          )}

          {/* Credential Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label htmlFor="login-email" className="mb-1 block text-xs font-medium text-zinc-300">
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
                className="w-full rounded-xl border border-white/[0.09] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/40 disabled:opacity-40 transition-all"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="mb-1 block text-xs font-medium text-zinc-300">
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
                className="w-full rounded-xl border border-white/[0.09] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/40 disabled:opacity-40 transition-all"
              />
            </div>

            <button
              id="btn-sign-in"
              type="submit"
              disabled={isBusy}
              className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/25 active:scale-[0.99] disabled:opacity-40 transition-all cursor-pointer flex items-center justify-center gap-2 mt-1"
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

          {/* Footer note */}
          <div className="mt-6 border-t border-white/[0.06] pt-3 text-center">
            <p className="text-[10px] text-zinc-600">
              Singapore (ap-southeast-1) &middot; Encrypted Session
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
