#!/bin/sh
# Запускается НА МАКЕ: собирает сайт и сервер Книги рода, кладёт на сервер и запускает server-setup.sh.
# Как у Кики (deploy-ru.sh): заходит по ключу ~/.ssh/kiki_proxy. Секреты берутся из папки «Книга рода – секреты», в репозиторий и в чат не попадают.
set -eu
cd "$(dirname "$0")/../.."
KEY="$HOME/.ssh/kiki_proxy"
HOST="root@${KNIGA_HOST:-194.135.24.17}"
ENV_FILE="${KNIGA_ENV:-$HOME/Documents/Книга рода – секреты/Книга_рода_сервер_ru.env}"
[ -f "$ENV_FILE" ] || { echo "Нет файла с секретами: $ENV_FILE"; exit 1; }
# SSH на этом сервере иногда не отвечает на входе («timed out during banner exchange»): одно общее соединение и повторы
SSHO="-i $KEY -o ConnectTimeout=60 -o ServerAliveInterval=10 -o ControlMaster=auto -o ControlPath=/tmp/kniga-ssh-%C -o ControlPersist=900"
retry() { n=0; until "$@"; do n=$((n+1)); [ "$n" -ge 12 ] && { echo "не удалось после $n попыток"; return 1; }; echo "повтор $n через 15 секунд..."; sleep 15; done; }
TMP=$(mktemp -d)
# Сайт для нового адреса собирается отдельно (приложение отдельно, потом лендинг + приложение вместе): API берётся с самого сервера (VITE_API_BASE=https://kniga-balanuca.ru), баннера «переехали» нет
( cd kniga-src && OUT_DIR="$TMP/app-build" npm run build:ru >/dev/null )
[ -f "$TMP/app-build/index.html" ] && [ -d "$TMP/app-build/assets" ] || { echo "сборка сайта не получилась"; exit 1; }
grep -q "kniga-balanuca.ru" "$TMP"/app-build/assets/index-*.js || { echo "в сборке нет адреса нового API"; exit 1; }
# Лендинг на главной, приложение по /app/ (старые адреса и иконки «Домой» подхватывает лендинг, см. deploy/ru/assemble-site.sh)
sh deploy/ru/assemble-site.sh "$TMP/site" "$TMP/app-build"
grep -q "Что люди получают" "$TMP/site/index.html" && [ -f "$TMP/site/app/index.html" ] || { echo "в сборке нет лендинга или приложения"; exit 1; }
tar czf "$TMP/site.tgz" --no-xattrs -C "$TMP/site" .
# На сервере нет npm: зависимости (пакет web-push, чистый JS) ставим здесь и кладём готовыми
mkdir "$TMP/api" && tar -C kniga-api --exclude node_modules --exclude 'test-*' --exclude '*.docx' -cf - . | tar -C "$TMP/api" -xf -
( cd "$TMP/api" && npm ci --omit=dev --no-audit --no-fund --silent )
export COPYFILE_DISABLE=1
tar czf "$TMP/kniga-api.tgz" --no-xattrs -C "$TMP/api" .
mkdir "$TMP/deploy" && cp -R deploy/ru "$TMP/deploy/ru"
cp "$ENV_FILE" "$TMP/kniga-api.env"
tar czf "$TMP/upload.tgz" --no-xattrs -C "$TMP" site.tgz kniga-api.tgz kniga-api.env deploy
retry ssh $SSHO "$HOST" true
retry scp $SSHO "$TMP/upload.tgz" "$HOST:/root/kniga-upload.tgz"
ssh $SSHO "$HOST" 'rm -rf /root/kniga-upload && mkdir /root/kniga-upload && tar xzf /root/kniga-upload.tgz -C /root/kniga-upload && chmod 700 /root/kniga-upload && sh /root/kniga-upload/deploy/ru/server-setup.sh'
# Секреты на сервере остаются только в /etc/kniga-api.env: загруженную копию убираем
retry ssh $SSHO "$HOST" 'shred -u /root/kniga-upload/kniga-api.env /root/kniga-upload.tgz 2>/dev/null || rm -f /root/kniga-upload/kniga-api.env /root/kniga-upload.tgz'
echo "Готово."
