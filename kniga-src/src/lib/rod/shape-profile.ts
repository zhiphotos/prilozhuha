// Контур картинки по прозрачности: для каждой горизонтальной полосы запоминаем, где начинается и кончается непрозрачное.
// По нему текст обтекает стикер по форме (сердце, листок), а не по квадрату вокруг.
import { useSyncExternalStore } from "react";

export const PROFILE_ROWS = 48;
const COLS = 96;
/** Для каждой полосы сверху вниз: левый и правый край непрозрачного (0..1 от ширины) или null, если полоса пустая. */
export type Profile = ([number, number] | null)[];

const cache = new Map<string, Profile | null>();
const pending = new Map<string, Promise<Profile | null>>();
const listeners = new Set<() => void>();
let version = 0;

/** Уже посчитанный контур, null – если контур не получился (тогда обтекаем по рамке), undefined – ещё грузится. */
export function profileOf(url: string): Profile | null | undefined {
  if (!url) return null;
  return cache.get(url);
}

export function loadProfile(url: string): Promise<Profile | null> {
  if (!url) return Promise.resolve(null);
  if (cache.has(url)) return Promise.resolve(cache.get(url) ?? null);
  const wait = pending.get(url);
  if (wait) return wait;
  const job = new Promise<Profile | null>((resolve) => {
    const done = (profile: Profile | null) => {
      cache.set(url, profile);
      pending.delete(url);
      version += 1;
      listeners.forEach((fn) => fn());
      resolve(profile);
    };
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = COLS;
        canvas.height = PROFILE_ROWS;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return done(null);
        ctx.drawImage(img, 0, 0, COLS, PROFILE_ROWS);
        const data = ctx.getImageData(0, 0, COLS, PROFILE_ROWS).data;
        const rows: Profile = [];
        let any = false;
        for (let y = 0; y < PROFILE_ROWS; y += 1) {
          let min = -1;
          let max = -1;
          for (let x = 0; x < COLS; x += 1) {
            if (data[(y * COLS + x) * 4 + 3] > 40) {
              if (min < 0) min = x;
              max = x;
            }
          }
          if (min < 0) rows.push(null);
          else {
            any = true;
            rows.push([min / COLS, (max + 1) / COLS]);
          }
        }
        done(any ? rows : null);
      } catch {
        done(null);
      }
    };
    img.onerror = () => done(null);
    img.src = url;
  });
  pending.set(url, job);
  return job;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Меняется, когда досчитался новый контур: по нему страница пересобирает обтекание. */
export function useProfilesVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}
