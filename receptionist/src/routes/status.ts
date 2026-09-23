import { json } from "../http";
import { selectModel } from "../llm/select";

const SECRET_NAMES = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "RESEND_API_KEY",
  "RESEND_FROM",
  "TEST_TOKEN",
  "PUBLIC_BASE_URL",
  "SESSION_SECRET",
] as const;

export function handleStatus(env: Env): Response {
  const configured: Record<string, boolean> = {};
  const missing: string[] = [];
  const values: Record<(typeof SECRET_NAMES)[number], string | undefined> = {
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER: env.TWILIO_PHONE_NUMBER,
    RESEND_API_KEY: env.RESEND_API_KEY,
    RESEND_FROM: env.RESEND_FROM,
    TEST_TOKEN: env.TEST_TOKEN,
    PUBLIC_BASE_URL: env.PUBLIC_BASE_URL,
    SESSION_SECRET: env.SESSION_SECRET,
  };
  for (const name of SECRET_NAMES) {
    const present = Boolean(values[name]?.trim());
    configured[name] = present;
    if (!present && name !== "SESSION_SECRET" && name !== "TEST_TOKEN" && name !== "TWILIO_PHONE_NUMBER") {
      missing.push(name);
    }
  }
  const model = selectModel({
    openaiApiKey: env.OPENAI_API_KEY,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    workersAi: Boolean(env.AI),
    openaiRealtimeModel: env.OPENAI_REALTIME_MODEL,
    openaiTextModel: env.OPENAI_TEXT_MODEL,
    anthropicModel: env.ANTHROPIC_MODEL,
    workersAiModel: env.WORKERS_AI_MODEL,
  });
  return json({
    business: env.BUSINESS_NAME,
    businessPhone: env.BUSINESS_PHONE,
    site: env.BUSINESS_SITE,
    leadEmailTo: env.LEAD_EMAIL_TO,
    voice: {
      transport: String(env.VOICE_TRANSPORT) === "gather" ? "twilio-gather" : "twilio-conversation-relay",
      ttsProvider: env.TTS_PROVIDER,
      voice: env.FEMALE_VOICE,
      sayVoice: env.SAY_VOICE,
    },
    model,
    configured,
    missing,
    forwarding:
      "561-254-6608 is the existing Triton business line. Forward it from the carrier to the Twilio number in TWILIO_PHONE_NUMBER. This app does not port or own that number.",
  });
}
