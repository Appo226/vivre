import { describe, it, expect } from "vitest";
import { haversineKm } from "../services/ride-sse.service.js";

describe("haversineKm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineKm(12.37, -1.52, 12.37, -1.52)).toBe(0);
  });

  it("Ouagadougou → Bobo-Dioulasso is ~320 km", () => {
    const d = haversineKm(12.3647, -1.5336, 11.1770, -4.2979);
    expect(d).toBeGreaterThan(300);
    expect(d).toBeLessThan(350);
  });

  it("is symmetric (A→B == B→A)", () => {
    const ab = haversineKm(12.37, -1.52, 11.18, -4.30);
    const ba = haversineKm(11.18, -4.30, 12.37, -1.52);
    expect(ab).toBeCloseTo(ba, 6);
  });

  it("~1 km north in Ouagadougou", () => {
    /* 0.009° of latitude ≈ 1 km */
    const d = haversineKm(12.3647, -1.5336, 12.3737, -1.5336);
    expect(d).toBeGreaterThan(0.9);
    expect(d).toBeLessThan(1.1);
  });
});
