#!/bin/sh
# Один раз после создания бота в @BotFather: задаёт боту имя, описание, подсказку команд и адрес вебхука.
# Токен берётся из файла секретов (строки TG_BOT_TOKEN=… и TG_WEBHOOK_SECRET=…), на экран не выводится.
set -eu
ENV_FILE="${KNIGA_ENV:-$HOME/Documents/Книга рода – секреты/Книга_рода_сервер_ru.env}"
TOKEN=$(grep '^TG_BOT_TOKEN=' "$ENV_FILE" | cut -d= -f2-)
SECRET=$(grep '^TG_WEBHOOK_SECRET=' "$ENV_FILE" | cut -d= -f2-)
[ -n "$TOKEN" ] && [ -n "$SECRET" ] || { echo "В файле секретов нет TG_BOT_TOKEN или TG_WEBHOOK_SECRET"; exit 1; }
API="https://api.telegram.org/bot$TOKEN"
call() { curl -s -X POST "$API/$1" -H 'Content-Type: application/json' -d "$2" | grep -o '"ok":[a-z]*' ; }
echo "имя:";      call setMyName '{"name":"Дед Привратник"}'
echo "коротко:";  call setMyShortDescription '{"short_description":"Сижу на завалинке у ворот Книги Рода. Заплатил через Трибьют – скажи мне почту, и я тебя пропущу."}'
echo "описание:"; call setMyDescription '{"description":"Здорово, голубчик. Я тут при воротах Книги Рода сижу, чаёк прихлёбываю.\n\nКто заплатил за доступ через Трибьют, тому я сам ключ выдаю, Дарину беспокоить не надо. Жми «Старт», назови почту, и пойдёшь в Книгу по-хозяйски.\n\nНе заплатил пока – не взыщи, не пущу. Порядок такой."}'
echo "команды:";  call setMyCommands '{"commands":[{"command":"start","description":"Подойти к воротам"}]}'
echo "вебхук:";   call setWebhook "{\"url\":\"https://kniga-balanuca.ru/api/tg-bot\",\"secret_token\":\"$SECRET\",\"allowed_updates\":[\"message\"]}"
