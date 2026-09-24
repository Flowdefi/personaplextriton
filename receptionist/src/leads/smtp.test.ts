import { describe, expect, it } from "vitest";
import { smtpPayload } from "./smtp.ts";

describe("smtp payload", () => {
  it("keeps the subject on one line and dot-stuffs the body", () => {
    const payload = smtpPayload({
      host: "localhost",
      port: 25,
      mode: "plain",
      user: null,
      password: null,
      from: "Triton Desk <desk@debtmarket.net>",
      to: "portfolios@debtmarket.net",
      subject: "New Triton lead: sell — Ada\nLovelace",
      text: ".hidden\nHello",
    });
    expect(payload).toContain("Subject: New Triton lead: sell — Ada Lovelace\r\n");
    expect(payload).toContain("\r\n..hidden\r\nHello\r\n.\r\n");
    expect(payload).toContain("To: portfolios@debtmarket.net");
  });
});
