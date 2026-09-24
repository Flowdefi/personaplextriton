import net from "node:net";
import tls from "node:tls";

export interface SmtpMessage {
  host: string;
  port: number;
  mode: "plain" | "starttls" | "tls";
  user: string | null;
  password: string | null;
  from: string;
  to: string;
  subject: string;
  text: string;
}

export function smtpPayload(message: SmtpMessage): string {
  const subject = message.subject.replace(/[\r\n]+/g, " ");
  const body = message.text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
  return [
    `From: ${message.from}`,
    `To: ${message.to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
    ".",
    "",
  ].join("\r\n");
}

export async function sendSmtpMail(message: SmtpMessage): Promise<void> {
  const socket =
    message.mode === "tls"
      ? tls.connect({ host: message.host, port: message.port, servername: message.host })
      : net.connect({ host: message.host, port: message.port });
  socket.setTimeout(10_000);
  const reader = createReader(socket);
  await reader.expect(220);
  await reader.command(`EHLO triton-desk`);
  if (message.mode === "starttls") {
    await reader.command("STARTTLS", 220);
    const secure = tls.connect({ socket, servername: message.host });
    const secureReader = createReader(secure);
    await secureReader.command("EHLO triton-desk");
    await authenticate(secureReader, message);
    await deliver(secureReader, message);
    secure.end();
    return;
  }
  await authenticate(reader, message);
  await deliver(reader, message);
  socket.end();
}

async function authenticate(
  reader: LineReader,
  message: SmtpMessage,
): Promise<void> {
  if (!message.user || !message.password) {
    return;
  }
  await reader.command("AUTH LOGIN", 334);
  await reader.command(Buffer.from(message.user).toString("base64"), 334);
  await reader.command(Buffer.from(message.password).toString("base64"), 235);
}

async function deliver(reader: LineReader, message: SmtpMessage): Promise<void> {
  await reader.command(`MAIL FROM:<${addressOnly(message.from)}>`);
  await reader.command(`RCPT TO:<${addressOnly(message.to)}>`);
  await reader.command("DATA", 354);
  reader.send(smtpPayload(message));
  await reader.expect(250);
  await reader.command("QUIT", 221);
}

function addressOnly(value: string): string {
  const match = value.match(/<([^>]+)>/);
  const address = match?.[1] ?? value;
  if (!/^[^\s@]+@[^\s@]+$/.test(address)) {
    throw new Error("Invalid mailbox");
  }
  return address;
}

interface LineReader {
  command(line: string, code?: number): Promise<string>;
  expect(code: number): Promise<string>;
  send(data: string): void;
}

function createReader(socket: net.Socket): LineReader {
  let buffer = "";
  const waiters: Array<(line: string) => void> = [];
  socket.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index).replace(/\r$/, "");
      buffer = buffer.slice(index + 1);
      const waiter = waiters.shift();
      if (waiter) {
        waiter(line);
      }
      index = buffer.indexOf("\n");
    }
  });
  const nextLine = () =>
    new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("SMTP timed out")), 10_000);
      waiters.push((line) => {
        clearTimeout(timer);
        resolve(line);
      });
    });
  return {
    send(data: string) {
      socket.write(data);
    },
    async expect(code: number) {
      const line = await nextLine();
      if (!line.startsWith(String(code))) {
        throw new Error(`SMTP ${line}`);
      }
      return line;
    },
    async command(line: string, code = 250) {
      socket.write(`${line}\r\n`);
      return this.expect(code);
    },
  };
}
