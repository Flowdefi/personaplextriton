import { assertNever } from "../assert-never.ts";
import { verifyRightParty } from "./identity.ts";
import { buildOffers, paymentHandoffFor } from "./offers.ts";
import { isQuietHours } from "./quiet-hours.ts";
import { recoveryLines, WRONG_PARTY_LINE } from "./script.ts";
import {
  SCRIPT_VERSION,
  type Account,
  type AttemptRecord,
  type Channel,
  type DispositionCode,
  type OfferSet,
  type SuppressionCheck,
  type SuppressionFlag,
} from "./types.ts";
import {
  parseConsent,
  parseFlag,
  parseManual,
  parseOffer,
  parseOutbound,
  parseRevoke,
  type FieldFailure,
} from "./validate.ts";

export const VOICE_ATTEMPTS_ALLOWED = 6;
export const VOICE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface Handled {
  httpStatus: number;
  persist: boolean;
  account: Account;
  body: OutboundBody;
}

export interface OutboundRefusal {
  ok: false;
  code: string;
  error: string;
  disclosed: false;
  say: string[];
  offers: null;
  balanceCents: null;
  telephony: "not_placed";
  delivered: false;
  scriptVersion: typeof SCRIPT_VERSION;
  attempt: AttemptRecord | null;
}

export interface OutboundSuccess {
  ok: true;
  code: DispositionCode;
  phase: "offers" | "human_handoff" | "recorded";
  disclosed: boolean;
  say: string[];
  offers: OfferSet | null;
  balanceCents: number | null;
  telephony: "not_placed";
  delivered: false;
  scriptVersion: typeof SCRIPT_VERSION;
  attempt: AttemptRecord;
  paymentHandoff: Account["paymentHandoff"];
}

export interface LedgerBody {
  ok: true;
  disclosed: false;
  telephony: "not_placed";
  delivered: false;
  consents: Account["consents"];
  suppressions: SuppressionFlag[];
}

export type OutboundBody = OutboundRefusal | OutboundSuccess | LedgerBody;

