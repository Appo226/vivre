import { describe, it, expect } from "vitest";
import {
  otpKey,
  otpRateLimitKey,
  refreshTokenKey,
  OTP_TTL_SECONDS,
  OTP_RATE_LIMIT_MAX,
  OTP_RATE_LIMIT_WINDOW,
} from "../plugins/redis.js";

/**
 * Pure unit tests for the Redis key helpers and OTP constants.
 * No external services required — these are pure functions.
 */
describe("Redis key helpers", () => {
  it("otpKey produces a namespaced key", () => {
    expect(otpKey("+22670000000")).toBe("otp:+22670000000");
  });

  it("otpRateLimitKey produces a different namespace from otpKey", () => {
    const phone = "+22670000000";
    expect(otpRateLimitKey(phone)).not.toBe(otpKey(phone));
    expect(otpRateLimitKey(phone)).toBe("otp_rl:+22670000000");
  });

  it("refreshTokenKey encodes userId and tokenId", () => {
    expect(refreshTokenKey("user-1", "tok-abc")).toBe("rt:user-1:tok-abc");
  });

  it("different users produce different keys", () => {
    expect(otpKey("+22670000001")).not.toBe(otpKey("+22670000002"));
  });
});

describe("OTP constants", () => {
  it("OTP expires in 5 minutes", () => {
    expect(OTP_TTL_SECONDS).toBe(300);
  });

  it("rate limit allows max 3 OTPs per window", () => {
    expect(OTP_RATE_LIMIT_MAX).toBe(3);
  });

  it("rate limit window is 1 hour", () => {
    expect(OTP_RATE_LIMIT_WINDOW).toBe(3600);
  });
});
