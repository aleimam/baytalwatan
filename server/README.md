# Bayt Alwatan — Node API (login / signup / admin)

Pure Node (no dependencies, no build step). Serves only `/api/*`; nginx serves the static site and proxies `/api/` here.

## Endpoints
- `GET  /api/ping` → `{ok:true}`
- `POST /api/auth?action=register|login|logout`, `GET /api/auth?action=me`
- `GET  /api/admin?action=settings_get` (public); `users`, `set_role`, `delete_user`, `settings_set` (admin only)

## Install on the CWP server (run as root)
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/aleimam/baytalwatan/main/server/setup-node.sh)
```
Checks Node, installs `server.js` to `/home/bayt/bayt-api`, runs it as the `bayt-api` systemd service on `127.0.0.1:3000`, and adds the nginx `/api/` proxy. If Node isn't installed, it prints the install command and stops.

## Create the admin login (password stays in your shell)
```bash
runuser -u bayt -- env DATA_DIR=/home/bayt node /home/bayt/bayt-api/server.js seed-admin aleimam@live.com 'YOUR_PASSWORD' 'Admin'
```

## Data (all outside the web root, owned by `bayt`)
- `/home/bayt/bayt_users.json` — users (scrypt password hashes)
- `/home/bayt/bayt_settings.json` — admin appearance/feature settings
- `/home/bayt/bayt_session_secret` — HMAC secret for session cookies (auto-generated)

## Operate
```bash
systemctl status bayt-api        # health
systemctl restart bayt-api       # after replacing server.js
journalctl -u bayt-api -n 50     # logs
```

## Update server.js
```bash
curl -fsSL https://raw.githubusercontent.com/aleimam/baytalwatan/main/server/server.js -o /home/bayt/bayt-api/server.js
chown bayt:bayt /home/bayt/bayt-api/server.js && systemctl restart bayt-api
```

## Local dev
`node server/dev.js` serves the static site **and** the API on `http://127.0.0.1:8088` (writes data to `../_localdata`).
