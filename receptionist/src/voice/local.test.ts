import { describe, expect, it } from "vitest";
import { espeakArgs, piperArgs } from "./local.ts";
import { loadConfig } from "../config.ts";

describe("local voice commands", () => {
  it("asks espeak-ng for the female US voice", () => {
    const config = loadConfig({});
    expect(espeakArgs(config, "/tmp/say.wav")).toEqual([
      "-v",
      "en-us+f3",
      "-s",
      "150",
      "-w",
      "/tmp/say.wav",
      "--stdin",
    ]);
  });

  it("uses Piper when a model path is configured", () => {
    const config = loadConfig({ PIPER_BIN: "piper", PIPER_MODEL: "en_US-lessac-medium.onnx" });
    expect(piperArgs(config, "/tmp/say.wav")[0]).toBe("--model");
    expect(piperArgs(config, "/tmp/say.wav")).toContain("en_US-lessac-medium.onnx");
  });
});
