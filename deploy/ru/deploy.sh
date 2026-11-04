#!/bin/sh
# Выкладка на российский сервер. Запускать на сервере из папки с клоном репозитория: sh deploy/ru/deploy.sh
# Делает: берёт свежий main, ставит зависимости сервера, собирает папку сайта, выкладывает файлы приложения и перезапускает API.
# Прежняя версия сайта сохраняется в /var/www/kniga/previous для быстрого отката (sh deploy/ru/rollback.sh).
set -eu
cd "$(dirname "$0")/../.."
git fetch -q origin main
git checkout -q main
git merge -q --ff-only origin/main
OUT=$(mktemp -d)
sh scripts/build-site.sh "$OUT/site"
sudo mkdir -p /var/www/kniga /opt/kniga
if [ -d /var/www/kniga/site ]; then sudo rm -rf /var/www/kniga/previous && sudo mv /var/www/kniga/site /var/www/kniga/previous; fi
sudo mkdir -p /var/www/kniga/site
# Приложение лежит в корне нового адреса: берём содержимое папки kr-k3nu7rmszt
sudo cp -R "$OUT/site/kr-k3nu7rmszt/." /var/www/kniga/site/
sudo rsync -a --delete --exclude node_modules kniga-api/ /opt/kniga/kniga-api/
(cd /opt/kniga/kniga-api && sudo npm ci --omit=dev --no-audit --no-fund)
sudo chown -R kniga:kniga /opt/kniga
sudo systemctl restart kniga-api
sleep 2
curl -fsS http://127.0.0.1:3000/health >/dev/null && echo "API работает" || { echo "API не ответил: sh deploy/ru/rollback.sh"; exit 1; }
echo "Готово."
