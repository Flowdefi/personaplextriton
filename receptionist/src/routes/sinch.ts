import type { AppContext } from "../app-context.ts";
import { json } from "../http.ts";
import { synthesize } from "../voice/local.ts";

/** Minimal Sinch Voice ICE handler for a rented test number. */
export async function handleSinchIncoming(request: Request, ctx: AppContext): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405);
  }
  const body = (await request.json()) as Record<string, unknown>;
  const callId = readString(body.callId) ?? readString(body.callid) ?? crypto.randomUUID();
  const from = readString(body.from) ?? readString(body.cli) ?? "unknown";
  const sessionId = `sinch:${callId}`;
  const start = ctx.sessions.start(sessionId, from, "pstn");
  return json(svamlSay(start.say));
}

export async function handleSinchEvent(request: Request, ctx: AppContext): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405);
  }
  const body = (await request.json()) as Record<string, unknown>;
  const callId = readString(body.callId) ?? readString(body.callid);
  const sessionId = callId ? `sinch:${callId}` : null;
  const text =
    readString(body.input) ??
    readString(body.speech) ??
    readString(body.transcription) ??
    readNestedString(body, "speech", "text") ??
    "";
  if (!sessionId) {
    return json(svamlHangup("This call could not be matched to a session."));
  }
  const outcome = await ctx.sessions.turn(sessionId, text);
  if (!outcome) {
    return json(svamlHangup("Session expired. Please call again."));
  }
  if (outcome.done) {
    return json(svamlHangup(outcome.say));
  }
  return json(svamlSay(outcome.say));
}

/** Optional: return mulaw audio for clients that fetch TTS by URL. */
export async function handleSinchSpeak(request: Request, ctx: AppContext): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") ?? "";
  const state = ctx.sessions.get(sessionId);
  if (!state || !("transcript" in state)) {
    return json({ error: "Session not found." }, 404);
  }
  const last = state.transcript.filter((t) => t.role === "agent").at(-1)?.text;
  if (!last) {
    return json({ error: "Nothing to speak." }, 404);
  }
  const wav = await synthesize(ctx.config, last);
  return new Response(wav, { headers: { "content-type": "audio/wav" } });
}

function svamlSay(text: string): { action: { name: string; text: string; locale: string } } {
  return {
    action: {
      name: "say",
      text,
      locale: "en-US",
    },
  };
}

function svamlHangup(text: string): { action: { name: string; text: string; locale: string }; hangup: boolean } {
  return { ...svamlSay(text), hangup: true };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNestedString(body: Record<string, unknown>, key: string, nested: string): string | null {
  const parent = body[key];
  if (typeof parent !== "object" || parent === null) {
    return null;
  }
  const value = (parent as Record<string, unknown>)[nested];
  return readString(value);
}
