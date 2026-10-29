import { describe, expect, it } from "vitest";
import { decide, SAMPLES, downloadRequest } from "./ehds";

const s = (id: string) => SAMPLES.find((r) => r.id === id)!;

describe("EHDS decisions", () => {
  it("rejects prohibited purposes under Art. 54", () => {
    const r = decide(s("REQ-002"));
    expect(r.decision).toBe("REJECT");
    expect(r.articles).toContain("Art. 54");
  });
  it("approves aggregated research as statistical", () => {
    expect(decide(s("REQ-001")).decision).toBe("APPROVE_STATISTICAL");
  });
  it("routes individual-level data to the SPE", () => {
    expect(decide(s("REQ-003")).decision).toBe("APPROVE_SPE");
  });
  it("rejects aggregated output with cell size below 10", () => {
    expect(decide(s("REQ-007")).decision).toBe("REJECT");
  });
  it("blocks downloads with 403", async () => {
    expect((await downloadRequest("REQ-001")).status).toBe(403);
  });
});
