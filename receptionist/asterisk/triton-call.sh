#!/bin/sh
# Records each caller turn, posts it to the local open-source receptionist, and plays the reply.
# Usage: triton-call.sh <call-id> <caller-number>
set -eu

BASE_URL="${TRITON_BASE_URL:-http://127.0.0.1:8787}"
CALL_ID="${1:-local}"
CALLER="${2:-unknown}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

START="$(curl -fsS -X POST "$BASE_URL/dialogue/start" \
  -H 'content-type: application/json' \
  -d "{\"callerPhone\":\"$CALLER\",\"source\":\"pstn\"}")"
SESSION="$(printf '%s' "$START" | python3 -c 'import json,sys; print(json.load(sys.stdin)["sessionId"])')"
curl -fsS -X POST "$BASE_URL/voice/speak" \
  -H 'content-type: application/json' \
  -d "{\"sessionId\":\"$SESSION\"}" \
  -o "$WORK/reply.wav"
# Playback is left to the Asterisk dialplan if you prefer Playback(); this script uses aplay when present.
if command -v aplay >/dev/null 2>&1; then
  aplay "$WORK/reply.wav" || true
fi

DONE=false
while [ "$DONE" != "true" ]; do
  rec -q -r 16000 -c 1 "$WORK/turn.wav" silence 1 0.2 2% 1 2.0 2% trim 0 20 || true
  if [ ! -s "$WORK/turn.wav" ]; then
    break
  fi
  HEADERS="$(mktemp)"
  curl -fsS -D "$HEADERS" -X POST "$BASE_URL/voice/utterance" \
    -H "x-session-id: $SESSION" \
    -H 'content-type: audio/wav' \
    --data-binary @"$WORK/turn.wav" \
    -o "$WORK/turn.json"
  python3 - "$WORK/turn.json" <<'PY'
import json, sys
payload = json.load(open(sys.argv[1]))
open("/tmp/triton-last-say.txt", "w").write(payload.get("say", ""))
print(payload.get("done", False))
PY
  curl -fsS -X POST "$BASE_URL/voice/speak" \
    -H 'content-type: application/json' \
    -d "{\"sessionId\":\"$SESSION\"}" \
    -o "$WORK/reply.wav"
  if command -v aplay >/dev/null 2>&1; then
    aplay "$WORK/reply.wav" || true
  fi
  DONE="$(python3 -c 'import json,sys; print("true" if json.load(open("'"$WORK"'/turn.json")).get("done") else "false")')"
done
