#!/usr/bin/env bash
# Rent a temporary US local Sinch number when PROJECT_ID, KEY_ID, KEY_SECRET are set.
# Requires: Sinch MCP in Cursor, or use the Sinch dashboard with TEST_PHONE.md URLs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

if [[ -z "${SINCH_PROJECT_ID:-}" || -z "${SINCH_KEY_ID:-}" || -z "${SINCH_KEY_SECRET:-}" ]]; then
  echo "Missing Sinch credentials. Export SINCH_PROJECT_ID, SINCH_KEY_ID, SINCH_KEY_SECRET."
  echo "See docs/TEST_PHONE.md and configure Voice URL -> POST \${PUBLIC_BASE_URL}/voice/sinch/incoming"
  exit 1
fi

if [[ -z "${PUBLIC_BASE_URL:-}" ]]; then
  echo "Set PUBLIC_BASE_URL to your ngrok or deploy URL (no trailing slash)."
  exit 1
fi

echo "Search and rent a number in the Sinch dashboard or Cursor Sinch MCP:"
echo "  search-for-available-numbers regionCode=US type=LOCAL capabilities=VOICE"
echo "  rent-sinch-virtual-numbers with the E.164 you chose"
echo ""
echo "Then add to $ENV_FILE:"
echo "  TEST_PHONE_NUMBER=+1..."
echo "  PUBLIC_BASE_URL=$PUBLIC_BASE_URL"
echo ""
echo "Voice webhook: POST ${PUBLIC_BASE_URL}/voice/sinch/incoming"
