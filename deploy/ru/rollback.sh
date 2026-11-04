#!/bin/sh
# Откат сайта на предыдущую выкладку (файлы приложения). API откатывается через git: git checkout <прежний коммит> и deploy.sh.
set -eu
[ -d /var/www/kniga/previous ] || { echo "Прежней версии нет."; exit 1; }
sudo rm -rf /var/www/kniga/broken && sudo mv /var/www/kniga/site /var/www/kniga/broken
sudo mv /var/www/kniga/previous /var/www/kniga/site
echo "Сайт возвращён на прежнюю версию."
