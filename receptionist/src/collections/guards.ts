import { assertNever } from "../assert-never.ts";
import {
  PAYMENT_CARD_REFUSED,
  SKIP_TRACE_REFUSED,
  THIRD_PARTY_OUTREACH_REFUSED,
  type SuppressionFlag,
} from "./types.ts";

const CARD_KEYS = new Set([
  "pan",
  "cvv",
  "cvc",
  "cid",
  "card",
  "cardnumber",
  "expiry",
  "expiration",
  "expmonth",
  "expyear",
  "routing",
  "routingnumber",
  "accountnumber",
  "bankaccount",
  "ach",
  "iban",
  "debitcard",
  "creditcard",
  "cardcvv",
  "cardcvc",
]);

const SKIP_KEYS = new Set([
  "ssn",
  "socialsecurity",
  "socialsecuritynumber",
  "skiptrace",
  "peoplesearch",
  "peoplefinder",
]);

const OUTREACH_KEYS = new Set([
  "employer",
  "employerphone",
  "employername",
  "reference",
  "references",
  "household",
  "family",
  "affiliate",
  "locationphone",
  "relativename",
  "skiptracevendor",
]);

export type UnsafeCode = typeof PAYMENT_CARD_REFUSED | typeof SKIP_TRACE_REFUSED | typeof THIRD_PARTY_OUTREACH_REFUSED;

export function unsafeCode(value: unknown): UnsafeCode | null {
  return scan(value, 0);
}

export function isSuppressionFlag(value: string): value is SuppressionFlag {
  switch (value) {
    case "cease":
    case "dispute":
    case "attorney":
    case "bankruptcy":
    case "deceased":
    case "scra":
    case "fraud":
    case "wrong_party":
    case "dnc":
    case "consent_revoked":
      return true;
    default:
      return false;
  }
}

export function outreachRefused(role: string): boolean {
  switch (role) {
    case "debtor":
      return false;
    case "family":
    case "household":
    case "affiliate":
    case "reference":
    case "employer":
    case "location":
    case "third_party":
    case "neighbor":
    case "coworker":
    case "relative":
      return true;
    default:
      return true;
  }
}

export function unsafeMessage(code: UnsafeCode): string {
  switch (code) {
    case PAYMENT_CARD_REFUSED:
      return "Card, CVV, and bank account numbers are not accepted. No payment number was stored.";
    case SKIP_TRACE_REFUSED:
      return "Skip-trace, people-search, and SSN lookup data are not accepted.";
    case THIRD_PARTY_OUTREACH_REFUSED:
      return "Outbound contact with family, household members, affiliates, references, employers, locations, or other third parties is refused.";
    default:
      return assertNever(code, "unsafe code");
  }
}

function scan(value: unknown, depth: number): UnsafeCode | null {
  if (depth > 6 || value === null || typeof value !== "object") {
    return null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = scan(entry, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }
  for (const [key, entry] of Object.entries(value)) {
    const norm = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (CARD_KEYS.has(norm)) {
      return PAYMENT_CARD_REFUSED;
    }
    if (SKIP_KEYS.has(norm)) {
      return SKIP_TRACE_REFUSED;
    }
    if (OUTREACH_KEYS.has(norm)) {
      return THIRD_PARTY_OUTREACH_REFUSED;
    }
    const nested = scan(entry, depth + 1);
    if (nested) {
      return nested;
    }
  }
  return null;
}
