// ============================================================
//  ЗАПОЛНИ ЭТОТ ФАЙЛ — всё остальное подтянется автоматически
// ============================================================
window.PITCH_CONFIG = {
  family: {
    mom: "Anna",        // имя мамы (латиницей)
    dad: "Max",         // имя папы
    kid: "Mark",
    kidAge: "3",        // возраст Марка
  },

  // Соцсети. followers — строкой, как хочешь показать ("48K", "1.2M")
  socials: [
    { label: "Instagram · Mom", handle: "@your_mom_handle", url: "https://instagram.com/your_mom_handle", followers: "00K" },
    { label: "Instagram · Dad", handle: "@your_dad_handle", url: "https://instagram.com/your_dad_handle", followers: "00K" },
    { label: "Instagram · Family", handle: "@family_handle", url: "https://instagram.com/family_handle", followers: "00K" },
    { label: "YouTube · Family vlog", handle: "Our Channel", url: "https://youtube.com/@your_channel", followers: "00K" },
  ],

  // Цифры в блоке статистики
  stats: {
    reach: "0.0M",      // суммарный охват за 30 дней
    views: "000K",      // средние просмотры рилса
    audience: "RU · EN · CIS", // география аудитории
  },

  contact: {
    email: "your@email.com",
    whatsapp: "66000000000",   // номер без + (Тайланд 66…)
    telegram: "your_telegram",
  },

  // Файлы кладёшь в папку dusit/media/ с этими именами.
  // Если файла нет — показывается красивая заглушка.
  media: {
    hero: "media/hero.mp4",          // горизонтальное видео 10–20 сек, без звука
    heroPoster: "media/hero.jpg",
    family: "media/family.jpg",
    mom: "media/mom.jpg",
    dad: "media/dad.jpg",
    mark: "media/mark.jpg",
    // Тизеры, снятые УЖЕ у отеля (вертикальные 9:16)
    teasers: ["media/teaser1.mp4", "media/teaser2.mp4", "media/teaser3.mp4"],
    // Портфолио: любые лучшие работы (jpg/png/mp4)
    portfolio: [
      "media/work1.jpg", "media/work2.jpg", "media/work3.jpg",
      "media/work4.jpg", "media/work5.mp4", "media/work6.jpg",
    ],
  },
};
