import { describe, it, expect } from "vitest";
import { estimatePrice, applyRules, DEFAULT_RATES } from "../utils/pricing.js";
import type { CityRates, ApplicableRule } from "../utils/pricing.js";

/* ============================================================
 * FIXTURES
 * ============================================================ */

const OUAGA_RATES: CityRates = {
  taxi_rate_per_km:      250,
  zemidjan_rate_per_km:  150,
  min_fare:              500,
  night_rate_multiplier: 1.0,
};

const DAYTIME = new Date("2026-06-15T10:00:00"); /* lundi 15 juin 2026 — matin */
const NIGHT   = new Date("2026-06-15T23:00:00"); /* lundi 15 juin 2026 — nuit  */

/* ============================================================
 * estimatePrice
 * ============================================================ */

describe("estimatePrice", () => {
  it("returns min_fare for a trip shorter than ~400 m", () => {
    const price = estimatePrice(12.37, -1.52, 12.371, -1.521, "zemidjan", OUAGA_RATES, [], DAYTIME);
    expect(price).toBe(OUAGA_RATES.min_fare);
  });

  it("taxi costs more than zemidjan for the same route", () => {
    const zm = estimatePrice(12.37, -1.52, 12.42, -1.58, "zemidjan", OUAGA_RATES, [], DAYTIME);
    const tx = estimatePrice(12.37, -1.52, 12.42, -1.58, "taxi",     OUAGA_RATES, [], DAYTIME);
    expect(tx).toBeGreaterThan(zm);
  });

  it("longer route costs more than shorter route", () => {
    const short = estimatePrice(12.37, -1.52, 12.38, -1.53, "taxi", OUAGA_RATES, [], DAYTIME);
    const long  = estimatePrice(12.37, -1.52, 12.50, -1.70, "taxi", OUAGA_RATES, [], DAYTIME);
    expect(long).toBeGreaterThan(short);
  });

  it("applies night_rate_multiplier between 22h and 6h", () => {
    const rates: CityRates = { ...OUAGA_RATES, night_rate_multiplier: 1.2 };
    const day   = estimatePrice(12.37, -1.52, 12.45, -1.60, "taxi", rates, [], DAYTIME);
    const night = estimatePrice(12.37, -1.52, 12.45, -1.60, "taxi", rates, [], NIGHT);
    expect(night).toBeGreaterThan(day);
  });

  it("unknown ride type uses fallback rate and still respects min_fare", () => {
    const price = estimatePrice(12.37, -1.52, 12.371, -1.521, "helicopter", OUAGA_RATES, [], DAYTIME);
    expect(price).toBeGreaterThanOrEqual(OUAGA_RATES.min_fare);
  });

  it("uses DEFAULT_RATES values correctly", () => {
    expect(DEFAULT_RATES.taxi_rate_per_km).toBe(250);
    expect(DEFAULT_RATES.zemidjan_rate_per_km).toBe(150);
    expect(DEFAULT_RATES.min_fare).toBe(500);
  });
});

/* ============================================================
 * applyRules
 * ============================================================ */

