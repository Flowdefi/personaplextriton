const WINDOW_MS = 600_000;

interface Bucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  allow(bucket: string, limit: number, now = Date.now()): "allow" | "limit" {
    const current = this.buckets.get(bucket);
    if (!current || current.resetAt <= now) {
      this.buckets.set(bucket, { count: 1, resetAt: now + WINDOW_MS });
      return "allow";
    }
    if (current.count >= limit) {
      return "limit";
    }
    current.count += 1;
    return "allow";
  }
}
