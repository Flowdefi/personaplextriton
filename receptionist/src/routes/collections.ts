import type { AppContext } from "../app-context.ts";
import { unsafeCode, unsafeMessage, type UnsafeCode } from "../collections/guards.ts";
import { buildAccount } from "../collections/store.ts";
import { THIRD_PARTY_OUTREACH_REFUSED } from "../collections/types.ts";
import {
  applyConsent,
  applyManualDisposition,
  applyOffer,
  applyOutbound,
  applyRevoke,
  applySuppression,
} from "../collections/workflow.ts";
import { parseCreateAccount } from "../collections/validate.ts";
import { isResponse, json, readJson } from "../http.ts";
import { isUuid } from "../runtime.ts";
import { assertNever } from "../assert-never.ts";

const ACCOUNT_PATH = /^\/collections\/accounts\/([0-9a-f-]{36})(\/.*)?$/i;

export async function handleCollections(request: Request, ctx: AppContext, pathName: string): Promise<Response> {
  if (pathName === "/collections/accounts" && request.method === "GET") {
    return json(
      {
        ok: false,
        code: "account_list_refused",
        error: "Account lists are not available.",
        disclosed: false,
      },
      403,
    );
  }
  if (pathName === "/collections/outreach") {
    return refuseOutreach(request);
  }
  if (pathName === "/collections/accounts" && request.method === "POST") {
    return createAccount(request, ctx);
  }
  const match = ACCOUNT_PATH.exec(pathName);
  if (!match) {
    return json({ error: "Not found." }, 404);
  }
  const id = match[1] ?? "";
  const rest = match[2] ?? "";
  if (!isUuid(id)) {
    return json({ ok: false, code: "validation_error", error: "Account id must be a UUID.", disclosed: false }, 400);
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "Use GET or POST." }, 405);
  }
  const account = ctx.accounts.find(id);
  if (!account) {
    return json({ ok: false, code: "account_not_found", error: "Account was not found.", disclosed: false }, 404);
  }
  if (rest === "" && request.method === "GET") {
    return json({ ok: true, account, telephony: "not_placed" });
  }
  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405);
  }
  const body = await readJson(request);
  if (isResponse(body)) {
    return body;
  }
  const handled = dispatch(rest, account, body);
  if (!handled) {
    return json({ error: "Not found." }, 404);
  }
  if (handled.persist) {
    ctx.accounts.replace(handled.account);
  }
  return json(handled.body, handled.httpStatus);
}

function dispatch(rest: string, account: ReturnType<AppContext["accounts"]["find"]>, body: unknown) {
  if (!account) {
    return null;
  }
  switch (rest) {
    case "/consent":
      return applyConsent(account, body);
    case "/consent/revoke":
      return applyRevoke(account, body);
    case "/suppression":
      return applySuppression(account, body);
    case "/outbound":
      return applyOutbound(account, body);
    case "/offers":
      return applyOffer(account, body);
    case "/dispositions":
      return applyManualDisposition(account, body);
    default:
      return null;
  }
}

async function createAccount(request: Request, ctx: AppContext): Promise<Response> {
  const body = await readJson(request);
  if (isResponse(body)) {
    return body;
  }
  const parsed = parseCreateAccount(body);
  if (!parsed.ok) {
    return json(
      { ok: false, code: parsed.code, error: parsed.error, disclosed: false, telephony: "not_placed" },
      parsed.httpStatus,
    );
  }
  const account = buildAccount(parsed.value, crypto.randomUUID());
  ctx.accounts.add(account);
  return json({ ok: true, account, telephony: "not_placed" }, 201);
}

async function refuseOutreach(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405);
  }
  const body = await readJson(request);
  if (isResponse(body)) {
    return body;
  }
  const code = unsafeCode(body) ?? THIRD_PARTY_OUTREACH_REFUSED;
  return json(
    {
      ok: false,
      code: outreachCode(code),
      error: unsafeMessage(code),
      disclosed: false,
      telephony: "not_placed",
      delivered: false,
    },
    code === THIRD_PARTY_OUTREACH_REFUSED ? 403 : 400,
  );
}

function outreachCode(code: UnsafeCode | typeof THIRD_PARTY_OUTREACH_REFUSED): string {
  switch (code) {
    case "payment_card_refused":
    case "skip_trace_refused":
    case "third_party_outreach_refused":
      return code;
    default:
      return assertNever(code, "outreach code");
  }
}
