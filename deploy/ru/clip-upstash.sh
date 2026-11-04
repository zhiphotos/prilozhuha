#!/bin/sh
# Берёт из буфера обмена фрагмент .env.local из Vercel (Storage → Upstash → Copy Snippet) и кладёт два нужных значения в файл
# «Книга рода – секреты/Книга_рода_upstash.env». Значения на экран не выводятся, только имена и длины. Для проверки: echo "..." | sh clip-upstash.sh -
set -eu
OUT="${KNIGA_UPSTASH_ENV:-$HOME/Documents/Книга рода – секреты/Книга_рода_upstash.env}"
if [ "${1:-}" = "-" ]; then SRC=$(cat); else SRC=$(pbpaste); fi
val() { printf '%s\n' "$SRC" | grep -E "^(export )?($1)=" | head -1 | cut -d= -f2- | tr -d "\"' \r"; }
URL=$(val 'KV_REST_API_URL|UPSTASH_REDIS_REST_URL')
TOKEN=$(val 'KV_REST_API_TOKEN|UPSTASH_REDIS_REST_TOKEN')
case "$URL" in https://*) ;; *) echo "В буфере нет адреса (URL). Нажмите «Copy Snippet» и повторите."; exit 1;; esac
case "$TOKEN" in ""|*"*"*) echo "В буфере нет токена или он скрыт звёздочками: нажмите «Show secret», потом «Copy Snippet»."; exit 1;; esac
umask 077
{ echo "# Ключи Upstash (старая база Книги рода). Нужны только для разового переноса данных на новый сервер."; echo "UPSTASH_REDIS_REST_URL=$URL"; echo "UPSTASH_REDIS_REST_TOKEN=$TOKEN"; } > "$OUT"
chmod 600 "$OUT"
echo "Записано в $OUT: адрес ${#URL} знаков, токен ${#TOKEN} знаков"
