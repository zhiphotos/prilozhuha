#!/bin/sh
# Проверка бота: что Telegram знает о вебхуке и какая последняя ошибка. Токен берётся из файла секретов и на экран не выводится.
set -eu
ENV_FILE="${KNIGA_ENV:-$HOME/Documents/Книга рода – секреты/Книга_рода_сервер_ru.env}"
TOKEN=$(grep '^TG_BOT_TOKEN=' "$ENV_FILE" | cut -d= -f2-)
curl -s "https://api.telegram.org/bot$TOKEN/getWebhookInfo" | python3 -c '
import json,sys
r=json.load(sys.stdin).get("result",{})
print("адрес:", r.get("url"))
print("ждут обработки:", r.get("pending_update_count"))
print("последняя ошибка:", r.get("last_error_message"))
print("IP:", r.get("ip_address"))
'
