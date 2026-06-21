#!/usr/bin/env bash
# ============================================================================
# Set up the zero-dependency Node auth API on a CWP server (run as root).
#
#   USER_ACC=<cwp_user> DOMAIN=<domain> bash <(curl -fsSL \
#     https://raw.githubusercontent.com/aleimam/baytalwatan/main/server/setup-node.sh)
#
# Defaults: USER_ACC=bayt  DOMAIN=baytalwatan.com  PORT=3000
# It: checks Node, installs server.js to /home/<user>/bayt-api, runs it as a
# systemd service on 127.0.0.1:PORT, and proxies nginx  /api/  ->  the service.
# Works without PHP-FPM — login/signup run entirely on Node.
# ============================================================================
set -uo pipefail

DOMAIN="${DOMAIN:-baytalwatan.com}"
PORT="${PORT:-3000}"
REF="${REF:-main}"
C1="/etc/nginx/conf.d/vhosts/${DOMAIN}.conf"
C2="/etc/nginx/conf.d/vhosts/${DOMAIN}.ssl.conf"
# CWP account: use $USER_ACC if given, else auto-derive it from the domain's nginx vhost
USER_ACC="${USER_ACC:-}"
if [ -z "$USER_ACC" ]; then
  USER_ACC=$(awk 'match($0,/root[[:space:]]+\/home\/([^\/]+)\/public_html/,a){print a[1];exit}' "$C1" 2>/dev/null)
fi
USER_ACC="${USER_ACC:-bayt}"
SVC="${USER_ACC}-api"
API_DIR="/home/${USER_ACC}/bayt-api"
DATA_DIR="/home/${USER_ACC}"
RAW="https://raw.githubusercontent.com/aleimam/baytalwatan/${REF}/server/server.js"

echo "==== target: user=$USER_ACC  domain=$DOMAIN  port=$PORT  service=$SVC ===="

echo "==== 1. Node.js present? ===="
if ! command -v node >/dev/null 2>&1; then
  echo "!! Node.js is NOT installed. Install it, then re-run this script:"
  echo "     dnf module reset nodejs -y && dnf module enable nodejs:20 -y && dnf install nodejs -y"
  echo "   (or NodeSource:  curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -  &&  dnf install -y nodejs )"
  exit 1
fi
echo "node $(node --version)"

echo "==== 2. install server.js to $API_DIR ===="
id "$USER_ACC" >/dev/null 2>&1 || { echo "!! CWP user '$USER_ACC' does not exist — check the account name (ls -d /home/*/public_html)"; exit 1; }
mkdir -p "$API_DIR"
curl -fsSL "$RAW" -o "$API_DIR/server.js" || { echo "!! could not fetch server.js"; exit 1; }
chown -R "${USER_ACC}:${USER_ACC}" "$API_DIR"
echo "installed $(wc -l < "$API_DIR/server.js") lines"

echo "==== 3. systemd service ($SVC) ===="
cat > "/etc/systemd/system/${SVC}.service" <<EOF
[Unit]
Description=Node auth API for ${DOMAIN}
After=network.target

[Service]
Type=simple
User=${USER_ACC}
Environment=PORT=${PORT}
Environment=HOST=127.0.0.1
Environment=DATA_DIR=${DATA_DIR}
WorkingDirectory=${API_DIR}
ExecStart=$(command -v node) ${API_DIR}/server.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now "${SVC}"
sleep 2
echo "service active: $(systemctl is-active "${SVC}")"
echo "local ping: $(curl -s "http://127.0.0.1:${PORT}/api/ping")"

echo "==== 4. nginx: proxy /api/ -> 127.0.0.1:${PORT} ===="
PATCHED=0
for C in "$C1" "$C2"; do
  [ -f "$C" ] || { echo "skip (missing): $C"; continue; }
  if grep -q "location /api/" "$C"; then echo "already patched: $C"; PATCHED=1; continue; fi
  cp -a "$C" "$C.bak.$(date +%s)"
  sed -i '/root \/home\/'"${USER_ACC}"'\/public_html;/a\        location /api/ { proxy_pass http://127.0.0.1:'"${PORT}"'; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }' "$C"
  grep -q "location /api/" "$C" && { echo "patched: $C"; PATCHED=1; } || echo "!! could not patch (root line not found): $C"
done
if [ "$PATCHED" = "1" ]; then
  if nginx -t; then systemctl reload nginx && echo "nginx reloaded"; else echo "!! nginx -t FAILED — restoring backups"; for C in "$C1" "$C2"; do b=$(ls -t "$C".bak.* 2>/dev/null | head -1); [ -n "$b" ] && cp -a "$b" "$C"; done; fi
fi

echo "==== 5. test through nginx ===="
echo "http  ping: $(curl -s "http://${DOMAIN}/api/ping")"
echo "https ping: $(curl -s "https://${DOMAIN}/api/ping")"
echo
echo ">>> FINAL STEP — create your admin login (password stays in your shell, not the repo):"
echo "    runuser -u ${USER_ACC} -- env DATA_DIR=${DATA_DIR} node ${API_DIR}/server.js seed-admin aleimam@live.com 'QweAsd@911' 'Admin'"
echo
echo "Then make sure the frontend is deployed (gate + /api wiring) and hard-refresh https://${DOMAIN}/"
