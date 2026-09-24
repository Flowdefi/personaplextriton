import { describe, expect, it } from "vitest";
import { selectModel } from "./select.ts";

describe("selectModel", () => {
  it("uses the local Qwen model through Ollama", () => {
    const choice = selectModel({ ollamaEnabled: true });
    expect(choice.provider).toBe("ollama");
    if (choice.provider === "ollama") {
      expect(choice.model).toBe("Qwen3.8-27B-Uncensored");
      expect(choice.preferred).toBe(true);
    }
  });

  it("honors an overridden open model name", () => {
    const choice = selectModel({ ollamaEnabled: true, ollamaModel: "qwen2.5:7b" });
    expect(choice.provider).toBe("ollama");
    if (choice.provider === "ollama") {
      expect(choice.model).toBe("qwen2.5:7b");
    }
  });

  it("stays scripted when Ollama is disabled", () => {
    const choice = selectModel({ ollamaEnabled: false });
    expect(choice.provider).toBe("scripted");
    expect(choice.preferred).toBe(false);
  });
});
