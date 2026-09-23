export function publicBaseUrl(request: Request, env: Env): string {
  const configured = env.PUBLIC_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function websocketBase(httpBase: string): string {
  if (httpBase.startsWith("https://")) {
    return `wss://${httpBase.slice("https://".length)}`;
  }
  if (httpBase.startsWith("http://")) {
    return `ws://${httpBase.slice("http://".length)}`;
  }
  return httpBase;
}

export function signingSecret(env: Env): string | null {
  const secret = env.TWILIO_AUTH_TOKEN?.trim() || env.SESSION_SECRET?.trim();
  return secret ? secret : null;
}

export function sessionStub(env: Env, name: string): DurableObjectStub {
  const id = env.CALL_SESSION.idFromName(name);
  return env.CALL_SESSION.get(id);
}

export async function formParams(request: Request): Promise<Record<string, string>> {
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      params[key] = value;
    }
  }
  return params;
}

export function isCallSid(value: string): boolean {
  return /^[A-Za-z0-9]{8,64}$/.test(value);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
