import { describe, expect, it } from "vitest";
import { readModelAnswer } from "./interpret.ts";

describe("readModelAnswer", () => {
  it("reads a JSON answer and ignores surrounding text", () => {
    expect(readModelAnswer('Sure {"answer":"buy"}')).toBe("buy");
  });

  it("rejects empty and non-json answers", () => {
    expect(readModelAnswer('{"answer":""}')).toBeNull();
    expect(readModelAnswer("I think they want to sell")).toBeNull();
    expect(readModelAnswer('{"answer":1}')).toBeNull();
  });
});
