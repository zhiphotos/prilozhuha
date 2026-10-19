// Настройки, которые Дарина меняет сама (или просит Claude).

/** Ссылка на оплату программы (Продамус, ЮKassa, Тинькофф и т. п.). Пусто – кнопка оплаты скрыта. */
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
  l1: "",
  l2: "",
  l3: "",
  l4: "",
  l5: "",
  l6: "",
};

/**
 * Папка с видео уроков в Dropbox. Ссылка на сам файл открывает его просмотр без входа в Dropbox.
 * Урок 1 … 6 программы = urok-1 … urok-6 (urok-4 и urok-6 в папке с пометкой «.part», это недокачанные файлы).
 */
export const DROPBOX_FOLDER = "https://www.dropbox.com/scl/fo/nzjex04qtrfybe9wfip7y/AF1xesGjy07aCaV8m8mJlAY?rlkey=v1ln94f0d92njb8i57fu70io7&st=p93yv3ps";
export const LESSON_DROPBOX_FILE: Record<string, string> = {
  l1: "urok-1.mp4",
  l2: "urok-2.mp4",
  l3: "urok-3.mp4",
  l4: "urok-4.mp4.part.mp4",
  l5: "urok-5.mp4",
  l6: "urok-6.mp4.part.mp4",
};

export function dropboxLessonUrl(lessonId: string): string {
  const file = LESSON_DROPBOX_FILE[lessonId];
  return file ? `${DROPBOX_FOLDER}&preview=${encodeURIComponent(file)}&dl=0` : "";
}

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
