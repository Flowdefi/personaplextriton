import { isEmail } from "../dialogue/parse.ts";
import type { Intent, Lead, LeadSource, TranscriptTurn } from "../dialogue/types.ts";
import { intentIsKnown } from "./format.ts";

const SOURCES = new Set<LeadSource>(["pstn", "browser", "test"]);

export interface LeadValidation {
  ok: true;
  lead: Lead;
}

export interface LeadError {
  ok: false;
  error: string;
}

export function validateLeadPayload(input: unknown, now: number): LeadValidation | LeadError {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Lead body must be a JSON object." };
  }
  const body = input as Record<string, unknown>;
  const name = requiredString(body.name, "name", 80);
  if (typeof name !== "string") {
    return name;
  }
  const emailRaw = requiredString(body.email, "email", 200);
  if (typeof emailRaw !== "string") {
    return emailRaw;
  }
  const email = emailRaw.trim().toLowerCase();
  if (!isEmail(email)) {
    return { ok: false, error: "Email address is not valid." };
  }
  const intentRaw = requiredString(body.intent, "intent", 20);
  if (typeof intentRaw !== "string") {
    return intentRaw;
  }
  if (!intentIsKnown(intentRaw)) {
    return { ok: false, error: "Intent must be buy, sell, or collect." };
  }
  const intent: Intent = intentRaw;
  const callerPhone = requiredString(body.callerPhone, "callerPhone", 40);
  if (typeof callerPhone !== "string") {
    return callerPhone;
  }
  const need = requiredString(body.need, "need", 1500);
  if (typeof need !== "string") {
    return need;
  }
  const sourceRaw = body.source;
  if (typeof sourceRaw !== "string" || !SOURCES.has(sourceRaw as LeadSource)) {
    return { ok: false, error: "Source must be pstn, browser, or test." };
  }
  const source = sourceRaw as LeadSource;
  const company = optionalString(body.company, "company", 120);
  if (isLeadError(company)) {
    return company;
  }
  const addition = optionalString(body.addition, "addition", 1500);
  if (isLeadError(addition)) {
    return addition;
  }
  const transcript = parseTranscript(body.transcript);
  if (!Array.isArray(transcript)) {
    return transcript;
  }
  const startedAt = typeof body.startedAt === "number" && Number.isFinite(body.startedAt) ? body.startedAt : now;
  const completedAt =
    typeof body.completedAt === "number" && Number.isFinite(body.completedAt) ? body.completedAt : now;
  return {
    ok: true,
    lead: {
      name: name.replace(/[\r\n]+/g, " ").trim(),
      company,
      intent,
      email,
      callerPhone,
      source,
      need,
      addition,
      transcript,
      startedAt,
      completedAt,
    },
  };
}

function isLeadError(value: string | null | LeadError): value is LeadError {
  return typeof value === "object" && value !== null;
}

function requiredString(value: unknown, field: string, max: number): string | LeadError {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, error: `${field} is required.` };
  }
  if (value.length > max) {
    return { ok: false, error: `${field} is too long.` };
  }
  return value.trim();
}

function optionalString(value: unknown, field: string, max: number): string | null | LeadError {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    return { ok: false, error: `${field} must be a string.` };
  }
  if (value.length > max) {
    return { ok: false, error: `${field} is too long.` };
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseTranscript(value: unknown): TranscriptTurn[] | LeadError {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: "Transcript is required." };
  }
  if (value.length > 40) {
    return { ok: false, error: "Transcript is too long." };
  }
  const turns: TranscriptTurn[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, error: "Transcript entries must be objects." };
    }
    const role = "role" in entry ? entry.role : undefined;
    const text = "text" in entry ? entry.text : undefined;
    if (role !== "agent" && role !== "caller") {
      return { ok: false, error: "Transcript role must be agent or caller." };
    }
    if (typeof text !== "string" || text.trim().length === 0 || text.length > 2000) {
      return { ok: false, error: "Transcript text is missing or too long." };
    }
    turns.push({ role, text: text.trim() });
  }
  return turns;
}
