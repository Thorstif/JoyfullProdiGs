#!/usr/bin/env bash
# Pull the latest code and restart. Run on the server: sudo bash /opt/joyfull/deploy/update.sh
set -euo pipefail
cd /opt/joyfull
cp data/game.db "data/before-update-$(date +%Y%m%d-%H%M%S).db" 2>/dev/null || true
sudo -u www-data git fetch -q origin main
sudo -u www-data git reset -q --hard origin/main
sudo -u www-data npm ci
sudo -u www-data npm run build
systemctl restart joyfull
echo "Updated."
