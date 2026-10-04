import type { AppConfig } from "./config.ts";
import { applyCallerUtterance, createSession, heuristicAccepts, openingLine } from "./dialogue/machine.ts";
import type { DialogueState, Lead, LeadSource } from "./dialogue/types.ts";
import {
  conversationOpening,
  converseTurn,
  createConversation,
  type ConversationState,
} from "./llm/converse.ts";
import { interpretUtterance } from "./llm/interpret.ts";
import { deliverLead, type DeliveryResult, type MailEnv } from "./leads/send.ts";
import { RateLimiter } from "./leads/rate-limit.ts";

export interface TurnOutcome {
  say: string;
  step: string;
  done: boolean;
  lead: Lead | null;
}

type AnySession = { kind: "lead"; state: DialogueState } | { kind: "debtor"; state: ConversationState };

export class SessionBook {
  private readonly sessions = new Map<string, AnySession>();
  private readonly dispatched = new Set<string>();
  private readonly config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  start(sessionId: string, callerPhone: string, source: LeadSource): TurnOutcome {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return this.outcomeFromExisting(existing);
    }
    if (this.config.agentMode === "debtor_assist") {
      const state = createConversation({ callerPhone, source, now: Date.now() });
      this.sessions.set(sessionId, { kind: "debtor", state });
      return { say: conversationOpening(), step: "conversation", done: false, lead: null };
    }
    const state = createSession({ callerPhone, source, now: Date.now() });
    this.sessions.set(sessionId, { kind: "lead", state });
    return { say: openingLine(), step: state.step, done: false, lead: null };
  }

  get(sessionId: string): DialogueState | ConversationState | null {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return null;
    }
    return entry.state;
  }

  async turn(sessionId: string, text: string): Promise<TurnOutcome | null> {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return null;
    }
    if (entry.kind === "debtor") {
      const { state, result } = await converseTurn(entry.state, text, {
        ollamaBaseUrl: this.config.ollamaBaseUrl,
        ollamaModel: this.config.ollamaModel,
        ollamaEnabled: this.config.ollamaEnabled,
      });
      this.sessions.set(sessionId, { kind: "debtor", state });
      if (result.done && result.lead) {
        await this.deliverOnce(sessionId, result.lead);
      }
      return { say: result.say, step: result.done ? "completed" : "conversation", done: result.done, lead: result.lead };
    }
    const spoken = await this.maybeNormalize(entry.state, text);
    const result = applyCallerUtterance(entry.state, spoken, Date.now());
    this.sessions.set(sessionId, { kind: "lead", state: result.state });
    if (result.done && result.lead) {
      await this.deliverOnce(sessionId, result.lead);
    }
    return {
      say: result.say,
      step: result.state.step,
      done: result.done,
      lead: result.lead,
    };
  }

  private outcomeFromExisting(entry: AnySession): TurnOutcome {
    if (entry.kind === "debtor") {
      return {
        say: conversationOpening(),
        step: "conversation",
        done: false,
        lead: null,
      };
    }
    return {
      say: openingLine(),
      step: entry.state.step,
      done: entry.state.step === "completed",
      lead: null,
    };
  }

  private async maybeNormalize(state: DialogueState, text: string): Promise<string> {
    if (heuristicAccepts(state.step, text)) {
      return text;
    }
    const normalized = await interpretUtterance(
      {
        ollamaEnabled: this.config.ollamaEnabled,
        ollamaModel: this.config.ollamaModel,
        ollamaBaseUrl: this.config.ollamaBaseUrl,
      },
      state.step,
      text,
    );
    return normalized ?? text;
  }

  private async deliverOnce(sessionId: string, lead: Lead): Promise<void> {
    if (this.dispatched.has(sessionId)) {
      return;
    }
    this.dispatched.add(sessionId);
    try {
      await deliverLead(mailEnv(this.config), lead, sessionId);
    } catch {
      this.dispatched.delete(sessionId);
      console.error(JSON.stringify({ event: "lead_deliver_failed" }));
    }
  }
}

export function mailEnv(config: AppConfig): MailEnv {
  return {
    leadsDir: config.leadsDir,
    leadEmailTo: config.leadEmailTo,
    businessPhone: config.businessPhone,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpUser: config.smtpUser,
    smtpPassword: config.smtpPassword,
    smtpFrom: config.smtpFrom,
    smtpMode: config.smtpMode,
  };
}

export interface AppContext {
  config: AppConfig;
  sessions: SessionBook;
  rates: RateLimiter;
}

export function createAppContext(config: AppConfig): AppContext {
  return {
    config,
    sessions: new SessionBook(config),
    rates: new RateLimiter(),
  };
}

export type { DeliveryResult };
