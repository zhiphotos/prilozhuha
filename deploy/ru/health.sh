#!/bin/sh
# Состояние сервера: нагрузка, память, диск, сеть, сколько подключений, ошибки. Только чтение.
# С Мака: ssh -i ~/.ssh/kiki_proxy root@194.135.24.17 'sh -s' < deploy/ru/health.sh
echo "== нагрузка и время работы"; uptime
echo "== ядра"; nproc
echo "== память"; free -m | sed -n 1,3p
echo "== диск"; df -h / | tail -1
echo "== подключения"; ss -s | sed -n 1,4p
echo "== самые тяжёлые процессы"; ps aux --sort=-%cpu | head -6 | cut -c1-140
echo "== службы"; systemctl is-active nginx redis-server kniga-api
echo "== Redis"; redis-cli -a "$(grep '^REDIS_PASSWORD=' /etc/kniga-api.env | cut -d= -f2-)" --no-auth-warning info memory 2>/dev/null | grep -E "used_memory_human|maxmemory_human"; redis-cli -a "$(grep '^REDIS_PASSWORD=' /etc/kniga-api.env | cut -d= -f2-)" --no-auth-warning dbsize 2>/dev/null
echo "== ошибки nginx за последние минуты"; tail -n 8 /var/log/nginx/error.log 2>/dev/null
echo "== сброшенные и потерянные пакеты"; netstat -s 2>/dev/null | grep -i -E "retransmit|dropped|overflow" | head -5
echo "== ядро: последние сообщения о сети/памяти"; dmesg 2>/dev/null | tail -n 6
echo "== fail2ban"; (systemctl is-active fail2ban 2>/dev/null && fail2ban-client status sshd 2>/dev/null | head -6) || echo "fail2ban не установлен"
