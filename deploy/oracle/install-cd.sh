#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" -eq 0 || { echo 'Ejecuta con sudo bash deploy/oracle/install-cd.sh'; exit 1; }
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
test -f /etc/nutribot/nutribot.env
test -d /opt/nutribot/current
systemctl is-active --quiet nutribot
systemctl is-active --quiet caddy
for tool in /usr/bin/python3 /usr/bin/npm /usr/bin/curl /usr/sbin/runuser /usr/sbin/restorecon /usr/pgsql-18/bin/pg_dump /usr/pgsql-18/bin/pg_restore; do
  test -x "$tool" || { echo "Falta $tool"; exit 1; }
done
id nutribot-build >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /sbin/nologin nutribot-build
install -d -o root -g root -m 755 /usr/local/lib/nutribot-deploy /opt/nutribot/releases
install -d -o root -g root -m 700 /var/lib/nutribot-deploy
install -o root -g root -m 644 pull-release.py /usr/local/lib/nutribot-deploy/pull-release.py
install -o root -g root -m 644 nutribot-deploy.service nutribot-deploy.timer /etc/systemd/system/
restorecon -RF /usr/local/lib/nutribot-deploy /var/lib/nutribot-deploy /etc/systemd/system/nutribot-deploy.service /etc/systemd/system/nutribot-deploy.timer
systemctl daemon-reload
echo 'Instalado. Revisa primero con: sudo systemctl start nutribot-deploy.service'
echo 'Luego activa: sudo systemctl enable --now nutribot-deploy.timer'
