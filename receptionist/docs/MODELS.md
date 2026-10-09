# Local LLM choice (natural phone dialogue)

There is no Ollama tag named **Qwen 3.8** in this stack. For inbound debtor calls we default to **`qwen2.5:14b-instruct`** because it balances:

- Warm, conversational English (less “assistant voice” than smaller models)
- Reliable **JSON** output for `{ say, done, summary }` each turn
- Reasonable RAM on a 16GB+ machine (~9GB quantized)

Use **`qwen2.5:7b-instruct`** when RAM is tight or latency must stay under ~2s per turn on CPU.

## Alternatives (same Ollama setup)

| Model | When to use |
|-------|-------------|
| `llama3.1:8b-instruct` | Slightly more “casual” tone; JSON can be less stable |
| `mistral:7b-instruct` | Fast; good for short replies, weaker on long empathy |
| PersonaPlex (repo root) | Most natural **voice**; needs GPU and separate wiring |

Change model in `.env`:

```bash
OLLAMA_MODEL=qwen2.5:14b-instruct
```

Then restart `npm run dev`.

## What the model does *not* do

- It does not access live account balances or legal records (those come from your CRM later).
- It must not promise settlements or legal outcomes; the system prompt enforces that.
- Spoken audio is **Piper** (or espeak-ng fallback), not the LLM’s built-in voice.
