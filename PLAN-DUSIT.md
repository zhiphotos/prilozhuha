# Dusit Thani Laguna Phuket — план питча

**Кто мы:** Дарина (блогер и фотограф, @zhiphotos), Дима (монтирует YouTube-видео для известных российских блогеров), Марк.
**Что просим:** 7–10 ночей подряд в период **5–20 октября** (без пилотов — едем с ребёнком), один номер на 2 взрослых + 1 ребёнка, **проживание с питанием**. Билеты ещё не куплены — даты подстраиваем под отель.
**Что даём:** контент **для их аккаунтов** (Instagram, сайт, реклама), обучение персонала работе с ИИ, наши рилсы и сторис с отметкой отеля, влог на YouTube. После отъезда — удалённо досылаем ИИ-контент и, если зайдёт, продолжаем сотрудничество онлайн.

Сайт (Vercel): **https://dusit-laguna-creative-partnership.vercel.app** — ссылка для отеля. Исходники: `dusit/` (EN / ไทย / RU). После мержа в `main`: `https://zhiphotos.github.io/prilozhuha/dusit/`
Ссылки на язык: `?lang=th`, `?lang=ru`.

---

## Главные аргументы для отеля
1. **Октябрь — тихий сезон.** Гостей мало → снимаем свободно и никому не мешаем. Им не жалко номер, а свежий контент будет готов **ровно к высокому сезону** (ноябрь–апрель).
2. **Контент для них, а не реклама нас.** Рилсы на их аккаунт, фото номеров для сайта / Booking.com / Agoda / Expedia, фото ресторана, съёмка с дрона.
3. **Русскоязычный рынок** — один из крупнейших на Пхукете, и это наша аудитория.
4. **У отеля слабый Instagram** — @dusitthanilagunaphuket, около 8.4K подписчиков. Продукт сильный, а контента мало.
5. **Витрина «12 вещей за один номер»:** рилсы, фото, дрон, влог, аудит контента и стратегия виральности (Дарина — преподаватель), готовый контент-план каруселей, ИИ-курс для персонала, ИИ-ассистент для гостей, веб-приложение.
6. **Не исчезаем после выезда:** удалённый ИИ-контент, обученная команда.
7. **Безопасность бренда:** всё на согласование, номера и еду ИИ не меняем, чужих гостей не снимаем, дрон только с разрешения.

---

## Шаг 1. ИИ-фотосессия и ИИ-видео с отелем (главный «вау»)
Сайт уже готов их показать: кладёте файлы в `dusit/media/ai/` — и блок «ИИ-концепты» появляется сам.

| Файл | Что это |
|---|---|
| `photo1.jpg` … `photo9.jpg` | ИИ-фотосессия: ваша семья в отеле (сколько сделаете — столько и покажется) |
| `video1.mp4`, `video2.mp4`, `video3.mp4` | ИИ-видео 9:16, 5–15 сек, до ~8 МБ каждое |

Подписи к видео меняются в `dusit/i18n.js` и `index.html` (ключи `tz.c1`–`tz.c3`). Сейчас там:
1. «Первый день Марка в детском клубе»
2. «Закат на Банг Тао в стиле живописи»
3. «Один рилс на EN / TH / RU»

**Как делать:**
- Исходники: ваши реальные фото (лица, одежда в одном стиле — льняное белое/бежевое) + публичные фото отеля (сайт, Google Maps, Tripadvisor, их Instagram).
- Фото: Nano Banana / GPT Image / Midjourney (с референсом лица) → ретушь в Lightroom в вашей фирменной гамме.
- Видео: Kling / Veo / Runway / Hailuo из лучших ИИ-фото (image-to-video), 5–10 сек, плавная камера. Сверху монтаж Димы: музыка, титры.

**Сцены (промпты-идеи, писать на английском):**
- `young family (mother, father, toddler boy about three years old) walking barefoot on Bang Tao beach at sunrise, luxury Thai resort with traditional roofs behind, soft golden light, linen clothes, editorial travel photography`
- `mother and son at a lagoon-side infinity pool, tropical gardens, Thai pavilion, candid laughter, 35mm film look`
- `family dinner with a toddler in a Thai teak house over the lagoon, candlelight`
- `family dinner on a beach deck at sunset, lanterns, Andaman sea, cinematic`
- `toddler with parents at a lagoon-side pool at sunset, lanterns, warm light` (Марку почти 3 — сцены только с родителями)
- `parents at a Thai spa pavilion among frangipani trees, serene, luxury wellness`
- `aerial view of a beachfront resort with lagoons and palm trees, family on the beach` (видео)

