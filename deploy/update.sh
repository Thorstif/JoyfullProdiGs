#!/usr/bin/env bash
# Pull the latest code and restart. Run on the server: sudo bash /opt/joyfull/deploy/update.sh
# Everything is inside main() so bash parses the whole file before git replaces it mid-run.
main() {
  set -euo pipefail
  cd /opt/joyfull
  # one update at a time (the 5-minute timer and a manual run must never overlap)
  exec 9>/tmp/joyfull-update.lock
  flock -w 600 9 || { echo "Another update is running."; exit 1; }
  cp data/game.db "data/before-update-$(date +%Y%m%d-%H%M%S).db" 2>/dev/null || true
  # git and npm run as the app user, with a writable HOME and npm cache (www-data's own home may not exist)
  as_app() { sudo -u www-data env HOME=/opt/joyfull npm_config_cache=/opt/joyfull/.npm-cache "$@"; }
  as_app git fetch -q origin main
  as_app git reset -q --hard origin/main
  as_app npm ci --no-audit --no-fund
  as_app npm run build
  systemctl restart joyfull
  bash deploy/ensure-caddy.sh || true
  echo "Updated."
}
main "$@"
exit
