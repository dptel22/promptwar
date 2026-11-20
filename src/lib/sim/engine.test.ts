import { describe, expect, it } from "vitest";
import { DATASET, formatHHMM, parseHHMM, simulateNetwork } from "./engine";

describe("Domino Sky dataset & deterministic cascade engine", () => {
  it("loads exact organiser dataset counts and valid connection passenger bounds", () => {
    expect(DATASET.airports).toHaveLength(16);
    expect(DATASET.flights).toHaveLength(70);
    expect(DATASET.connections).toHaveLength(21);
    expect(DATASET.crews).toHaveLength(16);
    expect(DATASET.spare_aircraft).toHaveLength(2);

    const byId = new Map(DATASET.flights.map((f) => [f.flight_id, f]));
    for (const cx of DATASET.connections) {
      const fromF = byId.get(cx.from_flight);
      const toF = byId.get(cx.to_flight);
      expect(fromF).toBeDefined();
      expect(toF).toBeDefined();
      if (!fromF || !toF) continue;
      expect(cx.passengers).toBeLessThanOrEqual(Math.min(fromF.pax, toF.pax));
    }
  });

  it("parses and formats IST 24h times accurately", () => {
    expect(parseHHMM("08:00")).toBe(480);
    expect(parseHHMM("21:20")).toBe(1280);
    expect(formatHHMM(480)).toBe("08:00");
    expect(formatHHMM(1280)).toBe("21:20");
  });

  it("produces zero delays, zero breaches, and zero stranded pax under clear skies", () => {
    const res = simulateNetwork([]);
    expect(res.metrics.totalFlights).toBe(70);
    expect(res.metrics.onTimeFlights).toBe(70);
    expect(res.metrics.delayedFlights).toBe(0);
    expect(res.metrics.crewBreaches).toBe(0);
    expect(res.metrics.cancelledFlights).toBe(0);
    expect(res.metrics.brokenConnections).toBe(0);
    expect(res.metrics.totalStrandedPax).toBe(0);
  });

  it("Stress Test #1: absorbs a 20-minute BOM delay via turnaround slack, while a 110-minute storm cascades multi-hop", () => {
    const shortRes = simulateNetwork([
      { id: "c1", airportId: "BOM", startMin: parseHHMM("07:30"), endMin: parseHHMM("07:50") },
    ]);
    const longRes = simulateNetwork([
      { id: "c1", airportId: "BOM", startMin: parseHHMM("07:30"), endMin: parseHHMM("09:20") },
    ]);

    // Generous 70-75m turnarounds absorb the short 5-10m delay cleanly
    expect(shortRes.flightsById["DS1201"].delayMin).toBe(10);
    expect(shortRes.flightsById["DS1202"].delayMin).toBe(10);
    expect(shortRes.flightsById["DS1203"].bufferAbsorbedMin).toBe(10);
    expect(shortRes.flightsById["DS1203"].delayMin).toBe(0);
    expect(shortRes.flightsById["DS1204"].delayMin).toBe(0);

    expect(shortRes.flightsById["DS0403"].bufferAbsorbedMin).toBe(5);
    expect(shortRes.flightsById["DS0403"].delayMin).toBe(0);

    // 110-minute storm shatters those same turnarounds and cascades 3-4 hops
    expect(longRes.flightsById["DS1203"].delayMin).toBeGreaterThan(0);
    expect(longRes.flightsById["DS1204"].delayMin).toBeGreaterThan(0);
    expect(longRes.flightsById["DS0404"].delayMin).toBeGreaterThan(0);
    expect(longRes.metrics.delayedFlights).toBeGreaterThan(shortRes.metrics.delayedFlights);
    expect(longRes.metrics.totalStrandedPax).toBeGreaterThan(shortRes.metrics.totalStrandedPax);
  });

  it("Stress Test #2: spoke closure at GAU only impacts aircraft tails routed through GAU", () => {
    const gauShort = simulateNetwork([
      { id: "c-gau-1", airportId: "GAU", startMin: parseHHMM("17:00"), endMin: parseHHMM("19:45") },
    ]);
    const shortTails = new Set(
      gauShort.flights.filter((f) => f.status !== "ON_TIME").map((f) => f.tail_id)
    );
    expect(Array.from(shortTails).sort()).toEqual(["VT-DS10"]);

    const gauExtended = simulateNetwork([
      { id: "c-gau-2", airportId: "GAU", startMin: parseHHMM("17:00"), endMin: parseHHMM("20:45") },
    ]);
    const extTails = new Set(
      gauExtended.flights.filter((f) => f.status !== "ON_TIME").map((f) => f.tail_id)
    );
    expect(Array.from(extTails).sort()).toEqual(["VT-DS10", "VT-DS11"]);
  });

  it("Goldfish Fix #1: turnaround-before-closure prevents delayed flights from operating during a downstream closure", () => {
    // BOM 08:00-09:30 delays DS1502 (BOM->DEL, arr 11:00 -> pushed to ~11:40) into DEL closure 11:15-12:15
    const bomStart = parseHHMM("08:00");
    const bomEnd = parseHHMM("09:30");
    const delStart = parseHHMM("11:15");
    const delEnd = parseHHMM("12:15");

    const res = simulateNetwork([
      { id: "c-bom", airportId: "BOM", startMin: bomStart, endMin: bomEnd },
      { id: "c-del", airportId: "DEL", startMin: delStart, endMin: delEnd },
    ]);

    for (const f of res.flights) {
      if (f.status === "CANCELLED" || f.status === "CREW_BREACH") continue;
      if (f.origin === "BOM") {
        expect(f.actualDepMin < bomStart || f.actualDepMin >= bomEnd).toBe(true);
      }
      if (f.destination === "BOM") {
        expect(f.actualArrMin < bomStart || f.actualArrMin >= bomEnd).toBe(true);
      }
      if (f.origin === "DEL") {
        expect(f.actualDepMin < delStart || f.actualDepMin >= delEnd).toBe(true);
      }
      if (f.destination === "DEL") {
        expect(f.actualArrMin < delStart || f.actualArrMin >= delEnd).toBe(true);
      }
    }
  });

  it("enforces 600-min crew duty legality (CR03 / DS0304) and excludes CREW_BREACH from delayedFlights", () => {
    // BOM closure 15:00-16:30 catches DS0302 arrival (15:35 -> 16:30), pushing DS0304 past 21:30 duty limit
    const res = simulateNetwork([
      { id: "c-bom-pm", airportId: "BOM", startMin: parseHHMM("15:00"), endMin: parseHHMM("16:30") },
    ]);

    const ds0304 = res.flightsById["DS0304"];
    expect(ds0304.status).toBe("CREW_BREACH");
    expect(ds0304.crewOvertimeMin).toBeGreaterThan(0);
    expect(res.metrics.crewBreaches).toBeGreaterThanOrEqual(1);

    const operatedDelayed = res.flights.filter((f) => f.status === "DELAYED").length;
    expect(res.metrics.delayedFlights).toBe(operatedDelayed);
  });

  it("Goldfish Fix #2: uses inclusion-exclusion when both legs of a connection are grounded (no double counting)", () => {
    // Cancel both DS1201 and DS1502 (CX01 connects 43 pax between them)
    const res = simulateNetwork([], [
      {
        id: "cancel-ds1201-pair",
        type: "CANCEL_FLIGHT",
        flightIds: ["DS1201", "DS1202"],
        label: "Cancel DS1201/DS1202",
      },
      {
        id: "cancel-ds1502-pair",
        type: "CANCEL_FLIGHT",
        flightIds: ["DS1501", "DS1502"],
        label: "Cancel DS1501/DS1502",
      },
    ]);

    const cx01 = res.connections.find((c) => c.connection_id === "CX01");
    expect(cx01).toBeDefined();
    expect(cx01?.status).toBe("BROKEN_GROUNDED");
    expect(cx01?.isDualGrounded).toBe(true);
    expect(res.metrics.dualGroundedOverlapPax).toBeGreaterThanOrEqual(43);
    expect(res.metrics.totalStrandedPax).toBe(
      res.metrics.groundedPax - res.metrics.dualGroundedOverlapPax + res.metrics.missedConnectionPax
    );
  });
});
