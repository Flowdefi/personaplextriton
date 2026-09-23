import { openingLine } from "../dialogue/machine";
import { json, xml } from "../http";
import { callTokenIsValid, signCallToken, twilioSignatureIsValid } from "../security/twilio";
import { formParams, isCallSid, publicBaseUrl, sessionStub, signingSecret, websocketBase } from "../runtime";
import { conversationRelayTwiml, gatherTwiml } from "../voice/twiml";

export async function handleIncoming(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST for the Twilio voice webhook." }, 405);
  }
  const params = await formParams(request);
  const denied = await rejectBadTwilioSignature(request, env, params);
  if (denied) {
    return denied;
  }
  const callSid = params.CallSid ?? "";
  if (!isCallSid(callSid)) {
    return json({ error: "CallSid is required." }, 400);
  }
  if (env.TWILIO_ACCOUNT_SID && params.AccountSid && params.AccountSid !== env.TWILIO_ACCOUNT_SID) {
    return json({ error: "Twilio account does not match." }, 403);
  }
  const stub = sessionStub(env, `call:${callSid}`);
  await stub.fetch("https://session/init", {
    method: "POST",
    body: JSON.stringify({ callerPhone: params.From ?? "unknown", source: "pstn" }),
  });
  const token = await optionalToken(env, callSid);
  const base = publicBaseUrl(request, env);
  const transport: string = env.VOICE_TRANSPORT;
  if (transport === "gather") {
    const action = appendToken(`${base}/voice/gather?callSid=${encodeURIComponent(callSid)}`, token);
    return xml(
      gatherTwiml({
        actionUrl: action,
        sayVoice: env.SAY_VOICE,
        prompt: openingLine(),
        done: false,
      }),
    );
  }
  const ws = appendToken(
    `${websocketBase(base)}/voice/ws?callSid=${encodeURIComponent(callSid)}`,
    token,
  );
  return xml(
    conversationRelayTwiml({
      websocketUrl: ws,
      voice: env.FEMALE_VOICE,
      ttsProvider: env.TTS_PROVIDER,
    }),
  );
}

export async function handleGather(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST for the gather webhook." }, 405);
  }
  const params = await formParams(request);
  const denied = await rejectBadTwilioSignature(request, env, params);
  if (denied) {
    return denied;
  }
  const url = new URL(request.url);
  const callSid = url.searchParams.get("callSid") ?? params.CallSid ?? "";
  if (!isCallSid(callSid)) {
    return json({ error: "CallSid is required." }, 400);
  }
  const tokenDenied = await rejectBadToken(env, callSid, url.searchParams.get("token"));
  if (tokenDenied) {
    return tokenDenied;
  }
  const stub = sessionStub(env, `call:${callSid}`);
  const turnResponse = await stub.fetch("https://session/turn", {
    method: "POST",
    body: JSON.stringify({ text: params.SpeechResult ?? "" }),
  });
  const turn = (await turnResponse.json()) as { say?: string; done?: boolean };
  const say = typeof turn.say === "string" ? turn.say : openingLine();
  const done = turn.done === true;
  const token = url.searchParams.get("token");
  const action = appendToken(
    `${publicBaseUrl(request, env)}/voice/gather?callSid=${encodeURIComponent(callSid)}`,
    token,
  );
  return xml(
    gatherTwiml({
      actionUrl: action,
      sayVoice: env.SAY_VOICE,
      prompt: say,
      done,
    }),
  );
}

export async function handleSocket(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }
  const url = new URL(request.url);
  const callSid = url.searchParams.get("callSid") ?? "";
  if (!isCallSid(callSid)) {
    return json({ error: "callSid is required." }, 400);
  }
  const denied = await rejectBadToken(env, callSid, url.searchParams.get("token"));
  if (denied) {
    return denied;
  }
  return sessionStub(env, `call:${callSid}`).fetch(request);
}

async function rejectBadTwilioSignature(
  request: Request,
  env: Env,
  params: Record<string, string>,
): Promise<Response | null> {
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) {
    return null;
  }
  const valid = await twilioSignatureIsValid(
    request.url,
    params,
    request.headers.get("x-twilio-signature"),
    authToken,
  );
  if (!valid) {
    return json({ error: "Invalid Twilio signature." }, 403);
  }
  return null;
}

async function rejectBadToken(env: Env, callSid: string, token: string | null): Promise<Response | null> {
  const secret = signingSecret(env);
  if (!secret) {
    return null;
  }
  const valid = await callTokenIsValid(callSid, token, secret);
  if (!valid) {
    return json({ error: "Invalid call token." }, 401);
  }
  return null;
}

async function optionalToken(env: Env, callSid: string): Promise<string | null> {
  const secret = signingSecret(env);
  if (!secret) {
    return null;
  }
  return signCallToken(callSid, secret);
}

function appendToken(url: string, token: string | null): string {
  if (!token) {
    return url;
  }
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}token=${encodeURIComponent(token)}`;
}
