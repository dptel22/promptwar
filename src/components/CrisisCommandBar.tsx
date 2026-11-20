"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Sparkles, X } from "lucide-react";
import type { AirportClosure } from "@/lib/sim/types";

interface CrisisCommandBarProps {
  onApplyClosures: (closures: AirportClosure[]) => void;
  onClose: () => void;
}

const EXAMPLE_PROMPTS = [
  "75 minute storm at Hyderabad at 12:00",
  "Monsoon closes Mumbai 08:00-09:30 and fog hits Delhi 11:15 to 12:15",
  "90 min fog at Guwahati at 17:00",
];

export function CrisisCommandBar({
  onApplyClosures,
  onClose,
}: CrisisCommandBarProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/parse-crisis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.closures) || data.closures.length === 0) {
        setFeedback({
          type: "err",
          text:
            data.summary ||
            "Could not detect a valid airport and time window. Try e.g. 'Mumbai 08:00-09:30'.",
        });
      } else {
        onApplyClosures(data.closures);
        setFeedback({
          type: "ok",
          text: `${data.summary} (${data.mode === "ai" ? "AI Compiled" : "Deterministic Parser"})`,
        });
      }
    } catch {
      setFeedback({
        type: "err",
        text: "Failed to parse crisis prompt. Please retry.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-b border-[#222C38] bg-[#11161D] px-4 py-2.5">
      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-center gap-2"
      >
        <label htmlFor="crisis-prompt-input" className="sr-only">
          Describe airport closure scenario in plain English
        </label>
        <div className="relative flex min-w-[260px] flex-1 items-center">
          <Sparkles
            className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-amber-400"
            aria-hidden="true"
          />
          <input
            id="crisis-prompt-input"
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe a crisis in plain English (e.g. '75 min storm at HYD at 12:00' or 'Mumbai 08:00-09:30 and Delhi 11:15-12:15')"
            className="h-8 w-full rounded-md border border-[#222C38] bg-[#090D12] pl-8 pr-3 text-xs text-[#F1F5F9] placeholder:text-[#94A3B8]/60 focus-visible:border-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="h-8 cursor-pointer rounded-md bg-[#F59E0B] px-3 text-xs font-semibold text-[#090D12] transition-colors duration-150 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          {loading ? "Compiling..." : "Simulate Crisis"}
        </button>

        <div className="hidden items-center gap-1.5 xl:flex">
          {EXAMPLE_PROMPTS.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPrompt(ex)}
              className="cursor-pointer rounded-sm border border-[#222C38] bg-[#18202A] px-2 py-1 text-[11px] text-[#94A3B8] transition-colors duration-150 hover:border-slate-500 hover:text-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              {ex.length > 34 ? `${ex.slice(0, 34)}…` : ex}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close crisis prompt bar"
          className="ml-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[#222C38] bg-[#18202A] text-[#94A3B8] transition-colors duration-150 hover:text-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </form>

      {feedback && (
        <div
          className={`mt-1.5 flex items-center gap-1.5 text-xs ${
            feedback.type === "ok" ? "text-[#34D399]" : "text-[#F87171]"
          }`}
        >
          {feedback.type === "ok" ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}
    </div>
  );
}
