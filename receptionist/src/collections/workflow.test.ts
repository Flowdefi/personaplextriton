import { describe, expect, it } from "vitest";
import { buildOffers } from "./offers.ts";
import { isQuietHours } from "./quiet-hours.ts";
import { AI_DISCLOSURE, MINI_MIRANDA, RECORDING_DISCLOSURE, WRONG_PARTY_LINE } from "./script.ts";
import { buildAccount } from "./store.ts";
import { THIRD_PARTY_OUTREACH_REFUSED } from "./types.ts";
import type { Account } from "./types.ts";
import { applyConsent, applyOffer, applyOutbound, voiceAttemptCount } from "./workflow.ts";
import { parseCreateAccount } from "./validate.ts";

const DAY = Date.parse("2026-01-15T15:00:00.000Z");
const BEFORE_EIGHT = Date.parse("2026-01-15T12:59:00.000Z");
const AT_EIGHT = Date.parse("2026-01-15T13:00:00.000Z");
const BEFORE_NINE = Date.parse("2026-01-16T01:59:00.000Z");
const AT_NINE = Date.parse("2026-01-16T02:00:00.000Z");
const PHONE = "+15555550123";
const PRINCIPAL = 100_000;

function account(overrides: Record<string, unknown> = {}): Account {
  const parsed = parseCreateAccount({
    debtorName: "Maria Elena Santos",
    principalCents: PRINCIPAL,
    creditor: "Northwind Bank",
    phones: [PHONE],
    timeZone: "America/New_York",
    creditorAuthority: true,
    last4: "4242",
    ...overrides,
  });
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return buildAccount(parsed.value, crypto.randomUUID());
}

function withConsent(base: Account, address = PHONE): Account {
  const granted = applyConsent(base, {
    channel: "voice",
    number: address,
    consentType: "prior_express_consent",
    timestamp: DAY,
    source: "written website form",
  });
  return granted.account;
}

describe("consent and suppression", () => {
  it("refuses outbound voice when prior express consent is missing", () => {
    const result = applyOutbound(account(), {
      channel: "voice",
      number: PHONE,
      now: DAY,
      statedName: "Maria Elena Santos",
      last4: "4242",
    });
    expect(result.persist).toBe(true);
    expect(result.httpStatus).toBe(403);
    expect(result.body.ok).toBe(false);
    if (result.body.ok) {
      return;
    }
    expect(result.body.code).toBe("blocked_no_consent");
    expect(result.body.disclosed).toBe(false);
    expect(result.body.balanceCents).toBeNull();
    expect(result.body.offers).toBeNull();
    expect(result.body.say).toEqual([]);
    expect(result.body.telephony).toBe("not_placed");
    expect(result.body.delivered).toBe(false);
    expect(result.account.attempts.at(-1)?.code).toBe("blocked_no_consent");
    expect(result.account.attempts.at(-1)?.scriptVersion).toBe("collections-outbound-v1");
    expect(result.account.attempts.at(-1)?.suppressionCheck.blocked).toBe(false);
  });

  it("does not treat consent for a different number as consent for this number", () => {
    const base = account({ phones: [PHONE, "+15555550199"] });
    const granted = withConsent(base, "+15555550199");
    const result = applyOutbound(granted, {
      channel: "voice",
      number: PHONE,
      now: DAY,
      statedName: "Maria Elena Santos",
      last4: "4242",
    });
    expect(result.body.ok).toBe(false);
    if (!result.body.ok) {
      expect(result.body.code).toBe("blocked_no_consent");
    }
  });

  it("refuses every outbound channel when a hard stop is set", () => {
    const suppressed = withConsent(account({ suppressions: ["dispute"] }));
    const result = applyOutbound(suppressed, {
      channel: "voice",
      number: PHONE,
      now: DAY,
      statedName: "Maria Elena Santos",
      last4: "4242",
    });
    expect(result.body.ok).toBe(false);
    if (result.body.ok) {
      return;
    }
    expect(result.body.code).toBe("blocked_suppression");
    expect(result.body.disclosed).toBe(false);
    expect(result.body.balanceCents).toBeNull();
    expect(result.body.say.join(" ")).not.toContain("$1,000.00");
    expect(result.account.attempts.at(-1)?.suppressionCheck).toEqual({ blocked: true, flags: ["dispute"] });
  });
});

