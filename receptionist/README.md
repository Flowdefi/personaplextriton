# Triton voice receptionist

Live inbound receptionist for **Triton Financial Solutions, LLC** ([debtmarket.net](https://www.debtmarket.net)). She answers, discloses that she is an AI and that the call will be transcribed, asks how she can help, and takes a message for the team. She does not give legal, credit, or collection advice, quote prices, negotiate debt, or pretend to be a person.

The existing business line **561-254-6608** (Florida) is not ported and is not owned by this app. Forward that line from the carrier to a Twilio number whose voice webhook points here.

Florida is a two-party consent state. The opening line always says she is an AI for Triton and that the call will be transcribed so the message can be passed to the team.

## What a caller hears

1. "Thank you for calling Triton Financial Solutions. I'm an AI assistant for Triton, and this call will be transcribed so your message can be passed to the team. How can I help you today?"
2. After they say why they called: "As an AI for Triton, I can certainly take a message and pass it to the team."
3. One question at a time: name, company (or "no company"), buy / sell / collect, email.
4. A short read-back, a chance to add a note, then thank you and the call ends.

Each finished call emails **portfolios@debtmarket.net** with the name, company or none, intent, email, caller number, Eastern Time timestamp, transcript, and a short summary. Subject: `New Triton lead: {intent} — {name}`.

## Local run

```bash
cd receptionist
npm install
npx wrangler dev
```

Open `http://localhost:8787/`. Type the conversation or use Speak (browser Web Speech API; a female voice is selected when the computer has one). On completion the page posts the same lead endpoint the phone path uses.

`GET /status` shows which environment variables are missing. It never returns secret values.

`POST /leads` accepts a finished lead. With no `RESEND_API_KEY`, the response stores the lead and says email was skipped. It does not claim the email was sent.

`POST /leads/test` and `POST /leads/retry` stay disabled until `TEST_TOKEN` is set. Send `Authorization: Bearer <TEST_TOKEN>`.

```bash
npm test
npm run typecheck
```

`npm run typecheck` regenerates `worker-configuration.d.ts` from `wrangler.jsonc` and then runs `tsc`. That generated file is local and is not committed.

## Free Cloudflare deploy

Durable Objects on the Workers Free plan must be SQLite-backed. This worker uses that. Free daily limits apply: [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

Do not run `wrangler deploy` until you intend to publish. A dry run is:

```bash
npx wrangler deploy --dry-run
```

When you are ready for the free tier:

```bash
npx wrangler login
npx wrangler kv namespace create LEADS
```

Put the printed id in `wrangler.jsonc` under `kv_namespaces[0].id`, then:

```bash
printf '%s' 'https://YOUR-WORKER.workers.dev' | npx wrangler secret put PUBLIC_BASE_URL
# optional keys — see the table below
npx wrangler deploy
```

`npx wrangler deploy` publishes the worker. Use it only when you mean to. Local development is `npx wrangler dev`.

Dashboard alternative for non-secret vars: `LEAD_EMAIL_TO` is already `portfolios@debtmarket.net`.

## Forward 561-254-6608

This is not already forwarded. Do it at the carrier that serves 561-254-6608:

1. Buy any Twilio voice number. Put it in `TWILIO_PHONE_NUMBER` for your own notes. The worker does not dial out.
2. In Twilio, set that number's voice webhook to `POST https://<your-worker>/voice/incoming`.
3. At the carrier for **561-254-6608**, turn on unconditional call forwarding to the Twilio number.

Calls to 561-254-6608 then ring Twilio, which fetches TwiML from this worker. The email still labels 561-254-6608 as the business line and uses Twilio's `From` as the caller.

Without Twilio, use the browser page. ConversationRelay needs a public `wss://` URL, so local Twilio tests need a tunnel and `PUBLIC_BASE_URL` set to that https origin.

Set `VOICE_TRANSPORT` to `gather` if you want the `<Gather>` speech fallback instead of ConversationRelay. Both use the same dialogue module. The default is ConversationRelay with Amazon Polly **Joanna-Generative** (female). `<Say>` on the gather path uses **Polly.Joanna-Generative**.

To use another female voice Twilio already has, change `TTS_PROVIDER` and `FEMALE_VOICE`. Examples: Google `en-US-Neural2-F`, or an ElevenLabs voice id with `TTS_PROVIDER=ElevenLabs` (the ElevenLabs key lives in the Twilio account, which performs TTS).

## Environment

| Name | Required | Purpose |
| --- | --- | --- |
| `LEAD_EMAIL_TO` | preset | `portfolios@debtmarket.net` |
| `BUSINESS_PHONE` | preset | `561-254-6608`, shown in the email and docs |
| `BUSINESS_NAME` | preset | Triton Financial Solutions, LLC |
| `BUSINESS_SITE` | preset | `https://www.debtmarket.net` |
| `FEMALE_VOICE` | preset | ConversationRelay voice, default `Joanna-Generative` |
| `TTS_PROVIDER` | preset | `Amazon`, `Google`, or `ElevenLabs` |
| `SAY_VOICE` | preset | Gather `<Say>` voice, default `Polly.Joanna-Generative` |
| `VOICE_TRANSPORT` | preset | `relay` (default) or `gather` |
| `PUBLIC_BASE_URL` | for Twilio | Public https origin, no trailing slash |
| `OPENAI_API_KEY` | optional | Preferred model path |
| `OPENAI_REALTIME_MODEL` | preset | `gpt-realtime-2.1` |
| `OPENAI_TEXT_MODEL` | preset | `gpt-6-astra` if the realtime socket fails |
| `ANTHROPIC_API_KEY` | optional | Used when OpenAI is unset |
| `ANTHROPIC_MODEL` | preset | `claude-opus-5` |
| `WORKERS_AI_MODEL` | preset | Fallback only |
| `TWILIO_ACCOUNT_SID` | optional | Rejects a mismatched `AccountSid` when set |
| `TWILIO_AUTH_TOKEN` | optional | Validates `X-Twilio-Signature` and signs the websocket token |
| `TWILIO_PHONE_NUMBER` | optional | The Twilio number you bought. Not 561-254-6608 |
| `RESEND_API_KEY` | optional | [Resend](https://resend.com) free tier |
| `RESEND_FROM` | with Resend | Verified sender, for example `Triton Desk <desk@your-domain>` |
| `TEST_TOKEN` | optional | Enables `/leads/test` and `/leads/retry` |
| `SESSION_SECRET` | optional | Signs the call token when no Twilio auth token is set |

Secrets go in `.dev.vars` locally (see `.dev.vars.example`) or `npx wrangler secret put`. Never commit them.

Resend's onboarding sender can only deliver to the Resend account owner's inbox until a domain is verified. Until `RESEND_API_KEY` and `RESEND_FROM` are both set, leads are stored in KV for 30 days and email is reported as skipped. `POST /leads/retry` with the test token sends a stored lead again. KV writes are not a perfect lock. The public lead route is limited to 8 requests per IP each 10 minutes so it cannot be used as an open mail relay. Dialogue turns are limited to 40 per IP each 10 minutes. The recipient is fixed.

## Which model speaks and which model thinks

The words the caller must hear (disclosure, the "As an AI for Triton…" line, the questions, the read-back, the goodbye) come from the script, not from the model. That keeps the Florida disclosure stable.

| Keys present | Who interprets unclear answers | Who speaks |
| --- | --- | --- |
| `OPENAI_API_KEY` | `gpt-realtime-2.1` over a realtime websocket, then `gpt-6-astra` on the Responses API if that socket fails | Twilio ConversationRelay, female neural voice |
| else `ANTHROPIC_API_KEY` | `claude-opus-5` | same Twilio voice |
| else Workers AI binding only | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | same Twilio voice |

Workers AI is the **fallback**, not the preferred model. Clear answers never call a model; the state machine accepts them on its own. The browser page uses the same state machine, so the phone script and the test script cannot drift.

ConversationRelay is the phone path because a Cloudflare Worker can hold the Twilio websocket on a Durable Object, and Twilio can speak an exact sentence with Polly Joanna-Generative. A raw OpenAI realtime audio bridge would let the model rephrase the disclosure. The realtime model is still wired for understanding when an OpenAI key is present.

## Call state

One SQLite Durable Object per Twilio `CallSid` or browser session stores the dialogue. The object can hibernate while the websocket stays up. On the free plan, only SQLite-backed Durable Objects are available, and daily request limits apply. If a lead email fails, the lead remains in KV (`lead:<id>`) and the phone object (`delivery`) so it can be retried. Transcripts are not written to info logs.

## Limits

Inbound messages only. No outbound dialing, no autodialer, no payment capture, and no collection script. If a caller asks for advice or a price, she offers to put that in the message to the team.
