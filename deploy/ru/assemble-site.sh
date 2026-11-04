#!/bin/sh
# Собирает папку сайта: лендинг на главной, приложение по /app/. Запуск: sh deploy/ru/assemble-site.sh <куда> <готовая сборка приложения>
# Лендинг и приложение живут на одном адресе (kniga-balanuca.ru), поэтому у приложения остаётся тот же браузерный склад (книги, фото, вход).
set -eu
OUT="$1"; APP="$2"
cd "$(dirname "$0")/../.."
[ -f "$APP/index.html" ] && [ -d "$APP/assets" ] || { echo "нет сборки приложения в $APP"; exit 1; }
rm -rf "$OUT" && mkdir -p "$OUT/app"
cp -R "$APP"/. "$OUT/app/"
# Лендинг: главная страница и его файлы
cp -R kniga-landing/. "$OUT/"
# Для уже установленных у тестировщиков иконок и выданных уведомлений: старые адреса с корня остаются живыми
cp "$APP/push-sw.js" "$OUT/push-sw.js"
cp "$APP/manifest.webmanifest" "$OUT/manifest.webmanifest"
cp -R "$APP/icons" "$OUT/icons"
# Страницы с условиями открываются и с корня (/legal/offer/, /about/), как раньше
for d in legal about; do [ -d "$APP/$d" ] && cp -R "$APP/$d" "$OUT/$d"; done
echo "Сайт собран: лендинг на /, приложение на /app/"
