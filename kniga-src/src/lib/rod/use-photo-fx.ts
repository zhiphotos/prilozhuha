import { useEffect, useState } from "react";
import { PREVIEW_SIDE, cachedFx, cleanFx, fxKey, type PhotoFx } from "@/lib/rod/photo-fx";

// Экранная версия фото с эффектом: уменьшенная (для телефона), готовая картинка кэшируется. Пока считается, показываем оригинал.
const READY = new Map<string, string>();
const LIMIT = 12;

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function useFxSrc(src: string, fx: unknown): string {
  const clean = cleanFx(fx);
  const key = clean && src ? `${src.length}:${src.slice(-40)}|${fxKey(clean)}` : "";
  const [done, setDone] = useState<{ key: string; url: string }>({ key: "", url: "" });
  useEffect(() => {
    if (!key || !clean) return;
    const hit = READY.get(key);
    if (hit) {
      setDone({ key, url: hit });
      return;
    }
    let alive = true;
    // Небольшая задержка: при движении ползунка считается только последнее значение.
    const timer = window.setTimeout(() => {
      void load(src).then((img) => {
        if (!alive || !img) return;
        const url = cachedFx(src, img, clean, PREVIEW_SIDE).toDataURL("image/jpeg", 0.92);
        READY.set(key, url);
        while (READY.size > LIMIT) READY.delete(READY.keys().next().value as string);
        setDone({ key, url });
      });
    }, 120);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, src]);
  if (!key) return src;
  return done.key === key ? done.url : (READY.get(key) ?? src);
}

export type { PhotoFx };
