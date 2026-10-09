import type { AppContext } from "../app-context.ts";
import type { LeadSource } from "../dialogue/types.ts";
import { clientIp, isResponse, json, readJson } from "../http.ts";
import { isUuid } from "../runtime.ts";

export async function handleDialogue(
  request: Request,
  ctx: AppContext,
  path: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405);
  }
  const gate = ctx.rates.allow(`dialogue:${clientIp(request)}`, 40);
  if (gate === "limit") {
    return json({ error: "Too many requests. Please wait and try again." }, 429);
  }
  const body = await readJson(request);
  if (isResponse(body)) {
    return body;
  }
  if (path === "/dialogue/start") {
    return startDialogue(ctx, body);
  }
  if (path === "/dialogue/turn") {
    return turnDialogue(ctx, body);
  }
  return json({ error: "Not found." }, 404);
}

function startDialogue(ctx: AppContext, body: unknown): Response {
  const callerPhone = readCallerPhone(body);
  const source = readSource(body);
  const sessionId = crypto.randomUUID();
  const outcome = ctx.sessions.start(sessionId, callerPhone, source);
  return json({
    sessionId,
    say: outcome.say,
    step: outcome.step,
    done: false,
  });
}

async function turnDialogue(ctx: AppContext, body: unknown): Promise<Response> {
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
  const outcome = await ctx.sessions.turn(sessionId, text);
  if (!outcome) {
    return json({ error: "Session was not found." }, 404);
  }
  return json({
    sessionId,
    say: outcome.say,
    step: outcome.step,
    done: outcome.done,
    lead: outcome.lead,
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

function readSource(body: unknown): LeadSource {
  if (typeof body !== "object" || body === null || !("source" in body)) {
    return "browser";
  }
  const source = body.source;
  if (source === "pstn" || source === "test" || source === "browser") {
    return source;
  }
  return "browser";
}
