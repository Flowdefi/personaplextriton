import { assertNever } from "../assert-never.ts";
import { isEmail } from "../dialogue/parse.ts";
import { isSuppressionFlag, outreachRefused, unsafeCode, unsafeMessage, type UnsafeCode } from "./guards.ts";
import { isFullName } from "./identity.ts";
import { isCents } from "./money.ts";
import { normalizeEmailAddress, normalizePhone } from "./phone.ts";
import { isValidTimeZone } from "./quiet-hours.ts";
import {
  PAYMENT_CARD_REFUSED,
  SKIP_TRACE_REFUSED,
  THIRD_PARTY_OUTREACH_REFUSED,
  type AccountStatus,
  type Channel,
  type SuppressionFlag,
} from "./types.ts";

export interface FieldFailure {
  ok: false;
  httpStatus: number;
  code: string;
  error: string;
}

export interface CreateAccountInput {
  debtorName: string;
  principalCents: number;
  creditor: string;
  status: AccountStatus;
  phones: string[];
  emails: string[];
  timeZone: string;
  creditorAuthority: boolean;
  last4: string | null;
  dob: string | null;
  suppressions: SuppressionFlag[];
}

export interface ConsentInput {
  channel: Channel;
  address: string;
  timestamp: number;
  source: string;
}

export interface RevokeInput {
  channel: Channel;
  address: string;
  revokedAt: number;
}

export interface OutboundInput {
  channel: Channel;
  address: string;
  now: number;
  statedName: string | null;
  last4: string | null;
  dob: string | null;
}

export interface OfferInput {
  offer: "hardship" | "plan_65" | "settlement_40";
  paymentCount: 3 | 6 | null;
  now: number;
  channel: Channel;
}

