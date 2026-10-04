import { OPENING_DEBTOR, DEBTOR_ASSIST_SYSTEM } from "./prompt.ts";
import type { Lead, LeadSource, TranscriptTurn } from "../dialogue/types.ts";

export interface ConversationState {
  mode: "debtor_assist";
  callerPhone: string;
  source: LeadSource;
  startedAt: number;
  transcript: TranscriptTurn[];
  summary: ConversationSummary;
  turnCount: number;
}

export interface ConversationSummary {
  callerName: string | null;
  issueType: string | null;
  intent: "buy" | "sell" | "collect" | null;
  email: string | null;
  need: string | null;
  resolutionOffered: string | null;
}

export interface ConverseResponse {
  say: string;
  done: boolean;
  lead: Lead | null;
}

const MAX_TURNS = 24;

export function createConversation(input: {
  callerPhone: string;
  source: LeadSource;
  now: number;
}): ConversationState {
  return {
    mode: "debtor_assist",
    callerPhone: input.callerPhone,
    source: input.source,
    startedAt: input.now,
    transcript: [{ role: "agent", text: OPENING_DEBTOR }],
    summary: {
      callerName: null,
      issueType: null,
      intent: null,
      email: null,
      need: null,
      resolutionOffered: null,
    },
    turnCount: 0,
  };
}

export function conversationOpening(): string {
  return OPENING_DEBTOR;
}

export async function converseTurn(
  state: ConversationState,
  callerText: string,
  config: { ollamaBaseUrl: string; ollamaModel: string; ollamaEnabled: boolean },
): Promise<{ state: ConversationState; result: ConverseResponse }> {
  const trimmed = callerText.trim();
  const nextTranscript: TranscriptTurn[] = trimmed
    ? [...state.transcript, { role: "caller", text: trimmed }]
    : [...state.transcript];
  const turnCount = state.turnCount + 1;
  if (turnCount > MAX_TURNS) {
    const say =
      "I want to make sure you get the right help. I'll have a team member follow up using the number you're calling from. Thank you for calling Triton.";
    const transcript: TranscriptTurn[] = [...nextTranscript, { role: "agent", text: say }];
    const lead = leadFromConversation({ ...state, transcript }, state.summary, Date.now());
    return {
      state: { ...state, transcript, turnCount },
      result: { say, done: true, lead },
    };
  }
  let modelText: string | null = null;
  if (config.ollamaEnabled) {
    try {
      modelText = await ollamaConverse(config.ollamaBaseUrl, config.ollamaModel, nextTranscript);
    } catch (error) {
      console.error("Ollama converse error:", error instanceof Error ? error.message : error);
    }
  }
  const parsed = modelText ? readConverseJson(modelText) : null;
  const say =
    parsed?.say ??
    "I hear you, and I want to help. Can you tell me a little more about what you're hoping we can do today?";
  const summary = mergeSummary(state.summary, parsed?.summary);
  const transcript: TranscriptTurn[] = [...nextTranscript, { role: "agent", text: say }];
  const done = parsed?.done === true && canClose(summary, state.callerPhone);
  const lead = done ? leadFromConversation({ ...state, transcript, summary }, summary, Date.now()) : null;
  return {
    state: { ...state, transcript, summary, turnCount },
    result: { say, done, lead },
  };
}

function mergeSummary(base: ConversationSummary, patch: Partial<ConversationSummary> | undefined): ConversationSummary {
  if (!patch) {
    return base;
  }
  return {
    callerName: patch.callerName ?? base.callerName,
    issueType: patch.issueType ?? base.issueType,
    intent: patch.intent ?? base.intent,
    email: patch.email ?? base.email,
    need: patch.need ?? base.need,
    resolutionOffered: patch.resolutionOffered ?? base.resolutionOffered,
  };
}

function canClose(summary: ConversationSummary, callerPhone: string): boolean {
  const hasContact = Boolean(summary.email?.includes("@")) || callerPhone !== "unknown";
  const hasName = Boolean(summary.callerName?.trim());
  return hasName && hasContact && Boolean(summary.need?.trim());
}

function leadFromConversation(state: ConversationState, summary: ConversationSummary, completedAt: number): Lead | null {
  if (!canClose(summary, state.callerPhone)) {
    return null;
  }
  const intent = summary.intent ?? "collect";
  return {
    name: summary.callerName ?? "Unknown caller",
    company: null,
    intent,
    email: summary.email?.includes("@") ? summary.email : `callback+${state.callerPhone.replace(/\D/g, "")}@debtmarket.net`,
    callerPhone: state.callerPhone,
    source: state.source,
    need: summary.need ?? "Inbound debtor assist call",
    addition: summary.resolutionOffered,
    transcript: state.transcript,
    startedAt: state.startedAt,
    completedAt,
  };
}

interface ModelPayload {
  say?: string;
  done?: boolean;
  summary?: Partial<ConversationSummary>;
}

function readConverseJson(text: string): ModelPayload | null {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(stripped.slice(start, end + 1)) as ModelPayload;
  } catch {
    return null;
  }
}

async function ollamaConverse(baseUrl: string, model: string, transcript: TranscriptTurn[]): Promise<string> {
  const messages = [
    { role: "system", content: DEBTOR_ASSIST_SYSTEM },
    ...transcript.map((turn) => ({
      role: turn.role === "agent" ? "assistant" : "user",
      content: turn.text,
    })),
  ];
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      messages,
      options: { temperature: 0.65, num_predict: 320 },
    }),
  });
  if (!response.ok) {
    throw new Error("Ollama converse failed");
  }
  const body = (await response.json()) as { message?: { content?: string } };
  return body.message?.content ?? "";
}
