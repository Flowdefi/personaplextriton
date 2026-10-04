#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Installing OS packages..."
sudo apt-get update -qq
sudo apt-get install -y zstd espeak-ng ffmpeg python3-pip wget unzip curl

if ! command -v ollama >/dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
fi

if ! curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "Start Ollama in another terminal: ollama serve"
fi

MODEL="${OLLAMA_MODEL:-qwen2.5:14b-instruct}"
echo "Pulling Ollama model ${MODEL} (use qwen2.5:7b-instruct on smaller RAM)..."
ollama pull "$MODEL" || ollama pull qwen2.5:7b-instruct

echo "Installing Vosk..."
python3 -m pip install --user vosk
VOSK_DIR="$ROOT/models/vosk-model-small-en-us-0.15"
if [ ! -d "$VOSK_DIR" ]; then
  mkdir -p "$ROOT/models"
  wget -q -O /tmp/vosk.zip https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
  unzip -q /tmp/vosk.zip -d "$ROOT/models"
fi

PIPER_DIR="$ROOT/models/piper"
mkdir -p "$PIPER_DIR"
if [ ! -x "$PIPER_DIR/piper/piper" ]; then
  wget -q -O /tmp/piper.tgz https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz
  tar -xzf /tmp/piper.tgz -C "$PIPER_DIR"
fi
VOICE="$PIPER_DIR/en_US-lessac-medium.onnx"
if [ ! -f "$VOICE" ]; then
  wget -q -O "$VOICE.json" https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
  wget -q -O "$VOICE" https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
fi

cat > "$ROOT/.env" <<EOF
AGENT_MODE=debtor_assist
LEAD_EMAIL_TO=portfolios@debtmarket.net
LEADS_DIR=$ROOT/leads
OLLAMA_MODEL=$MODEL
VOSK_MODEL=$VOSK_DIR
PIPER_BIN=$PIPER_DIR/piper/piper
PIPER_MODEL=$VOICE
ESPEAK_BIN=espeak-ng
ESPEAK_VOICE=en-us+f3
EOF

echo "Wrote $ROOT/.env"
echo "Run: cd $ROOT && npm install && npm run dev"
