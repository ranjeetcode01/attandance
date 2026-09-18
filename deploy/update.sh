#!/usr/bin/env bash
# Build on this PC and deploy to the server. Works from Git Bash on Windows.
#
#   SERVER=ubuntu@attendance.example.com bash deploy/update.sh
#   SERVER=... SKIP_BUILD=1 bash deploy/update.sh     # upload the existing build
#
# The server must have been prepared once with deploy/install.sh.
set -euo pipefail

SERVER="${SERVER:-}"
[ -n "$SERVER" ] || { echo "Usage: SERVER=user@host bash deploy/update.sh"; exit 1; }
cd "$(dirname "$0")/.."

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "==> Building"
  npm run build
fi
[ -f .next/standalone/server.js ] || { echo "No build found (.next/standalone). Run npm run build."; exit 1; }

echo "==> Uploading to $SERVER"
# Send the folder over ssh as a tar stream: no rsync needed on Windows.
tar -czf - -C .next/standalone . | ssh "$SERVER" 'sudo install -d -o siteapp -g siteapp /opt/site-attendance && sudo tar -xzf - -C /opt/site-attendance && sudo chown -R siteapp:siteapp /opt/site-attendance'

echo "==> Restarting"
ssh -t "$SERVER" 'sudo systemctl restart site-attendance && sleep 3 && systemctl is-active site-attendance && curl -fsS -o /dev/null -w "local check: %{http_code}\n" http://127.0.0.1:3000/login'

echo "Done. Database tables are created/updated automatically at start."
echo "Logs: ssh $SERVER 'journalctl -u site-attendance -n 50 --no-pager'"
