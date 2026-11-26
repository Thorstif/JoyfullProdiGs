#!/usr/bin/env bash
# Pull the latest code and restart. Run on the server: sudo bash /opt/joyfull/deploy/update.sh
set -euo pipefail
cd /opt/joyfull
cp data/game.db "data/before-update-$(date +%Y%m%d-%H%M%S).db" 2>/dev/null || true
sudo -u www-data git fetch -q origin main
sudo -u www-data git reset -q --hard origin/main
# npm needs a writable HOME/cache; www-data's default home (/var/www) may not exist
as_app() { sudo -u www-data env HOME=/opt/joyfull npm_config_cache=/opt/joyfull/.npm-cache "$@"; }
as_app npm ci
as_app npm run build
systemctl restart joyfull
bash deploy/ensure-caddy.sh || true
echo "Updated."
