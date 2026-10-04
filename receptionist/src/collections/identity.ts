export type IdentityVerdict = "match" | "mismatch" | "incomplete";

export function normalizePersonName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isFullName(value: string): boolean {
  const normalized = normalizePersonName(value);
  const parts = normalized.split(" ").filter((part) => part.length > 0);
  return parts.length >= 2 && normalized.length <= 80;
}

/** Full stored name only. A first name, or a shorter subset, does not match. */
export function isFullNameMatch(stored: string, stated: string): boolean {
  if (!isFullName(stored) || !isFullName(stated)) {
    return false;
  }
  return normalizePersonName(stored) === normalizePersonName(stated);
}

export function verifyRightParty(
  storedName: string,
  storedLast4: string | null,
  storedDob: string | null,
  statedName: string | null,
  statedLast4: string | null,
  statedDob: string | null,
): IdentityVerdict {
  if (statedName === null || statedName.trim().length === 0) {
    return "incomplete";
  }
  if (statedLast4 === null && statedDob === null) {
    return "incomplete";
  }
  if (!isFullNameMatch(storedName, statedName)) {
    return "mismatch";
  }
  if (statedLast4 !== null && storedLast4 !== null && statedLast4 !== storedLast4) {
    return "mismatch";
  }
  if (statedDob !== null && storedDob !== null && statedDob !== storedDob) {
    return "mismatch";
  }
  const last4Ok = statedLast4 !== null && storedLast4 !== null && statedLast4 === storedLast4;
  const dobOk = statedDob !== null && storedDob !== null && statedDob === storedDob;
  return last4Ok || dobOk ? "match" : "mismatch";
}