describe("applyRules", () => {
  it("returns ×1 when no rules", () => {
    const { taxiMult, zemidjanMult } = applyRules([], DAYTIME);
    expect(taxiMult).toBe(1);
    expect(zemidjanMult).toBe(1);
  });

  it("applies a month rule that matches", () => {
    const june: ApplicableRule = {
      months: [6], weekdays: [], hour_start: null, hour_end: null,
      date_from: null, date_to: null,
      taxi_multiplier: 1.3, zemidjan_multiplier: 1.2,
    };
    const { taxiMult } = applyRules([june], DAYTIME); /* DAYTIME is June */
    expect(taxiMult).toBeCloseTo(1.3);
  });

  it("skips a month rule that does not match", () => {
    const january: ApplicableRule = {
      months: [1], weekdays: [], hour_start: null, hour_end: null,
      date_from: null, date_to: null,
      taxi_multiplier: 1.5, zemidjan_multiplier: 1.5,
    };
    const { taxiMult } = applyRules([january], DAYTIME); /* DAYTIME is June */
    expect(taxiMult).toBe(1);
  });

  it("applies a weekday rule that matches", () => {
    /* DAYTIME is a Monday (getDay() === 1) */
    const mondays: ApplicableRule = {
      months: [], weekdays: [1], hour_start: null, hour_end: null,
      date_from: null, date_to: null,
      taxi_multiplier: 1.1, zemidjan_multiplier: 1.0,
    };
    const { taxiMult } = applyRules([mondays], DAYTIME);
    expect(taxiMult).toBeCloseTo(1.1);
  });

  it("applies an hour range rule", () => {
    const morning: ApplicableRule = {
      months: [], weekdays: [], hour_start: 7, hour_end: 12,
      date_from: null, date_to: null,
      taxi_multiplier: 1.15, zemidjan_multiplier: 1.1,
    };
    const at10 = new Date("2026-06-15T10:30:00");
    const at14 = new Date("2026-06-15T14:00:00");
    expect(applyRules([morning], at10).taxiMult).toBeCloseTo(1.15);
    expect(applyRules([morning], at14).taxiMult).toBe(1); /* outside range */
  });

  it("supports overnight hour ranges (22→6)", () => {
    const night: ApplicableRule = {
      months: [], weekdays: [], hour_start: 22, hour_end: 6,
      date_from: null, date_to: null,
      taxi_multiplier: 1.25, zemidjan_multiplier: 1.25,
    };
    const at23 = new Date("2026-06-15T23:00:00");
    const at03 = new Date("2026-06-15T03:00:00");
    const at12 = new Date("2026-06-15T12:00:00");
    expect(applyRules([night], at23).taxiMult).toBeCloseTo(1.25);
    expect(applyRules([night], at03).taxiMult).toBeCloseTo(1.25);
    expect(applyRules([night], at12).taxiMult).toBe(1);
  });

  it("compounds multiple matching rules", () => {
    const r1: ApplicableRule = {
      months: [6], weekdays: [], hour_start: null, hour_end: null,
      date_from: null, date_to: null,
      taxi_multiplier: 1.2, zemidjan_multiplier: 1.0,
    };
    const r2: ApplicableRule = {
      months: [], weekdays: [1], hour_start: null, hour_end: null,
      date_from: null, date_to: null,
      taxi_multiplier: 1.1, zemidjan_multiplier: 1.0,
    };
    /* Both match DAYTIME (June, Monday) → 1.2 × 1.1 = 1.32 */
    const { taxiMult } = applyRules([r1, r2], DAYTIME);
    expect(taxiMult).toBeCloseTo(1.32);
  });

  it("caps compound multiplier at ×2.00", () => {
    const big: ApplicableRule = {
      months: [], weekdays: [], hour_start: null, hour_end: null,
      date_from: null, date_to: null,
      taxi_multiplier: 1.8, zemidjan_multiplier: 1.8,
    };
    const also_big: ApplicableRule = { ...big };
    /* 1.8 × 1.8 = 3.24, but capped at 2.0 */
    const { taxiMult } = applyRules([big, also_big], DAYTIME);
    expect(taxiMult).toBe(2.0);
  });

  it("applies date_from / date_to window", () => {
    const fespaco: ApplicableRule = {
      months: [], weekdays: [], hour_start: null, hour_end: null,
      date_from: new Date("2026-02-20"),
      date_to:   new Date("2026-03-01"),
      taxi_multiplier: 1.3, zemidjan_multiplier: 1.2,
    };
    const during = new Date("2026-02-25T12:00:00");
    const after  = new Date("2026-03-05T12:00:00");
    expect(applyRules([fespaco], during).taxiMult).toBeCloseTo(1.3);
    expect(applyRules([fespaco], after).taxiMult).toBe(1);
  });
});
