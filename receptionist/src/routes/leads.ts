import { GREETING } from "../dialogue/script";
import type { Lead } from "../dialogue/types";
import { clientIp, isResponse, json, readJson } from "../http";
import { allowRequest } from "../leads/rate-limit";
import { deliverLead, retryLead } from "../leads/send";
import { validateLeadPayload } from "../leads/validate";
import { isUuid, sessionStub } from "../runtime";
import { timingSafeEqualString } from "../security/timing";

export async function handleLeads(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405);
  }
  const gate = await allowRequest(env.LEADS, `lead:${clientIp(request)}`);
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
  const sessionLead = await leadFromSession(env, body);
  if (sessionLead instanceof Response) {
    return sessionLead;
  }
  const validated = sessionLead ?? validateLeadPayload(body, Date.now());
  if (!validated.ok) {
    return json({ error: validated.error }, 400);
  }
  const sessionId = readSessionId(body);
  const result = await deliverLead(env, validated.lead, sessionId);
  return json({
    ok: true,
    id: result.id,
    lead: result.lead,
    emailStatus: result.emailStatus,
    emailDetail: result.emailDetail,
    stored: result.stored,
  });
}

export async function handleLeadTest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405);
  }
  const denied = authorizeTest(request, env);
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
  const result = await deliverLead(env, lead, `test:${crypto.randomUUID()}`);
  return json({
    ok: true,
    id: result.id,
    lead: result.lead,
    emailStatus: result.emailStatus,
    emailDetail: result.emailDetail,
    stored: result.stored,
  });
}

export async function handleLeadRetry(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405);
  }
  const denied = authorizeTest(request, env);
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
  const result = await retryLead(env, id);
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

function authorizeTest(request: Request, env: Env): Response | null {
  const expected = env.TEST_TOKEN?.trim();
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

async function leadFromSession(env: Env, body: unknown): Promise<{ ok: true; lead: Lead } | null | Response> {
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
  const response = await sessionStub(env, `browser:${sessionId}`).fetch("https://session/state");
  const payload = (await response.json()) as { state?: { step?: string } | null };
  const state = payload.state;
  if (!state) {
    return json({ error: "Session was not found." }, 404);
  }
  if (state.step !== "completed") {
    return json({ error: "The conversation is not finished yet." }, 409);
  }
  const record = state as unknown;
  if (typeof record !== "object" || record === null) {
    return json({ error: "Session was not found." }, 404);
  }
  const rebuilt = validateLeadPayload(leadWire(record), Date.now());
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
