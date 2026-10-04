export const SCRIPT_VERSION = "collections-outbound-v1";

export const THIRD_PARTY_OUTREACH_REFUSED = "third_party_outreach_refused";

export const SKIP_TRACE_REFUSED = "skip_trace_refused";

export const PAYMENT_CARD_REFUSED = "payment_card_refused";

export type Channel = "voice" | "sms" | "email";

export type ConsentType = "prior_express_consent";

export type AccountStatus = "open" | "paid" | "closed";

export type SuppressionFlag =
  | "cease"
  | "dispute"
  | "attorney"
  | "bankruptcy"
  | "deceased"
  | "scra"
  | "fraud"
  | "wrong_party"
  | "dnc"
  | "consent_revoked";

export type DispositionCode =
  | "right_party"
  | "wrong_party"
  | "refused"
  | "dispute"
  | "cease"
  | "promise_to_pay"
  | "hardship_selected"
  | "plan_65_selected"
  | "settlement_40_selected"
  | "escalated_human"
  | "blocked_no_consent"
  | "blocked_suppression"
  | "blocked_quiet_hours"
  | "blocked_frequency"
  | "blocked_account_status";

export type OfferKind = "hardship" | "plan_65" | "settlement_40";

export type ManualDispositionCode = "refused" | "dispute" | "cease" | "promise_to_pay";

export interface ConsentRecord {
  id: string;
  channel: Channel;
  address: string;
  consentType: ConsentType;
  timestamp: number;
  source: string;
  revokedAt: number | null;
}

export interface SuppressionCheck {
  blocked: boolean;
  flags: SuppressionFlag[];
}

export interface AttemptRecord {
  id: string;
  at: number;
  channel: Channel;
  code: DispositionCode;
  scriptVersion: string;
  suppressionCheck: SuppressionCheck;
  note: string;
  address: string | null;
  countsAsVoiceAttempt: boolean;
}

export interface PaymentHandoff {
  status: "pending_human";
  offer: OfferKind;
  amountCents: number;
  paymentCount: number;
  totalCents: number;
  selectedAt: number;
}

export interface Account {
  id: string;
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
  consents: ConsentRecord[];
  suppressions: SuppressionFlag[];
  attempts: AttemptRecord[];
  paymentHandoff: PaymentHandoff | null;
}

export interface HardshipOffer {
  kind: "hardship";
  monthlyCents: number;
  monthCount: number;
  lastPaymentCents: number;
  totalCents: number;
  feesCents: 0;
  paidInFull: true;
}

export interface PlanOption {
  count: 3 | 6;
  withinDays: 90;
  paymentsCents: number[];
  totalCents: number;
  paidInFull: true;
}

export interface Plan65Offer {
  kind: "plan_65";
  percent: 65;
  totalCents: number;
  withinDays: 90;
  options: [PlanOption, PlanOption];
  paidInFull: true;
}

export interface SettlementOffer {
  kind: "settlement_40";
  percent: 40;
  dueTodayCents: number;
  paidInFull: true;
}

export interface OfferSet {
  hardship: HardshipOffer;
  plan_65: Plan65Offer;
  settlement_40: SettlementOffer;
}
