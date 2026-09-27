// ============================================================
//  ЗАПОЛНИ ЭТОТ ФАЙЛ — всё остальное подтянется автоматически
// ============================================================
window.PITCH_CONFIG = {
  family: {
    mom: "Darina",
    dad: "Dima",
    kid: "Mark",
  },

  // Соцсети. followers — строкой ("48K"); пусто "" — цифра не показывается
  socials: [
    { label: "Instagram · Photo & video", handle: "@zhiphotos", url: "https://www.instagram.com/zhiphotos/", followers: "31K" },
    // { label: "Instagram · Family", handle: "@family_handle", url: "https://instagram.com/family_handle", followers: "" },
    // { label: "YouTube · Family vlog", handle: "Our Channel", url: "https://youtube.com/@your_channel", followers: "" },
  ],

  // Цифры охватов. Пока null — блок скрыт. Когда будут реальные цифры:
  // stats: { reach: "1.2M", views: "150K", audience: "RU · EN · CIS" },
  stats: { reach: "31K", women: "87%", age: "74%", reel: "352K" },

  // Отзыв клиента (Freedom / Пицунда / Clever). Пока quote пустой — блок скрыт.
  testimonial: { quote: "", name: "", role: "", place: "" },

  contact: {
    email: "darinazizina@gmail.com",
    whatsapp: "79622028885",              // номер без + , например 79001234567
    telegram: "+79622028885",              // ник без @
    instagram: "zhiphotos",
  },

  // Файлы кладёшь в папку dusit/media/ с этими именами.
  // Если файла нет — показывается аккуратная заглушка (или блок скрыт).
  media: {
    hero: "media/hero.mp4",          // горизонтальное видео 10–20 сек, без звука (необязательно)
    heroPoster: "",
    family: "media/family.jpg",
    mom: "media/mom.jpg",
    dad: "media/dad.jpg",
    mark: "media/mark.jpg",
    // ИИ-концепты с отелем. Кладёшь файлы в dusit/media/ai/ — блок появится сам.
    // Видео вертикальные 9:16, до ~8 МБ каждое (подписи к ним — в i18n: tz.c1..c3)
    teasers: ["media/ai/video1.mp4", "media/ai/video2.mp4", "media/ai/video3.mp4"],
    // ИИ-фото для блока «Подарок» (по порядку карточек 1–10). Можно дать несколько фото на карточку: ["a.jpg", "b.jpg"]
    aiPhotos: [
      "media/ai/photo1.jpg", "media/ai/photo2.jpg", ["media/ai/photo3.jpg", "media/ai/photo3b.jpg"],
      "media/ai/photo4.jpg", "media/ai/photo5.jpg", "media/ai/photo6.jpg",
      "media/ai/photo7.jpg", "media/ai/photo8.jpg", "media/ai/photo9.jpg",
      ["media/ai/photo10c.jpg", "media/ai/photo10.jpg", "media/ai/photo10b.jpg"],
    ],
    // ИИ-работы для клиентов (фото jpg / видео mp4) — кладёшь в dusit/media/clients/
    clientWorks: [
      "media/clients/work1.jpg", "media/clients/work2.jpg", "media/clients/work3.jpg",
      "media/clients/work4.jpg", "media/clients/work5.jpg", "media/clients/work6.jpg",
      "media/clients/video1.mp4", "media/clients/video2.mp4", "media/clients/video3.mp4",
    ],
    // Дополнительные работы (необязательно) — основное портфолио уже в media/pf/
    portfolio: [],
  },
};