describe("right-party contact", () => {
  it("does not disclose the balance when the second identifier is wrong", () => {
    const ready = withConsent(account());
    const result = applyOutbound(ready, {
      channel: "voice",
      number: PHONE,
      now: DAY,
      statedName: "Maria Elena Santos",
      last4: "0000",
    });
    expect(result.body.ok).toBe(false);
    if (result.body.ok) {
      return;
    }
    expect(result.body.code).toBe("wrong_party");
    expect(result.body.say).toEqual([WRONG_PARTY_LINE]);
    expect(result.body.balanceCents).toBeNull();
    expect(result.body.offers).toBeNull();
    expect(result.body.disclosed).toBe(false);
    const spoken = JSON.stringify(result.body);
    expect(spoken).not.toContain("$1,000.00");
    expect(spoken).not.toContain("100000");
    expect(spoken).not.toContain(AI_DISCLOSURE);
    expect(spoken).not.toContain(MINI_MIRANDA);
    expect(result.account.suppressions).not.toContain("wrong_party");
    expect(result.account.attempts.at(-1)?.code).toBe("wrong_party");
  });

  it("rejects a first name and does not treat it as right-party contact", () => {
    const ready = withConsent(account());
    const result = applyOutbound(ready, {
      channel: "voice",
      number: PHONE,
      now: DAY,
      statedName: "Maria",
      last4: "4242",
    });
    expect(result.body.ok).toBe(false);
    if (!result.body.ok) {
      expect(result.body.code).toBe("wrong_party");
      expect(result.body.balanceCents).toBeNull();
    }
  });

  it("speaks scripted disclosures and exact offer math after right-party contact", () => {
    const ready = withConsent(account());
    const result = applyOutbound(ready, {
      channel: "voice",
      number: PHONE,
      now: DAY,
      statedName: "Maria Elena Santos",
      last4: "4242",
    });
    expect(result.body.ok).toBe(true);
    if (!result.body.ok || !("offers" in result.body) || !result.body.offers) {
      throw new Error("expected offers");
    }
    expect(result.body.code).toBe("right_party");
    expect(result.body.disclosed).toBe(true);
    expect(result.body.balanceCents).toBe(PRINCIPAL);
    expect(result.body.telephony).toBe("not_placed");
    expect(result.body.offers.hardship).toEqual({
      kind: "hardship",
      monthlyCents: 6500,
      monthCount: 16,
      lastPaymentCents: 2500,
      totalCents: PRINCIPAL,
      feesCents: 0,
      paidInFull: true,
    });
    expect(result.body.offers.plan_65.totalCents).toBe(65_000);
    expect(result.body.offers.plan_65.options[0].paymentsCents).toEqual([21666, 21666, 21668]);
    expect(result.body.offers.plan_65.options[1].paymentsCents).toEqual([10833, 10833, 10833, 10833, 10833, 10835]);
    expect(result.body.offers.plan_65.options[0].paymentsCents.reduce((sum, cents) => sum + cents, 0)).toBe(65_000);
    expect(result.body.offers.plan_65.options[1].paymentsCents.reduce((sum, cents) => sum + cents, 0)).toBe(65_000);
    expect(result.body.offers.settlement_40).toEqual({
      kind: "settlement_40",
      percent: 40,
      dueTodayCents: 40_000,
      paidInFull: true,
    });
    const spoken = result.body.say.join(" ");
    expect(spoken).toContain(AI_DISCLOSURE);
    expect(spoken).toContain(MINI_MIRANDA);
    expect(spoken).toContain(RECORDING_DISCLOSURE);
    expect(spoken).toContain("The authorized principal balance on this account is $1,000.00.");
    expect(spoken).toContain("15 payments of $65.00 per month and a final payment of $25.00");
    expect(spoken).toContain("no extra fees");
    expect(spoken).toContain("65 percent");
    expect(spoken).toContain("$650.00");
    expect(spoken).toContain("$216.66, $216.66, $216.68");
    expect(spoken).toContain("$400.00");
    expect(spoken).toContain("paid in full");
    expect(result.account.attempts.at(-1)?.channel).toBe("voice");
    expect(result.account.attempts.at(-1)?.at).toBe(DAY);
  });

  it("does not offer payment options without creditor authority", () => {
    const ready = withConsent(account({ creditorAuthority: false, principalCents: 250_000 }));
    const result = applyOutbound(ready, {
      channel: "voice",
      number: PHONE,
      now: DAY,
      statedName: "Maria Elena Santos",
      last4: "4242",
    });
    expect(result.body.ok).toBe(true);
    if (!result.body.ok || !("phase" in result.body)) {
      throw new Error("expected a completed simulation");
    }
    expect(result.body.phase).toBe("human_handoff");
    expect(result.body.code).toBe("escalated_human");
    expect(result.body.offers).toBeNull();
    expect(result.body.balanceCents).toBe(250_000);
    const spoken = result.body.say.join(" ");
    expect(spoken).toContain("$2,500.00");
    expect(spoken).toContain("not able to offer payment options");
    expect(spoken).not.toContain("Hardship option");
    expect(spoken).not.toContain("65 percent");
    expect(spoken).not.toContain("$65.00");
    expect(spoken).not.toContain("40 percent");
    const selected = applyOffer(result.account, { offer: "hardship", now: DAY });
    expect(selected.persist).toBe(false);
    expect(selected.body.ok).toBe(false);
    if (!selected.body.ok) {
      expect(selected.body.code).toBe("no_creditor_authority");
      expect(selected.body.offers).toBeNull();
    }
  });
});