export interface ManualInput {
  code: "refused" | "dispute" | "cease" | "promise_to_pay";
  channel: Channel;
  now: number;
  note: string | null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseCreateAccount(body: unknown): { ok: true; value: CreateAccountInput } | FieldFailure {
  const unsafe = rejectUnsafe(body);
  if (unsafe) {
    return unsafe;
  }
  if (!isRecord(body)) {
    return failure(400, "validation_error", "JSON object is required.");
  }
  const debtorName = requiredString(body.debtorName, "debtorName", 80);
  if (typeof debtorName !== "string") {
    return debtorName;
  }
  if (!isFullName(debtorName)) {
    return failure(400, "validation_error", "debtorName must be a full name, not a first name alone.");
  }
  if (!isCents(body.principalCents) || body.principalCents < 100) {
    return failure(400, "validation_error", "principalCents must be an integer of at least 100.");
  }
  const creditor = requiredString(body.creditor, "creditor", 120);
  if (typeof creditor !== "string") {
    return creditor;
  }
  const status = parseStatus(body.status);
  if (typeof status !== "string") {
    return status;
  }
  const phones = parsePhones(body.phones);
  if (!Array.isArray(phones)) {
    return phones;
  }
  const emails = parseEmails(body.emails);
  if (!Array.isArray(emails)) {
    return emails;
  }
  if (typeof body.timeZone !== "string" || !isValidTimeZone(body.timeZone)) {
    return failure(400, "validation_error", "timeZone must be an IANA time zone.");
  }
  if (typeof body.creditorAuthority !== "boolean") {
    return failure(400, "validation_error", "creditorAuthority must be true or false.");
  }
  const last4 = optionalLast4(body.last4);
  if (typeof last4 !== "string" && last4 !== null) {
    return last4;
  }
  const dob = optionalDob(body.dob);
  if (typeof dob !== "string" && dob !== null) {
    return dob;
  }
  if (last4 === null && dob === null) {
    return failure(400, "validation_error", "A stored last4 or date of birth is required for right-party contact.");
  }
  const suppressions = parseFlags(body.suppressions);
  if (!Array.isArray(suppressions)) {
    return suppressions;
  }
  return {
    ok: true,
    value: {
      debtorName: debtorName.replace(/\s+/g, " ").trim(),
      principalCents: body.principalCents,
      creditor,
      status,
      phones,
      emails,
      timeZone: body.timeZone.trim(),
      creditorAuthority: body.creditorAuthority,
      last4,
      dob,
      suppressions,
    },
  };
}

export function parseConsent(body: unknown): { ok: true; value: ConsentInput } | FieldFailure {
  const unsafe = rejectUnsafe(body);
  if (unsafe) {
    return unsafe;
  }
  if (!isRecord(body)) {
    return failure(400, "validation_error", "JSON object is required.");
  }
  const channel = parseChannel(body.channel);
  if (typeof channel !== "string") {
    return channel;
  }
  const address = parseAddress(channel, body.address ?? body.number);
  if (typeof address !== "string") {
    return address;
  }
  const timestamp = parseTimestamp(body.timestamp, "timestamp");
  if (typeof timestamp !== "number") {
    return timestamp;
  }
  const source = requiredString(body.source, "source", 160);
  if (typeof source !== "string") {
    return source;
  }
  if (body.consentType !== undefined && body.consentType !== "prior_express_consent") {
    return failure(400, "validation_error", "consentType must be prior_express_consent.");
  }
  return { ok: true, value: { channel, address, timestamp, source } };
}

export function parseRevoke(body: unknown): { ok: true; value: RevokeInput } | FieldFailure {
  const unsafe = rejectUnsafe(body);
  if (unsafe) {
    return unsafe;
  }
  if (!isRecord(body)) {
    return failure(400, "validation_error", "JSON object is required.");
  }
  const channel = parseChannel(body.channel);
  if (typeof channel !== "string") {
    return channel;
  }
  const address = parseAddress(channel, body.address ?? body.number);
  if (typeof address !== "string") {
    return address;
  }
  const revokedAt = parseTimestamp(body.revokedAt, "revokedAt");
  if (typeof revokedAt !== "number") {
    return revokedAt;
  }
  return { ok: true, value: { channel, address, revokedAt } };
}

export function parseOutbound(body: unknown): { ok: true; value: OutboundInput } | FieldFailure {
  const unsafe = rejectUnsafe(body);
  if (unsafe) {
    return unsafe;
  }
  if (!isRecord(body)) {
    return failure(400, "validation_error", "JSON object is required.");
  }
  const role = body.contactRole === undefined ? "debtor" : body.contactRole;
  if (typeof role !== "string" || outreachRefused(role)) {
    return failure(
      403,
      THIRD_PARTY_OUTREACH_REFUSED,
      unsafeMessage(THIRD_PARTY_OUTREACH_REFUSED),
    );
  }
  const channel = parseChannel(body.channel);
  if (typeof channel !== "string") {
    return channel;
  }
  const address = parseAddress(channel, body.number ?? body.address);
  if (typeof address !== "string") {
    return address;
  }
  const now = parseTimestamp(body.now, "now");
  if (typeof now !== "number") {
    return now;
  }
  const statedName = optionalText(body.statedName, "statedName", 80);
  if (typeof statedName !== "string" && statedName !== null) {
    return statedName;
  }
  const last4 = optionalLast4(body.last4);
  if (typeof last4 !== "string" && last4 !== null) {
    return last4;
  }
  const dob = optionalDob(body.dob);
  if (typeof dob !== "string" && dob !== null) {
    return dob;
  }
  return { ok: true, value: { channel, address, now, statedName, last4, dob } };
}

export function parseOffer(body: unknown): { ok: true; value: OfferInput } | FieldFailure {
  const unsafe = rejectUnsafe(body);
  if (unsafe) {
    return unsafe;
  }
  if (!isRecord(body)) {
    return failure(400, "validation_error", "JSON object is required.");
  }
  if (body.offer !== "hardship" && body.offer !== "plan_65" && body.offer !== "settlement_40") {
    return failure(400, "validation_error", "offer must be hardship, plan_65, or settlement_40.");
  }
  const now = parseTimestamp(body.now, "now");
  if (typeof now !== "number") {
    return now;
  }
  const channel = body.channel === undefined ? "voice" : parseChannel(body.channel);
  if (typeof channel !== "string") {
    return channel;
  }
  let paymentCount: 3 | 6 | null = null;
  if (body.offer === "plan_65") {
    if (body.paymentCount !== 3 && body.paymentCount !== 6) {
      return failure(400, "validation_error", "paymentCount must be 3 or 6 for plan_65.");
    }
    paymentCount = body.paymentCount;
  } else if (body.paymentCount !== undefined) {
    return failure(400, "validation_error", "paymentCount is only used for plan_65.");
  }
  return { ok: true, value: { offer: body.offer, paymentCount, now, channel } };
}

export function parseManual(body: unknown): { ok: true; value: ManualInput } | FieldFailure {
  const unsafe = rejectUnsafe(body);
  if (unsafe) {
    return unsafe;
  }
  if (!isRecord(body)) {
    return failure(400, "validation_error", "JSON object is required.");
  }
  if (body.code !== "refused" && body.code !== "dispute" && body.code !== "cease" && body.code !== "promise_to_pay") {
    return failure(400, "validation_error", "code must be refused, dispute, cease, or promise_to_pay.");
  }
  const channel = body.channel === undefined ? "voice" : parseChannel(body.channel);
  if (typeof channel !== "string") {
    return channel;
  }
  const now = parseTimestamp(body.now, "now");
  if (typeof now !== "number") {
    return now;
  }
  const note = optionalText(body.note, "note", 500);
  if (typeof note !== "string" && note !== null) {
    return note;
  }
  return { ok: true, value: { code: body.code, channel, now, note } };
}

export function parseFlag(body: unknown): { ok: true; value: SuppressionFlag } | FieldFailure {
  const unsafe = rejectUnsafe(body);
  if (unsafe) {
    return unsafe;
  }
  if (!isRecord(body) || typeof body.flag !== "string" || !isSuppressionFlag(body.flag)) {
    return failure(
      400,
      "validation_error",
      "flag must be cease, dispute, attorney, bankruptcy, deceased, scra, fraud, wrong_party, dnc, or consent_revoked.",
    );
  }
  return { ok: true, value: body.flag };
}

function rejectUnsafe(body: unknown): FieldFailure | null {
  const code = unsafeCode(body);
  if (!code) {
    return null;
  }
  return failure(unsafeStatus(code), code, unsafeMessage(code));
}

function unsafeStatus(code: UnsafeCode): number {
  switch (code) {
    case THIRD_PARTY_OUTREACH_REFUSED:
      return 403;
    case PAYMENT_CARD_REFUSED:
    case SKIP_TRACE_REFUSED:
      return 400;
    default:
      return assertNever(code, "unsafe code");
  }
}

function failure(httpStatus: number, code: string, error: string): FieldFailure {
  return { ok: false, httpStatus, code, error };
}

function parseStatus(value: unknown): AccountStatus | FieldFailure {
  if (value === undefined) {
    return "open";
  }
  if (value === "open" || value === "paid" || value === "closed") {
    return value;
  }
  return failure(400, "validation_error", "status must be open, paid, or closed.");
}

function parseChannel(value: unknown): Channel | FieldFailure {
  if (value === "voice" || value === "sms" || value === "email") {
    return value;
  }
  return failure(400, "validation_error", "channel must be voice, sms, or email.");
}

function parseAddress(channel: Channel, value: unknown): string | FieldFailure {
  if (typeof value !== "string") {
    return failure(400, "validation_error", "number is required.");
  }
  if (channel === "email") {
    const email = normalizeEmailAddress(value);
    if (!email || !isEmail(email)) {
      return failure(400, "validation_error", "address must be an email for the email channel.");
    }
    return email;
  }
  const phone = normalizePhone(value);
  if (!phone) {
    return failure(400, "validation_error", "number must be a 10-digit US phone number.");
  }
  return phone;
}

function parsePhones(value: unknown): string[] | FieldFailure {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    return failure(400, "validation_error", "phones must be an array of 1 to 3 numbers.");
  }
  const phones: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      return failure(400, "validation_error", "phones must be strings.");
    }
    const phone = normalizePhone(entry);
    if (!phone) {
      return failure(400, "validation_error", "Each phone must be a 10-digit US number supplied on the account.");
    }
    if (!phones.includes(phone)) {
      phones.push(phone);
    }
  }
  return phones;
}

