#!/usr/bin/env bash
# One-time server setup for Site Attendance (Ubuntu 22.04 / 24.04, x86 or ARM).
#
#   sudo bash install.sh attendance.example.com            # built-in database (PGlite)
#   sudo bash install.sh attendance.example.com --postgres # PostgreSQL on the same server
#
# Safe to re-run: existing secrets and data are kept.
set -euo pipefail

DOMAIN="${1:-}"
USE_PG="${2:-}"
[ -n "$DOMAIN" ] || { echo "Usage: sudo bash install.sh <domain> [--postgres]"; exit 1; }
[ "$(id -u)" = "0" ] || { echo "Run with sudo."; exit 1; }

APP_DIR=/opt/site-attendance
DATA_DIR=/var/lib/site-attendance
BACKUP_DIR=/var/backups/site-attendance
ENV_FILE=/etc/site-attendance.env
PORT=3000

echo "==> Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates nginx cron rsync >/dev/null
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node -v

echo "==> User and folders"
id -u siteapp >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin siteapp
mkdir -p "$APP_DIR" "$DATA_DIR" "$BACKUP_DIR"
chown -R siteapp:siteapp "$APP_DIR" "$DATA_DIR"
chmod 750 "$DATA_DIR"

echo "==> Environment file ($ENV_FILE)"
if [ ! -f "$ENV_FILE" ]; then
  AUTH_SECRET=$(openssl rand -hex 32)
  CRON_SECRET=$(openssl rand -hex 24)
  ADMIN_PASSWORD=$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-12)
  DB_URL=""
  if [ "$USE_PG" = "--postgres" ]; then
    apt-get install -y -qq postgresql >/dev/null
    PG_PASS=$(openssl rand -hex 16)
    sudo -u postgres psql -qc "CREATE USER site_attendance WITH PASSWORD '${PG_PASS}';" || true
    sudo -u postgres psql -qc "CREATE DATABASE site_attendance OWNER site_attendance;" || true
    DB_URL="postgres://site_attendance:${PG_PASS}@127.0.0.1:5432/site_attendance"
  fi
  cat > "$ENV_FILE" <<EOF
# Site Attendance — created by install.sh on $(date -u +%F)
AUTH_SECRET=${AUTH_SECRET}
CRON_SECRET=${CRON_SECRET}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
SEED_DEMO=0
DATABASE_URL=${DB_URL}
PGLITE_DIR=${DATA_DIR}/pglite
STORAGE_DIR=${DATA_DIR}/files
NEXT_PUBLIC_APP_NAME="Site Attendance"
EOF
  NEW_ENV=1
else
  echo "    keeping existing $ENV_FILE"
  NEW_ENV=0
fi
chmod 600 "$ENV_FILE"

echo "==> systemd service"
cat > /etc/systemd/system/site-attendance.service <<EOF
[Unit]
Description=Site Attendance
After=network.target postgresql.service

[Service]
User=siteapp
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
Environment=NODE_ENV=production PORT=${PORT} HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
MemoryMax=700M
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=${DATA_DIR}

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable site-attendance >/dev/null

echo "==> nginx"
cat > /etc/nginx/sites-available/site-attendance <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 5m;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_set_header Host \$host;
        # \$remote_addr (not \$proxy_add_x_forwarded_for): clients must not be able to fake
        # their IP for the login rate limiter.
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
EOF
ln -sf /etc/nginx/sites-available/site-attendance /etc/nginx/sites-enabled/site-attendance
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> Cron jobs (backup + photo cleanup)"
install -m 755 /dev/stdin /usr/local/bin/site-attendance-backup <<EOF
#!/usr/bin/env bash
set -euo pipefail
STAMP=\$(date +%F)
DB_URL=\$(grep -E '^DATABASE_URL=.' ${ENV_FILE} | cut -d= -f2- || true)
if [ -n "\$DB_URL" ]; then
  sudo -u postgres pg_dump site_attendance | gzip > ${BACKUP_DIR}/db-\${STAMP}.sql.gz
else
  systemctl stop site-attendance
  tar czf ${BACKUP_DIR}/db-\${STAMP}.tgz -C ${DATA_DIR} pglite
  systemctl start site-attendance
fi
find ${BACKUP_DIR} -type f -mtime +14 -delete
EOF
CRON_SECRET_VALUE=$(grep '^CRON_SECRET=' "$ENV_FILE" | cut -d= -f2)
cat > /etc/cron.d/site-attendance <<EOF
0 2 * * * root /usr/local/bin/site-attendance-backup
0 3 * * * root curl -fsS -X POST -H "Authorization: Bearer ${CRON_SECRET_VALUE}" http://127.0.0.1:${PORT}/api/cron/cleanup >/dev/null
EOF
chmod 600 /etc/cron.d/site-attendance

echo
echo "Server is ready."
echo "Next:"
echo "  1. Point DNS: A record for ${DOMAIN} -> this server's public IP."
echo "  2. From your PC, upload the app:  SERVER=<user>@${DOMAIN} bash deploy/update.sh"
echo "  3. Enable HTTPS (after DNS works):  sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d ${DOMAIN}"
if [ "$NEW_ENV" = "1" ]; then
  echo
  echo "  First admin login -> ID: ADMIN   password: $(grep '^ADMIN_PASSWORD=' "$ENV_FILE" | cut -d= -f2)"
  echo "  (save it now; it is only used while the database is empty)"
fi
