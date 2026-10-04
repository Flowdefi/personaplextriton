import { isUuid } from "../runtime.ts";
import type { Account } from "./types.ts";
import type { CreateAccountInput } from "./validate.ts";

export class AccountBook {
  private readonly accounts = new Map<string, Account>();

  add(account: Account): void {
    if (!isUuid(account.id)) {
      throw new Error("Account id must be a UUID.");
    }
    if (this.accounts.has(account.id)) {
      throw new Error("Account id already exists.");
    }
    this.accounts.set(account.id, structuredClone(account));
  }

  find(id: string): Account | null {
    if (!isUuid(id)) {
      return null;
    }
    const found = this.accounts.get(id);
    return found ? structuredClone(found) : null;
  }

  replace(account: Account): void {
    if (!this.accounts.has(account.id)) {
      throw new Error("Account was not found.");
    }
    this.accounts.set(account.id, structuredClone(account));
  }
}

export function buildAccount(input: CreateAccountInput, id: string): Account {
  if (!isUuid(id)) {
    throw new Error("Account id must be a UUID.");
  }
  if (input.principalCents < 100 || input.phones.length < 1) {
    throw new Error("Account input is incomplete.");
  }
  if (input.last4 === null && input.dob === null) {
    throw new Error("Account input is missing a second identifier.");
  }
  return {
    id,
    debtorName: input.debtorName,
    principalCents: input.principalCents,
    creditor: input.creditor,
    status: input.status,
    phones: [...input.phones],
    emails: [...input.emails],
    timeZone: input.timeZone,
    creditorAuthority: input.creditorAuthority,
    last4: input.last4,
    dob: input.dob,
    consents: [],
    suppressions: [...input.suppressions],
    attempts: [],
    paymentHandoff: null,
  };
}
