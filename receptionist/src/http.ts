export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function readJson(request: Request, maxBytes = 32_000): Promise<unknown | Response> {
  const length = request.headers.get("content-length");
  if (length && Number(length) > maxBytes) {
    return json({ error: "Request body is too large." }, 413);
  }
  const text = await request.text();
  if (text.length > maxBytes) {
    return json({ error: "Request body is too large." }, 413);
  }
  if (text.trim().length === 0) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return json({ error: "Request body must be JSON." }, 400);
  }
}

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}
