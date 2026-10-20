// Настройки, которые Дарина меняет сама (или просит Claude).

/** Ссылка на оплату программы (Продамус, ЮKassa, Тинькофф и т. п.). Пусто – кнопка оплаты скрыта. */
export const PAY_URL = "";

/**
 * Коды доступа к платным урокам. После оплаты покупатель получает код и вводит его в приложении.
 * Регистр и пробелы не важны.
 */
// Общих кодов в приложении нет: личные коды выдаёт сервер (/api/redeem), у каждого свой, и они отзываются.
export const ACCESS_CODES: string[] = [];

/**
 * Адрес серверной части (папка kniga-api, проект на Vercel), например "https://kniga-roda-api.vercel.app".
 * Пока пусто, оплата картой скрыта и работает только ввод кода. Как подключить: kniga-api/README.md.
 */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

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

/** Урок → ключ файла в общей папке и имя файла. Ключ видно в адресе файла, когда открываешь его в Dropbox. */
const DROPBOX_FILES: Record<string, { key: string; name: string }> = {
  l1: { key: "AFF2TZN0hVm7_7S9Uuxl--0", name: "urok-1.mp4" },
  l2: { key: "ADW867TNUWZncm83Txkf8E8", name: "urok-2.mp4" },
  l3: { key: "AHbeFJ6oiQW8LJfysVgQiUY", name: "urok-3.mp4" },
  l4: { key: "AG5U0nqJr1E1QJFkuAQm-Iw", name: "urok-4.mp4.part.mp4" },
  l5: { key: "ALwGtRdPrgUAzWx99DrA3Vo", name: "urok-5.mp4" },
  l6: { key: "ABiZqWy79N7M9W-mBgfbCiA", name: "urok-6.mp4.part.mp4" },
};
const DROPBOX_QUERY = "rlkey=v1ln94f0d92njb8i57fu70io7&st=p93yv3ps";

/** Адрес, который проигрывается прямо в приложении (тег video), и запасной адрес страницы Dropbox. */
export function dropboxLessonVideo(lessonId: string): { stream: string; page: string } | null {
  const file = DROPBOX_FILES[lessonId];
  if (!file) return null;
  const base = `https://www.dropbox.com/scl/fo/nzjex04qtrfybe9wfip7y/${file.key}/${file.name}?${DROPBOX_QUERY}`;
  return { stream: `${base}&raw=1`, page: `${base}&dl=0` };
}

/** Вступительное видео с сайта программы (YouTube). */
export const INTRO_VIDEO = "https://www.youtube.com/watch?v=TOz2-eyQGPA";

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