describe("quiet hours and frequency", () => {
  it("refuses voice before 08:00 and at 21:00 in the account time zone", () => {
    expect(isQuietHours(BEFORE_EIGHT, "America/New_York")).toBe(true);
    expect(isQuietHours(AT_EIGHT, "America/New_York")).toBe(false);
    expect(isQuietHours(BEFORE_NINE, "America/New_York")).toBe(false);
    expect(isQuietHours(AT_NINE, "America/New_York")).toBe(true);
    const ready = withConsent(account());
    const early = applyOutbound(ready, {
      channel: "voice",
      number: PHONE,
      now: BEFORE_EIGHT,
      statedName: "Maria Elena Santos",
      last4: "4242",
    });
    expect(early.body.ok).toBe(false);
    if (!early.body.ok) {
      expect(early.body.code).toBe("blocked_quiet_hours");
      expect(early.body.balanceCents).toBeNull();
      expect(early.body.say).toEqual([]);
    }
    const opened = applyOutbound(ready, {
      channel: "voice",
      number: PHONE,
      now: AT_EIGHT,
      statedName: "Maria Elena Santos",
      last4: "4242",
    });
    expect(opened.body.ok).toBe(true);
    const closed = applyOutbound(ready, {
      channel: "voice",
      number: PHONE,
      now: AT_NINE,
      statedName: "Maria Elena Santos",
      last4: "4242",
    });
    expect(closed.body.ok).toBe(false);
    if (!closed.body.ok) {
      expect(closed.body.code).toBe("blocked_quiet_hours");
    }
  });

  it("refuses the 7th voice attempt within 7 days without disclosing the balance", () => {
    let current = withConsent(account());
    for (let index = 0; index < 6; index += 1) {
      const attempt = applyOutbound(current, {
        channel: "voice",
        number: PHONE,
        now: DAY + index,
        statedName: "Maria Elena Santos",
        last4: "0000",
      });
      expect(attempt.body.ok).toBe(false);
      current = attempt.account;
    }
    expect(voiceAttemptCount(current.attempts, DAY + 6)).toBe(6);
    const seventh = applyOutbound(current, {
      channel: "voice",
      number: PHONE,
      now: DAY + 6,
      statedName: "Maria Elena Santos",
      last4: "4242",
    });
    expect(seventh.body.ok).toBe(false);
    if (!seventh.body.ok) {
      expect(seventh.body.code).toBe("blocked_frequency");
      expect(seventh.body.balanceCents).toBeNull();
      expect(seventh.body.disclosed).toBe(false);
      expect(JSON.stringify(seventh.body)).not.toContain("$1,000.00");
    }
    const stale = withConsent(account());
    let old = stale;
    const outside = DAY - 8 * 24 * 60 * 60 * 1000;
    for (let index = 0; index < 6; index += 1) {
      old = applyOutbound(old, {
        channel: "voice",
        number: PHONE,
        now: outside + index,
        statedName: "Maria Elena Santos",
        last4: "0000",
      }).account;
    }
    const later = applyOutbound(old, {
      channel: "voice",
      number: PHONE,
      now: DAY,
      statedName: "Maria Elena Santos",
      last4: "4242",
    });
    expect(later.body.ok).toBe(true);
  });
});

