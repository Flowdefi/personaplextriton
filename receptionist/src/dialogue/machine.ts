import { assertNever } from "../assert-never";
import { normalizeIntent } from "./intent";
import {
  clipText,
  isAboutQuestion,
  isEmail,
  isGreetingOnly,
  isHumanChallenge,
  isOutOfScopeRequest,
  parseCompany,
  parseConfirm,
  parseName,
  parseSpokenEmail,
} from "./parse";
import {
  ABOUT_TRITON,
  ASK_ADDITION,
  ASK_COMPANY,
  ASK_CONFIRM_AGAIN,
  ASK_EMAIL,
  ASK_EMAIL_AGAIN,
  ASK_INTENT,
  ASK_INTENT_AGAIN,
  ASK_NAME,
  ASK_NAME_AGAIN,
  ASK_NEED_AGAIN,
  CANNOT_DO,
  GREETING,
  NOT_HUMAN,
  TAKE_MESSAGE,
  readbackLine,
  thanksLine,
} from "./script";
import type { DialogueState, Lead, LeadDraft, LeadSource, Step, TurnResult } from "./types";

const EMPTY_DRAFT: LeadDraft = {
  name: null,
  company: null,
  companyDeclined: false,
  intent: null,
  email: null,
  need: null,
  addition: null,
};

export function createSession(input: {
  callerPhone: string;
  source: LeadSource;
  now: number;
}): DialogueState {
  return {
    step: "awaiting_need",
    callerPhone: clipText(input.callerPhone, 40) || "unknown",
    source: input.source,
    startedAt: input.now,
    draft: { ...EMPTY_DRAFT },
    transcript: [{ role: "agent", text: GREETING }],
  };
}

export function openingLine(): string {
  return GREETING;
}

export function leadFromState(state: DialogueState, completedAt: number): Lead | null {
  const { draft } = state;
  if (!draft.name || !draft.intent || !draft.email || !draft.need) {
    return null;
  }
  if (!isEmail(draft.email)) {
    return null;
  }
  return {
    name: draft.name,
    company: draft.companyDeclined ? null : draft.company,
    intent: draft.intent,
    email: draft.email,
    callerPhone: state.callerPhone,
    source: state.source,
    need: draft.need,
    addition: draft.addition,
    transcript: state.transcript,
    startedAt: state.startedAt,
    completedAt,
  };
}

function withTurn(state: DialogueState, caller: string, say: string, step: Step): DialogueState {
  return {
    ...state,
    step,
    draft: { ...state.draft },
    transcript: [
      ...state.transcript,
      { role: "caller", text: caller },
      { role: "agent", text: say },
    ],
  };
}

function prefixFor(utterance: string): string {
  if (isHumanChallenge(utterance)) {
    return `${NOT_HUMAN} `;
  }
  if (isOutOfScopeRequest(utterance)) {
    return `${CANNOT_DO} `;
  }
  return "";
}

function result(
  state: DialogueState,
  caller: string,
  say: string,
  step: Step,
  completedAt: number | null,
): TurnResult {
  const next = withTurn(state, caller, say, step);
  const done = step === "completed";
  const lead = done ? leadFromState(next, completedAt ?? state.startedAt) : null;
  return { state: next, say, done, lead };
}

function repeat(state: DialogueState, caller: string, say: string): TurnResult {
  return result(state, caller, say, state.step, null);
}

export function currentPrompt(step: Step): string {
  switch (step) {
    case "awaiting_need":
      return ASK_NEED_AGAIN;
    case "awaiting_name":
      return ASK_NAME_AGAIN;
    case "awaiting_company":
      return ASK_COMPANY;
    case "awaiting_intent":
      return ASK_INTENT_AGAIN;
    case "awaiting_email":
      return ASK_EMAIL_AGAIN;
    case "awaiting_confirm":
      return ASK_CONFIRM_AGAIN;
    case "awaiting_addition":
      return ASK_ADDITION;
    case "completed":
      return thanksLine("there");
    default:
      return assertNever(step, "step");
  }
}

/**
 * True when the scripted parser can accept this utterance without a model.
 * The phone path may call the LLM only when this returns false.
 */
export function heuristicAccepts(step: Step, utterance: string): boolean {
  const text = utterance.trim();
  if (text.length === 0) {
    return false;
  }
  switch (step) {
    case "awaiting_need":
      return !isGreetingOnly(text) && !isAboutQuestion(text) && text.length >= 3;
    case "awaiting_name":
      return parseName(text) !== null;
    case "awaiting_company":
      return parseCompany(text) !== null;
    case "awaiting_intent":
      return normalizeIntent(text) !== null;
    case "awaiting_email":
      return parseSpokenEmail(text) !== null;
    case "awaiting_confirm":
      return parseConfirm(text) !== "unclear";
    case "awaiting_addition":
      return text.length >= 2;
    case "completed":
      return true;
    default:
      return assertNever(step, "step");
  }
}

