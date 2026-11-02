#!/usr/bin/env bash
# Start the web UI as a chosen dev user (local testing only).
# Admin status comes from the admins table, not from the client.
# Usage: scripts/dev-as.sh [user_id]
#   Make a user an admin:  (cd apps/api && uv run python -m app.core.admins add <user_id>)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_ID="${1:-alice}"

echo "Web UI as user='$USER_ID'  ->  http://localhost:3001/"
cd "$ROOT/apps/web"
NEXT_PUBLIC_DEV_USER_ID="$USER_ID" exec pnpm dev
