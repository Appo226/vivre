/**
 * services/sms.service.ts — OTP delivery via Twilio Verify
 *
 * Production: delegates everything (generation, storage, delivery) to
 * Twilio Verify. No phone number owned by us is needed.
 *
 * Dev (no credentials): falls back to local code generation + Redis
 * storage, with the code returned in-band so testers don't need an SMS.
 */

import Twilio from "twilio";
import { generateOtpCode } from "./otp.service.js";
import { saveOtp } from "./otp.service.js";

/* ── Twilio client (lazy, nullable) ──────────────────────────────── */

function getTwilioClient(): ReturnType<typeof Twilio> | null {
  const sid   = process.env["TWILIO_ACCOUNT_SID"];
  const token = process.env["TWILIO_AUTH_TOKEN"];
  if (!sid || !token || sid === "CHANGE_ME" || token === "CHANGE_ME") return null;
  return Twilio(sid, token);
}

function getVerifyServiceSid(): string | null {
  const sid = process.env["TWILIO_VERIFY_SERVICE_SID"];
  return sid && sid !== "CHANGE_ME" ? sid : null;
}

/* ── Send ─────────────────────────────────────────────────────────── */

/**
 * Send an OTP to `phone`.
 * Returns `{ devCode }` in dev mode so the caller can expose it in the
 * API response without any real SMS being sent.
 */
export async function sendVerification(
  phone: string
): Promise<{ devCode?: string }> {
  const client     = getTwilioClient();
  const serviceSid = getVerifyServiceSid();

  /* Dev fallback: no Twilio creds */
  if (!client || !serviceSid) {
    const code = generateOtpCode();
    await saveOtp(phone, code);
    console.log("\n╔═══════════════════════════════════════╗");
    console.log("║      MODE DEV — TWILIO VERIFY OTP     ║");
    console.log(`║  Téléphone : ${phone.padEnd(22)} ║`);
    console.log(`║  Code OTP  : ${code.padEnd(22)} ║`);
    console.log("╚═══════════════════════════════════════╝\n");
    return { devCode: code };
  }

  /* Production: Twilio Verify handles generation, storage and SMS */
  await client.verify.v2
    .services(serviceSid)
    .verifications.create({ to: phone, channel: "sms" });

  return {};
}

/* ── Check ────────────────────────────────────────────────────────── */

/**
 * Verify the OTP submitted by the user.
 * Returns true if the code is correct and unused.
 */
export async function checkVerification(
  phone: string,
  code: string
): Promise<boolean> {
  const client     = getTwilioClient();
  const serviceSid = getVerifyServiceSid();

  /* Dev fallback: check against Redis */
  if (!client || !serviceSid) {
    const { verifyOtp } = await import("./otp.service.js");
    const result = await verifyOtp(phone, code);
    return result.success;
  }

  /* Production: Twilio Verify check */
  try {
    const check = await client.verify.v2
      .services(serviceSid)
      .verificationChecks.create({ to: phone, code });
    return check.status === "approved";
  } catch {
    /* Twilio throws when the code is not found / already used */
    return false;
  }
}
