import { timingSafeEqualString } from "./timing";

export async function computeTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
): Promise<string> {
  const signed = url + Object.keys(params).sort().map((key) => `${key}${params[key] ?? ""}`).join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  return base64Encode(new Uint8Array(mac));
}

export async function twilioSignatureIsValid(
  url: string,
  params: Record<string, string>,
  signature: string | null,
  authToken: string,
): Promise<boolean> {
  if (!signature) {
    return false;
  }
  const expected = await computeTwilioSignature(url, params, authToken);
  return timingSafeEqualString(expected, signature);
}

export async function signCallToken(callSid: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`call:${callSid}`));
  return base64UrlEncode(new Uint8Array(mac));
}

export async function callTokenIsValid(callSid: string, token: string | null, secret: string): Promise<boolean> {
  if (!token) {
    return false;
  }
  const expected = await signCallToken(callSid, secret);
  return timingSafeEqualString(expected, token);
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64UrlEncode(bytes: Uint8Array): string {
  return base64Encode(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
