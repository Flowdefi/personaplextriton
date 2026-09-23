import { describe, expect, it } from "vitest";
import { GREETING } from "../dialogue/script";
import { conversationRelayTwiml, gatherTwiml } from "./twiml";

describe("twiml", () => {
  it("puts the Florida disclosure in the ConversationRelay greeting and uses Joanna", () => {
    const xml = conversationRelayTwiml({
      websocketUrl: "wss://example.com/voice/ws?callSid=CA1&token=abc",
      voice: "Joanna-Generative",
      ttsProvider: "Amazon",
    });
    expect(xml).toContain("welcomeGreeting=");
    expect(xml).toContain("I&apos;m an AI assistant for Triton");
    expect(xml).toContain("this call will be transcribed");
    expect(xml).toContain('voice="Joanna-Generative"');
    expect(xml).toContain('ttsProvider="Amazon"');
    expect(xml).toContain("wss://example.com/voice/ws");
    expect(GREETING).toContain("How can I help you today?");
  });

  it("speaks with Polly Joanna on the gather fallback and hangs up when done", () => {
    const asking = gatherTwiml({
      actionUrl: "https://example.com/voice/gather?callSid=CA1",
      sayVoice: "Polly.Joanna-Generative",
      prompt: GREETING,
      done: false,
    });
    expect(asking).toContain('voice="Polly.Joanna-Generative"');
    expect(asking).toContain("<Gather");
    const done = gatherTwiml({
      actionUrl: "https://example.com/voice/gather",
      sayVoice: "Polly.Joanna-Generative",
      prompt: "Thank you.",
      done: true,
    });
    expect(done).toContain("<Hangup/>");
  });
});
