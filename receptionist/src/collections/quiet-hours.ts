export const CALL_WINDOW_START_MINUTE = 8 * 60;

export const CALL_WINDOW_END_MINUTE = 21 * 60;

export function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== "string" || timeZone.trim().length === 0 || timeZone.length > 80) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function minutesOfDay(now: number, timeZone: string): number {
  if (typeof now !== "number" || !Number.isInteger(now)) {
    throw new Error("now must be an integer timestamp.");
  }
  if (!isValidTimeZone(timeZone)) {
    throw new Error("timeZone is not a valid IANA zone.");
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const hourPart = parts.find((part) => part.type === "hour")?.value;
  const minutePart = parts.find((part) => part.type === "minute")?.value;
  if (hourPart === undefined || minutePart === undefined) {
    throw new Error("timeZone did not produce a local time.");
  }
  let hour = Number(hourPart);
  const minute = Number(minutePart);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error("timeZone did not produce a local time.");
  }
  if (hour === 24) {
    hour = 0;
  }
  return hour * 60 + minute;
}

/** True outside 08:00–21:00 local time. 08:00 is allowed. 21:00 is refused. */
export function isQuietHours(now: number, timeZone: string): boolean {
  const minute = minutesOfDay(now, timeZone);
  return minute < CALL_WINDOW_START_MINUTE || minute >= CALL_WINDOW_END_MINUTE;
}
