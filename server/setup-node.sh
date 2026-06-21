#!/usr/bin/env bash
# ============================================================================
# Bayt Alwatan — set up the Node API on the CWP server (run as root).
#   bash <(curl -fsSL https://raw.githubusercontent.com/aleimam/baytalwatan/main/server/setup-node.sh)
# It: checks Node, installs server.js to /home/bayt/bayt-api, runs it as a
# systemd service on 127.0.0.1:PORT, and proxies nginx  /api/ -> the service.
# ============================================================================
set -uo pipefail

USER_ACC=bayt
API_DIR=/home/${USER_ACC}/bayt-api
DATA_DIR=/home/${USER_ACC}
PORT="${PORT:-3000}"
REF="${REF:-main}"
RAW="https://raw.githubusercontent.com/aleimam/baytalwatan/${REF}/server/server.js"
C1=/etc/nginx/conf.d/vhosts/baytalwatan.com.conf
C2=/etc/nginx/conf.d/vhosts/baytalwatan.com.ssl.conf

echo "==== 1. Node.js present? ===="
if ! command -v node >/dev/null 2>&1; then
  echo "!! Node.js is NOT installed. Install it, then re-run this script:"
  echo "     dnf module reset nodejs -y && dnf module enable nodejs:20 -y && dnf install nodejs -y"
  echo "   (or NodeSource:  curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -  &&  dnf install -y nodejs )"
  exit 1
fi
echo "node $(node --version)"

echo "==== 2. Install server.js to $API_DIR ===="
mkdir -p "$API_DIR"
curl -fsSL "$RAW" -o "$API_DIR/server.js" || { echo "!! could not fetch server.js"; exit 1; }
chown -R ${USER_ACC}:${USER_ACC} "$API_DIR"
echo "installed $(wc -l < "$API_DIR/server.js") lines"

echo "==== 3. systemd service (bayt-api) ===="
cat > /etc/systemd/system/bayt-api.service <<EOF
[Unit]
Description=Bayt Alwatan Node API
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
systemctl enable --now bayt-api
sleep 2
echo "service active: $(systemctl is-active bayt-api)"
echo "local ping: $(curl -s http://127.0.0.1:${PORT}/api/ping)"

echo "==== 4. nginx: proxy /api/ -> 127.0.0.1:${PORT} ===="
for C in "$C1" "$C2"; do
  [ -f "$C" ] || { echo "skip (missing): $C"; continue; }
  if grep -q "location /api/" "$C"; then echo "already patched: $C"; continue; fi
  cp -a "$C" "$C.bak.$(date +%s)"
  sed -i '/root \/home\/bayt\/public_html;/a\        location /api/ { proxy_pass http://127.0.0.1:'"${PORT}"'; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }' "$C"
  echo "patched: $C"
done
if nginx -t; then systemctl reload nginx && echo "nginx reloaded"; else echo "!! nginx -t FAILED — restoring backups"; for C in "$C1" "$C2"; do b=$(ls -t "$C".bak.* 2>/dev/null | head -1); [ -n "$b" ] && cp -a "$b" "$C"; done; fi

echo "==== 5. Test through nginx ===="
echo "https ping: $(curl -s https://baytalwatan.com/api/ping)"
echo
echo ">>> FINAL STEP — create your admin login (password stays in your shell):"
echo "    runuser -u ${USER_ACC} -- env DATA_DIR=${DATA_DIR} node ${API_DIR}/server.js seed-admin aleimam@live.com 'QweAsd@911' 'Admin'"
echo
echo "Then deploy the updated frontend (gate + /api wiring) and hard-refresh."