export function applyOutbound(account: Account, body: unknown): Handled {
  const parsed = parseOutbound(body);
  if (!parsed.ok) {
    return fromField(account, parsed);
  }
  const input = parsed.value;
  if (!addressOnAccount(account, input.channel, input.address)) {
    return refusal(
      account,
      false,
      403,
      "number_not_on_account",
      "That number is not stored on this account. This server does not look up numbers.",
      [],
      null,
    );
  }
  const suppressionCheck = inspectSuppression(account.suppressions);
  if (suppressionCheck.blocked) {
    const flags = suppressionCheck.flags.join(", ");
    return recordRefusal(
      account,
      input.channel,
      input.address,
      input.now,
      "blocked_suppression",
      403,
      `Outbound refused: suppression flag ${flags} is set.`,
      [],
      suppressionCheck,
    );
  }
  if (account.status !== "open") {
    return recordRefusal(
      account,
      input.channel,
      input.address,
      input.now,
      "blocked_account_status",
      403,
      "Outbound refused: the account is not open.",
      [],
      suppressionCheck,
    );
  }
  if (input.channel === "voice" && isQuietHours(input.now, account.timeZone)) {
    return recordRefusal(
      account,
      input.channel,
      input.address,
      input.now,
      "blocked_quiet_hours",
      403,
      "Outbound voice refused: outside 08:00–21:00 in the account time zone.",
      [],
      suppressionCheck,
    );
  }
  if (input.channel === "voice" && voiceAttemptCount(account.attempts, input.now) >= VOICE_ATTEMPTS_ALLOWED) {
    return recordRefusal(
      account,
      input.channel,
      input.address,
      input.now,
      "blocked_frequency",
      403,
      "Outbound voice refused: a 7th voice attempt within 7 days is not allowed.",
      [],
      suppressionCheck,
    );
  }
  if (!hasPriorExpressConsent(account, input.channel, input.address)) {
    return recordRefusal(
      account,
      input.channel,
      input.address,
      input.now,
      "blocked_no_consent",
      403,
      `Outbound ${channelName(input.channel)} refused: no non-revoked prior express consent for this exact number.`,
      [],
      suppressionCheck,
    );
  }
  const verdict = verifyRightParty(account.debtorName, account.last4, account.dob, input.statedName, input.last4, input.dob);
  if (verdict === "incomplete") {
    return refusal(
      account,
      false,
      400,
      "right_party_required",
      "Full name and a second stored identifier are required before any debt discussion.",
      [],
      null,
    );
  }
  if (verdict === "mismatch") {
    // Stop this attempt only. A failed check is not the wrong_party hard stop,
    // so a later exact full-name match can still be confirmed.
    return recordRefusal(
      account,
      input.channel,
      input.address,
      input.now,
      "wrong_party",
      403,
      "Right-party contact failed. No debt information was disclosed.",
      [WRONG_PARTY_LINE],
      suppressionCheck,
    );
  }
  if (verdict !== "match") {
    return assertNever(verdict, "identity verdict");
  }
  const offers = account.creditorAuthority ? buildOffers(account.principalCents) : null;
  const code: DispositionCode = offers ? "right_party" : "escalated_human";
  const note = offers
    ? "Right-party contact confirmed. Scripted disclosures and offers were returned. No call was placed."
    : "Right-party contact confirmed. No creditor authority for offers. Handed to a human. No call was placed.";
  const attempt = makeAttempt(input.channel, input.address, input.now, code, note, suppressionCheck, true);
  const next = withAttempt(account, attempt);
  return {
    httpStatus: 200,
    persist: true,
    account: next,
    body: {
      ok: true,
      code,
      phase: offers ? "offers" : "human_handoff",
      disclosed: true,
      say: recoveryLines(account.principalCents, offers),
      offers,
      balanceCents: account.principalCents,
      telephony: "not_placed",
      delivered: false,
      scriptVersion: SCRIPT_VERSION,
      attempt,
      paymentHandoff: next.paymentHandoff,
    },
  };
}

export function applyConsent(account: Account, body: unknown): Handled {
  const parsed = parseConsent(body);
  if (!parsed.ok) {
    return fromField(account, parsed);
  }
  const input = parsed.value;
  if (!addressOnAccount(account, input.channel, input.address)) {
    return refusal(
      account,
      false,
      403,
      "number_not_on_account",
      "Consent can be stored only for a number already on the account.",
      [],
      null,
    );
  }
  const record = {
    id: crypto.randomUUID(),
    channel: input.channel,
    address: input.address,
    consentType: "prior_express_consent" as const,
    timestamp: input.timestamp,
    source: input.source,
    revokedAt: null,
  };
  const next: Account = { ...account, consents: [...account.consents, record] };
  return {
    httpStatus: 201,
    persist: true,
    account: next,
    body: ledgerBody(next),
  };
}

export function applyRevoke(account: Account, body: unknown): Handled {
  const parsed = parseRevoke(body);
  if (!parsed.ok) {
    return fromField(account, parsed);
  }
  const input = parsed.value;
  let found = false;
  const consents = account.consents.map((record) => {
    if (record.channel === input.channel && record.address === input.address && record.revokedAt === null) {
      found = true;
      return { ...record, revokedAt: input.revokedAt };
    }
    return record;
  });
  if (!found) {
    return refusal(account, false, 404, "consent_not_found", "No active consent record matches that number.", [], null);
  }
  const next: Account = { ...account, consents };
  return {
    httpStatus: 200,
    persist: true,
    account: next,
    body: ledgerBody(next),
  };
}

