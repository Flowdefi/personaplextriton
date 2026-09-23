import { clientIp, isResponse, json, readJson } from "../http";
import { allowRequest } from "../leads/rate-limit";
import { isUuid, sessionStub } from "../runtime";

export async function handleDialogue(request: Request, env: Env, path: string): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405);
  }
  const gate = await allowRequest(env.LEADS, clientIp(request));
  if (gate === "limit") {
    return json({ error: "Too many requests. Please wait and try again." }, 429);
  }
  if (gate === "error") {
    return json({ error: "Lead storage is unavailable." }, 503);
  }
  const body = await readJson(request);
  if (isResponse(body)) {
    return body;
  }
  if (path === "/dialogue/start") {
    return startDialogue(env, body);
  }
  if (path === "/dialogue/turn") {
    return turnDialogue(env, body);
  }
  return json({ error: "Not found." }, 404);
}

async function startDialogue(env: Env, body: unknown): Promise<Response> {
  const callerPhone = readCallerPhone(body);
  const sessionId = crypto.randomUUID();
  const stub = sessionStub(env, `browser:${sessionId}`);
  const response = await stub.fetch("https://session/init", {
    method: "POST",
    body: JSON.stringify({ callerPhone, source: "browser" }),
  });
  const payload = (await response.json()) as { say?: string; step?: string };
  return json({
    sessionId,
    say: payload.say ?? "",
    step: payload.step ?? "awaiting_need",
    done: false,
  });
}

async function turnDialogue(env: Env, body: unknown): Promise<Response> {
  if (typeof body !== "object" || body === null) {
    return json({ error: "JSON object is required." }, 400);
  }
  const record = body as Record<string, unknown>;
  const sessionId = record.sessionId;
  const text = record.text;
  if (typeof sessionId !== "string" || !isUuid(sessionId)) {
    return json({ error: "sessionId must be a UUID from /dialogue/start." }, 400);
  }
  if (typeof text !== "string") {
    return json({ error: "text is required." }, 400);
  }
  if (text.length > 1500) {
    return json({ error: "text is too long." }, 400);
  }
  const stub = sessionStub(env, `browser:${sessionId}`);
  const response = await stub.fetch("https://session/turn", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  const payload = (await response.json()) as {
    say?: string;
    step?: string;
    done?: boolean;
    lead?: unknown;
  };
  return json({
    sessionId,
    say: payload.say ?? "",
    step: payload.step ?? "awaiting_need",
    done: payload.done === true,
    lead: payload.lead ?? null,
  });
}

function readCallerPhone(body: unknown): string {
  if (typeof body !== "object" || body === null || !("callerPhone" in body)) {
    return "browser-test";
  }
  const value = body.callerPhone;
  if (typeof value !== "string" || value.trim().length === 0) {
    return "browser-test";
  }
  return value.trim().slice(0, 40);
}
