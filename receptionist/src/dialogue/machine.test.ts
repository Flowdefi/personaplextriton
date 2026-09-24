import { describe, expect, it } from "vitest";
import { normalizeIntent } from "./intent.ts";
import { applyCallerUtterance, createSession, openingLine } from "./machine.ts";
import { isEmail, parseSpokenEmail } from "./parse.ts";
import { GREETING, TAKE_MESSAGE } from "./script.ts";
import type { DialogueState, Lead } from "./types.ts";

const NOW = Date.parse("2026-01-15T15:00:00.000Z");

function start(): DialogueState {
  return createSession({
    callerPhone: "+15612546608",
    source: "browser",
    now: NOW,
  });
}

function say(state: DialogueState, text: string, at = NOW + 1000): ReturnType<typeof applyCallerUtterance> {
  return applyCallerUtterance(state, text, at);
}

describe("greeting disclosure", () => {
  it("opens as an AI, discloses transcription, and asks how she can help", () => {
    const line = openingLine();
    expect(line).toBe(GREETING);
    expect(line).toContain("Triton Financial Solutions");
    expect(line).toContain("I'm an AI assistant for Triton");
    expect(line).toContain("this call will be transcribed");
    expect(line).toContain("How can I help you today?");
    expect(start().transcript[0]?.text).toBe(GREETING);
  });
});

describe("message taking script", () => {
  it("walks every required field, accepts no company, and builds a lead", () => {
    let state = start();
    const need = say(state, "I need help placing a portfolio");
    expect(need.say).toContain(TAKE_MESSAGE);
    expect(need.say).toContain("May I have your name?");
    expect(need.state.step).toBe("awaiting_name");

    const name = say(need.state, "Jane Doe");
    expect(name.state.step).toBe("awaiting_company");
    expect(name.state.draft.name).toBe("Jane Doe");

    const company = say(name.state, "no company");
    expect(company.state.step).toBe("awaiting_intent");
    expect(company.state.draft.companyDeclined).toBe(true);
    expect(company.state.draft.company).toBeNull();

    const intent = say(company.state, "sell paper");
    expect(intent.state.step).toBe("awaiting_email");
    expect(intent.state.draft.intent).toBe("sell");

    const email = say(intent.state, "jane.doe@example.com");
    expect(email.state.step).toBe("awaiting_confirm");
    expect(email.say).toContain("Let me read that back");
    expect(email.say).toContain("Jane Doe");
    expect(email.say).toContain("with no company");
    expect(email.say).toContain("looking to sell debt");
    expect(email.say).toContain("jane.doe@example.com");
    expect(email.say).toContain("Would you like to add anything");

    const done = say(email.state, "no", NOW + 5000);
    expect(done.done).toBe(true);
    expect(done.state.step).toBe("completed");
    expect(done.say).toContain("Thank you, Jane Doe");
    expect(done.say).toContain("Have a good day");
    const lead = done.lead;
    expect(lead).not.toBeNull();
    const finished = lead as Lead;
    expect(finished).toMatchObject({
      name: "Jane Doe",
      company: null,
      intent: "sell",
      email: "jane.doe@example.com",
      callerPhone: "+15612546608",
      need: "I need help placing a portfolio",
      addition: null,
    });
    expect(finished.completedAt).toBe(NOW + 5000);
    expect(finished.transcript[0]?.text).toBe(GREETING);
    expect(finished.transcript.some((turn) => turn.role === "caller" && turn.text.includes("Jane Doe"))).toBe(
      true,
    );
  });

  it("keeps a company name when one is given", () => {
    let state = start();
    state = say(state, "Calling about a portfolio").state;
    state = say(state, "My name is Alex Rivera").state;
    const company = say(state, "Acme Capital");
    expect(company.state.draft.company).toBe("Acme Capital");
    expect(company.state.draft.companyDeclined).toBe(false);
    expect(company.state.step).toBe("awaiting_intent");
  });

  it("re-asks an invalid email and accepts a spoken address", () => {
    let state = start();
    state = say(state, "I want to sell accounts").state;
    state = say(state, "Sam Lee").state;
    state = say(state, "none").state;
    state = say(state, "sell").state;
    const bad = say(state, "not an email");
    expect(bad.state.step).toBe("awaiting_email");
    expect(bad.say).toContain("doesn't look like a complete email address");
    expect(bad.lead).toBeNull();
    const good = say(bad.state, "sam at lee capital dot com");
    expect(good.state.step).toBe("awaiting_confirm");
    expect(good.state.draft.email).toBe("sam@leecapital.com");
    expect(isEmail("sam@leecapital.com")).toBe(true);
    expect(parseSpokenEmail("not an email")).toBeNull();
  });

  it("stores an added note after readback", () => {
    let state = start();
    state = say(state, "Please have someone call me about buying").state;
    state = say(state, "Riley Chen").state;
    state = say(state, "Northwind Holdings").state;
    state = say(state, "purchase portfolios").state;
    state = say(state, "riley@northwind.example").state;
    const yes = say(state, "yes");
    expect(yes.state.step).toBe("awaiting_addition");
    expect(yes.say).toContain("What would you like me to add?");
    const done = say(yes.state, "Please call after 3pm Eastern.");
    expect(done.done).toBe(true);
    expect(done.lead?.addition).toBe("Please call after 3pm Eastern.");
    expect(done.lead?.intent).toBe("buy");
    expect(done.lead?.company).toBe("Northwind Holdings");
  });
});

describe("intent normalization", () => {
  it("maps buy, sell, and collect synonyms and rejects ambiguity", () => {
    expect(normalizeIntent("purchase portfolios")).toBe("buy");
    expect(normalizeIntent("I want to buy debt")).toBe("buy");
    expect(normalizeIntent("sell paper")).toBe("sell");
    expect(normalizeIntent("we are sellers of charged-off accounts")).toBe("sell");
    expect(normalizeIntent("collections")).toBe("collect");
    expect(normalizeIntent("place these for collection")).toBe("collect");
    expect(normalizeIntent("buy and sell")).toBeNull();
    expect(normalizeIntent("hello there")).toBeNull();
  });

  it("uses the caller's intent answer, not only the opening need", () => {
    let state = start();
    state = say(state, "I have a question about the market").state;
    state = say(state, "Jordan Blake").state;
    state = say(state, "no company").state;
    const intent = say(state, "collections");
    expect(intent.state.draft.intent).toBe("collect");
    expect(intent.say).toContain("What email address");
  });
});

describe("limits", () => {
  it("does not give pricing advice and does not pretend to be human", () => {
    let state = start();
    state = say(state, "I want a quote to sell paper").state;
    expect(state.step).toBe("awaiting_name");
    const price = say(state, "How much does it cost?");
    expect(price.state.step).toBe("awaiting_name");
    expect(price.say).toContain("I can't help with that directly");
    expect(price.say.toLowerCase()).toContain("name");
    const human = say(price.state, "Are you a real person?");
    expect(human.state.step).toBe("awaiting_name");
    expect(human.say).toContain("I'm an AI assistant for Triton Financial Solutions");
    expect(human.say).toContain("I'm not a person");
  });

  it("describes DebtMarket without leaving message-taking", () => {
    const about = say(start(), "What is Triton?");
    expect(about.state.step).toBe("awaiting_need");
    expect(about.say).toContain("DebtMarket");
    expect(about.say).toContain("debtmarket.net");
    expect(about.say).toContain("How can I help you today?");
    expect(about.say).not.toContain(TAKE_MESSAGE);
  });
});
