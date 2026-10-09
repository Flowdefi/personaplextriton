/** Stable lines. Tests and the phone path speak these verbatim. */

export const GREETING =
  "Thank you for calling Triton Financial Solutions. I'm an AI assistant for Triton, and this call will be transcribed so your message can be passed to the team. How can I help you today?";

export const TAKE_MESSAGE =
  "As an AI for Triton, I can certainly take a message and pass it to the team.";

export const ASK_NAME = "May I have your name?";

export const ASK_NAME_AGAIN =
  "I didn't catch your name. Please say your first and last name.";

export const ASK_COMPANY =
  "What company are you with? If you don't have one, just say no company.";

export const ASK_INTENT =
  "Are you looking to buy debt, sell debt, or collect on debt?";

export const ASK_INTENT_AGAIN =
  "I want to get this right. Are you looking to buy, sell, or collect on debt?";

export const ASK_EMAIL = "What email address should the team use to reach you?";

export const ASK_EMAIL_AGAIN =
  "That doesn't look like a complete email address. Please say it again, for example jane at company dot com.";

export const ASK_NEED_AGAIN =
  "I'm sorry, I didn't catch that. How can I help you today?";

export const ASK_ADDITION = "What would you like me to add?";

export const ASK_CONFIRM_AGAIN =
  "I want to confirm. Would you like to add anything, or should I pass this message to the team as it is?";

export const CANNOT_DO =
  "I can't help with that directly. I only take messages for the team, and I can include what you said in the message.";

export const NOT_HUMAN =
  "I'm an AI assistant for Triton Financial Solutions. I'm not a person.";

export const ABOUT_TRITON =
  "Triton Financial Solutions operates DebtMarket at debtmarket.net, where institutions buy, sell, and place debt for collection. I only take messages for the team. How can I help you today?";

export function askCompanyLine(): string {
  return ASK_COMPANY;
}

export function thanksLine(name: string): string {
  return `Thank you, ${name}. I'll pass this message to the Triton team. Have a good day.`;
}

export function readbackLine(input: {
  name: string;
  company: string | null;
  intent: "buy" | "sell" | "collect";
  email: string;
  need: string;
}): string {
  const companyPhrase = input.company ? `with ${input.company}` : "with no company";
  return `Let me read that back. ${input.name}, ${companyPhrase}, looking to ${input.intent} debt, email ${input.email}. Your message was: ${input.need}. Would you like to add anything before I pass this to the team?`;
}
