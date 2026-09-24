import type { AppContext } from "../app-context.ts";
import { mailEnv } from "../app-context.ts";
import { GREETING } from "../dialogue/script.ts";
import type { Lead } from "../dialogue/types.ts";
import { clientIp, isResponse, json, readJson } from "../http.ts";
import { deliverLead, retryLead } from "../leads/send.ts";
import { validateLeadPayload } from "../leads/validate.ts";
import { isUuid } from "../runtime.ts";
import { timingSafeEqualString } from "../security/timing.ts";

export async function handleLeads(request: Request, ctx: AppContext): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405);
  }
  const gate = ctx.rates.allow(`lead:${clientIp(request)}`, 8);
  if (gate === "limit") {
    return json({ error: "Too many requests. Please wait and try again." }, 429);
  }
  const body = await readJson(request);
  if (isResponse(body)) {
    return body;
  }
  const sessionLead = leadFromSession(ctx, body);
  if (sessionLead instanceof Response) {
    return sessionLead;
  }
  const validated = sessionLead ?? validateLeadPayload(body, Date.now());
  if (!validated.ok) {
    return json({ error: validated.error }, 400);
  }
  const sessionId = readSessionId(body);
  const result = await deliverLead(mailEnv(ctx.config), validated.lead, sessionId);
  return json({
    ok: true,
    id: result.id,
    lead: result.lead,
    emailStatus: result.emailStatus,
    emailDetail: result.emailDetail,
    stored: result.stored,
  });
}

export async function handleLeadTest(request: Request, ctx: AppContext): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405);
  }
  const denied = authorizeTest(request, ctx);
  if (denied) {
    return denied;
  }
  const now = Date.now();
  const lead: Lead = {
    name: "Test Caller",
    company: null,
    intent: "sell",
    email: "test.caller@example.com",
    callerPhone: "+15555550123",
    source: "test",
    need: "Test message from the protected lead endpoint.",
    addition: null,
    transcript: [
      { role: "agent", text: GREETING },
      { role: "caller", text: "This is a test." },
    ],
    startedAt: now,
    completedAt: now,
  };
  const result = await deliverLead(mailEnv(ctx.config), lead, `test:${crypto.randomUUID()}`);
  return json({
    ok: true,
    id: result.id,
    lead: result.lead,
    emailStatus: result.emailStatus,
    emailDetail: result.emailDetail,
    stored: result.stored,
  });
}

export async function handleLeadRetry(request: Request, ctx: AppContext): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405);
  }
  const denied = authorizeTest(request, ctx);
  if (denied) {
    return denied;
  }
  const body = await readJson(request);
  if (isResponse(body)) {
    return body;
  }
  const id =
    typeof body === "object" && body !== null && "id" in body && typeof body.id === "string" ? body.id : "";
  if (!isUuid(id)) {
    return json({ error: "id must be the stored lead UUID." }, 400);
  }
  const result = await retryLead(mailEnv(ctx.config), id);
  if (!result) {
    return json({ error: "Stored lead was not found." }, 404);
  }
  return json({
    ok: true,
    id: result.id,
    lead: result.lead,
    emailStatus: result.emailStatus,
    emailDetail: result.emailDetail,
    stored: result.stored,
  });
}

function authorizeTest(request: Request, ctx: AppContext): Response | null {
  const expected = ctx.config.testToken;
  if (!expected) {
    return json({ error: "Test endpoint disabled." }, 404);
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!timingSafeEqualString(token, expected)) {
    return json({ error: "Unauthorized." }, 401);
  }
  return null;
}

function leadFromSession(ctx: AppContext, body: unknown): { ok: true; lead: Lead } | null | Response {
  if (typeof body !== "object" || body === null || !("sessionId" in body)) {
    return null;
  }
  const sessionId = body.sessionId;
  if (typeof sessionId !== "string" || !isUuid(sessionId)) {
    return null;
  }
  if ("name" in body && typeof body.name === "string") {
    return null;
  }
  const state = ctx.sessions.get(sessionId);
  if (!state) {
    return json({ error: "Session was not found." }, 404);
  }
  if (state.step !== "completed") {
    return json({ error: "The conversation is not finished yet." }, 409);
  }
  const rebuilt = validateLeadPayload(leadWire(state), Date.now());
  if (!rebuilt.ok) {
    return json({ error: rebuilt.error }, 409);
  }
  return rebuilt;
}

function leadWire(state: object): unknown {
  if (!("draft" in state) || typeof state.draft !== "object" || state.draft === null) {
    return {};
  }
  const draft = state.draft as Record<string, unknown>;
  return {
    name: draft.name,
    company: draft.companyDeclined === true ? null : draft.company,
    intent: draft.intent,
    email: draft.email,
    callerPhone: "callerPhone" in state ? state.callerPhone : "unknown",
    source: "source" in state ? state.source : "browser",
    need: draft.need,
    addition: draft.addition,
    transcript: "transcript" in state ? state.transcript : [],
    startedAt: "startedAt" in state ? state.startedAt : Date.now(),
    completedAt: Date.now(),
  };
}

function readSessionId(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("sessionId" in body)) {
    return null;
  }
  const sessionId = body.sessionId;
  return typeof sessionId === "string" && isUuid(sessionId) ? sessionId : null;
}