**Важно:**
- На сайте есть подпись: «ИИ-концепты созданы до поездки на основе публичных фото отеля». Не убирайте её — так честно, и отель не испугается.
- Логотипы и название отеля на картинках не рисовать.
- Эти ИИ-материалы — только для питча. Публиковать их в своих соцсетях до договорённости с отелем нельзя.

## Шаг 2. Заполнить сайт
1. `dusit/config.js`: WhatsApp и Telegram (+7 962 202-88-85) и 30K подписчиков уже вписаны. Осталось: почта, YouTube-канал (строка закомментирована), охваты/просмотры рилсов, если есть цифры.
2. Семейные фото: `dusit/media/family.jpg` (4:5), `darina`/`dima`/`mark` → файлы `mom.jpg`, `dad.jpg`, `mark.jpg`. Без них блок показывает только текст. **Агент по маркетингу:** без семейного фото не отправлять.
3. Тайский текст показать носителю языка.
4. Слить ветку в `main` → проверить с телефона все 3 языка.

## Шаг 3. Кому писать
- **Director of Sales & Marketing** + **Marketing Communications Manager** (имена — в LinkedIn), копия — Cluster PR. Не на общий info@.
- Параллельно — короткий DM в Instagram отеля и сообщение в LinkedIn.

## Шаг 4. Письмо (EN, максимум 5–6 строк, 3 ИИ-фото прямо в теле письма)

> **Subject:** October content for Dusit Thani Laguna Phuket — family creators, barter with meals
>
> Dear [Name],
>
> We're Darina and Dima, a Russian creator family (photographer/blogger and YouTube editor for well-known Russian creators), travelling with our son Mark. We'd love to create content for **your** Instagram, website and ads — Reels, room and restaurant photos, drone — plus train your team to produce AI content themselves.
>
> We're planning Phuket for **5–20 October** and would ask for **7–10 nights with meals included**, dates to suit your occupancy. We've already made a few AI concepts of your resort — they're in the proposal (EN / TH / RU): **[link]**
>
> Could we have a 15-minute call this week?
>
> Warm regards, Darina & Dima · [WhatsApp] · @zhiphotos

## Шаг 5. Фоллоу-ап
- Через 4–5 дней: новое сообщение **с новой ценностью** — ещё 2–3 ИИ-концепта.
- Через 10 дней: последнее короткое сообщение.
- Параллельно отправить предложение 2–3 другим отелям Laguna / Банг Тао: когда есть альтернативы, решение принимается быстрее.

---

## Что ещё советует агент по маркетингу (стоит сделать)
- **Оценка в деньгах:** затраты отеля с сайта убраны по решению Дарины; на сайте осталась только ценность выбранной пары задач (THB 80–280K). Было: на сайте блок «Ваши затраты ≈ THB 22–38K» (7–10 ночей по их ценам от 3 096 бат) против «Что вы получаете THB 500K+» с разбивкой. Если узнаете реальный октябрьский тариф — поправить цифры в `dusit/index.html` (блок `.value`).
- **Цифры аудитории:** если их пока мало — позиционироваться как продакшн-студия, а не инфлюенсеры (сайт уже сделан в этом ключе).
- **Отзыв:** одна цитата от Freedom / Пицунды / Clever + контакт.
- **Договор:** даты, номер, количество единиц контента, сроки сдачи, права (где и сколько отель может использовать), что будет при досрочном завершении.
- **Обучение персонала:** на месте только снимаем демо-материалы, само обучение — онлайн. Иностранцам без Work Permit проводить тренинги в отеле рискованно.

## Чек-лист перед отправкой
- [ ] ИИ-фото и ИИ-видео с отелем лежат в `dusit/media/ai/`
- [ ] Семейное фото + портреты
- [ ] `config.js`: контакты, подписчики, соцсети
- [ ] Тайский проверен носителем
- [ ] Сайт открыт с телефона на EN / TH / RU
- [ ] Найдены конкретные люди в маркетинге
- [ ] Письмо отправлено, дата фоллоу-апа записана
