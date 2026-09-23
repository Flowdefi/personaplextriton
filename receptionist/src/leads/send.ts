import type { Lead } from "../dialogue/types";
import { leadHtml, leadPlainText, leadSubject } from "./format";

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
  LEADS: KVNamespace;
  LEAD_EMAIL_TO: string;
  BUSINESS_PHONE: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
}

const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function deliverLead(
  env: MailEnv,
  lead: Lead,
  sessionId: string | null,
): Promise<DeliveryResult> {
  if (sessionId) {
    const existing = await readSessionDelivery(env.LEADS, sessionId);
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
  const stored = await writeRecord(env.LEADS, pending, sessionId);
  const emailed = await sendEmail(env, lead);
  const result: DeliveryResult = { ...emailed, id, lead, stored };
  await writeRecord(env.LEADS, result, sessionId);
  console.log(JSON.stringify({ event: "lead_stored", leadId: id, emailStatus: result.emailStatus, stored }));
  return result;
}

export async function retryLead(env: MailEnv, id: string): Promise<DeliveryResult | null> {
  const existing = await readRecord(env.LEADS, id);
  if (!existing) {
    return null;
  }
  const emailed = await sendEmail(env, existing.lead);
  const result: DeliveryResult = {
    ...existing,
    emailStatus: emailed.emailStatus,
    emailDetail: emailed.emailDetail,
  };
  await writeRecord(env.LEADS, result, null);
  console.log(JSON.stringify({ event: "lead_retry", leadId: id, emailStatus: result.emailStatus }));
  return result;
}

async function sendEmail(env: MailEnv, lead: Lead): Promise<Pick<DeliveryResult, "emailStatus" | "emailDetail">> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM?.trim();
  if (!apiKey) {
    return {
      emailStatus: "skipped",
      emailDetail: "RESEND_API_KEY is not set. The lead was stored and email was skipped.",
    };
  }
  if (!from) {
    return {
      emailStatus: "skipped",
      emailDetail: "RESEND_FROM is not set. The lead was stored and email was skipped.",
    };
  }
  const to = env.LEAD_EMAIL_TO.trim();
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: leadSubject(lead),
        html: leadHtml(lead, env.BUSINESS_PHONE),
        text: leadPlainText(lead, env.BUSINESS_PHONE),
      }),
    });
    if (!response.ok) {
      console.error(JSON.stringify({ event: "email_failed", status: response.status }));
      return {
        emailStatus: "failed",
        emailDetail: `Resend returned HTTP ${response.status}. The lead was stored and can be retried.`,
      };
    }
    return {
      emailStatus: "sent",
      emailDetail: `Email sent to ${to}.`,
    };
  } catch {
    console.error(JSON.stringify({ event: "email_failed", status: "network" }));
    return {
      emailStatus: "failed",
      emailDetail: "Email request failed. The lead was stored and can be retried.",
    };
  }
}

async function writeRecord(kv: KVNamespace, result: DeliveryResult, sessionId: string | null): Promise<boolean> {
  const record: StoredRecord = { ...result, createdAt: new Date().toISOString() };
  try {
    await kv.put(`lead:${result.id}`, JSON.stringify(record), { expirationTtl: THIRTY_DAYS });
    if (sessionId) {
      await kv.put(`session:${sessionId}`, result.id, { expirationTtl: THIRTY_DAYS });
    }
    return true;
  } catch {
    console.error(JSON.stringify({ event: "lead_store_failed", leadId: result.id }));
    return false;
  }
}

async function readSessionDelivery(kv: KVNamespace, sessionId: string): Promise<DeliveryResult | null> {
  const id = await kv.get(`session:${sessionId}`);
  if (!id) {
    return null;
  }
  return readRecord(kv, id);
}

async function readRecord(kv: KVNamespace, id: string): Promise<DeliveryResult | null> {
  const raw = await kv.get(`lead:${id}`);
  if (!raw) {
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
