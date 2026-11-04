#!/bin/sh
# Сертификат https для Книги рода. Запуск с Мака: ssh -i ~/.ssh/kiki_proxy root@194.135.24.17 'sh -s' < deploy/ru/certbot.sh
# Меняет только файл kniga.conf (certbot находит его по имени сайта), файлы Кики не трогает. Почту для сертификата не указываем.
set -eu
DOMAIN=kniga-balanuca.ru
echo "== перед выпуском: nginx"; nginx -t
echo "== плагин nginx для certbot"
certbot plugins 2>/dev/null | grep -q "^\* nginx" || DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-certbot-nginx >/dev/null
certbot plugins 2>/dev/null | grep -E "^\* nginx" || { echo "плагин nginx не установился"; exit 1; }
echo "== выпуск сертификата"
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect
echo "== после выпуска: проверка nginx"
nginx -t && systemctl reload nginx
echo "== сертификат"; certbot certificates 2>/dev/null | grep -E "Certificate Name|Domains|Expiry" | head -8
echo "== автообновление"; systemctl list-timers 2>/dev/null | grep -i certbot | head -2 || true
echo "== проверка https изнутри"
curl -s -m 15 -o /dev/null -w "kniga https: %{http_code}\n" --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/"
curl -s -m 15 -o /dev/null -w "kiki https: %{http_code}\n" --resolve "kiki-mama.ru:443:127.0.0.1" "https://kiki-mama.ru/"
