#!/bin/sh
# Запускается НА МАКЕ: собирает сайт и сервер Книги рода, кладёт на сервер и запускает server-setup.sh.
# Как у Кики (deploy-ru.sh): заходит по ключу ~/.ssh/kiki_proxy. Секреты берутся из папки «Книга рода – секреты», в репозиторий и в чат не попадают.
set -eu
cd "$(dirname "$0")/../.."
KEY="$HOME/.ssh/kiki_proxy"
HOST="root@${KNIGA_HOST:-194.135.24.17}"
ENV_FILE="${KNIGA_ENV:-$HOME/Documents/Книга рода – секреты/Книга_рода_сервер_ru.env}"
[ -f "$ENV_FILE" ] || { echo "Нет файла с секретами: $ENV_FILE"; exit 1; }
TMP=$(mktemp -d)
sh scripts/build-site.sh "$TMP/site"
tar czf "$TMP/site.tgz" -C "$TMP/site/kr-k3nu7rmszt" .
tar czf "$TMP/kniga-api.tgz" --exclude node_modules --exclude 'test-*' --exclude '*.docx' -C kniga-api .
mkdir "$TMP/deploy" && cp -R deploy/ru "$TMP/deploy/ru"
cp "$ENV_FILE" "$TMP/kniga-api.env"
tar czf "$TMP/upload.tgz" -C "$TMP" site.tgz kniga-api.tgz kniga-api.env deploy
scp -i "$KEY" -o ConnectTimeout=20 "$TMP/upload.tgz" "$HOST:/root/kniga-upload.tgz"
ssh -i "$KEY" -o ConnectTimeout=20 "$HOST" 'rm -rf /root/kniga-upload && mkdir /root/kniga-upload && tar xzf /root/kniga-upload.tgz -C /root/kniga-upload && chmod 700 /root/kniga-upload && sh /root/kniga-upload/deploy/ru/server-setup.sh'
# Секреты на сервере остаются только в /etc/kniga-api.env: загруженную копию убираем
ssh -i "$KEY" "$HOST" 'shred -u /root/kniga-upload/kniga-api.env /root/kniga-upload.tgz 2>/dev/null || rm -f /root/kniga-upload/kniga-api.env /root/kniga-upload.tgz'
echo "Готово."