function parseEmails(value: unknown): string[] | FieldFailure {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > 3) {
    return failure(400, "validation_error", "emails must be an array of at most 3 addresses.");
  }
  const emails: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      return failure(400, "validation_error", "emails must be strings.");
    }
    const email = normalizeEmailAddress(entry);
    if (!email) {
      return failure(400, "validation_error", "Each email must be a valid address supplied on the account.");
    }
    if (!emails.includes(email)) {
      emails.push(email);
    }
  }
  return emails;
}

function parseFlags(value: unknown): SuppressionFlag[] | FieldFailure {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > 10) {
    return failure(400, "validation_error", "suppressions must be an array of flags.");
  }
  const flags: SuppressionFlag[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !isSuppressionFlag(entry)) {
      return failure(400, "validation_error", "suppressions contains an unknown flag.");
    }
    if (!flags.includes(entry)) {
      flags.push(entry);
    }
  }
  return flags;
}

function optionalLast4(value: unknown): string | null | FieldFailure {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !/^\d{4}$/.test(value)) {
    return failure(400, "validation_error", "last4 must be exactly 4 digits.");
  }
  return value;
}

function optionalDob(value: unknown): string | null | FieldFailure {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !isDob(value)) {
    return failure(400, "validation_error", "dob must be YYYY-MM-DD.");
  }
  return value;
}

export function isDob(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (year < 1900 || year > 2100) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function optionalText(value: unknown, field: string, max: number): string | null | FieldFailure {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return requiredString(value, field, max);
}

function requiredString(value: unknown, field: string, max: number): string | FieldFailure {
  if (typeof value !== "string" || value.trim().length === 0) {
    return failure(400, "validation_error", `${field} is required.`);
  }
  if (value.length > max) {
    return failure(400, "validation_error", `${field} is too long.`);
  }
  return value.trim();
}

function parseTimestamp(value: unknown, field: string): number | FieldFailure {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 10_000_000_000_000) {
    return failure(400, "validation_error", `${field} must be an integer timestamp in milliseconds.`);
  }
  return value;
}
