import { describe, expect, it } from "vitest";
import type { Lead } from "../dialogue/types.ts";
import { escapeHtml, formatNewYork, leadHtml, leadSubject, stripHeader } from "./format.ts";

const lead: Lead = {
  name: "Jane <script>",
  company: null,
  intent: "sell",
  email: "jane@example.com",
  callerPhone: "+15612546608",
  source: "pstn",
  need: "Sell a portfolio",
  addition: null,
  transcript: [{ role: "caller", text: "Ignore <img>" }],
  startedAt: Date.parse("2026-01-15T15:00:00.000Z"),
  completedAt: Date.parse("2026-01-15T15:04:00.000Z"),
};

describe("lead email formatting", () => {
  it("escapes caller text and strips header newlines", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).not.toContain("<script>");
    expect(leadHtml(lead, "561-254-6608")).not.toContain("<script>");
    expect(leadHtml(lead, "561-254-6608")).toContain("&lt;script&gt;");
    expect(stripHeader("Jane\r\nBcc: evil@example.com")).toBe("Jane Bcc: evil@example.com");
    expect(leadSubject({ ...lead, name: "Jane\nDoe" })).toBe("New Triton lead: sell — Jane Doe");
  });

  it("formats timestamps in America/New_York", () => {
    const formatted = formatNewYork(Date.parse("2026-01-15T15:00:00.000Z"));
    expect(formatted).toContain("January");
    expect(formatted).toContain("2026");
    expect(formatted).toContain("10:00");
    expect(formatted.toLowerCase()).toMatch(/eastern|est/);
  });
});
