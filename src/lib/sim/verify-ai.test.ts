import { describe, expect, it } from "vitest";
import { parseHHMM } from "./constants";
import { buildDeterministicBriefing, evaluateRecoveryCandidates } from "./recovery";
import type { DispatcherBriefing, RecoveryEvaluation } from "./types";
import { verifyAiBriefing } from "./verify-ai";

function hydEvaluation(): RecoveryEvaluation {
  return evaluateRecoveryCandidates([
    { id: "c-hyd", airportId: "HYD", startMin: parseHHMM("12:00"), endMin: parseHHMM("13:15") },
  ]);
}

function withSummary(base: DispatcherBriefing, extra: string): DispatcherBriefing {
  return { ...base, executiveSummary: `${base.executiveSummary} ${extra}` };
}

describe("verifyAiBriefing zero-hallucination allow-list", () => {
  const evaluation = hydEvaluation();
  const briefing = buildDeterministicBriefing(evaluation);

  it("accepts the deterministic briefing built from the same evaluation", () => {
    expect(evaluation.candidates.length).toBeGreaterThan(0);
    const check = verifyAiBriefing(briefing, evaluation);
    expect(check.valid).toBe(true);
    expect(check.violations).toEqual([]);
  });

  it("rejects an ungrounded crew ID (CR99)", () => {
    const check = verifyAiBriefing(withSummary(briefing, "Crew CR99 is stood down."), evaluation);
    expect(check.valid).toBe(false);
    expect(check.violations).toContain("Ungrounded crew ID: CR99");
  });

  it("rejects an ungrounded tail ID (VT-DS99)", () => {
    const check = verifyAiBriefing(withSummary(briefing, "Swap in VT-DS99 immediately."), evaluation);
    expect(check.valid).toBe(false);
    expect(check.violations).toContain("Ungrounded tail ID: VT-DS99");
  });

  it("rejects an ungrounded connection ID (CX99)", () => {
    const check = verifyAiBriefing(withSummary(briefing, "Protect CX99 passengers."), evaluation);
    expect(check.valid).toBe(false);
    expect(check.violations).toContain("Ungrounded connection ID: CX99");
  });

  it("rejects an ungrounded flight ID (DS9999)", () => {
    const check = verifyAiBriefing(withSummary(briefing, "Reroute DS9999."), evaluation);
    expect(check.valid).toBe(false);
    expect(check.violations).toContain("Ungrounded flight ID: DS9999");
  });

  it("rejects an unknown recommendedCandidateId", () => {
    const check = verifyAiBriefing({ ...briefing, recommendedCandidateId: "not-a-candidate" }, evaluation);
    expect(check.valid).toBe(false);
    expect(check.violations).toContain('Invalid recommendedCandidateId "not-a-candidate"');
  });

  it("rejects an unknown candidateId inside optionNotes", () => {
    const check = verifyAiBriefing(
      { ...briefing, optionNotes: [{ candidateId: "ghost", rationale: "ok", tradeoff: "ok" }] },
      evaluation
    );
    expect(check.valid).toBe(false);
    expect(check.violations).toContain("Unknown candidateId in optionNotes: ghost");
  });

  it("rejects an unknown standalone integer but ignores digits inside grounded IDs", () => {
    const bad = verifyAiBriefing(withSummary(briefing, "Saves 4242 passengers."), evaluation);
    expect(bad.valid).toBe(false);
    expect(bad.violations).toContain("Ungrounded integer: 4242");

    // Digits in a grounded tail/flight ID must not be mistaken for loose integers.
    const spare = evaluation.candidates
      .flatMap((c) => c.actions)
      .find((a) => a.type === "SWAP_SPARE");
    if (spare && spare.type === "SWAP_SPARE") {
      const ok = verifyAiBriefing(
        withSummary(briefing, `Use ${spare.spareTailId} on ${spare.targetFlightId}.`),
        evaluation
      );
      expect(ok.violations.filter((v) => v.startsWith("Ungrounded integer"))).toEqual([]);
    }
  });

  it("requires a null recommendation when no candidates exist", () => {
    const clear = evaluateRecoveryCandidates([]);
    const clearBriefing = buildDeterministicBriefing(clear);
    expect(clear.candidates).toEqual([]);
    expect(verifyAiBriefing(clearBriefing, clear).valid).toBe(true);

    const bad = verifyAiBriefing({ ...clearBriefing, recommendedCandidateId: "swap-x" }, clear);
    expect(bad.valid).toBe(false);
  });
});
