#!/bin/sh
# Перенос данных из Upstash в Redis на сервере. Запуск НА МАКЕ:  sh deploy/ru/migrate.sh dry   (только посчитать)   или   sh deploy/ru/migrate.sh run   (скопировать)
# Ключи Upstash берутся из папки «Книга рода – секреты» (файл Книга_рода_upstash.env), на сервер кладутся на время работы и стираются. Старая база не меняется.
set -eu
cd "$(dirname "$0")/../.."
MODE="${1:-dry}"
KEY="$HOME/.ssh/kiki_proxy"
HOST="root@${KNIGA_HOST:-194.135.24.17}"
UP="${KNIGA_UPSTASH_ENV:-$HOME/Documents/Книга рода – секреты/Книга_рода_upstash.env}"
[ -f "$UP" ] || { echo "Нет файла $UP"; exit 1; }
grep -qE '^UPSTASH_REDIS_REST_URL=.+' "$UP" && grep -qE '^UPSTASH_REDIS_REST_TOKEN=.+' "$UP" || { echo "В файле Upstash не заполнены значения URL и TOKEN"; exit 1; }
SSHO="-i $KEY -o ConnectTimeout=60 -o ServerAliveInterval=10 -o ControlMaster=auto -o ControlPath=/tmp/kniga-ssh-%C -o ControlPersist=300"
retry() { n=0; until "$@"; do n=$((n+1)); [ "$n" -ge 12 ] && return 1; echo "повтор $n через 15 секунд..."; sleep 15; done; }
retry ssh $SSHO "$HOST" true
retry scp $SSHO "$UP" "$HOST:/root/upstash.env"
# Свежие версии самого скрипта переноса и клиента Redis (на сервере лежат версии с момента установки)
retry scp $SSHO kniga-api/migrate-redis.mjs kniga-api/lib/redis-native.js "$HOST:/root/"
FLAG=""; [ "$MODE" = "dry" ] && FLAG="--dry"
ssh $SSHO "$HOST" "chmod 600 /root/upstash.env; cp /root/migrate-redis.mjs /opt/kniga/kniga-api/migrate-redis.mjs && cp /root/redis-native.js /opt/kniga/kniga-api/lib/redis-native.js && cd /opt/kniga/kniga-api && set -a && . /etc/kniga-api.env && . /root/upstash.env && set +a && node migrate-redis.mjs $FLAG; rc=\$?; shred -u /root/upstash.env 2>/dev/null || rm -f /root/upstash.env; exit \$rc"
echo "Готово ($MODE). Ключи Upstash на сервере стёрты."
