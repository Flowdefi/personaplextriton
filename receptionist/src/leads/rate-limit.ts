const WINDOW_SECONDS = 600;
const LIMIT = 8;

export async function allowRequest(kv: KVNamespace, ip: string): Promise<"allow" | "limit" | "error"> {
  const key = `rl:${ip}`;
  try {
    const current = await kv.get(key);
    const count = current ? Number(current) : 0;
    if (Number.isFinite(count) && count >= LIMIT) {
      return "limit";
    }
    await kv.put(key, String((Number.isFinite(count) ? count : 0) + 1), { expirationTtl: WINDOW_SECONDS });
    return "allow";
  } catch {
    console.error(JSON.stringify({ event: "rate_limit_failed" }));
    return "error";
  }
}
