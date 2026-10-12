// Свои шрифты из файла (например, почерк бабушки, собранный из сканов в Calligraphr): хранятся рядом с картинками, подключаются при запуске.
import { resolveMedia, saveMedia } from "@/lib/rod/media";
import type { CustomFontEntry } from "@/lib/rod/types";

const loaded = new Set<string>();

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
