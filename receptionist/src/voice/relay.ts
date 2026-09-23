export type RelayInbound =
  | {
      type: "setup";
      callSid?: string;
      from?: string;
      to?: string;
      forwardedFrom?: string;
    }
  | { type: "prompt"; voicePrompt?: string; last?: boolean }
  | { type: "interrupt" }
  | { type: "dtmf"; digit?: string }
  | { type: "error"; description?: string };

export function parseRelayMessage(raw: string): RelayInbound | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
    return null;
  }
  const type = parsed.type;
  if (type === "setup" || type === "prompt" || type === "interrupt" || type === "dtmf" || type === "error") {
    return parsed as RelayInbound;
  }
  return null;
}

export function textToken(token: string, last: boolean): string {
  return JSON.stringify({
    type: "text",
    token,
    last,
    interruptible: false,
  });
}

export function endSession(): string {
  return JSON.stringify({
    type: "end",
    handoffData: JSON.stringify({ reason: "message-complete" }),
  });
}
