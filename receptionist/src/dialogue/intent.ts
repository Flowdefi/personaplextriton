import { assertNever } from "../assert-never";
import type { Intent } from "./types";

const BUY =
  /\b(buy(?:ing|er|ers)?|purchase(?:s|d|ing)?|purchaser|acquire|acquisition|acquisitions)\b/i;
const SELL =
  /\b(sell(?:ing|er|ers|s)?|disposition|liquidate|liquidation)\b|\bsell(?:ing)?\s+paper\b/i;
const COLLECT =
  /\b(collect(?:ing|ion|ions|or|ors)?|recovery|recover(?:y|ing)?|placement)\b/i;

export function normalizeIntent(utterance: string): Intent | null {
  const text = utterance.trim();
  if (text.length === 0) {
    return null;
  }
  const buy = BUY.test(text);
  const sell = SELL.test(text) || /\bpaper\b/i.test(text) && /\b(sell|selling|portfolio)\b/i.test(text);
  const collect = COLLECT.test(text);
  const hits = [buy, sell, collect].filter(Boolean).length;
  if (hits !== 1) {
    return null;
  }
  if (buy) {
    return "buy";
  }
  if (sell) {
    return "sell";
  }
  if (collect) {
    return "collect";
  }
  return null;
}

export function intentLabel(intent: Intent): string {
  switch (intent) {
    case "buy":
      return "buy";
    case "sell":
      return "sell";
    case "collect":
      return "collect";
    default:
      return assertNever(intent, "intent");
  }
}
