export type AgentMode = "debtor_assist" | "lead_capture";

export interface AppConfig {
  agentMode: AgentMode;
  testPhoneNumber: string | null;
  leadEmailTo: string;
  businessPhone: string;
  businessName: string;
  businessSite: string;
  leadsDir: string;
  testToken: string | null;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaEnabled: boolean;
  smtpHost: string | null;
  smtpPort: number;
  smtpUser: string | null;
  smtpPassword: string | null;
  smtpFrom: string | null;
  smtpMode: "plain" | "starttls" | "tls";
  espeakBin: string;
  espeakVoice: string;
  piperBin: string | null;
  piperModel: string | null;
  sttCommand: string;
  ffmpegBin: string;
}

function filled(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const mode = filled(env.SMTP_MODE) ?? "starttls";
  const smtpMode = mode === "plain" || mode === "tls" || mode === "starttls" ? mode : "starttls";
  const modeRaw = filled(env.AGENT_MODE) ?? "debtor_assist";
  const agentMode: AgentMode = modeRaw === "lead_capture" ? "lead_capture" : "debtor_assist";
  return {
    agentMode,
    testPhoneNumber: filled(env.TEST_PHONE_NUMBER),
    leadEmailTo: filled(env.LEAD_EMAIL_TO) ?? "portfolios@debtmarket.net",
    businessPhone: filled(env.BUSINESS_PHONE) ?? "561-254-6608",
    businessName: filled(env.BUSINESS_NAME) ?? "Triton Financial Solutions, LLC",
    businessSite: filled(env.BUSINESS_SITE) ?? "https://www.debtmarket.net",
    leadsDir: filled(env.LEADS_DIR) ?? "leads",
    testToken: filled(env.TEST_TOKEN),
    ollamaBaseUrl: (filled(env.OLLAMA_BASE_URL) ?? "http://127.0.0.1:11434").replace(/\/$/, ""),
    ollamaModel: filled(env.OLLAMA_MODEL) ?? "qwen2.5:14b-instruct",
    ollamaEnabled: filled(env.OLLAMA_DISABLED) !== "1",
    smtpHost: filled(env.SMTP_HOST),
    smtpPort: Number(filled(env.SMTP_PORT) ?? (smtpMode === "tls" ? "465" : "587")),
    smtpUser: filled(env.SMTP_USER),
    smtpPassword: filled(env.SMTP_PASSWORD),
    smtpFrom: filled(env.SMTP_FROM),
    smtpMode,
    espeakBin: filled(env.ESPEAK_BIN) ?? "espeak-ng",
    espeakVoice: filled(env.ESPEAK_VOICE) ?? "en-us+f3",
    piperBin: filled(env.PIPER_BIN),
    piperModel: filled(env.PIPER_MODEL),
    sttCommand: filled(env.STT_COMMAND) ?? "python3 bin/transcribe.py",
    ffmpegBin: filled(env.FFMPEG_BIN) ?? "ffmpeg",
  };
}
