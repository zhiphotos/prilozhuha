#!/bin/sh
# Первичная настройка сервера под «Книгу рода». Запускается НА СЕРВЕРЕ от root скриптом upload.sh (папка /root/kniga-upload уже на месте).
# Безопасно для соседнего сайта: файлы Кики не меняются, nginx перезагружается только после успешной проверки `nginx -t`.
# Можно запускать повторно: каждый шаг проверяет, что уже сделано.
set -eu
UP=/root/kniga-upload
DOMAIN=kniga-balanuca.ru
say() { printf '\n== %s\n' "$*"; }

say "1. Проверка перед установкой (ничего не меняет)"
command -v nginx >/dev/null || { echo "nginx не найден"; exit 1; }
node -v | grep -E '^v(2[0-9]|[3-9][0-9])' >/dev/null || { echo "нужен Node 20 или новее"; exit 1; }
ss -ltn | awk '{print $4}' | grep -E ':3100$' >/dev/null && { echo "порт 3100 уже занят: остановитесь и сообщите"; exit 1; } || true
ss -ltn | awk '{print $4}' | grep -E ':6379$' >/dev/null && echo "порт 6379 уже занят (Redis уже стоит, продолжаем осторожно)" || true
[ -f "$UP/kniga-api.env" ] || { echo "нет $UP/kniga-api.env"; exit 1; }

say "2. Redis (только для этого компьютера, с паролем, без вытеснения данных)"
if ! command -v redis-server >/dev/null; then
  DEBIAN_FRONTEND=noninteractive apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq redis-server >/dev/null
fi
PASS=$(grep -E '^REDIS_PASSWORD=' "$UP/kniga-api.env" | cut -d= -f2-)
CONF=/etc/redis/redis.conf
cp -n "$CONF" "$CONF.before-kniga" 2>/dev/null || true
set_conf() { grep -qE "^$1 " "$CONF" && sed -i "s|^$1 .*|$1 $2|" "$CONF" || echo "$1 $2" >> "$CONF"; }
set_conf bind "127.0.0.1 -::1"
set_conf protected-mode yes
set_conf requirepass "$PASS"
set_conf maxmemory 200mb
set_conf maxmemory-policy noeviction
set_conf appendonly yes
systemctl enable redis-server >/dev/null 2>&1 || true
systemctl restart redis-server
sleep 1
redis-cli -a "$PASS" --no-auth-warning ping | grep -q PONG && echo "Redis отвечает"

say "3. Пользователь и папки"
id kniga >/dev/null 2>&1 || useradd --system --home /opt/kniga --shell /usr/sbin/nologin kniga
mkdir -p /opt/kniga /var/www/kniga/site
rm -rf /opt/kniga/kniga-api.new && mkdir /opt/kniga/kniga-api.new
tar xzf "$UP/kniga-api.tgz" -C /opt/kniga/kniga-api.new
[ -d /opt/kniga/kniga-api.new/node_modules/web-push ] || { echo "в загрузке нет node_modules/web-push"; exit 1; }
if [ -d /opt/kniga/kniga-api ]; then rm -rf /opt/kniga/kniga-api.old && mv /opt/kniga/kniga-api /opt/kniga/kniga-api.old; fi
mv /opt/kniga/kniga-api.new /opt/kniga/kniga-api
chown -R kniga:kniga /opt/kniga
install -m 600 -o root -g root "$UP/kniga-api.env" /etc/kniga-api.env

say "4. Файлы сайта"
if [ -d /var/www/kniga/site ] && [ -n "$(ls -A /var/www/kniga/site)" ]; then rm -rf /var/www/kniga/previous && cp -a /var/www/kniga/site /var/www/kniga/previous; fi
rm -rf /var/www/kniga/site/* && tar xzf "$UP/site.tgz" -C /var/www/kniga/site

say "5. Служба API и планировщик пушей"
install -m 644 "$UP/deploy/ru/kniga-api.service" /etc/systemd/system/kniga-api.service
install -m 644 "$UP/deploy/ru/kniga-push-tick.cron" /etc/cron.d/kniga-push-tick
systemctl daemon-reload
systemctl enable kniga-api >/dev/null 2>&1
systemctl restart kniga-api
sleep 2
curl -fsS http://127.0.0.1:3100/health >/dev/null && echo "API отвечает на /health" || { echo "API НЕ ответил: journalctl -u kniga-api -n 30"; exit 1; }

say "6. nginx (отдельный файл, файлы Кики не трогаем)"
if grep -q ssl_certificate /etc/nginx/conf.d/kniga.conf 2>/dev/null; then
  echo "kniga.conf уже с сертификатом https (certbot): не перезаписываем"
else
  install -m 644 "$UP/deploy/ru/nginx-kniga-http.conf" /etc/nginx/conf.d/kniga.conf
  if nginx -t; then systemctl reload nginx; echo "nginx перезагружен"; else rm -f /etc/nginx/conf.d/kniga.conf; echo "конфиг nginx не прошёл проверку, наш файл убран, Кики не затронут"; exit 1; fi
fi

say "Готово. Дальше: сертификат https командой certbot (отдельный шаг)."
