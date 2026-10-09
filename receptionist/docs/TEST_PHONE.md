# Temporary test phone number (Sinch)

The receptionist runs on your server. A **temporary US local number** for testing uses [Sinch](https://sinch.com) Voice (same family as the Sinch MCP tools in Cursor).

## What you need

1. Sinch project with **Numbers** and **Voice** enabled.
2. Environment variables (never commit these):

```bash
export SINCH_PROJECT_ID=...
export SINCH_KEY_ID=...
export SINCH_KEY_SECRET=...
export PUBLIC_BASE_URL=https://YOUR-NGROK-OR-DEPLOY-URL   # no trailing slash
```

3. `npm run dev` running and reachable at `PUBLIC_BASE_URL`.

## Rent a number

In the Sinch dashboard, or with MCP tools when authenticated:

- `search-for-available-numbers` with `regionCode: US`, `type: LOCAL`, `capabilities: [VOICE]`
- `rent-sinch-virtual-numbers` with the E.164 number you chose
- Put the rented number in `.env` as `TEST_PHONE_NUMBER=+1...`

## Point voice to this app

Configure the rented number’s **Voice URL** (Sinch Voice API / dashboard) to:

```http
POST {PUBLIC_BASE_URL}/voice/sinch/incoming
```

The handler returns Sinch Voice ICE instructions that stream audio to `/voice/sinch/event` and speak replies with your local Piper/espeak WAV.

## Until Sinch is configured

Use the browser test at `http://127.0.0.1:8787/` — same debtor-assist model and voice stack, no PSTN.

Your production line **561-254-6608** stays separate. Forward it only when you move off the temporary test number.
