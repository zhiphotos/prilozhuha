// Свои шрифты из файла (например, почерк бабушки, собранный из сканов в Calligraphr): хранятся рядом с картинками, подключаются при запуске.
import { resolveMedia, saveMedia } from "@/lib/rod/media";
import type { CustomFontEntry } from "@/lib/rod/types";

const loaded = new Set<string>();

/** Шрифты, которые идут в комплекте с приложением. «Почерк бабушки» её собственный; в нём нет «!», «?», «-» и латиницы, их дорисует обычный шрифт. */
export const BUILTIN_FONTS = [{ id: "babushka", name: "Почерк бабушки", file: "fonts/pocherk-babushki.ttf" }] as const;

export async function registerBuiltinFonts(): Promise<void> {
  if (typeof document === "undefined") return;
  for (const font of BUILTIN_FONTS) {
    if (loaded.has(font.id)) continue;
    try {
      const face = new FontFace(`kr-${font.id}`, `url(${font.file})`);
      await face.load();
      document.fonts.add(face);
      loaded.add(font.id);
    } catch {
      /* без этого шрифта текст рисуется обычным */
    }
  }
}

export async function registerFont(entry: CustomFontEntry): Promise<boolean> {
  if (typeof document === "undefined" || loaded.has(entry.id)) return true;
  try {
    const url = await resolveMedia(entry.ref);
    if (!url) return false;
    const face = new FontFace(`kr-${entry.id}`, `url(${url})`);
    await face.load();
    document.fonts.add(face);
    loaded.add(entry.id);
    return true;
  } catch {
    return false;
  }
}

export async function importFont(file: File): Promise<CustomFontEntry> {
  if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) throw new Error("Нужен файл шрифта: .ttf, .otf, .woff или .woff2");
  if (file.size > 8 * 1024 * 1024) throw new Error("Файл больше 8 МБ");
  const ref = await saveMedia(file);
  const entry: CustomFontEntry = { id: crypto.randomUUID().slice(0, 8), name: file.name.replace(/\.[^.]+$/, ""), ref };
  if (!(await registerFont(entry))) throw new Error("Этот файл не открылся как шрифт");
  return entry;
}

// ——— Библиотека шрифтов для страниц: подгружается только когда шрифт выбран или уже стоит на странице ———

const CYR = "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116";
const LAT = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215";

export type LibFont = { id: string; name: string; group: "Рукописные" | "Заголовочные" | "С засечками"; files: { file: string; range?: string }[] };

const two = (name: string) => [
  { file: `fonts/lib/${name}-cyrillic.woff2`, range: CYR },
  { file: `fonts/lib/${name}-latin.woff2`, range: LAT },
];

export const FONT_LIBRARY: LibFont[] = [
  { id: "brusnika", name: "Брусника", group: "Рукописные", files: [{ file: "fonts/lib/brusnika.otf" }] },
  { id: "nautilus", name: "Наутилус", group: "Рукописные", files: [{ file: "fonts/lib/nautilus.otf" }] },
  { id: "zull-wettis", name: "Zull Wettis", group: "Рукописные", files: [{ file: "fonts/lib/zull-wettis.otf" }] },
  { id: "marck-script", name: "Marck Script", group: "Рукописные", files: two("marck-script") },
  { id: "bad-script", name: "Bad Script", group: "Рукописные", files: two("bad-script") },
  { id: "pacifico", name: "Pacifico", group: "Рукописные", files: two("pacifico") },
  { id: "amatic-sc", name: "Amatic SC", group: "Рукописные", files: two("amatic-sc") },
  { id: "yauza", name: "Яуза", group: "Заголовочные", files: [{ file: "fonts/lib/yauza.ttf" }] },
  { id: "santa-catarina", name: "Santa Catarina", group: "Заголовочные", files: [{ file: "fonts/lib/santa-catarina.ttf" }] },
  { id: "akony", name: "Akony", group: "Заголовочные", files: [{ file: "fonts/lib/akony.woff2" }] },
  { id: "old-standard", name: "Old Standard", group: "С засечками", files: [{ file: "fonts/lib/old-standard.ttf" }] },
  { id: "playfair-display", name: "Playfair Display", group: "С засечками", files: two("playfair-display") },
  { id: "lora", name: "Lora", group: "С засечками", files: two("lora") },
];

export const libFont = (id: string) => FONT_LIBRARY.find((item) => item.id === id);

const pending = new Map<string, Promise<void>>();

/** Подключает шрифт из библиотеки (один раз). Без него текст рисуется обычным шрифтом. */
export function ensureLibraryFont(id: string): Promise<void> {
  const font = libFont(id);
  if (!font || typeof document === "undefined") return Promise.resolve();
  const have = pending.get(id);
  if (have) return have;
  const job = (async () => {
    for (const part of font.files) {
      try {
        const face = new FontFace(`kr-${id}`, `url(${part.file})`, part.range ? { unicodeRange: part.range } : undefined);
        await face.load();
        document.fonts.add(face);
      } catch {
        /* нет файла: останется запасной шрифт */
      }
    }
  })();
  pending.set(id, job);
  return job;
}

/** Идентификаторы шрифтов библиотеки, которые используются в наборе блоков (и в корешке). */
export function libraryIdsIn(fonts: (string | undefined)[]): string[] {
  const ids = new Set<string>();
  for (const font of fonts) if (font?.startsWith("custom:") && libFont(font.slice(7))) ids.add(font.slice(7));
  return [...ids];
}