export function applyCallerUtterance(
  state: DialogueState,
  utterance: string,
  completedAt: number,
): TurnResult {
  const caller = clipText(utterance, 1500);
  if (state.step === "completed") {
    const say = thanksLine(state.draft.name ?? "there");
    return result(state, caller || "(silence)", say, "completed", completedAt);
  }
  if (caller.length === 0) {
    return repeat(state, "(silence)", `${prefixFor(caller)}${currentPrompt(state.step)}`);
  }

  switch (state.step) {
    case "awaiting_need":
      return onNeed(state, caller, completedAt);
    case "awaiting_name":
      return onName(state, caller, completedAt);
    case "awaiting_company":
      return onCompany(state, caller, completedAt);
    case "awaiting_intent":
      return onIntent(state, caller, completedAt);
    case "awaiting_email":
      return onEmail(state, caller, completedAt);
    case "awaiting_confirm":
      return onConfirm(state, caller, completedAt);
    case "awaiting_addition":
      return onAddition(state, caller, completedAt);
    default:
      return assertNever(state.step, "step");
  }
}

function onNeed(state: DialogueState, caller: string, completedAt: number): TurnResult {
  if (isAboutQuestion(caller) && !isOutOfScopeRequest(caller)) {
    return repeat(state, caller, ABOUT_TRITON);
  }
  if (isGreetingOnly(caller) || caller.length < 3) {
    const prefix = prefixFor(caller);
    return repeat(state, caller, `${prefix}${ASK_NEED_AGAIN}`);
  }
  const prefix = prefixFor(caller);
  const next: DialogueState = {
    ...state,
    draft: { ...state.draft, need: caller },
  };
  const say = `${prefix}${TAKE_MESSAGE} ${ASK_NAME}`;
  return result(next, caller, say, "awaiting_name", completedAt);
}

function onName(state: DialogueState, caller: string, completedAt: number): TurnResult {
  const name = parseName(caller);
  if (!name) {
    return repeat(state, caller, `${prefixFor(caller)}${ASK_NAME_AGAIN}`);
  }
  const next: DialogueState = {
    ...state,
    draft: { ...state.draft, name },
  };
  const say = `${prefixFor(caller)}Thank you, ${name}. ${ASK_COMPANY}`;
  return result(next, caller, say, "awaiting_company", completedAt);
}

function onCompany(state: DialogueState, caller: string, completedAt: number): TurnResult {
  const parsed = parseCompany(caller);
  if (!parsed) {
    return repeat(state, caller, `${prefixFor(caller)}${ASK_COMPANY}`);
  }
  const next: DialogueState = {
    ...state,
    draft: {
      ...state.draft,
      company: parsed.declined ? null : parsed.name,
      companyDeclined: parsed.declined,
    },
  };
  const say = `${prefixFor(caller)}${ASK_INTENT}`;
  return result(next, caller, say, "awaiting_intent", completedAt);
}

function onIntent(state: DialogueState, caller: string, completedAt: number): TurnResult {
  const intent = normalizeIntent(caller);
  if (!intent) {
    return repeat(state, caller, `${prefixFor(caller)}${ASK_INTENT_AGAIN}`);
  }
  const next: DialogueState = {
    ...state,
    draft: { ...state.draft, intent },
  };
  const say = `${prefixFor(caller)}${ASK_EMAIL}`;
  return result(next, caller, say, "awaiting_email", completedAt);
}

function onEmail(state: DialogueState, caller: string, completedAt: number): TurnResult {
  const email = parseSpokenEmail(caller);
  if (!email) {
    return repeat(state, caller, `${prefixFor(caller)}${ASK_EMAIL_AGAIN}`);
  }
  const draft = { ...state.draft, email };
  const name = draft.name;
  const need = draft.need;
  const intent = draft.intent;
  if (!name || !need || !intent) {
    return repeat(state, caller, ASK_EMAIL_AGAIN);
  }
  const next: DialogueState = { ...state, draft };
  const say = `${prefixFor(caller)}${readbackLine({
    name,
    company: draft.companyDeclined ? null : draft.company,
    intent,
    email,
    need,
  })}`;
  return result(next, caller, say, "awaiting_confirm", completedAt);
}

function onConfirm(state: DialogueState, caller: string, completedAt: number): TurnResult {
  const choice = parseConfirm(caller);
  switch (choice) {
    case "no": {
      const name = state.draft.name ?? "there";
      return result(state, caller, thanksLine(name), "completed", completedAt);
    }
    case "yes":
      return result(state, caller, `${prefixFor(caller)}${ASK_ADDITION}`, "awaiting_addition", completedAt);
    case "addition": {
      const next: DialogueState = {
        ...state,
        draft: { ...state.draft, addition: caller },
      };
      const name = next.draft.name ?? "there";
      return result(next, caller, thanksLine(name), "completed", completedAt);
    }
    case "unclear":
      return repeat(state, caller, `${prefixFor(caller)}${ASK_CONFIRM_AGAIN}`);
    default:
      return assertNever(choice, "confirm");
  }
}

function onAddition(state: DialogueState, caller: string, completedAt: number): TurnResult {
  if (caller.length < 2) {
    return repeat(state, caller, ASK_ADDITION);
  }
  const next: DialogueState = {
    ...state,
    draft: { ...state.draft, addition: caller },
  };
  const name = next.draft.name ?? "there";
  return result(next, caller, thanksLine(name), "completed", completedAt);
}
