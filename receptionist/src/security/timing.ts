export function timingSafeEqualString(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const equal = crypto.subtle.timingSafeEqual;
  if (typeof equal === "function") {
    if (a.byteLength !== b.byteLength) {
      equal.call(crypto.subtle, a, a);
      return false;
    }
    return equal.call(crypto.subtle, a, b);
  }
  const length = Math.max(a.byteLength, b.byteLength);
  let diff = a.byteLength ^ b.byteLength;
  for (let index = 0; index < length; index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return diff === 0;
}
