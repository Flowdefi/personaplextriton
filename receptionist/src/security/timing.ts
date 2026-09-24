import { timingSafeEqual } from "node:crypto";

export function timingSafeEqualString(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.byteLength !== b.byteLength) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}