export function applySuppression(account: Account, body: unknown): Handled {
  const parsed = parseFlag(body);
  if (!parsed.ok) {
    return fromField(account, parsed);
  }
  const flag = parsed.value;
  const suppressions = account.suppressions.includes(flag) ? account.suppressions : [...account.suppressions, flag];
  const next: Account = { ...account, suppressions };
  return {
    httpStatus: 200,
    persist: true,
    account: next,
    body: ledgerBody(next),
  };
}

export function applyOffer(account: Account, body: unknown): Handled {
  const parsed = parseOffer(body);
  if (!parsed.ok) {
    return fromField(account, parsed);
  }
  const input = parsed.value;
  const suppressionCheck = inspectSuppression(account.suppressions);
  if (suppressionCheck.blocked) {
    return refusal(
      account,
      false,
      403,
      "blocked_suppression",
      `Offer refused: suppression flag ${suppressionCheck.flags.join(", ")} is set.`,
      [],
      null,
    );
  }
  if (!account.creditorAuthority) {
    return refusal(
      account,
      false,
      403,
      "no_creditor_authority",
      "Offers are not available. A person must handle this account.",
      [],
      null,
    );
  }
  const verified = account.attempts.some((attempt) => attempt.code === "right_party");
  if (!verified) {
    return refusal(
      account,
      false,
      403,
      "right_party_required",
      "Right-party contact must succeed before an offer can be selected.",
      [],
      null,
    );
  }
  if (account.paymentHandoff) {
    return refusal(account, false, 409, "offer_already_selected", "An offer was already selected for this account.", [], null);
  }
  const offers = buildOffers(account.principalCents);
  const handoff = paymentHandoffFor(input.offer, offers, input.paymentCount, input.now);
  const code = offerCode(input.offer);
  const attempt = makeAttempt(
    input.channel,
    null,
    input.now,
    code,
    `Offer ${input.offer} selected. Payment handoff status is pending_human. No card data was accepted.`,
    suppressionCheck,
    false,
  );
  const next: Account = { ...account, attempts: [...account.attempts, attempt], paymentHandoff: handoff };
  return {
    httpStatus: 200,
    persist: true,
    account: next,
    body: {
      ok: true,
      code,
      phase: "recorded",
      disclosed: false,
      say: [],
      offers: null,
      balanceCents: null,
      telephony: "not_placed",
      delivered: false,
      scriptVersion: SCRIPT_VERSION,
      attempt,
      paymentHandoff: handoff,
    },
  };
}

export function applyManualDisposition(account: Account, body: unknown): Handled {
  const parsed = parseManual(body);
  if (!parsed.ok) {
    return fromField(account, parsed);
  }
  const input = parsed.value;
  const flag = suppressionForManual(input.code);
  const suppressions = flag && !account.suppressions.includes(flag) ? [...account.suppressions, flag] : account.suppressions;
  const suppressionCheck = inspectSuppression(suppressions);
  const attempt = makeAttempt(
    input.channel,
    null,
    input.now,
    input.code,
    input.note ?? `Disposition ${input.code} recorded. No call was placed.`,
    suppressionCheck,
    false,
  );
  const next: Account = { ...account, suppressions, attempts: [...account.attempts, attempt] };
  return {
    httpStatus: 200,
    persist: true,
    account: next,
    body: {
      ok: true,
      code: input.code,
      phase: "recorded",
      disclosed: false,
      say: [],
      offers: null,
      balanceCents: null,
      telephony: "not_placed",
      delivered: false,
      scriptVersion: SCRIPT_VERSION,
      attempt,
      paymentHandoff: next.paymentHandoff,
    },
  };
}

export function voiceAttemptCount(attempts: readonly AttemptRecord[], now: number): number {
  if (typeof now !== "number" || !Number.isInteger(now)) {
    throw new Error("now must be an integer timestamp.");
  }
  const start = now - VOICE_WINDOW_MS;
  return attempts.filter(
    (attempt) => attempt.countsAsVoiceAttempt && attempt.channel === "voice" && attempt.at >= start && attempt.at <= now,
  ).length;
}

