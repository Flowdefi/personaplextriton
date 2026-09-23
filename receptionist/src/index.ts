import { CallSession } from "./call-session";
import { json } from "./http";
import { handleDialogue } from "./routes/dialogue";
import { handleLeadRetry, handleLeadTest, handleLeads } from "./routes/leads";
import { handleStatus } from "./routes/status";
import { handleGather, handleIncoming, handleSocket } from "./routes/voice";

export { CallSession };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === "/health") {
        return json({ ok: true });
      }
      if (path === "/status") {
        return handleStatus(env);
      }
      if (path === "/voice/incoming") {
        return await handleIncoming(request, env);
      }
      if (path === "/voice/gather") {
        return await handleGather(request, env);
      }
      if (path === "/voice/ws") {
        return await handleSocket(request, env);
      }
      if (path === "/dialogue/start" || path === "/dialogue/turn") {
        return await handleDialogue(request, env, path);
      }
      if (path === "/leads") {
        return await handleLeads(request, env);
      }
      if (path === "/leads/test") {
        return await handleLeadTest(request, env);
      }
      if (path === "/leads/retry") {
        return await handleLeadRetry(request, env);
      }
      if (request.method === "GET" || request.method === "HEAD") {
        return await env.ASSETS.fetch(request);
      }
      return json({ error: "Not found." }, 404);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "request_failed",
          path,
          message: error instanceof Error ? error.message : "unknown",
        }),
      );
      return json({ error: "The receptionist could not complete that request." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
