#!/usr/bin/env bash
# Runs every 5 minutes on the server (systemd timer, set up by setup.sh).
# If GitHub main has new commits: update, restart, and roll back if the app doesn't come back healthy.
set -uo pipefail
cd /opt/joyfull
sudo -u www-data git fetch -q origin main || exit 0
OLD=$(git rev-parse HEAD)
NEW=$(git rev-parse origin/main)
[ "$OLD" = "$NEW" ] && exit 0
# never retry a commit that already failed
[ -f data/.bad-commit ] && [ "$(cat data/.bad-commit)" = "$NEW" ] && exit 0
echo "[autoupdate] $OLD -> $NEW"
if bash deploy/update.sh && sleep 8 && curl -fsS http://localhost:3000/api/health >/dev/null; then
  echo "[autoupdate] ok"
  exit 0
fi
echo "[autoupdate] unhealthy, rolling back to $OLD"
echo "$NEW" > data/.bad-commit
sudo -u www-data git reset -q --hard "$OLD"
sudo -u www-data npm ci && sudo -u www-data npm run build
systemctl restart joyfull
