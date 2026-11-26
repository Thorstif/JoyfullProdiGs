#!/usr/bin/env bash
# Keeps Caddy serving the main domain plus backup addresses for the same app.
# Backup 1: <droplet-ip>.sslip.io (no purchase needed; in case a carrier filter blocks the main domain).
# Extra: any hostnames listed one per line in /opt/joyfull/data/extra-domains (point their DNS here first).
# Safe to run repeatedly: only reloads Caddy when the config changes, and keeps the old one if the new one is invalid.
set -uo pipefail
APP=/opt/joyfull
CF=/etc/caddy/Caddyfile
[ -f "$CF" ] || exit 0
# main domain = first name on the first site line of the current Caddyfile
MAIN=$(grep -m1 -oE '^[A-Za-z0-9.-]+' "$CF")
[ -n "$MAIN" ] || exit 0
IP=$(curl -fsS -m 3 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null || hostname -I | awk '{print $1}')
HOSTS="$MAIN, www.$MAIN"
if [[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  # spare names from two independent free wildcard-DNS services, so one being filtered doesn't sink us
  SPARES="${IP//./-}.sslip.io ${IP//./-}.nip.io"
  : > "$APP/data/backup-urls.tmp"
  for h in $SPARES; do HOSTS="$HOSTS, $h"; echo "https://$h" >> "$APP/data/backup-urls.tmp"; done
  mv "$APP/data/backup-urls.tmp" "$APP/data/backup-urls"
  head -1 "$APP/data/backup-urls" > "$APP/data/backup-url"
  chown www-data: "$APP/data/backup-url" "$APP/data/backup-urls" 2>/dev/null || true
fi
if [ -f "$APP/data/extra-domains" ]; then
  while read -r h; do
    [[ "$h" =~ ^[A-Za-z0-9.-]+$ ]] && HOSTS="$HOSTS, $h"
  done < "$APP/data/extra-domains"
fi
NEW=$(mktemp)
cat > "$NEW" <<CADDY
$HOSTS {
    encode gzip
    reverse_proxy localhost:3000
}
CADDY
if cmp -s "$NEW" "$CF"; then rm -f "$NEW"; exit 0; fi
if ! caddy validate --config "$NEW" --adapter caddyfile >/dev/null 2>&1; then
  echo "[ensure-caddy] new config invalid, keeping the old one"; rm -f "$NEW"; exit 0
fi
cp "$CF" "$CF.bak"
cp "$NEW" "$CF" && rm -f "$NEW"
if ! systemctl reload caddy; then
  echo "[ensure-caddy] reload failed, restoring"; cp "$CF.bak" "$CF"; systemctl reload caddy || systemctl restart caddy
fi
echo "[ensure-caddy] serving: $HOSTS"
