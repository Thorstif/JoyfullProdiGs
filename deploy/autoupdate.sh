#!/usr/bin/env bash
# Runs every 5 minutes on the server (systemd timer, set up by setup.sh).
# If GitHub main has new commits: update, restart, and roll back if the app doesn't come back healthy.
# Wrapped in main() so bash parses it all before update.sh replaces this file mid-run.
main() {
  set -uo pipefail
  export HOME=/root
  cd /opt/joyfull
  # all git commands run as the repo owner: root under systemd has no HOME/safe.directory and git refuses the repo
  g() { sudo -u www-data env HOME=/opt/joyfull git "$@"; }
  g fetch -q origin main || { echo "[autoupdate] fetch failed"; exit 0; }
  OLD=$(g rev-parse HEAD) || { echo "[autoupdate] cannot read HEAD"; exit 0; }
  NEW=$(g rev-parse origin/main) || { echo "[autoupdate] cannot read origin/main"; exit 0; }
  [ -n "$OLD" ] && [ -n "$NEW" ] || { echo "[autoupdate] empty revision"; exit 0; }
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
  g reset -q --hard "$OLD"
  sudo -u www-data env HOME=/opt/joyfull npm_config_cache=/opt/joyfull/.npm-cache npm ci && sudo -u www-data env HOME=/opt/joyfull npm_config_cache=/opt/joyfull/.npm-cache npm run build
  systemctl restart joyfull
}
main "$@"
exit
