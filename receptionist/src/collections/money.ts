export const HARDSHIP_MONTHLY_CENTS = 6500;

export function isCents(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2_000_000_000;
}

export function formatDollars(cents: number): string {
  if (!isCents(cents)) {
    throw new Error("cents must be a non-negative integer.");
  }
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const grouped = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${grouped}.${rem.toString().padStart(2, "0")}`;
}

export function percentOfCents(principalCents: number, percent: number): number {
  if (!isCents(principalCents)) {
    throw new Error("principalCents must be a non-negative integer.");
  }
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new Error("percent must be an integer from 0 to 100.");
  }
  return Math.round((principalCents * percent) / 100);
}

export function splitPayments(totalCents: number, count: number): number[] {
  if (!isCents(totalCents)) {
    throw new Error("totalCents must be a non-negative integer.");
  }
  if (!Number.isInteger(count) || count < 1 || count > 360) {
    throw new Error("count must be an integer from 1 to 360.");
  }
  const base = Math.floor(totalCents / count);
  const payments = Array.from({ length: count }, () => base);
  const lastIndex = count - 1;
  const last = payments[lastIndex];
  if (last === undefined) {
    throw new Error("count must include a final payment.");
  }
  payments[lastIndex] = totalCents - base * lastIndex;
  return payments;
}
