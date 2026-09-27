// ============================================================
//  ЗАПОЛНИ ЭТОТ ФАЙЛ — всё остальное подтянется автоматически
// ============================================================
window.PITCH_CONFIG = {
  family: {
    mom: "Mom",         // имя мамы (латиницей)
    dad: "Dad",         // имя папы
    kid: "Mark",
  },

  // Соцсети. followers — строкой ("48K"); пусто "" — цифра не показывается
  socials: [
    { label: "Instagram · Photo & video", handle: "@zhiphotos", url: "https://instagram.com/zhiphotos", followers: "" },
    // { label: "Instagram · Family", handle: "@family_handle", url: "https://instagram.com/family_handle", followers: "" },
    // { label: "YouTube · Family vlog", handle: "Our Channel", url: "https://youtube.com/@your_channel", followers: "" },
  ],

  // Цифры охватов. Пока null — блок скрыт. Когда будут реальные цифры:
  // stats: { reach: "1.2M", views: "150K", audience: "RU · EN · CIS" },
  stats: null,

  contact: {
    email: "",                 // your@email.com — пусто = кнопка скрыта
    whatsapp: "",              // номер без + , например 79001234567
    telegram: "",              // ник без @
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
    // ИИ-концепты для отеля (вертикальные 9:16). Пока файлов нет — секция скрыта.
    teasers: ["media/teaser1.mp4", "media/teaser2.mp4", "media/teaser3.mp4"],
    // Дополнительные работы (необязательно) — основное портфолио уже в media/pf/
    portfolio: [],
  },
};
