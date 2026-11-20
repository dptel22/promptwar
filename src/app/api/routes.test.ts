import { describe, expect, it } from "vitest";
import { verifyAiBriefing } from "@/lib/sim/verify-ai";
import { POST as dispatchPost } from "./dispatch/route";
import { POST as parseCrisisPost } from "./parse-crisis/route";

describe("Next.js API Route Handlers (/api/dispatch & /api/parse-crisis)", () => {
  it("POST /api/dispatch rejects malformed JSON with HTTP 400", async () => {
    const req = new Request("http://localhost/api/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad-json",
    });

    const res = await dispatchPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid JSON payload");
  });

  it("POST /api/dispatch rejects invalid airport IATA ('XXX') with HTTP 400", async () => {
    const req = new Request("http://localhost/api/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        closures: [
          { id: "bad-iata", airportId: "XXX", startMin: 720, endMin: 795 },
        ],
      }),
    });

    const res = await dispatchPost(req);
    expect(res.status).toBe(400);
  });

  it("POST /api/dispatch rejects inverted closure window (endMin <= startMin) with HTTP 400", async () => {
    const req = new Request("http://localhost/api/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        closures: [
          { id: "bad-win", airportId: "HYD", startMin: 800, endMin: 795 },
        ],
      }),
    });

    const res = await dispatchPost(req);
    expect(res.status).toBe(400);
  });

  it("POST /api/dispatch returns HTTP 200 on HYD 75m (720..795) with deterministic metrics & verified briefing", async () => {
    const req = new Request("http://localhost/api/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        closures: [
          { id: "hyd-75", airportId: "HYD", startMin: 720, endMin: 795 },
        ],
        activeActions: [],
      }),
    });

    const res = await dispatchPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.evaluation.baseline.metrics.delayedFlights).toBeGreaterThan(0);
    expect(verifyAiBriefing(data.briefing, data.evaluation).valid).toBe(true);
  });

  it("POST /api/parse-crisis rejects malformed JSON with HTTP 400", async () => {
    const req = new Request("http://localhost/api/parse-crisis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json {",
    });

    const res = await parseCrisisPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid JSON payload");
  });

  it("POST /api/parse-crisis rejects too-short 1-char prompt ('a') with HTTP 400", async () => {
    const req = new Request("http://localhost/api/parse-crisis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "a" }),
    });

    const res = await parseCrisisPost(req);
    expect(res.status).toBe(400);
  });

  it("POST /api/parse-crisis compiles '75 minute storm at HYD at 12:00' to exact HYD window", async () => {
    const req = new Request("http://localhost/api/parse-crisis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "75 minute storm at HYD at 12:00" }),
    });

    const res = await parseCrisisPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.closures).toHaveLength(1);
    expect(data.closures[0]).toMatchObject({
      airportId: "HYD",
      startMin: 720,
      endMin: 795,
    });
  });
});
