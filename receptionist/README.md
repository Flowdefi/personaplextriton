# Triton voice receptionist

Live inbound receptionist for **Triton Financial Solutions, LLC** ([debtmarket.net](https://www.debtmarket.net)). She answers, discloses that she is an AI and that the call will be transcribed, asks how she can help, and takes a message for the team.

The speech stack is open source:

- **espeak-ng** speaks every scripted line in a female US voice (`en-us+f3`). Set `PIPER_BIN` and `PIPER_MODEL` to use [Piper](https://github.com/rhasspy/piper) instead.
- **Vosk** transcribes the caller (`bin/transcribe.py`).
- **Ollama** runs `Qwen3.8-27B-Uncensored` only when a reply is unclear. The required lines stay scripted.
- **Asterisk** answers the forwarded phone line.
- Finished calls are written under `leads/` and mailed with SMTP when `SMTP_HOST` and `SMTP_FROM` are set.

The existing business line **561-254-6608** is not ported. Forward it from the carrier to the SIP number that lands in `asterisk/extensions.conf`.

Florida is a two-party consent state. The opening line always says she is an AI for Triton and that the call will be transcribed.

## What a caller hears

1. "Thank you for calling Triton Financial Solutions. I'm an AI assistant for Triton, and this call will be transcribed so your message can be passed to the team. How can I help you today?"
2. After they say why they called: "As an AI for Triton, I can certainly take a message and pass it to the team."
3. One question at a time: name, company (or "no company"), buy / sell / collect, email.
4. A short read-back, a chance to add a note, then thank you and the call ends.

Each finished call is stored as JSON and, when SMTP is set, emailed to **portfolios@debtmarket.net**. Subject: `New Triton lead: {intent} — {name}`.

## Local run

```bash
cd receptionist
sudo apt install espeak-ng ffmpeg
pip install vosk
# download https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip and unzip it
export VOSK_MODEL="$PWD/vosk-model-small-en-us-0.15"
npm install
npm run dev
```

Open `http://127.0.0.1:8787/`. Type the conversation, or use Speak to record and transcribe with Vosk. Playback uses espeak-ng or Piper, not the browser voice.

`GET /status` shows which local tools are configured. It never returns secrets.

With no `SMTP_HOST`, `POST /leads` stores the lead file and reports email as skipped.

```bash
npm test
npm run typecheck
```

## Phone

1. Install Asterisk.
2. Copy `asterisk/extensions.conf` into the dialplan and `asterisk/triton-call.sh` onto the server. `chmod +x` the script.
3. Keep `npm run dev` running on that machine.
4. At the carrier for **561-254-6608**, turn on unconditional forwarding to the SIP number that enters `[triton-desk]`.

## Environment

See `.env.example`. The interpreter model is `Qwen3.8-27B-Uncensored` through Ollama. Override `OLLAMA_MODEL` with another local open model if you pulled a different tag.

## Limits

Inbound messages only. No outbound dialing, no autodialer, no payment capture, and no collection script.
