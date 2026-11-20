/**
 * Cmd/Ctrl+K modal translating plain-English Indian weather disruption prompts
 * into deterministic IST airport closure windows via `/api/parse-crisis`.
 */

"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Sparkles, X } from "lucide-react";
import type { AirportClosure } from "@/lib/sim/types";

/** Props accepted by `CrisisCommandModal`. */
export interface CrisisCommandModalProps {
  isOpen: boolean;
  onApplyClosures: (closures: AirportClosure[]) => void;
  onClose: () => void;
}

const EXAMPLE_PROMPTS = [
  "75 minute storm at Hyderabad at 12:00",
  "Monsoon closes Mumbai 08:00-09:30 and fog hits Delhi 11:15 to 12:15",
  "90 min fog at Guwahati at 17:00",
];

/**
 * Renders the modal dialog for compiling plain-English crisis scenarios.
 */
export function CrisisCommandModal({
  isOpen,
  onApplyClosures,
  onClose,
}: CrisisCommandModalProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/parse-crisis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.closures) || data.closures.length === 0) {
        setError(
          data.summary ||
            "No valid Indian airport detected. Try e.g. '75 min storm at HYD at 12:00'."
        );
      } else {
        onApplyClosures(data.closures);
        setPrompt("");
        onClose();
      }
    } catch {
      setError("Failed to compile crisis command. Please retry.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[#0F172A]/40 px-4 pt-24"
      role="dialog"
      aria-modal="true"
      aria-label="Plain-English crisis command"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-[#E6EBF2] bg-[#FFFFFF] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-[#0F172A]">
              Simulate a crisis in plain English
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close crisis dialog"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[#E6EBF2] text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <label htmlFor="crisis-modal-input" className="sr-only">
            Crisis description
          </label>
          <input
            id="crisis-modal-input"
            type="text"
            autoFocus
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setError(null);
            }}
            placeholder="e.g. Heavy monsoon closes Mumbai 08:00-09:30 and fog hits Delhi 11:15 to 12:15"
            className="h-10 w-full rounded-md border border-[#CBD5E1] bg-[#FBFCFD] px-3 text-sm text-[#0F172A] placeholder:text-[#475569] focus-visible:border-[#2B79FB] focus-visible:bg-[#FFFFFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
          />

          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_PROMPTS.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPrompt(ex)}
                className="cursor-pointer rounded-md border border-[#E6EBF2] bg-[#FBFCFD] px-2.5 py-1 text-xs text-[#475569] hover:border-[#2B79FB]/40 hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
              >
                {ex}
              </button>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-[#B91C1C]" role="alert">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <span className="inline-flex items-center gap-1 text-[11px] text-[#475569]">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#047857]" aria-hidden="true" />
              Compiles to exact IST airport closure windows
            </span>
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="h-9 cursor-pointer rounded-md bg-[#1D4ED8] px-4 text-xs font-semibold text-white transition-colors duration-150 hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
            >
              {loading ? "Compiling..." : "Run Crisis"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
