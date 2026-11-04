#!/bin/sh
# Проверка сервера перед установкой Книги рода. Только читает, ничего не меняет. Запуск с Мака:
#   ssh -i ~/.ssh/kiki_proxy root@194.135.24.17 'sh -s' < deploy/ru/preflight.sh
echo "== система"; . /etc/os-release; echo "$PRETTY_NAME"; uptime -p
echo "== ресурсы"; free -m | sed -n 1,2p; df -h / | tail -1
echo "== версии"; nginx -v 2>&1; node -v; command -v redis-server >/dev/null && redis-server --version || echo "redis: не установлен"; command -v certbot >/dev/null && certbot --version 2>&1 || echo "certbot: не установлен"
echo "== занятые порты"; ss -ltn | awk 'NR>1{print $4}' | sed 's/.*://' | sort -un | tr '\n' ' '; echo
echo "== что слушает 3100 и 6379"; ss -ltn | grep -E ':(3100|6379)\s' || echo "свободны"
echo "== nginx: сайты"; ls /etc/nginx/conf.d /etc/nginx/sites-enabled 2>/dev/null; grep -h server_name /etc/nginx/conf.d/*.conf 2>/dev/null | sort -u
echo "== nginx проверка"; nginx -t 2>&1
echo "== пользователь kniga и папки"; id kniga 2>&1 | head -1; ls -d /opt/kniga /var/www/kniga 2>&1 | head -2
echo "== файрвол"; (ufw status 2>/dev/null | head -5) || echo "ufw нет"