export function hasPriorExpressConsent(account: Account, channel: Channel, address: string): boolean {
  if (!address) {
    return false;
  }
  return account.consents.some(
    (record) =>
      record.channel === channel &&
      record.address === address &&
      record.consentType === "prior_express_consent" &&
      record.revokedAt === null,
  );
}

function addressOnAccount(account: Account, channel: Channel, address: string): boolean {
  switch (channel) {
    case "voice":
    case "sms":
      return account.phones.includes(address);
    case "email":
      return account.emails.includes(address);
    default:
      return assertNever(channel, "channel");
  }
}

function channelName(channel: Channel): string {
  switch (channel) {
    case "voice":
      return "voice";
    case "sms":
      return "SMS";
    case "email":
      return "email";
    default:
      return assertNever(channel, "channel");
  }
}

function offerCode(offer: "hardship" | "plan_65" | "settlement_40"): DispositionCode {
  switch (offer) {
    case "hardship":
      return "hardship_selected";
    case "plan_65":
      return "plan_65_selected";
    case "settlement_40":
      return "settlement_40_selected";
    default:
      return assertNever(offer, "offer");
  }
}

function suppressionForManual(code: "refused" | "dispute" | "cease" | "promise_to_pay"): SuppressionFlag | null {
  switch (code) {
    case "dispute":
      return "dispute";
    case "cease":
      return "cease";
    case "refused":
    case "promise_to_pay":
      return null;
    default:
      return assertNever(code, "disposition");
  }
}

function inspectSuppression(flags: readonly SuppressionFlag[]): SuppressionCheck {
  const copy = [...flags];
  return { blocked: copy.length > 0, flags: copy };
}

function recordRefusal(
  account: Account,
  channel: Channel,
  address: string,
  now: number,
  code: DispositionCode,
  httpStatus: number,
  error: string,
  say: string[],
  suppressionCheck: SuppressionCheck,
): Handled {
  const attempt = makeAttempt(channel, address, now, code, error, suppressionCheck, channel === "voice");
  const next = withAttempt(account, attempt);
  return {
    httpStatus,
    persist: true,
    account: next,
    body: {
      ok: false,
      code,
      error,
      disclosed: false,
      say,
      offers: null,
      balanceCents: null,
      telephony: "not_placed",
      delivered: false,
      scriptVersion: SCRIPT_VERSION,
      attempt,
    },
  };
}

function refusal(
  account: Account,
  persist: boolean,
  httpStatus: number,
  code: string,
  error: string,
  say: string[],
  attempt: AttemptRecord | null,
): Handled {
  return {
    httpStatus,
    persist,
    account,
    body: {
      ok: false,
      code,
      error,
      disclosed: false,
      say,
      offers: null,
      balanceCents: null,
      telephony: "not_placed",
      delivered: false,
      scriptVersion: SCRIPT_VERSION,
      attempt,
    },
  };
}

function fromField(account: Account, failure: FieldFailure): Handled {
  return refusal(account, false, failure.httpStatus, failure.code, failure.error, [], null);
}

function withAttempt(account: Account, attempt: AttemptRecord): Account {
  return { ...account, attempts: [...account.attempts, attempt] };
}

function makeAttempt(
  channel: Channel,
  address: string | null,
  at: number,
  code: DispositionCode,
  note: string,
  suppressionCheck: SuppressionCheck,
  countsAsVoiceAttempt: boolean,
): AttemptRecord {
  return {
    id: crypto.randomUUID(),
    at,
    channel,
    code,
    scriptVersion: SCRIPT_VERSION,
    suppressionCheck: { blocked: suppressionCheck.blocked, flags: [...suppressionCheck.flags] },
    note,
    address,
    countsAsVoiceAttempt,
  };
}

function ledgerBody(account: Account): LedgerBody {
  return {
    ok: true,
    disclosed: false,
    telephony: "not_placed",
    delivered: false,
    consents: account.consents,
    suppressions: account.suppressions,
  };
}
