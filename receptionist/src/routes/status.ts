import { spawnSync } from "node:child_process";
import type { AppContext } from "../app-context.ts";
import { json } from "../http.ts";
import { selectModel } from "../llm/select.ts";

export function handleStatus(ctx: AppContext): Response {
  const voiceReady = commandExists(ctx.config.piperBin ?? ctx.config.espeakBin);
  const model = selectModel({
    ollamaEnabled: ctx.config.ollamaEnabled,
    ollamaModel: ctx.config.ollamaModel,
  });
  const smtpReady = Boolean(ctx.config.smtpHost && ctx.config.smtpFrom);
  return json({
    business: ctx.config.businessName,
    businessPhone: ctx.config.businessPhone,
    site: ctx.config.businessSite,
    leadEmailTo: ctx.config.leadEmailTo,
    voice: {
      transport: "asterisk",
      engine: ctx.config.piperModel ? "piper" : "espeak-ng",
      voice: ctx.config.piperModel ? ctx.config.piperModel : ctx.config.espeakVoice,
      installed: voiceReady,
    },
    model,
    configured: {
      SMTP_HOST: Boolean(ctx.config.smtpHost),
      SMTP_FROM: Boolean(ctx.config.smtpFrom),
      OLLAMA: ctx.config.ollamaEnabled,
      PIPER_MODEL: Boolean(ctx.config.piperModel),
    },
    missing: smtpReady ? [] : ["SMTP_HOST", "SMTP_FROM"],
    forwarding:
      "561-254-6608 is the existing Triton business line. Forward it from the carrier to an Asterisk SIP number. This app does not port or own that number.",
  });
}

function commandExists(bin: string): boolean {
  const result = spawnSync("sh", ["-c", `command -v ${bin.split(" ")[0] ?? bin}`], { encoding: "utf8" });
  return result.status === 0;
}
