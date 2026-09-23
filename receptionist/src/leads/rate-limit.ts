const WINDOW_SECONDS = 600;

export async function allowRequest(
  kv: KVNamespace,
  bucket: string,
  limit: number,
): Promise<"allow" | "limit" | "error"> {
  const key = `rl:${bucket}`;
  try {
    const current = await kv.get(key);
    const count = current ? Number(current) : 0;
    const next = Number.isFinite(count) ? count : 0;
    if (next >= limit) {
      return "limit";
    }
    await kv.put(key, String(next + 1), { expirationTtl: WINDOW_SECONDS });
    return "allow";
  } catch {
    console.error(JSON.stringify({ event: "rate_limit_failed" }));
    return "error";
  }
}
