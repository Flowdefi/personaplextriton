import { assertNever } from "../assert-never.ts";
import { HARDSHIP_MONTHLY_CENTS, isCents, percentOfCents, splitPayments } from "./money.ts";
import type { HardshipOffer, OfferKind, OfferSet, PaymentHandoff, Plan65Offer, PlanOption, SettlementOffer } from "./types.ts";

export function buildOffers(principalCents: number): OfferSet {
  if (!isCents(principalCents) || principalCents < 100) {
    throw new Error("principalCents must be an integer of at least 100.");
  }
  return {
    hardship: buildHardship(principalCents),
    plan_65: buildPlan65(principalCents),
    settlement_40: buildSettlement(principalCents),
  };
}

export function paymentHandoffFor(offer: OfferKind, offers: OfferSet, paymentCount: 3 | 6 | null, selectedAt: number): PaymentHandoff {
  switch (offer) {
    case "hardship":
      return {
        status: "pending_human",
        offer,
        amountCents: offers.hardship.monthlyCents,
        paymentCount: offers.hardship.monthCount,
        totalCents: offers.hardship.totalCents,
        selectedAt,
      };
    case "plan_65": {
      if (paymentCount !== 3 && paymentCount !== 6) {
        throw new Error("plan_65 requires a payment count of 3 or 6.");
      }
      const option = offers.plan_65.options.find((item) => item.count === paymentCount);
      if (!option) {
        throw new Error("plan_65 option was not found.");
      }
      return {
        status: "pending_human",
        offer,
        amountCents: option.totalCents,
        paymentCount: option.count,
        totalCents: option.totalCents,
        selectedAt,
      };
    }
    case "settlement_40":
      return {
        status: "pending_human",
        offer,
        amountCents: offers.settlement_40.dueTodayCents,
        paymentCount: 1,
        totalCents: offers.settlement_40.dueTodayCents,
        selectedAt,
      };
    default:
      return assertNever(offer, "offer");
  }
}

function buildHardship(principalCents: number): HardshipOffer {
  const monthCount = Math.ceil(principalCents / HARDSHIP_MONTHLY_CENTS);
  const monthlyCents = Math.min(HARDSHIP_MONTHLY_CENTS, principalCents);
  const lastPaymentCents =
    monthCount === 1 ? principalCents : principalCents - HARDSHIP_MONTHLY_CENTS * (monthCount - 1);
  return {
    kind: "hardship",
    monthlyCents,
    monthCount,
    lastPaymentCents,
    totalCents: principalCents,
    feesCents: 0,
    paidInFull: true,
  };
}

function buildPlan65(principalCents: number): Plan65Offer {
  const totalCents = percentOfCents(principalCents, 65);
  return {
    kind: "plan_65",
    percent: 65,
    totalCents,
    withinDays: 90,
    options: [planOption(totalCents, 3), planOption(totalCents, 6)],
    paidInFull: true,
  };
}

function planOption(totalCents: number, count: 3 | 6): PlanOption {
  return {
    count,
    withinDays: 90,
    paymentsCents: splitPayments(totalCents, count),
    totalCents,
    paidInFull: true,
  };
}

function buildSettlement(principalCents: number): SettlementOffer {
  return {
    kind: "settlement_40",
    percent: 40,
    dueTodayCents: percentOfCents(principalCents, 40),
    paidInFull: true,
  };
}
