#!/bin/sh
# Диагностика Книги рода на сервере (только чтение). С Мака: ssh -i ~/.ssh/kiki_proxy root@194.135.24.17 'sh -s' < deploy/ru/diag.sh
echo "== службы"; systemctl is-active kniga-api redis-server nginx
echo "== порты"; ss -ltnp 2>/dev/null | grep -E ':(80|443|3000|3100|6379)\s' | awk '{print $4, $NF}'
echo "== nginx: listen, server_name, return"; nginx -T 2>/dev/null | grep -n -E "^\s*(listen|server_name|return|root|include|ssl_certificate )" | grep -v "^\s*#" | head -40
echo "== файл kniga.conf"; ls -la /etc/nginx/conf.d/
echo "== тест изнутри"; curl -s -m 10 -o /dev/null -w "kniga по Host: %{http_code}\n" -H "Host: kniga-balanuca.ru" http://127.0.0.1/
curl -s -m 10 -o /dev/null -w "api на 3100: %{http_code}\n" http://127.0.0.1:3100/health
curl -s -m 10 -o /dev/null -w "api через nginx: %{http_code}\n" -H "Host: kniga-balanuca.ru" http://127.0.0.1/api/status
echo "== последние записи журнала nginx (ошибки)"; tail -n 5 /var/log/nginx/error.log 2>/dev/null
