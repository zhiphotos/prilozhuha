#!/bin/sh
# Быстрая выкладка только страниц с условиями (about и legal, около 100 КБ) на сервер. Запуск НА МАКЕ: sh deploy/ru/upload-legal.sh
# Остальной сайт, API и секреты не трогает.
set -eu
cd "$(dirname "$0")/../.."
KEY="$HOME/.ssh/kiki_proxy"
HOST="root@${KNIGA_HOST:-194.135.24.17}"
SSHO="-i $KEY -o ConnectTimeout=60 -o ServerAliveInterval=10 -o ControlMaster=auto -o ControlPath=/tmp/kniga-ssh-%C -o ControlPersist=300"
retry() { n=0; until "$@"; do n=$((n+1)); [ "$n" -ge 12 ] && return 1; echo "повтор $n через 15 секунд..."; sleep 15; done; }
( cd kniga-src && npm run legal:pages >/dev/null )
TMP=$(mktemp -d)
export COPYFILE_DISABLE=1
tar czf "$TMP/legal.tgz" --no-xattrs -C kniga-src/public about legal
retry ssh $SSHO "$HOST" true
retry scp $SSHO "$TMP/legal.tgz" "$HOST:/root/legal.tgz"
ssh $SSHO "$HOST" 'tar xzf /root/legal.tgz -C /var/www/kniga/site && rm -f /root/legal.tgz && ls /var/www/kniga/site/about /var/www/kniga/site/legal'
echo "Готово: https://kniga-balanuca.ru/about/"
