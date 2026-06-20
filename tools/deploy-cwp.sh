#!/usr/bin/env bash
# Deploy the Beit El Watan lands app to a CWP / Apache server.
# Run as root:  bash <(curl -fsSL https://raw.githubusercontent.com/aleimam/baytalwatan/main/tools/deploy-cwp.sh)
# Optional:     DOCROOT=/home/USER/public_html bash <(curl -fsSL .../deploy-cwp.sh) baytalwatan.com
set -uo pipefail

DOMAIN="${1:-baytalwatan.com}"
REPO="https://github.com/aleimam/baytalwatan.git"
BRANCH="main"
DOCROOT="${DOCROOT:-}"

echo "== Beit El Watan — deploy to CWP =="
echo "Domain : $DOMAIN"

# locate the Apache binary (CWP keeps it under /usr/local/apache/bin)
HTTPD=""
for h in /usr/local/apache/bin/httpd httpd /usr/sbin/httpd; do
  if command -v "$h" >/dev/null 2>&1; then HTTPD=$(command -v "$h"); break; fi
  if [ -x "$h" ]; then HTTPD="$h"; break; fi
done

# 1) Detect the Apache document root for the domain (unless DOCROOT was provided)
if [ -n "$DOCROOT" ] && [ ! -d "$DOCROOT" ]; then
  echo "!! The DOCROOT you provided does not exist: $DOCROOT"
  echo "   (Did you replace USER with the real account name?)"; exit 1
fi
if [ -z "$DOCROOT" ]; then
  CONF=$(ls /usr/local/apache/conf.d/vhosts/${DOMAIN}*.conf 2>/dev/null | head -1)
  [ -z "$CONF" ] && CONF=$(grep -rilE "ServerName[[:space:]]+${DOMAIN}|ServerAlias[[:space:]]+${DOMAIN}" /usr/local/apache/conf.d/vhosts/ 2>/dev/null | head -1)
  if [ -z "$CONF" ] && [ -n "$HTTPD" ]; then
    CONF=$("$HTTPD" -S 2>/dev/null | grep -iE "namevhost[[:space:]]+${DOMAIN}([[:space:]]|$)" | grep -oE '\(/[^:]+' | tr -d '(' | head -1)
  fi
  [ -n "$CONF" ] && [ -f "$CONF" ] && DOCROOT=$(awk 'tolower($1)=="documentroot"{gsub(/"/,"",$2);print $2;exit}' "$CONF")
  # home-dir heuristic (domain-specific — never a blind glob)
  if [ -z "$DOCROOT" ]; then
    base="${DOMAIN%%.*}"
    for cand in /home/${base}/public_html /home/${base}*/public_html; do
      [ -d "$cand" ] && DOCROOT="$cand" && break
    done
  fi
fi
if [ -z "$DOCROOT" ] || [ ! -d "$DOCROOT" ]; then
  echo "!! Could not auto-detect the document root for $DOMAIN."
  echo "   Run this and send me the output:"
  echo "     ${HTTPD:-httpd} -S 2>/dev/null | grep -i baytal ; ls -d /home/*/public_html 2>/dev/null ; grep -rhiE DocumentRoot /usr/local/apache/conf.d/vhosts/ 2>/dev/null"
  echo "   (If nothing mentions baytalwatan, the domain isn't added in CWP yet — add it in CWP > Domains first.)"
  exit 1
fi
OWNER=$(stat -c '%U:%G' "$DOCROOT")
echo "DocRoot: $DOCROOT"
echo "Owner  : $OWNER"

# 2) Ensure git is installed
if ! command -v git >/dev/null 2>&1; then
  echo "Installing git..."; (yum -y install git || dnf -y install git) >/dev/null 2>&1
fi

# 3) Fetch the app FIRST (so a failed clone never wipes the live site)
TMP=$(mktemp -d)
echo "Cloning $REPO ..."
git clone --depth 1 -b "$BRANCH" "$REPO" "$TMP/app" || { echo "!! Clone failed"; rm -rf "$TMP"; exit 1; }
[ -f "$TMP/app/index.html" ] || { echo "!! Clone looks incomplete (no index.html)"; rm -rf "$TMP"; exit 1; }

# 4) Back up the current document root
TS=$(date +%F-%H%M%S); mkdir -p /root/backups
if [ -n "$(ls -A "$DOCROOT" 2>/dev/null)" ]; then
  tar czf "/root/backups/${DOMAIN}-${TS}.tgz" -C "$DOCROOT" . 2>/dev/null && echo "Backup : /root/backups/${DOMAIN}-${TS}.tgz"
fi

# 5) Deploy (the app lives at the repo root)
shopt -s dotglob
rm -rf "${DOCROOT:?}/"*
cp -a "$TMP/app/." "$DOCROOT/"
rm -rf "$DOCROOT/.git" "$DOCROOT/tools" "$DOCROOT/data" "$TMP"

# 6) Permissions, ownership, SELinux context
chown -R "$OWNER" "$DOCROOT"
find "$DOCROOT" -type d -exec chmod 755 {} \;
find "$DOCROOT" -type f -exec chmod 644 {} \;
command -v restorecon >/dev/null 2>&1 && restorecon -R "$DOCROOT" >/dev/null 2>&1

echo
echo "== Deployed successfully =="
echo "Site  : https://${DOMAIN}/"
echo "API   : https://${DOMAIN}/api.php?action=ping   (expect {\"ok\":true})"
echo "If the API errors, the site still works in static mode; ensure the domain's PHP has pdo_sqlite (CWP > PHP Version)."