describe("offer selection", () => {
  it("records a hardship disposition and refuses card fields", () => {
    const ready = withConsent(account());
    const verified = applyOutbound(ready, {
      channel: "voice",
      number: PHONE,
      now: DAY,
      statedName: "Maria Elena Santos",
      last4: "4242",
    });
    const pan = "4111111111111111";
    const rejected = applyOffer(verified.account, { offer: "hardship", now: DAY, pan, cvv: "123" });
    expect(rejected.persist).toBe(false);
    expect(rejected.body.ok).toBe(false);
    if (!rejected.body.ok) {
      expect(rejected.body.code).toBe("payment_card_refused");
    }
    expect(JSON.stringify(rejected.body)).not.toContain(pan);
    expect(JSON.stringify(rejected.account)).not.toContain(pan);
    expect(rejected.account.paymentHandoff).toBeNull();
    expect(rejected.account.attempts).toHaveLength(verified.account.attempts.length);

    const selected = applyOffer(verified.account, { offer: "hardship", now: DAY + 1 });
    expect(selected.persist).toBe(true);
    expect(selected.body.ok).toBe(true);
    if (!selected.body.ok || !("paymentHandoff" in selected.body)) {
      throw new Error("expected a handoff");
    }
    expect(selected.account.attempts.at(-1)?.code).toBe("hardship_selected");
    expect(selected.account.attempts.at(-1)?.countsAsVoiceAttempt).toBe(false);
    expect(selected.account.paymentHandoff).toEqual({
      status: "pending_human",
      offer: "hardship",
      amountCents: 6500,
      paymentCount: 16,
      totalCents: PRINCIPAL,
      selectedAt: DAY + 1,
    });
    expect(JSON.stringify(selected.account.paymentHandoff)).not.toMatch(/pan|cvv|card|routing|accountNumber/i);
  });
});

describe("guards", () => {
  it("refuses third-party, location, and employer outreach", () => {
    const ready = withConsent(account());
    for (const contactRole of ["employer", "family", "household", "reference", "location", "affiliate", "third_party"]) {
      const result = applyOutbound(ready, {
        channel: "voice",
        number: PHONE,
        now: DAY,
        contactRole,
        statedName: "Maria Elena Santos",
        last4: "4242",
      });
      expect(result.persist).toBe(false);
      expect(result.body.ok).toBe(false);
      if (!result.body.ok) {
        expect(result.body.code).toBe(THIRD_PARTY_OUTREACH_REFUSED);
        expect(result.body.say).toEqual([]);
      }
      expect(result.account.attempts).toHaveLength(0);
    }
  });

  it("refuses skip-trace fields and keeps cent math exact for an uneven balance", () => {
    const skipped = parseCreateAccount({
      debtorName: "Maria Elena Santos",
      principalCents: PRINCIPAL,
      creditor: "Northwind Bank",
      phones: [PHONE],
      timeZone: "America/New_York",
      creditorAuthority: true,
      last4: "4242",
      ssn: "123456789",
    });
    expect(skipped.ok).toBe(false);
    if (!skipped.ok) {
      expect(skipped.code).toBe("skip_trace_refused");
    }
    const offers = buildOffers(10_001);
    expect(offers.plan_65.totalCents).toBe(6501);
    expect(offers.settlement_40.dueTodayCents).toBe(4000);
    expect(offers.hardship.monthCount).toBe(2);
    expect(offers.hardship.lastPaymentCents).toBe(3501);
    expect(offers.hardship.feesCents).toBe(0);
  });
});
