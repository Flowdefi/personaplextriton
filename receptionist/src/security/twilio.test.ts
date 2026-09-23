import { describe, expect, it } from "vitest";
import { callTokenIsValid, computeTwilioSignature, signCallToken, twilioSignatureIsValid } from "./twilio";

describe("twilio signatures", () => {
  it("accepts a matching signature and rejects a tampered body", async () => {
    const url = "https://example.com/voice/incoming";
    const params = { CallSid: "CA123", From: "+15612546608" };
    const token = "test-auth-token";
    const signature = await computeTwilioSignature(url, params, token);
    expect(await twilioSignatureIsValid(url, params, signature, token)).toBe(true);
    expect(await twilioSignatureIsValid(url, { ...params, From: "+1999" }, signature, token)).toBe(false);
    expect(await twilioSignatureIsValid(url, params, null, token)).toBe(false);
  });

  it("signs a per-call websocket token", async () => {
    const token = await signCallToken("CA123", "secret");
    expect(await callTokenIsValid("CA123", token, "secret")).toBe(true);
    expect(await callTokenIsValid("CA999", token, "secret")).toBe(false);
  });
});
