import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { createAppContext, type AppContext } from "./app-context.ts";
import { loadConfig } from "./config.ts";
import { json } from "./http.ts";
import { handleDialogue } from "./routes/dialogue.ts";
import { handleLeadRetry, handleLeadTest, handleLeads } from "./routes/leads.ts";
import { handleStatus } from "./routes/status.ts";
import { isUuid } from "./runtime.ts";
import { synthesize, transcribe } from "./voice/local.ts";

const PUBLIC_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "../public");
const MAX_AUDIO = 8_000_000;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

export function startServer(ctx: AppContext, port: number): Promise<number> {
  const server = createServer((req, res) => {
    void handleNodeRequest(ctx, req, res);
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : port);
    });
  });
}

async function handleNodeRequest(ctx: AppContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = req.headers.host ?? "127.0.0.1";
  const request = await toWebRequest(req, host);
  const response = await route(ctx, request);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

export async function route(ctx: AppContext, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathName = url.pathname;
  try {
    if (pathName === "/health") {
      return json({ ok: true });
    }
    if (pathName === "/status") {
      return handleStatus(ctx);
    }
    if (pathName === "/dialogue/start" || pathName === "/dialogue/turn") {
      return await handleDialogue(request, ctx, pathName);
    }
    if (pathName === "/leads") {
      return await handleLeads(request, ctx);
    }
    if (pathName === "/leads/test") {
      return await handleLeadTest(request, ctx);
    }
    if (pathName === "/leads/retry") {
      return await handleLeadRetry(request, ctx);
    }
    if (pathName === "/voice/speak") {
      return await handleSpeak(request, ctx);
    }
    if (pathName === "/voice/utterance") {
      return await handleUtterance(request, ctx);
    }
    if (request.method === "GET" || request.method === "HEAD") {
      return await serveStatic(pathName);
    }
    return json({ error: "Not found." }, 404);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "request_failed",
        path: pathName,
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return json({ error: "The receptionist could not complete that request." }, 500);
  }
}

async function handleSpeak(request: Request, ctx: AppContext): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405);
  }
  const gate = ctx.rates.allow(`speak:${request.headers.get("x-forwarded-for") ?? "local"}`, 40);
  if (gate === "limit") {
    return json({ error: "Too many requests. Please wait and try again." }, 429);
  }
  const body = (await request.json()) as { sessionId?: string };
  const sessionId = body.sessionId ?? "";
  if (!isUuid(sessionId)) {
    return json({ error: "sessionId is required." }, 400);
  }
  const state = ctx.sessions.get(sessionId);
  const last = state?.transcript.filter((turn) => turn.role === "agent").at(-1)?.text;
  if (!last) {
    return json({ error: "Session was not found." }, 404);
  }
  try {
    const wav = await synthesize(ctx.config, last);
    return new Response(wav, {
      headers: { "content-type": "audio/wav", "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speech failed";
    return json({ error: `Open-source speech is unavailable. ${message}` }, 503);
  }
}

async function handleUtterance(request: Request, ctx: AppContext): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405);
  }
  const sessionId = request.headers.get("x-session-id") ?? "";
  if (!isUuid(sessionId)) {
    return json({ error: "x-session-id must be the session UUID." }, 400);
  }
  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.byteLength > MAX_AUDIO) {
    return json({ error: "Audio is too large." }, 413);
  }
  let text = "";
  try {
    text = await transcribe(ctx.config, audio, request.headers.get("content-type") ?? "audio/webm");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed";
    return json({ error: `Open-source transcription is unavailable. ${message}` }, 503);
  }
  if (!text) {
    return json({ error: "No speech was recognized. Please try again or type." }, 422);
  }
  const outcome = await ctx.sessions.turn(sessionId, text);
  if (!outcome) {
    return json({ error: "Session was not found." }, 404);
  }
  return json({
    sessionId,
    text,
    say: outcome.say,
    step: outcome.step,
    done: outcome.done,
    lead: outcome.lead,
  });
}

async function serveStatic(pathname: string): Promise<Response> {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return json({ error: "Not found." }, 404);
  }
  try {
    await access(filePath);
    const info = await stat(filePath);
    if (!info.isFile()) {
      return json({ error: "Not found." }, 404);
    }
  } catch {
    return json({ error: "Not found." }, 404);
  }
  const extension = path.extname(filePath);
  const stream = createReadStream(filePath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: { "content-type": TYPES[extension] ?? "application/octet-stream" },
  });
}

async function toWebRequest(req: IncomingMessage, host: string): Promise<Request> {
  const url = `http://${host}${req.url ?? "/"}`;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") {
      headers.set(key, value);
    }
  }
  const method = req.method ?? "GET";
  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = body;
  }
  return new Request(url, init);
}

const isDirectRun = Boolean(process.argv[1]?.endsWith("serve.ts"));

if (isDirectRun) {
  const port = Number(process.env.PORT ?? "8787");
  const ctx = createAppContext(loadConfig());
  const listening = await startServer(ctx, port);
  console.log(`Triton receptionist listening on http://127.0.0.1:${listening}`);
}
