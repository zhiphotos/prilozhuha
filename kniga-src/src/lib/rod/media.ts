import { useEffect, useState } from "react";
import { MEDIA_STORE, idbDelete, idbGet, idbSet } from "@/lib/rod/idb";

// Картинки лежат в IndexedDB отдельно от состояния, в состоянии — только ссылка "media:<id>".
// Старые записи с data:URL продолжают работать как есть.

const PREFIX = "media:";
const urls = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

export function isMediaRef(src: string): boolean {
  return src.startsWith(PREFIX);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",", 2);
  const mime = head.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
  const binary = atob(body ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Сохраняет картинку и возвращает ссылку для состояния. */
export async function saveMedia(input: Blob | string): Promise<string> {
  const blob = typeof input === "string" ? dataUrlToBlob(input) : input;
  const id = crypto.randomUUID();
  await idbSet(MEDIA_STORE, id, blob);
  urls.set(id, URL.createObjectURL(blob));
  return PREFIX + id;
}

/** Адрес, который можно поставить в <img src>. */
export function resolveMedia(src: string): Promise<string> {
  if (!src) return Promise.resolve("");
  if (!isMediaRef(src)) return Promise.resolve(src);
  const id = src.slice(PREFIX.length);
  const ready = urls.get(id);
  if (ready) return Promise.resolve(ready);
  const waiting = pending.get(id);
  if (waiting) return waiting;
  const job = idbGet<Blob>(MEDIA_STORE, id)
    .then((blob) => {
      if (!blob) return "";
      const url = URL.createObjectURL(blob);
      urls.set(id, url);
      return url;
    })
    .catch(() => "")
    .finally(() => pending.delete(id));
  pending.set(id, job);
  return job;
}

/** Синхронно — если картинка уже загружена. */
export function peekMedia(src: string): string {
  if (!src) return "";
  if (!isMediaRef(src)) return src;
  return urls.get(src.slice(PREFIX.length)) ?? "";
}

export function useMedia(src: string | undefined): string {
  const [url, setUrl] = useState(() => peekMedia(src ?? ""));
  useEffect(() => {
    let alive = true;
    const now = peekMedia(src ?? "");
    setUrl(now);
    if (!now && src) {
      void resolveMedia(src).then((next) => {
        if (alive) setUrl(next);
      });
    }
    return () => {
      alive = false;
    };
  }, [src]);
  return url;
}

export async function mediaBlob(src: string): Promise<Blob | null> {
  if (!src) return null;
  if (isMediaRef(src)) return (await idbGet<Blob>(MEDIA_STORE, src.slice(PREFIX.length))) ?? null;
  if (src.startsWith("data:")) return dataUrlToBlob(src);
  const res = await fetch(src).catch(() => null);
  return res ? res.blob() : null;
}

/** data:URL — нужен вырезке фона, которая работает с base64. */
export async function mediaDataUrl(src: string): Promise<string> {
  if (!src || src.startsWith("data:")) return src;
  const blob = await mediaBlob(src);
  if (!blob) return "";
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(blob);
  });
}

export function dropMedia(src: string): void {
  if (!isMediaRef(src)) return;
  const id = src.slice(PREFIX.length);
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
  void idbDelete(MEDIA_STORE, id).catch(() => undefined);
}
