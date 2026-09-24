import { assertNever } from "../assert-never.ts";
import type { Step } from "../dialogue/types.ts";
import { selectModel, type ModelChoice, type ModelConfig } from "./select.ts";

export interface InterpretEnv extends ModelConfig {
  ollamaBaseUrl: string;
}

const INSTRUCTIONS = `You normalize a single answer for a phone receptionist at Triton Financial Solutions.
Return JSON only, no markdown: {"answer":"<short canonical answer or empty string if unknown>"}.
Do not invent facts. Do not give advice, prices, or legal opinions.
If the step is awaiting_intent, answer must be exactly buy, sell, or collect.
If the step is awaiting_email, answer must be one email address.
If the step is awaiting_company and they have none, answer no company.
If the step is awaiting_name, answer only the person's name.
If the step is awaiting_need, answer a short restatement of what they need.
If you cannot tell, return {"answer":""}.`;

export function readModelAnswer(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || !("answer" in parsed)) {
    return null;
  }
  const answer = parsed.answer;
  if (typeof answer !== "string") {
    return null;
  }
  const trimmed = answer.trim();
  if (trimmed.length === 0 || trimmed.length > 300) {
    return null;
  }
  return trimmed;
}

export async function interpretUtterance(env: InterpretEnv, step: Step, utterance: string): Promise<string | null> {
  const choice = selectModel(env);
  if (choice.provider === "scripted") {
    return null;
  }
  const user = `Step: ${step}\nCaller said: ${utterance}`;
  try {
    const text = await complete(env, choice, user);
    return readModelAnswer(text);
  } catch {
    console.error(JSON.stringify({ event: "model_interpret_failed", provider: choice.provider }));
    return null;
  }
}

async function complete(env: InterpretEnv, choice: ModelChoice, user: string): Promise<string> {
  switch (choice.provider) {
    case "ollama":
      return ollamaText(env.ollamaBaseUrl, choice.model, user);
    case "scripted":
      return "";
    default:
      return assertNever(choice, "model choice");
  }
}

interface OllamaChatBody {
  message?: { content?: string };
}

async function ollamaText(baseUrl: string, model: string, user: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: "system", content: INSTRUCTIONS },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error("Ollama request failed");
  }
  const body = (await response.json()) as OllamaChatBody;
  return body.message?.content ?? "";
}
