#!/bin/sh
# Только чтение: доходит ли Telegram до сервера и может ли сервер достучаться до Telegram. Запуск с Мака:
#   ssh -i ~/.ssh/kiki_proxy root@194.135.24.17 'sh -s' < deploy/ru/tg-net.sh
echo "== запросы к /api/tg-bot в журнале nginx (последние 8: время, адрес, код)"
grep -h "/api/tg-bot" /var/log/nginx/access.log /var/log/nginx/access.log.1 2>/dev/null | awk '{print $4, $1, $9}' | tail -8
echo "== запросы с адресов Telegram (149.154.*, 91.108.*) за всё время журнала"
grep -hE "^(149\.154\.|91\.108\.)" /var/log/nginx/access.log 2>/dev/null | wc -l
echo "== сервер -> Telegram"
curl -s -m 10 -o /dev/null -w "api.telegram.org: %{http_code} за %{time_total}s\n" https://api.telegram.org/ || echo "api.telegram.org: НЕ ОТВЕЧАЕТ"
echo "== брандмауэр"
(ufw status 2>/dev/null | head -12) || true
iptables -S 2>/dev/null | head -12
echo "== порт 443 снаружи слушается"
ss -ltn 2>/dev/null | grep ':443 '
