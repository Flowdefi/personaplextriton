export type Intent = "buy" | "sell" | "collect";

export type Step =
  | "awaiting_need"
  | "awaiting_name"
  | "awaiting_company"
  | "awaiting_intent"
  | "awaiting_email"
  | "awaiting_confirm"
  | "awaiting_addition"
  | "completed";

export type LeadSource = "pstn" | "browser" | "test";

export interface TranscriptTurn {
  role: "agent" | "caller";
  text: string;
}

export interface LeadDraft {
  name: string | null;
  company: string | null;
  companyDeclined: boolean;
  intent: Intent | null;
  email: string | null;
  need: string | null;
  addition: string | null;
}

export interface DialogueState {
  step: Step;
  callerPhone: string;
  source: LeadSource;
  startedAt: number;
  draft: LeadDraft;
  transcript: TranscriptTurn[];
}

export interface Lead {
  name: string;
  company: string | null;
  intent: Intent;
  email: string;
  callerPhone: string;
  source: LeadSource;
  need: string;
  addition: string | null;
  transcript: TranscriptTurn[];
  startedAt: number;
  completedAt: number;
}

export interface TurnResult {
  state: DialogueState;
  say: string;
  done: boolean;
  lead: Lead | null;
}
