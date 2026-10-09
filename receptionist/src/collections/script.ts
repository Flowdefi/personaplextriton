import { formatDollars } from "./money.ts";
import type { HardshipOffer, OfferSet, PlanOption, SettlementOffer } from "./types.ts";

export const AI_DISCLOSURE =
  "I'm an AI assistant for Triton Financial Solutions, a debt collector.";

export const MINI_MIRANDA =
  "This is an attempt to collect a debt, and any information obtained will be used for that purpose.";

export const RECORDING_DISCLOSURE = "This call will be recorded and transcribed.";

export const WRONG_PARTY_LINE = "I am not able to continue this call. Goodbye.";

export const HUMAN_HANDOFF_LINE =
  "I am not able to offer payment options on this call. A person at Triton Financial Solutions will follow up with you.";

export function balanceLine(principalCents: number): string {
  return `The authorized principal balance on this account is ${formatDollars(principalCents)}.`;
}

export function recoveryLines(principalCents: number, offers: OfferSet | null): string[] {
  const lines = [AI_DISCLOSURE, MINI_MIRANDA, RECORDING_DISCLOSURE, balanceLine(principalCents)];
  if (!offers) {
    lines.push(HUMAN_HANDOFF_LINE);
    return lines;
  }
  lines.push(hardshipLine(offers.hardship), plan65Line(offers.plan_65), settlementLine(offers.settlement_40));
  return lines;
}

export function hardshipLine(offer: HardshipOffer): string {
  const total = formatDollars(offer.totalCents);
  return `Hardship option: ${hardshipSchedule(offer)} toward the authorized principal of ${total}. There are no extra fees. When these payments are completed, the authorized principal is paid in full.`;
}

export function plan65Line(offer: OfferSet["plan_65"]): string {
  const total = formatDollars(offer.totalCents);
  const three = offer.options[0];
  const six = offer.options[1];
  return `Plan option: 3 or 6 payments within 90 days totaling 65 percent of the authorized principal, which is ${total}. The 3-payment option is ${describePayments(three)}. The 6-payment option is ${describePayments(six)}. When that amount is paid, the account is paid in full.`;
}

export function settlementLine(offer: SettlementOffer): string {
  const due = formatDollars(offer.dueTodayCents);
  return `Settlement option: ${due}, which is 40 percent of the authorized principal, is due today. When that amount is paid, the account is paid in full.`;
}

function hardshipSchedule(offer: HardshipOffer): string {
  const monthly = formatDollars(offer.monthlyCents);
  const last = formatDollars(offer.lastPaymentCents);
  if (offer.monthCount === 1) {
    return `1 payment of ${last}`;
  }
  if (offer.lastPaymentCents === offer.monthlyCents) {
    return `${offer.monthCount} payments of ${monthly} per month`;
  }
  const earlier = offer.monthCount - 1;
  return `${earlier} payments of ${monthly} per month and a final payment of ${last}`;
}

function describePayments(option: PlanOption): string {
  return option.paymentsCents.map((cents) => formatDollars(cents)).join(", ");
}
