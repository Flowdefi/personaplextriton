import { assertNever } from "../assert-never";
import type { Intent, Lead, TranscriptTurn } from "../dialogue/types";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function stripHeader(value: string, max = 80): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function formatNewYork(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "full",
    timeStyle: "long",
  }).format(new Date(ms));
}

export function companyLabel(company: string | null): string {
  return company && company.trim().length > 0 ? company.trim() : "none";
}

export function leadSubject(lead: Lead): string {
  return `New Triton lead: ${lead.intent} — ${stripHeader(lead.name)}`;
}

export function structuredSummary(lead: Lead, businessPhone: string): string {
  const lines = [
    `Source: ${sourceLabel(lead.source)}`,
    `Business line (carrier-forwarded, not a ported number): ${businessPhone}`,
    `Caller phone: ${lead.callerPhone}`,
    `Timestamp: ${formatNewYork(lead.completedAt)}`,
    `Name: ${lead.name}`,
    `Company: ${companyLabel(lead.company)}`,
    `Intent: ${lead.intent}`,
    `Email: ${lead.email}`,
    `Need: ${lead.need}`,
    `Added note: ${lead.addition ?? "none"}`,
  ];
  return lines.join("\n");
}

function sourceLabel(source: Lead["source"]): string {
  switch (source) {
    case "pstn":
      return "Phone call forwarded to the voice agent";
    case "browser":
      return "Browser or local voice test (not a PSTN call)";
    case "test":
      return "TEST LEAD from the protected test endpoint";
    default:
      return assertNever(source, "lead source");
  }
}

export function transcriptText(turns: TranscriptTurn[]): string {
  return turns
    .map((turn) => `${turn.role === "agent" ? "Triton AI" : "Caller"}: ${turn.text}`)
    .join("\n");
}

export function leadPlainText(lead: Lead, businessPhone: string): string {
  const banner = lead.source === "test" ? "THIS IS A TEST LEAD\n\n" : "";
  return `${banner}${structuredSummary(lead, businessPhone)}\n\nTranscript:\n${transcriptText(lead.transcript)}\n`;
}

export function leadHtml(lead: Lead, businessPhone: string): string {
  const banner =
    lead.source === "test"
      ? `<p><strong>THIS IS A TEST LEAD.</strong> It was created by the protected test endpoint.</p>`
      : "";
  const rows: Array<[string, string]> = [
    ["Source", sourceLabel(lead.source)],
    ["Business line", businessPhone],
    ["Caller phone", lead.callerPhone],
    ["Timestamp", formatNewYork(lead.completedAt)],
    ["Name", lead.name],
    ["Company", companyLabel(lead.company)],
    ["Intent", lead.intent],
    ["Email", lead.email],
    ["Need", lead.need],
    ["Added note", lead.addition ?? "none"],
  ];
  const body = rows
    .map(
      ([label, value]) =>
        `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const transcript = lead.transcript
    .map(
      (turn) =>
        `<p><strong>${turn.role === "agent" ? "Triton AI" : "Caller"}:</strong> ${escapeHtml(turn.text)}</p>`,
    )
    .join("");
  return `<!doctype html><html><body><h1>New Triton lead</h1>${banner}<p>Triton Financial Solutions message for portfolios@debtmarket.net. The business line 561-254-6608 is the caller's existing number, reached by carrier forwarding.</p><table>${body}</table><h2>Transcript</h2>${transcript}</body></html>`;
}

export function intentIsKnown(value: string): value is Intent {
  return value === "buy" || value === "sell" || value === "collect";
}
