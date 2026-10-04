import { isEmail } from "../dialogue/parse.ts";

/** Canonical NANP form. Consent matches this exact normalized number. */
export function normalizePhone(input: string): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 40) {
    return null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  return null;
}

export function normalizeEmailAddress(input: string): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const email = input.trim().toLowerCase();
  if (!isEmail(email) || email.length > 200) {
    return null;
  }
  return email;
}
