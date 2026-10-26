# Новое древо из Грока: заметка для продолжения (2026-10-26)

Задача Дарины: взять новое древо из `~/Downloads/YSeLGdc6BQTwLzXw-grok-workspace` и встроить в «Книгу рода» (вкладка «Древо» в архиве, сейчас старое `components/rod/family-tree.tsx`). Люди из вкладки «Люди» должны попадать в новое древо логично: мама по маминой линии на мамину сторону, и так далее. Платное: все красивые стили кроме схемы, поиск по архивам, ИИ. Плюс изучить кисти Грока (отдельный помощник уже работает, см. ниже). Правки тестировщиков и свои правки по приложению Дарина пришлёт отдельно.

## Что в папке Грока (src/)
- Модель: `lib/tree/types.ts`: Person (firstName, patronymic, lastName, gender m/f/u, birthYear, deathYear, photo, note), Union (partnerIds, childIds, status, годы), TreeData {people, unions, focusId}. Всё через союзы (пары) и детей, а не через `parents[]`.
- Раскладка: `lib/tree/layout.ts` (поколения обходом графа, дети под серединой родителей, пара: мужчина слева, женщина справа), `metrics.ts`, `kinship.ts` (названия родства от «фокуса»), `fill.ts` (addPerson/attachPerson по видам: father, mother, spouse, son, daughter, brother, sister; buildStarter с дедушками и бабушками по обеим линиям).
- Стили: `styles.ts` TreeStyle = work (схема) | carved | cameo | gzhel | boheme | taiga; у каждого свой layout (`poster.ts`, `cameo.ts`, `gzhel.ts`, `boheme.ts`, `taiga.ts`) и вид (`components/tree/*View.tsx`), экспорт листа `exportPoster.ts`.
- UI: `components/tree/TreeApp.tsx` (шапка с кнопками, «Лист», список рода), `TreeStage.tsx` (зум/перетаскивание), `AddPerson.tsx`, `PersonDrawer.tsx`, `FillBook.tsx`, `ImportFile.tsx` (GEDCOM и файл), `AncestorSearch.tsx` (+ `lib/tree/ancestorSearch.ts` чистый клиентский подбор архивов; `seekLeads*.server.ts` и `readImport*.server.ts` это серверные ИИ-вызовы, их в нашем приложении нет, это платная часть).
- Рисование: `components/draw/DrawStudio.tsx`, `lib/draw/engine.ts`, `pages.ts`.
- Хранение у Грока: localStorage `kniga-roda-v1` (этот ключ НЕ использовать, у нас свой).

## Что у нас (kniga-src)
- Люди: `Person` в `lib/rod/types.ts` с `parents?: string[]`, `siblingOf?: string`, `relation` (текст: мама, бабушка…), `gender`, имя по частям. Нет полей «линия мамы/папы» и «супруг».
- Старое древо: `components/rod/family-tree.tsx` + `lib/rod/family-tree.ts` (`familyLevels`), вкладка в `archive.tsx`.
- Фото у нас хранятся ссылкой на медиа (`useMedia(ref)`), у Грока строкой data URL.

## План интеграции (согласовать с Дариной перед большим кодом)
1. Источник правды: основной список `people`. Добавить в Person: `line?: "mom" | "dad"` (для предков и дядь/тёть) и `partnerOf?` (супруг). В форме «Люди» для бабушек/дедушек/дядь/тёть спрашивать «по маминой или папиной линии».
2. Адаптер `people -> TreeData` (союзы из parents[], partnerOf, связи по relation+line: мама/папа родители «я», бабушки/дедушки родители мамы или папы по line, дяди/тёти дети дедушек и бабушек линии, братья/сёстры дети родителей и т.д.).
3. Скопировать чистые библиотеки в `kniga-src/src/lib/tree/` и виды в `components/tree/`, убрать серверное и localStorage-ключ Грока; фото через `useMedia`.
4. Платное (`programOpen`): все стили кроме `work`, поиск по архивам, ИИ. Бесплатно: схема.
5. Правки в древе (добавить родственника) писать обратно в основной список людей.
6. Проверка на ширине 375, потом деплой по обычной схеме (отдельная ветка от origin/main, сборка `npm run build:pages`, PR, merge).

## Параллельно запущено
- Помощник по кистям: рабочая копия `~/Downloads/prilozhuha-brushes`, ветка `claude/kniga-brushes` (без сборки и деплоя). Результат смотреть там: `git -C ~/Downloads/prilozhuha-brushes log --oneline origin/main..HEAD`.

## Ничего из древа ещё не сделано в коде приложения
Только чтение. Изменений в kniga-src для древа нет.

## Напоминания по работе
- Деплой сайта: см. `~/Documents/BRAIN/ACCOUNTS/КНИГА РОДА/APP_KNIGA_RODA.md` (раздел про схему деплоя через PR), `.env.production` с адресом сервера в git есть.
- Запуск превью: терминал `cd ~/Downloads/prilozhuha-update/kniga-src && npm run dev`, открывать http://localhost:8080/, проверять заголовок «Книга рода».

## Итог помощника по кистям (получен 2026-10-26)
- У Грока кисти слабее наших: растровый движок на 150 строк (4 кисти, ластик, размытие, отмена снимками, заливка). Наш движок векторный: 14 кистей, нажим пера, ластик по линиям, распознавание фигур. Переносить растровую часть нельзя (ломает печать и хранение штрихов).
- Перенесено одно: быстрые размеры в px под ползунком кисти и ластика (пункт 4.2). Коммит 06a8f2f в ветке `claude/kniga-brushes` (`ink.ts`: `sizePresets`, `editor-bars.tsx`). tsc, eslint, npm test чистые. Глазами не проверено (ширина 375, панель стала выше на ~12 px), не собрано в kr и не выложено.
- Не сделано: подключить заливку контура и свои кисти из PNG из `lib/draw-kit` к редактору (пункт 4.1).
- Баги «ластик мигает» и «жирность не меняется после штриха» не воспроизведены, остаются. Идея: у выбранного рисунка есть только «Тоньше/Толще», нет размера в px.
- Чтобы выложить: проверить панель на 375, затем собрать и выложить по обычной схеме (ветку claude/kniga-brushes влить через PR после проверки).

## Прогресс (2026-10-26, продолжение)
Ветка `claude/kniga-new-tree` от origin/main, не запушена. Сделано: чистые библиотеки Грока в `src/lib/tree/` (без серверных и store), поле `line?: "mom"|"dad"` в Person, адаптер `src/lib/tree/from-people.ts` (`treeFromPeople`: люди -> TreeData, «Я» = `__self`, заготовки Мама/Папа при необходимости, линия бабушек/дядь по `line`) + тест. tsc чистый, 14 тестов зелёные (в `npm test` добавлены).
Осталось: (1) поле «Линия» в форме человека (`person-fields.tsx`) для бабушек/дедушек/дядь/тёть; (2) виды `components/tree/*` + `TreeStage`, store на основе `useRod` вместо localStorage Грока, фото через `useMedia`; (3) замена вкладки «Древо» в `archive.tsx`, платные стили по `programOpen`; (4) запись правок обратно в people; (5) проверка на 375, PR.
