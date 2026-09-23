const EMAIL_SHAPE = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;

const NO_COMPANY =
  /^(no|nope|nah|none|n\/a|na|no company|without a company|no thanks|individual|personal|just me|i don't have one|i do not have one|i dont have one|not applicable|private person|on my own)[.!]?$/i;

const YES_ONLY = /^(yes|yeah|yep|yup|sure|please|i do|i would|i want to add something)[.!]?$/i;

const NO_MORE =
  /^(no|nope|nah|nothing|nothing else|that's all|thats all|that's it|thats it|no thanks|no thank you|all good|looks good|that's correct|thats correct|correct|we're good|were good|that is all|nothing to add)[.!]?$/i;

const HELLO_ONLY =
  /^(hi|hello|hey|good morning|good afternoon|good evening|howdy)[.!\s]*$/i;

const NAME_STOP =
  /^(yes|no|yeah|nope|ok|okay|sure|hello|hi|hey|help|um|uh)$/i;

export function isEmail(value: string): boolean {
  return EMAIL_SHAPE.test(value.trim());
}

export function parseSpokenEmail(utterance: string): string | null {
  const compact = utterance.trim();
  const direct = compact.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/);
  const directHit = direct?.[0];
  if (directHit && isEmail(directHit)) {
    return directHit.toLowerCase();
  }
  let spoken = compact.toLowerCase();
  spoken = spoken.replace(/\s+at\s+/g, "@");
  spoken = spoken.replace(/\s+dot\s+/g, ".");
  spoken = spoken.replace(/\s+/g, "");
  spoken = spoken.replace(/[<>"'(),]/g, "");
  if (isEmail(spoken)) {
    return spoken.toLowerCase();
  }
  return null;
}

export function parseName(utterance: string): string | null {
  let text = utterance.trim().replace(/\s+/g, " ");
  const introduced = text.match(/^(?:my name is|this is|i am|i'm|it's|it is)\s+(.+)$/i);
  if (introduced?.[1]) {
    text = introduced[1].trim();
  }
  const beforeComma = text.split(/[,.]/)[0]?.trim() ?? text;
  text = beforeComma.replace(/\b(speaking|calling|here)\b/gi, "").trim();
  if (text.length < 2 || text.length > 80) {
    return null;
  }
  if (NAME_STOP.test(text)) {
    return null;
  }
  if (!/^[A-Za-z][A-Za-z .'\-]{0,78}$/.test(text)) {
    return null;
  }
  const words = text.split(/\s+/);
  if (words.length > 5) {
    return null;
  }
  return text;
}

export interface CompanyParse {
  declined: boolean;
  name: string | null;
}

export function parseCompany(utterance: string): CompanyParse | null {
  const text = utterance.trim().replace(/\s+/g, " ");
  if (NO_COMPANY.test(text)) {
    return { declined: true, name: null };
  }
  const introduced = text.match(
    /^(?:my company is|the company is|company is|we are|we're|i'm with|i am with|with|from)\s+(.+)$/i,
  );
  const name = (introduced?.[1] ?? text).replace(/[.]+$/, "").trim();
  if (name.length < 2 || name.length > 120) {
    return null;
  }
  if (/^(yes|yeah|yep|ok|okay|sure)$/i.test(name)) {
    return null;
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .,&'+\-]{0,118}$/u.test(name)) {
    return null;
  }
  return { declined: false, name };
}

export type ConfirmParse = "no" | "yes" | "addition" | "unclear";

export function parseConfirm(utterance: string): ConfirmParse {
  const text = utterance.trim().replace(/\s+/g, " ");
  if (text.length === 0) {
    return "unclear";
  }
  if (NO_MORE.test(text)) {
    return "no";
  }
  if (YES_ONLY.test(text)) {
    return "yes";
  }
  if (text.length >= 2) {
    return "addition";
  }
  return "unclear";
}

export function isGreetingOnly(utterance: string): boolean {
  return HELLO_ONLY.test(utterance.trim());
}

export function isHumanChallenge(utterance: string): boolean {
  return /\b(are you (a )?(human|real person|person|robot|ai|bot)|real person|speak to (a )?(human|person|someone|agent|representative)|talk to (a )?(human|person|someone)|is this a person)\b/i.test(
    utterance,
  );
}

export function isOutOfScopeRequest(utterance: string): boolean {
  return /\b(price|pricing|quote|how much|legal advice|lawsuit|sue\b|attorney|lawyer|credit score|interest rate|negotiat|settlement|payment plan|collection advice|guarantee|discount)\b/i.test(
    utterance,
  );
}

export function isAboutQuestion(utterance: string): boolean {
  return /\b(what do you do|who is this|who are you|what is triton|what's triton|what is debtmarket|what's debtmarket|your website|web site)\b/i.test(
    utterance,
  );
}

export function clipText(value: string, max: number): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) {
    return trimmed;
  }
  return trimmed.slice(0, max);
}
