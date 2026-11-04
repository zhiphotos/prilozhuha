#!/bin/sh
# Собирает папку для GitHub Pages: только то, что должно быть видно людям.
# Исходники сервера (kniga-api), исходники приложения (kniga-src), docs, CLAUDE.md, .claude и служебные файлы остаются в репозитории, но не публикуются.
# Использование: sh scripts/build-site.sh [папка]   (по умолчанию _site; папка должна быть новой, пустой или несуществующей)
set -eu
cd "$(dirname "$0")/.."
OUT="${1:-_site}"
if [ -e "$OUT" ] && [ -n "$(ls -A "$OUT" 2>/dev/null)" ]; then
  echo "Папка $OUT уже есть и не пуста: удалите её или укажите другую." >&2
  exit 1
fi
mkdir -p "$OUT"
cp -R kr-k3nu7rmszt studio public "$OUT"/
touch "$OUT/.nojekyll"
# Корень сайта пустой и закрыт от поисковиков: раньше здесь показывался README репозитория.
printf '%s\n' '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>.</title></html>' > "$OUT/index.html"
node scripts/check-site.mjs "$OUT"
