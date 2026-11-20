import { describe, expect, it } from "vitest";
import { DATASET, parseHHMM, simulateNetwork } from "./engine";
import { parseCrisisDeterministic } from "./parse-crisis";
import {
  answerDispatcherQuery,
  buildDeterministicBriefing,
  evaluateRecoveryCandidates,
} from "./recovery";
import { verifyAiBriefing } from "./verify-ai";

describe("Deterministic recovery evaluator, crisis parser & AI hallucination verifier", () => {
  it("finds strictly improving recovery candidates for BOM 90m morning storm", () => {
    const evalRes = evaluateRecoveryCandidates([
      { id: "c-bom", airportId: "BOM", startMin: parseHHMM("07:30"), endMin: parseHHMM("09:00") },
    ]);

    expect(evalRes.baseline.metrics.delayedFlights).toBeGreaterThan(0);
    expect(evalRes.baseline.metrics.totalStrandedPax).toBeGreaterThan(0);
    expect(evalRes.candidates.length).toBeGreaterThan(0);

    const best = evalRes.candidates[0];
    expect(best.deltas.strandedPaxDelta).toBeLessThanOrEqual(0);
    const improves =
      best.deltas.strandedPaxDelta < 0 ||
      best.deltas.crewBreachesDelta < 0 ||
      best.deltas.totalDelayMinutesDelta < 0;
    expect(improves).toBe(true);
  });

  it("enforces physical aircraft positioning on CANCEL_FLIGHT (no teleportation)", () => {
    const evalRes = evaluateRecoveryCandidates([
      { id: "c-bom", airportId: "BOM", startMin: parseHHMM("07:30"), endMin: parseHHMM("09:30") },
    ]);

    for (const candidate of evalRes.candidates) {
      for (const action of candidate.actions) {
        if (action.type === "CANCEL_FLIGHT") {
          expect(action.flightIds.length).toBeGreaterThanOrEqual(1);
          expect(action.flightIds.length).toBeLessThanOrEqual(2);
          if (action.flightIds.length === 1) {
            const f = DATASET.flights.find((x) => x.flight_id === action.flightIds[0])!;
            const tailLegs = DATASET.flights.filter((x) => x.tail_id === f.tail_id);
            const maxOrder = Math.max(...tailLegs.map((x) => x.leg_order));
            expect(f.leg_order).toBe(maxOrder);
          } else {
            const [f1, f2] = action.flightIds.map(
              (id) => DATASET.flights.find((x) => x.flight_id === id)!
            );
            expect(f1.tail_id).toBe(f2.tail_id);
            expect(f2.leg_order).toBe(f1.leg_order + 1);
            expect(f1.origin).toBe(f2.destination);
            expect(f1.destination).toBe(f2.origin);
          }
        }
      }
    }
  });

  it("resolves CR03 / DS0304 crew duty breach using spare VT-DS18 at DEL", () => {
    const evalRes = evaluateRecoveryCandidates([
      { id: "c-bom-pm", airportId: "BOM", startMin: parseHHMM("15:00"), endMin: parseHHMM("16:30") },
    ]);

    expect(evalRes.baseline.metrics.crewBreaches).toBeGreaterThanOrEqual(1);
    const spareRescue = evalRes.candidates.find((c) =>
      c.actions.some(
        (a) =>
          a.type === "SWAP_SPARE" &&
          a.spareTailId === "VT-DS18" &&
          a.targetFlightId === "DS0304"
      )
    );
    expect(spareRescue).toBeDefined();
    expect(spareRescue!.result.metrics.crewBreaches).toBe(0);
    expect(spareRescue!.deltas.strandedPaxDelta).toBeLessThan(0);
  });

  it("Stress Test #4: finds grounded HYD 75m candidates & verifies deterministic briefing", () => {
    const evalRes = evaluateRecoveryCandidates([
      { id: "c-hyd", airportId: "HYD", startMin: parseHHMM("12:00"), endMin: parseHHMM("13:15") },
    ]);

    expect(evalRes.baseline.metrics.delayedFlights).toBeGreaterThan(0);
    const briefing = buildDeterministicBriefing(evalRes);
    const check = verifyAiBriefing(briefing, evalRes);
    expect(check.valid).toBe(true);
    expect(check.violations).toEqual([]);
  });

  it("verifyAiBriefing catches hallucinated numbers and ungrounded flight IDs", () => {
    const evalRes = evaluateRecoveryCandidates([
      { id: "c-hyd", airportId: "HYD", startMin: parseHHMM("12:00"), endMin: parseHHMM("13:15") },
    ]);
    const validBriefing = buildDeterministicBriefing(evalRes);

    const badNumberCheck = verifyAiBriefing(
      {
        ...validBriefing,
        executiveSummary: `${validBriefing.executiveSummary} Saves 9999 passengers.`,
      },
      evalRes
    );
    expect(badNumberCheck.valid).toBe(false);
    expect(badNumberCheck.violations.some((v) => v.includes("9999"))).toBe(true);

    const badFlightCheck = verifyAiBriefing(
      {
        ...validBriefing,
        tradeoffAnalysis: `Reroute DS9999 around storm.`,
      },
      evalRes
    );
    expect(badFlightCheck.valid).toBe(false);
    expect(badFlightCheck.violations.some((v) => v.includes("DS9999"))).toBe(true);
  });

  it("parses single and multi-airport plain-English crisis strings deterministically", () => {
    const single = parseCrisisDeterministic("90 min thunderstorm in Mumbai at 7:30am");
    expect(single.closures).toHaveLength(1);
    expect(single.closures[0]).toMatchObject({
      airportId: "BOM",
      startMin: parseHHMM("07:30"),
      endMin: parseHHMM("09:00"),
    });

    const multi = parseCrisisDeterministic(
      "Heavy monsoon closes Mumbai 08:00-09:30 and fog hits Delhi 10am to 11am"
    );
    expect(multi.closures).toHaveLength(2);
    expect(multi.closures[0]).toMatchObject({
      airportId: "BOM",
      startMin: parseHHMM("08:00"),
      endMin: parseHHMM("09:30"),
    });
    expect(multi.closures[1]).toMatchObject({
      airportId: "DEL",
      startMin: parseHHMM("10:00"),
      endMin: parseHHMM("11:00"),
    });

    const hyd = parseCrisisDeterministic("75 minute storm at HYD at 12:00");
    expect(hyd.closures).toHaveLength(1);
    expect(hyd.closures[0]).toMatchObject({
      airportId: "HYD",
      startMin: parseHHMM("12:00"),
      endMin: parseHHMM("13:15"),
    });
  });

  it("evaluates follow-on recovery candidates cleanly on top of activeActions", () => {
    const closures = [
      { id: "c-bom", airportId: "BOM", startMin: parseHHMM("07:30"), endMin: parseHHMM("09:00") },
    ];
    const first = evaluateRecoveryCandidates(closures, 5, []);
    const applied = first.candidates[0];
    const followOn = evaluateRecoveryCandidates(closures, 5, applied.actions);

    expect(followOn.baseline.metrics.totalStrandedPax).toBe(
      applied.result.metrics.totalStrandedPax
    );
    for (const c of followOn.candidates) {
      expect(c.result.metrics.totalStrandedPax).toBeLessThanOrEqual(
        followOn.baseline.metrics.totalStrandedPax
      );
    }
  });

  it("prevents physical spare tail teleportation when two SWAP_SPARE actions reuse VT-DS18", () => {
    const closures = [
      { id: "c-bom-pm", airportId: "BOM", startMin: parseHHMM("15:00"), endMin: parseHHMM("16:30") },
    ];
    const sim = simulateNetwork(closures, [
      {
        id: "swap-1",
        type: "SWAP_SPARE",
        spareTailId: "VT-DS18",
        targetFlightId: "DS0304",
        label: "Swap 1",
      },
      {
        id: "swap-2",
        type: "SWAP_SPARE",
        spareTailId: "VT-DS18",
        targetFlightId: "DS1204",
        label: "Swap 2",
      },
    ]);

    expect(sim.flightsById["DS0304"].isSpareOperated).toBe(true);
    expect(sim.flightsById["DS1204"].isSpareOperated).toBe(false);
    expect(sim.metrics.sparesUsed).toEqual(["VT-DS18"]);
  });

  it("enforces <= 45m cap on HOLD_CONNECTION directly inside simulateNetwork", () => {
    const closures = [
      { id: "c-bom", airportId: "BOM", startMin: parseHHMM("07:30"), endMin: parseHHMM("09:00") },
    ];
    const cx = DATASET.connections[0];
    const baseSim = simulateNetwork(closures, []);
    const heldSim = simulateNetwork(closures, [
      {
        id: `hold-${cx.connection_id}`,
        type: "HOLD_CONNECTION",
        connectionId: cx.connection_id,
        flightId: cx.to_flight,
        holdMinutes: 120,
        label: "Overlong hold",
      },
    ]);

    const addedDelay =
      heldSim.flightsById[cx.to_flight].actualDepMin -
      baseSim.flightsById[cx.to_flight].actualDepMin;
    expect(addedDelay).toBeLessThanOrEqual(45);
  });

  it("handles duration ranges and shared multi-airport time windows in parseCrisisDeterministic", () => {
    const durRange = parseCrisisDeterministic(
      "60 to 90 minute storm at HYD at 12:00"
    );
    expect(durRange.closures).toHaveLength(1);
    expect(durRange.closures[0]).toMatchObject({
      airportId: "HYD",
      startMin: parseHHMM("12:00"),
      endMin: parseHHMM("13:30"),
    });

    const shared = parseCrisisDeterministic("BOM and DEL closed 12:00-13:30");
    expect(shared.closures).toHaveLength(2);
    expect(shared.closures[0]).toMatchObject({
      airportId: "BOM",
      startMin: parseHHMM("12:00"),
      endMin: parseHHMM("13:30"),
    });
    expect(shared.closures[1]).toMatchObject({
      airportId: "DEL",
      startMin: parseHHMM("12:00"),
      endMin: parseHHMM("13:30"),
    });
  });

  it("buildDeterministicBriefing never writes 'from 0 to 0' when active closure has 0 stranded pax and positive delay reduction", () => {
    const evalRes = evaluateRecoveryCandidates([
      {
        id: "jai-fog",
        airportId: "JAI",
        startMin: parseHHMM("08:30"),
        endMin: parseHHMM("09:45"),
      },
    ]);

    expect(evalRes.baseline.metrics.totalStrandedPax).toBe(0);
    expect(evalRes.baseline.metrics.delayedFlights).toBeGreaterThan(0);
    expect(evalRes.candidates.length).toBeGreaterThan(0);
    expect(evalRes.candidates[0].deltas.totalDelayMinutesDelta).toBeLessThan(0);

    const briefing = buildDeterministicBriefing(evalRes);
    expect(briefing.tradeoffAnalysis).not.toContain("from 0 to 0");
    for (const note of briefing.optionNotes) {
      expect(note.rationale).not.toContain("from 0 to 0");
    }
    expect(verifyAiBriefing(briefing, evalRes).valid).toBe(true);
  });

  it("answerDispatcherQuery('+30m extension') returns exact increased metrics and +30m extended closures", () => {
    const closures = [
      {
        id: "c-bom-ext",
        airportId: "BOM",
        startMin: parseHHMM("07:30"),
        endMin: parseHHMM("09:00"),
      },
    ];
    const sim = simulateNetwork(closures, []);
    const res = answerDispatcherQuery("+30m extension", sim, closures, []);

    expect(res.actionLabel).toBe("Apply +30m Extension");
    expect(res.suggestedClosures).toHaveLength(1);
    expect(res.suggestedClosures![0].endMin).toBe(closures[0].endMin + 30);

    const extSim = simulateNetwork(res.suggestedClosures!, []);
    expect(extSim.metrics.totalDelayMinutes).toBeGreaterThan(sim.metrics.totalDelayMinutes);
    expect(res.answer).toContain(String(extSim.metrics.delayedFlights));
    expect(res.answer).toContain(String(extSim.metrics.totalStrandedPax));
    expect(res.answer).toContain(String(extSim.metrics.totalDelayMinutes));
  });
});
