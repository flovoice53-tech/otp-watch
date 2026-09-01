#!/usr/bin/env bash
# Deploy otp-watch to the Hetzner box. Run from the otp-watch/ directory:
#   ./deploy.sh
#
# rsync the source up (never .env / data — those are server-only, and --delete
# would wipe them), install + build on the server, restart under pm2.
set -euo pipefail

REMOTE=sms-florin
REMOTE_DIR=/home/deploy/otp-watch

echo "==> Syncing source to $REMOTE:$REMOTE_DIR"
rsync -az --delete \
  --exclude .env \
  --exclude data \
  --exclude node_modules \
  --exclude .git \
  --exclude dist \
  ./ "$REMOTE:$REMOTE_DIR/"

echo "==> Installing + building on the server"
ssh "$REMOTE" "cd $REMOTE_DIR && npm ci && npm run build"

echo "==> Restarting pm2 process"
ssh "$REMOTE" "cd $REMOTE_DIR && pm2 restart otp-watch --update-env"

echo "==> Health check"
sleep 2
curl -fsS -o /dev/null -w 'GET / -> %{http_code}\n' https://otpwatch.flo-voice1.com/
curl -fsS -H 'Accept: text/html' -o /dev/null -w 'GET / (html) -> %{http_code}\n' https://otpwatch.flo-voice1.com/

echo "==> Done."
