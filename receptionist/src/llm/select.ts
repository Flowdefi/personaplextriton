export interface ModelConfig {
  ollamaEnabled: boolean;
  ollamaModel?: string;
}

export type ModelChoice =
  | {
      provider: "ollama";
      model: string;
      preferred: true;
      note: string;
    }
  | {
      provider: "scripted";
      preferred: false;
      note: string;
    };

const DEFAULT_OLLAMA = "Qwen3.8-27B-Uncensored";

function filled(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Local open-source interpreter. Spoken lines stay on the script. */
export function selectModel(config: ModelConfig): ModelChoice {
  if (config.ollamaEnabled) {
    const model = filled(config.ollamaModel) ?? DEFAULT_OLLAMA;
    return {
      provider: "ollama",
      model,
      preferred: true,
      note: `Ollama model ${model} interprets unclear caller speech. espeak-ng or Piper speaks the script in a female voice. Clear answers never call the model.`,
    };
  }
  return {
    provider: "scripted",
    preferred: false,
    note: "Ollama is disabled. The receptionist uses the scripted state machine only.",
  };
}
