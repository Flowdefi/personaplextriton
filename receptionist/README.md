# Triton voice receptionist (open source)

Live inbound agent for **Triton Financial Solutions, LLC** ([debtmarket.net](https://www.debtmarket.net)).

**Default mode (`debtor_assist`)** uses a local LLM for natural conversation: empathy with callers, understanding intent, factual dispute handling, and general repayment or hardship options (with human follow-up). It still discloses AI use and transcription (Florida two-party consent).

**Legacy mode (`lead_capture`)** is the scripted buy/sell/collect lead form.

## Stack (all local / open source)

| Piece | Tool | Role |
| --- | --- | --- |
| Dialogue | **Ollama** + `qwen2.5:14b-instruct` (or `qwen2.5:7b-instruct` on smaller RAM) | Natural replies; better suited than ad-hoc “Qwen 3.8” tags for empathy + JSON summaries |
| Speech out | **Piper** (`en_US-lessac-medium`) or **espeak-ng** | Piper sounds much less robotic |
| Speech in | **Vosk** | Caller transcription |
| Phone (test) | **Sinch** rented US local number → `/voice/sinch/incoming` | Temporary PSTN; see [docs/TEST_PHONE.md](docs/TEST_PHONE.md) |
| Leads | JSON files + optional **SMTP** | Email to `portfolios@debtmarket.net` |

Production line **561-254-6608** is not ported. Use a **temporary test number** first, then forward 561 when ready.

## One-command setup

```bash
cd receptionist
npm install
npm run setup    # Ollama model, Vosk, Piper, writes .env
ollama serve     # if not already running
npm run dev
```

Open `http://127.0.0.1:8787/`.

## Model choice

- **`qwen2.5:14b-instruct`** (default): strong balance of empathy, instruction following, and dispute reasoning on CPU with ~16GB RAM.
- **`qwen2.5:7b-instruct`**: faster on smaller VMs.
- **`llama3.1:8b-instruct`**: alternative if Qwen is unavailable.

Set `OLLAMA_MODEL` in `.env`. Pull with `ollama pull <name>`. See [docs/MODELS.md](docs/MODELS.md) for why we use Qwen2.5 instead of “Qwen 3.8” tags.

## Temporary test phone

Sinch credentials are **not** stored in this repo. Follow [docs/TEST_PHONE.md](docs/TEST_PHONE.md), set `TEST_PHONE_NUMBER` and `PUBLIC_BASE_URL`, and point the rented number’s voice URL at your server.

## Compliance note

The agent offers **general** repayment pathways and notes concerns for the team. It does not threaten, give legal advice, or promise specific settlements. Specialists follow up in writing.

## Tests

```bash
npm test
npm run typecheck
```
