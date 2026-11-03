import { useSyncExternalStore } from "react";

// Избранные шрифты: звёздочка в окне «Шрифты». Хранятся на устройстве (как остальные настройки панели) и показываются рядом с «Почерк бабушки».
const KEY = "kniga-font-favs";
const listeners = new Set<() => void>();
let cache: string[] | null = null;

/** Разбор сохранённого значения: только непустые уникальные строки, чужое и битое отбрасывается. */
export function parseFavs(raw: string | null): string[] {
  try {
    const data = JSON.parse(raw ?? "[]") as unknown;
    if (!Array.isArray(data)) return [];
    return [...new Set(data.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length < 80))];
  } catch {
    return [];
  }
}

/** Добавляет шрифт в избранное или убирает, если он уже там. Новые идут в конец. */
export function toggleFavList(list: string[], ref: string): string[] {
  return list.includes(ref) ? list.filter((item) => item !== ref) : [...list, ref];
}

function read(): string[] {
  if (cache) return cache;
  try {
    cache = parseFavs(localStorage.getItem(KEY));
  } catch {
    cache = [];
  }
  return cache;
}

export function toggleFavFont(ref: string): void {
  cache = toggleFavList(read(), ref);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* без запоминания избранное живёт до закрытия приложения */
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Список избранных шрифтов (ссылки вида «custom:bristol»), обновляется сразу везде, где показан. */
export function useFavFonts(): string[] {
  return useSyncExternalStore(subscribe, read, () => []);
}
