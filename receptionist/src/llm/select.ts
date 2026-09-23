export interface ModelConfig {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  workersAi: boolean;
  openaiTextModel?: string;
  openaiRealtimeModel?: string;
  anthropicModel?: string;
  workersAiModel?: string;
}

export type ModelChoice =
  | {
      provider: "openai";
      realtimeModel: string;
      textModel: string;
      preferred: true;
      note: string;
    }
  | {
      provider: "anthropic";
      model: string;
      preferred: true;
      note: string;
    }
  | {
      provider: "workers-ai";
      model: string;
      preferred: false;
      note: string;
    }
  | {
      provider: "scripted";
      preferred: false;
      note: string;
    };

const DEFAULT_REALTIME = "gpt-realtime-2.1";
const DEFAULT_OPENAI_TEXT = "gpt-6-astra";
const DEFAULT_ANTHROPIC = "claude-opus-5";
const DEFAULT_WORKERS_AI = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

function filled(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Preferred order: OpenAI realtime-class model, then Claude Opus-class,
 * then Workers AI as an explicit fallback. Required spoken lines stay scripted.
 */
export function selectModel(config: ModelConfig): ModelChoice {
  if (filled(config.openaiApiKey)) {
    const realtimeModel = filled(config.openaiRealtimeModel) ?? DEFAULT_REALTIME;
    const textModel = filled(config.openaiTextModel) ?? DEFAULT_OPENAI_TEXT;
    return {
      provider: "openai",
      realtimeModel,
      textModel,
      preferred: true,
      note: `OpenAI ${realtimeModel} interprets unclear caller speech, with ${textModel} on the Responses API if the realtime socket is unavailable. Twilio speaks the script in a female neural voice.`,
    };
  }
  if (filled(config.anthropicApiKey)) {
    const model = filled(config.anthropicModel) ?? DEFAULT_ANTHROPIC;
    return {
      provider: "anthropic",
      model,
      preferred: true,
      note: `Anthropic ${model} interprets unclear caller speech. Twilio speaks the script in a female neural voice.`,
    };
  }
  if (config.workersAi) {
    const model = filled(config.workersAiModel) ?? DEFAULT_WORKERS_AI;
    return {
      provider: "workers-ai",
      model,
      preferred: false,
      note: `Fallback only: Cloudflare Workers AI ${model} is used because no OpenAI or Anthropic key is set. It is not the preferred model. The spoken script does not depend on it.`,
    };
  }
  return {
    provider: "scripted",
    preferred: false,
    note: "No model key is set. The receptionist uses the scripted state machine only.",
  };
}
