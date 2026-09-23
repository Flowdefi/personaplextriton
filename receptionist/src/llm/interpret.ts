import { assertNever } from "../assert-never";
import type { Step } from "../dialogue/types";
import { selectModel, type ModelChoice, type ModelConfig } from "./select";

export interface InterpretEnv extends ModelConfig {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  ai?: Ai;
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

export async function interpretUtterance(
  env: InterpretEnv,
  step: Step,
  utterance: string,
): Promise<string | null> {
  const choice = selectModel({
    openaiApiKey: env.openaiApiKey,
    anthropicApiKey: env.anthropicApiKey,
    workersAi: Boolean(env.ai),
    openaiRealtimeModel: env.openaiRealtimeModel,
    openaiTextModel: env.openaiTextModel,
    anthropicModel: env.anthropicModel,
    workersAiModel: env.workersAiModel,
  });
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
    case "openai": {
      const key = env.openaiApiKey;
      if (!key) {
        return "";
      }
      try {
        return await openAiRealtimeText(key, choice.realtimeModel, user);
      } catch {
        console.error(JSON.stringify({ event: "openai_realtime_failed", model: choice.realtimeModel }));
        return openAiResponsesText(key, choice.textModel, user);
      }
    }
    case "anthropic": {
      const key = env.anthropicApiKey;
      if (!key) {
        return "";
      }
      return anthropicText(key, choice.model, user);
    }
    case "workers-ai": {
      if (!env.ai) {
        return "";
      }
      return workersAiText(env.ai, choice.model, user);
    }
    case "scripted":
      return "";
    default:
      return assertNever(choice, "model choice");
  }
}

async function openAiRealtimeText(apiKey: string, model: string, user: string): Promise<string> {
  const response = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Upgrade: "websocket",
    },
  });
  const socket = response.webSocket;
  if (!socket) {
    throw new Error("OpenAI realtime websocket unavailable");
  }
  socket.accept();
  return await new Promise<string>((resolve, reject) => {
    let text = "";
    let settled = false;
    const timer = setTimeout(() => {
      fail(new Error("OpenAI realtime timed out"));
    }, 4000);
    const finish = (value: string) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(value);
    };
    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.close();
      reject(error);
    };
    socket.addEventListener("message", (event: MessageEvent) => {
      const raw = typeof event.data === "string" ? event.data : "";
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }
      if (typeof payload !== "object" || payload === null || !("type" in payload)) {
        return;
      }
      const type = payload.type;
      if (type === "response.output_text.delta" && "delta" in payload && typeof payload.delta === "string") {
        text += payload.delta;
      }
      if (type === "response.output_text.done" && "text" in payload && typeof payload.text === "string") {
        text = payload.text;
      }
      if (type === "response.done" || type === "response.output_text.done") {
        finish(text);
      }
      if (type === "error") {
        fail(new Error("OpenAI realtime error"));
      }
    });
    socket.addEventListener("error", () => {
      fail(new Error("OpenAI realtime socket error"));
    });
    socket.addEventListener("close", () => {
      fail(new Error("OpenAI realtime closed"));
    });
    socket.send(
      JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          model,
          output_modalities: ["text"],
          instructions: INSTRUCTIONS,
        },
      }),
    );
    socket.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: user }],
        },
      }),
    );
    socket.send(JSON.stringify({ type: "response.create" }));
  });
}

interface ResponsesBody {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
}

async function openAiResponsesText(apiKey: string, model: string, user: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_output_tokens: 200,
      input: [
        { role: "system", content: INSTRUCTIONS },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error("OpenAI responses request failed");
  }
  const body = (await response.json()) as ResponsesBody;
  if (typeof body.output_text === "string" && body.output_text.length > 0) {
    return body.output_text;
  }
  const parts: string[] = [];
  for (const item of body.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("");
}

interface AnthropicBody {
  content?: Array<{ text?: string }>;
}

async function anthropicText(apiKey: string, model: string, user: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 200,
      system: INSTRUCTIONS,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!response.ok) {
    throw new Error("Anthropic request failed");
  }
  const body = (await response.json()) as AnthropicBody;
  return (body.content ?? [])
    .map((part) => part.text ?? "")
    .join("");
}

async function workersAiText(ai: Ai, model: string, user: string): Promise<string> {
  const result = await ai.run(model as Parameters<Ai["run"]>[0], {
    messages: [
      { role: "system", content: INSTRUCTIONS },
      { role: "user", content: user },
    ],
    max_tokens: 200,
  });
  if (typeof result === "object" && result !== null && "response" in result && typeof result.response === "string") {
    return result.response;
  }
  return "";
}
