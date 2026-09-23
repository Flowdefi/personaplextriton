import { describe, expect, it } from "vitest";
import { selectModel } from "./select";

describe("selectModel", () => {
  it("prefers OpenAI when that key is present", () => {
    const choice = selectModel({
      openaiApiKey: "sk-test",
      anthropicApiKey: "sk-ant",
      workersAi: true,
    });
    expect(choice.provider).toBe("openai");
    if (choice.provider === "openai") {
      expect(choice.realtimeModel).toBe("gpt-realtime-2.1");
      expect(choice.textModel).toBe("gpt-6-astra");
      expect(choice.preferred).toBe(true);
    }
  });

  it("uses Claude opus-class when only Anthropic is set", () => {
    const choice = selectModel({
      anthropicApiKey: "sk-ant",
      workersAi: true,
    });
    expect(choice.provider).toBe("anthropic");
    if (choice.provider === "anthropic") {
      expect(choice.model).toBe("claude-opus-5");
    }
  });

  it("marks Workers AI as the fallback", () => {
    const choice = selectModel({ workersAi: true });
    expect(choice.provider).toBe("workers-ai");
    expect(choice.preferred).toBe(false);
    expect(choice.note.toLowerCase()).toContain("fallback");
  });

  it("stays scripted when nothing is configured", () => {
    const choice = selectModel({ workersAi: false });
    expect(choice.provider).toBe("scripted");
  });
});
