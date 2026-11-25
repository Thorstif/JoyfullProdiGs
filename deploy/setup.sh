#!/usr/bin/env bash
# One-shot server setup for a fresh Ubuntu 24.04 droplet. Run as root.
# Needs these environment variables (the DigitalOcean "User data" snippet in the battle plan sets them):
#   DOMAIN, EMAIL, REPO, GM_PIN, GM_CODE
# Safe to re-run: it updates the code and keeps the database.
set -euo pipefail
export HOME="${HOME:-/root}"
: "${DOMAIN:?}" "${EMAIL:?}" "${REPO:?}" "${GM_PIN:?}" "${GM_CODE:?}"
APP=/opt/joyfull
export DEBIAN_FRONTEND=noninteractive

# 1 GB swap so npm installs never run out of memory on the smallest droplet
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Node 22, git, build tools, Caddy (automatic HTTPS)
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
fi
apt-get -o DPkg::Lock::Timeout=600 update
apt-get -o DPkg::Lock::Timeout=600 install -y nodejs git build-essential python3 caddy ufw

# Firewall: SSH + web only
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# Code
git config --global --add safe.directory "$APP"
if [ -d "$APP/.git" ]; then git -C "$APP" pull --ff-only; else git clone "$REPO" "$APP"; fi
cd "$APP"
npm ci
npm run build

# Settings (only written the first time, so later runs never change codes or keys)
if [ ! -f .env ]; then
  cat > .env <<ENV
PORT=3000
TZ=Europe/Oslo
APP_NAME=JoyfullProdiGs
GM_PIN=$GM_PIN
GM_CODE=$GM_CODE
VAPID_SUBJECT=mailto:$EMAIL
TRIP_START=2026-11-27T18:00:00+01:00
FINAL_AT=2026-11-29T22:00:00+01:00
SEED_PLAYERS=Thor-Stian*,Nikolai,Christoffer,Simen,Jens~,Ivar~
DATA_DIR=./data
ENV
fi
mkdir -p data
chown -R www-data:www-data "$APP"

# Service: restarts itself if it crashes or the server reboots
cat > /etc/systemd/system/joyfull.service <<UNIT
[Unit]
Description=JoyfullProdiGs
After=network.target

[Service]
WorkingDirectory=$APP
ExecStart=/usr/bin/npx tsx server/index.ts
Restart=always
RestartSec=3
User=www-data
Environment=NODE_ENV=production
Environment=HOME=$APP

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable joyfull
systemctl restart joyfull

# HTTPS: Caddy fetches the certificate by itself once DNS points here
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN, www.$DOMAIN {
    encode gzip
    reverse_proxy localhost:3000
}
CADDY
systemctl reload caddy || systemctl restart caddy

echo "Done. Open https://$DOMAIN (certificate appears within a minute of DNS pointing here)."
