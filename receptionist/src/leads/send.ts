import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Lead } from "../dialogue/types.ts";
import { leadPlainText, leadSubject } from "./format.ts";
import { sendSmtpMail } from "./smtp.ts";

export type EmailStatus = "sent" | "skipped" | "failed";

export interface DeliveryResult {
  id: string;
  lead: Lead;
  emailStatus: EmailStatus;
  emailDetail: string;
  stored: boolean;
}

interface StoredRecord extends DeliveryResult {
  createdAt: string;
}

export interface MailEnv {
  leadsDir: string;
  leadEmailTo: string;
  businessPhone: string;
  smtpHost: string | null;
  smtpPort: number;
  smtpUser: string | null;
  smtpPassword: string | null;
  smtpFrom: string | null;
  smtpMode: "plain" | "starttls" | "tls";
}

export async function deliverLead(
  env: MailEnv,
  lead: Lead,
  sessionId: string | null,
): Promise<DeliveryResult> {
  if (sessionId) {
    const existing = await readSessionDelivery(env.leadsDir, sessionId);
    if (existing) {
      return existing;
    }
  }
  const id = crypto.randomUUID();
  const pending: DeliveryResult = {
    id,
    lead,
    emailStatus: "skipped",
    emailDetail: "Lead stored. Email has not been attempted yet.",
    stored: false,
  };
  const stored = await writeRecord(env.leadsDir, pending, sessionId);
  const emailed = await sendEmail(env, lead);
  const result: DeliveryResult = { ...emailed, id, lead, stored };
  await writeRecord(env.leadsDir, result, sessionId);
  console.log(JSON.stringify({ event: "lead_stored", leadId: id, emailStatus: result.emailStatus, stored }));
  return result;
}

export async function retryLead(env: MailEnv, id: string): Promise<DeliveryResult | null> {
  const existing = await readRecord(env.leadsDir, id);
  if (!existing) {
    return null;
  }
  const emailed = await sendEmail(env, existing.lead);
  const result: DeliveryResult = {
    ...existing,
    emailStatus: emailed.emailStatus,
    emailDetail: emailed.emailDetail,
  };
  await writeRecord(env.leadsDir, result, null);
  console.log(JSON.stringify({ event: "lead_retry", leadId: id, emailStatus: result.emailStatus }));
  return result;
}

async function sendEmail(env: MailEnv, lead: Lead): Promise<Pick<DeliveryResult, "emailStatus" | "emailDetail">> {
  const to = env.leadEmailTo.trim();
  if (!env.smtpHost || !env.smtpFrom) {
    return {
      emailStatus: "skipped",
      emailDetail: "SMTP_HOST or SMTP_FROM is not set. The lead file was written and email was skipped.",
    };
  }
  try {
    await sendSmtpMail({
      host: env.smtpHost,
      port: env.smtpPort,
      mode: env.smtpMode,
      user: env.smtpUser,
      password: env.smtpPassword,
      from: env.smtpFrom,
      to,
      subject: leadSubject(lead),
      text: leadPlainText(lead, env.businessPhone),
    });
    return {
      emailStatus: "sent",
      emailDetail: `Email sent to ${to}.`,
    };
  } catch {
    console.error(JSON.stringify({ event: "email_failed" }));
    return {
      emailStatus: "failed",
      emailDetail: "SMTP send failed. The lead file was kept and can be retried.",
    };
  }
}

async function writeRecord(dir: string, result: DeliveryResult, sessionId: string | null): Promise<boolean> {
  const record: StoredRecord = { ...result, createdAt: new Date().toISOString() };
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${result.id}.json`), JSON.stringify(record), "utf8");
    if (sessionId) {
      await writeFile(path.join(dir, `session-${safeId(sessionId)}`), result.id, "utf8");
    }
    return true;
  } catch {
    console.error(JSON.stringify({ event: "lead_store_failed", leadId: result.id }));
    return false;
  }
}

async function readSessionDelivery(dir: string, sessionId: string): Promise<DeliveryResult | null> {
  try {
    const id = (await readFile(path.join(dir, `session-${safeId(sessionId)}`), "utf8")).trim();
    return readRecord(dir, id);
  } catch {
    return null;
  }
}

async function readRecord(dir: string, id: string): Promise<DeliveryResult | null> {
  if (!isSafeId(id)) {
    return null;
  }
  let raw: string;
  try {
    raw = await readFile(path.join(dir, `${id}.json`), "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  if (!("id" in parsed) || !("lead" in parsed) || !("emailStatus" in parsed) || !("emailDetail" in parsed)) {
    return null;
  }
  const record = parsed as StoredRecord;
  return {
    id: record.id,
    lead: record.lead,
    emailStatus: record.emailStatus,
    emailDetail: record.emailDetail,
    stored: true,
  };
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9-]/g, "");
}

function isSafeId(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value);
}
