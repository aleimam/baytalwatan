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
  # nginx vhost (CWP nginx / nginx-front): pull the `root ...;` directive
  if [ -z "$DOCROOT" ]; then
    for ng in /etc/nginx/conf.d/vhosts/${DOMAIN}.conf /etc/nginx/conf.d/vhosts/${DOMAIN}.ssl.conf \
              /usr/local/nginx/conf/conf.d/vhosts/${DOMAIN}.conf /usr/local/nginx/conf/vhosts/${DOMAIN}.conf; do
      [ -f "$ng" ] && DOCROOT=$(awk '$1=="root"{r=$2;gsub(/;/,"",r);print r;exit}' "$ng") && [ -n "$DOCROOT" ] && break
    done
    if [ -z "$DOCROOT" ]; then
      NGCONF=$(grep -rilE "server_name[[:space:]].*${DOMAIN}" /etc/nginx /usr/local/nginx/conf 2>/dev/null | head -1)
      [ -n "$NGCONF" ] && DOCROOT=$(awk '$1=="root"{r=$2;gsub(/;/,"",r);print r;exit}' "$NGCONF")
    fi
  fi
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
  echo "   Re-run with the path stated explicitly, e.g.:"
  echo "     DOCROOT=/home/USER/public_html bash <(curl -fsSL .../deploy-cwp.sh) $DOMAIN"
  echo "   To find it, run this and send me the output:"
  echo "     ls -d /home/*/public_html 2>/dev/null ; grep -rEi 'server_name|root ' /etc/nginx/conf.d/vhosts/ /usr/local/nginx/conf 2>/dev/null | grep -i ${DOMAIN%%.*}"
  exit 1
fi
OWNER_USER=$(stat -c '%U' "$DOCROOT")
OWNER="${OWNER_USER}:${OWNER_USER}"   # suEXEC/suPHP (Apache) requires files in the user's OWN group, not nobody
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
rm -rf "$DOCROOT/.git" "$DOCROOT/tools" "$DOCROOT/data" "$DOCROOT/server" "$TMP"

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
