// Настройки, которые Дарина меняет сама (или просит Claude).

/** Ссылка на оплату программы (Продамус, ЮKassa, Тинькофф и т. п.). Пусто — кнопка оплаты скрыта. */
export const PAY_URL = "";

/**
 * Коды доступа к платным урокам. После оплаты покупатель получает код и вводит его в приложении.
 * Регистр и пробелы не важны.
 */
export const ACCESS_CODES = ["КНИГА"];

/**
 * Видео уроков: id урока → ссылка. Подходят YouTube, Vimeo, Kinescope, Rutube или прямая ссылка на .mp4.
 * Пока ссылки нет, в уроке видно место под видео.
 */
export const LESSON_VIDEO: Record<string, string> = {
  start: "",
  interview: "",
  maiden: "",
  photo: "",
  places: "",
  chapter: "",
  assemble: "",
};

export function checkCode(input: string): boolean {
  const clean = input.trim().toUpperCase().replace(/\s+/g, "");
  return ACCESS_CODES.some((code) => code.toUpperCase().replace(/\s+/g, "") === clean);
}

/** Превращает обычную ссылку на видео в ссылку для встраивания. */
export function embedUrl(url: string): { kind: "iframe" | "video"; src: string } | null {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{6,})/);
  if (yt) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&playsinline=1` };
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { kind: "iframe", src: `https://player.vimeo.com/video/${vimeo[1]}` };
  const rutube = url.match(/rutube\.ru\/video\/([\w]+)/);
  if (rutube) return { kind: "iframe", src: `https://rutube.ru/play/embed/${rutube[1]}` };
  if (/kinescope\.io/.test(url)) return { kind: "iframe", src: url.replace("kinescope.io/", "kinescope.io/embed/").replace("/embed/embed/", "/embed/") };
  return { kind: "video", src: url };
}
