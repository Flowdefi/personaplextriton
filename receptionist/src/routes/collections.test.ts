import { describe, expect, it } from "vitest";
import { createAppContext } from "../app-context.ts";
import { loadConfig } from "../config.ts";
import { route } from "../serve.ts";

const NOW = Date.parse("2026-01-15T15:00:00.000Z");

async function post(path: string, body: unknown, ctx = createAppContext(loadConfig())): Promise<{ response: Response; json: Record<string, unknown>; ctx: ReturnType<typeof createAppContext> }> {
  const response = await route(
    ctx,
    new Request(`http://127.0.0.1${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { response, json: (await response.json()) as Record<string, unknown>, ctx };
}

describe("collections HTTP API", () => {
  it("walks consent, right-party failure, offers, and hardship without placing a call", async () => {
    const ctx = createAppContext(loadConfig());
    const created = await post(
      "/collections/accounts",
      {
        debtorName: "Maria Elena Santos",
        principalCents: 100_000,
        creditor: "Northwind Bank",
        phones: ["(555) 555-0123"],
        timeZone: "America/New_York",
        creditorAuthority: true,
        last4: "4242",
      },
      ctx,
    );
    expect(created.response.status).toBe(201);
    const account = created.json.account as { id: string };
    const id = account.id;

    const denied = await post(
      `/collections/accounts/${id}/outbound`,
      { channel: "voice", number: "5555550123", now: NOW, statedName: "Maria Elena Santos", last4: "4242" },
      ctx,
    );
    expect(denied.response.status).toBe(403);
    expect(denied.json.code).toBe("blocked_no_consent");
    expect(denied.json.balanceCents).toBeNull();

    const consent = await post(
      `/collections/accounts/${id}/consent`,
      {
        channel: "voice",
        number: "+1 555 555 0123",
        consentType: "prior_express_consent",
        timestamp: NOW,
        source: "signed account form",
      },
      ctx,
    );
    expect(consent.response.status).toBe(201);

    const wrong = await post(
      `/collections/accounts/${id}/outbound`,
      { channel: "voice", number: "+15555550123", now: NOW, statedName: "Maria", last4: "4242" },
      ctx,
    );
    expect(wrong.response.status).toBe(403);
    expect(wrong.json.code).toBe("wrong_party");
    expect(JSON.stringify(wrong.json)).not.toContain("$1,000.00");

    const right = await post(
      `/collections/accounts/${id}/outbound`,
      { channel: "voice", number: "+15555550123", now: NOW + 1, statedName: "Maria Elena Santos", last4: "4242" },
      ctx,
    );
    expect(right.response.status).toBe(200);
    expect(right.json.code).toBe("right_party");
    expect(right.json.telephony).toBe("not_placed");
    const offers = right.json.offers as { hardship: { monthCount: number; monthlyCents: number } };
    expect(offers.hardship.monthCount).toBe(16);
    expect(offers.hardship.monthlyCents).toBe(6500);

    const card = await post(
      `/collections/accounts/${id}/offers`,
      { offer: "hardship", now: NOW + 2, pan: "4111111111111111", cvv: "999" },
      ctx,
    );
    expect(card.response.status).toBe(400);
    expect(card.json.code).toBe("payment_card_refused");
    expect(JSON.stringify(card.json)).not.toContain("4111111111111111");

    const hardship = await post(`/collections/accounts/${id}/offers`, { offer: "hardship", now: NOW + 3 }, ctx);
    expect(hardship.response.status).toBe(200);
    expect(hardship.json.code).toBe("hardship_selected");

    const listed = await route(ctx, new Request("http://127.0.0.1/collections/accounts"));
    expect(listed.status).toBe(403);

    const stored = await route(ctx, new Request(`http://127.0.0.1/collections/accounts/${id}`));
    const storedJson = (await stored.json()) as { account: { attempts: Array<{ code: string }>; paymentHandoff: { status: string } } };
    expect(storedJson.account.paymentHandoff.status).toBe("pending_human");
    expect(storedJson.account.attempts.map((attempt) => attempt.code)).toEqual([
      "blocked_no_consent",
      "wrong_party",
      "right_party",
      "hardship_selected",
    ]);

    const outreach = await post("/collections/outreach", { contactRole: "employer", employerPhone: "+15555550100" }, ctx);
    expect(outreach.response.status).toBe(403);
    expect(outreach.json.code).toBe("third_party_outreach_refused");

    const greeting = await post("/dialogue/start", { callerPhone: "browser-test", source: "test" }, ctx);
    expect(greeting.response.status).toBe(200);
    expect(greeting.json.say).toContain("I'm an AI assistant for Triton");
    expect(greeting.json.say).toContain("this call will be transcribed");
  });
});
