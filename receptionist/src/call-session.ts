import { DurableObject } from "cloudflare:workers";
import { applyCallerUtterance, createSession, heuristicAccepts, openingLine } from "./dialogue/machine";
import type { DialogueState, LeadSource } from "./dialogue/types";
import { json } from "./http";
import { interpretUtterance } from "./llm/interpret";
import { deliverLead, type DeliveryResult } from "./leads/send";
import { endSession, parseRelayMessage, textToken } from "./voice/relay";

const END_DELAY_MS = 12_000;

interface InitBody {
  callerPhone?: string;
  source?: LeadSource;
}

interface TurnBody {
  text?: string;
}

export class CallSession extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      if (!client || !server) {
        return new Response("WebSocket pair was not created.", { status: 500 });
      }
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/init") {
      return this.init(request);
    }
    if (request.method === "POST" && url.pathname === "/turn") {
      return this.turn(request);
    }
    if (request.method === "GET" && url.pathname === "/state") {
      const state = await this.ctx.storage.get<DialogueState>("state");
      return json({ state: state ?? null });
    }
    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") {
      return;
    }
    const inbound = parseRelayMessage(message);
    if (!inbound) {
      return;
    }
    if (inbound.type === "setup") {
      const from = inbound.from?.trim() || "unknown";
      const existing = await this.ctx.storage.get<DialogueState>("state");
      const state = existing
        ? { ...existing, callerPhone: from === "unknown" ? existing.callerPhone : from }
        : createSession({ callerPhone: from, source: "pstn", now: Date.now() });
      await this.ctx.storage.put("state", state);
      return;
    }
    if (inbound.type === "prompt") {
      if (inbound.last === false) {
        return;
      }
      const text = inbound.voicePrompt?.trim() ?? "";
      const outcome = await this.advance(text);
      ws.send(textToken(outcome.say, true));
      if (outcome.done) {
        await this.ctx.storage.put("ending", true);
        await this.ctx.storage.setAlarm(Date.now() + END_DELAY_MS);
      }
      return;
    }
    if (inbound.type === "error") {
      console.error(JSON.stringify({ event: "relay_error" }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    ws.close(code, "closed");
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    console.error(JSON.stringify({ event: "relay_socket_error", readyState: ws.readyState }));
  }

  async alarm(): Promise<void> {
    const ending = await this.ctx.storage.get<boolean>("ending");
    if (!ending) {
      return;
    }
    for (const socket of this.ctx.getWebSockets()) {
      socket.send(endSession());
      socket.close(1000, "complete");
    }
  }

  private async init(request: Request): Promise<Response> {
    const body = (await request.json()) as InitBody;
    const existing = await this.ctx.storage.get<DialogueState>("state");
    if (existing) {
      return json({ say: openingLine(), step: existing.step, done: existing.step === "completed" });
    }
    const source = body.source === "browser" || body.source === "test" || body.source === "pstn" ? body.source : "pstn";
    const state = createSession({
      callerPhone: body.callerPhone?.trim() || "unknown",
      source,
      now: Date.now(),
    });
    await this.ctx.storage.put("state", state);
    return json({ say: openingLine(), step: state.step, done: false });
  }

  private async turn(request: Request): Promise<Response> {
    const body = (await request.json()) as TurnBody;
    const text = typeof body.text === "string" ? body.text : "";
    const outcome = await this.advance(text);
    return json(outcome);
  }

  private async advance(text: string): Promise<{ say: string; step: DialogueState["step"]; done: boolean; lead: DeliveryResult["lead"] | null }> {
    const existing = await this.ctx.storage.get<DialogueState>("state");
    const state =
      existing ??
      createSession({
        callerPhone: "unknown",
        source: "pstn",
        now: Date.now(),
      });
    const spoken = await this.maybeNormalize(state, text);
    const result = applyCallerUtterance(state, spoken, Date.now());
    await this.ctx.storage.put("state", result.state);
    if (result.done && result.lead && result.state.source === "pstn") {
      await this.deliverOnce(result.lead);
    }
    return {
      say: result.say,
      step: result.state.step,
      done: result.done,
      lead: result.lead,
    };
  }

  private async maybeNormalize(state: DialogueState, text: string): Promise<string> {
    if (heuristicAccepts(state.step, text)) {
      return text;
    }
    const normalized = await interpretUtterance(
      {
        openaiApiKey: this.env.OPENAI_API_KEY,
        anthropicApiKey: this.env.ANTHROPIC_API_KEY,
        workersAi: Boolean(this.env.AI),
        ai: this.env.AI,
        openaiRealtimeModel: this.env.OPENAI_REALTIME_MODEL,
        openaiTextModel: this.env.OPENAI_TEXT_MODEL,
        anthropicModel: this.env.ANTHROPIC_MODEL,
        workersAiModel: this.env.WORKERS_AI_MODEL,
      },
      state.step,
      text,
    );
    return normalized ?? text;
  }

  private async deliverOnce(lead: DeliveryResult["lead"]): Promise<void> {
    const already = await this.ctx.storage.get<boolean>("emailDispatched");
    if (already) {
      return;
    }
    await this.ctx.storage.put("emailDispatched", true);
    try {
      const delivery = await deliverLead(this.env, lead, null);
      await this.ctx.storage.put("delivery", delivery);
    } catch {
      await this.ctx.storage.put("emailDispatched", false);
      console.error(JSON.stringify({ event: "lead_deliver_failed" }));
    }
  }
}
