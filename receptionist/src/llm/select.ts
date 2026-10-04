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

const DEFAULT_OLLAMA = "qwen2.5:14b-instruct";

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
      note: `Ollama ${model} drives natural debtor-assist dialogue (empathy, disputes, repayment options). Piper or espeak-ng speaks replies.`,
    };
  }
  return {
    provider: "scripted",
    preferred: false,
    note: "Ollama is disabled. The receptionist uses the scripted state machine only.",
  };
}
