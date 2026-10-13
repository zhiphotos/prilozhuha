// Кадрирование: какая часть фото видна в рамке. Центр (cx, cy) в долях картинки, z – приближение.
import { POLAROID } from "@/lib/rod/page-style";
import type { PhotoFrame } from "@/lib/rod/types";

export type Crop = { cx: number; cy: number; z: number };

/** Внутренняя область рамки, где лежит картинка, в % страницы. */
export function innerBox(frame: PhotoFrame, plain: boolean, w: number, h: number): { w: number; h: number; dx: number; dy: number } {
  if (frame === "polaroid") {
    const side = (POLAROID.side * w) / 100;
    const top = (POLAROID.top * w) / 100;
    const bottom = (POLAROID.bottom * w) / 100;
    return { w: w - side * 2, h: h - top - bottom, dx: side, dy: top };
  }
  if (frame === "sticker" && !plain) return { w: w - 2.8, h: h - 2.8, dx: 1.4, dy: 1.4 };
  return { w, h, dx: 0, dy: 0 };
}

/** ar – высота/ширина самой картинки. Возвращает размер и сдвиг картинки внутри области. */
export function cropGeom(inner: { w: number; h: number }, arIn: number, crop: Crop) {
  const ar = arIn > 0 && Number.isFinite(arIn) ? arIn : 1;
  crop = { cx: Number.isFinite(crop.cx) ? crop.cx : 0.5, cy: Number.isFinite(crop.cy) ? crop.cy : 0.5, z: Number.isFinite(crop.z) ? crop.z : 1 };
  const z = Math.min(6, Math.max(1, crop.z));
  const dw = Math.max(inner.w, inner.h / ar) * z;
  const dh = dw * ar;
  const fx = inner.w / dw / 2;
  const fy = inner.h / dh / 2;
  const cx = Math.min(1 - fx, Math.max(fx, crop.cx));
  const cy = Math.min(1 - fy, Math.max(fy, crop.cy));
  return { dw, dh, left: inner.w / 2 - cx * dw, top: inner.h / 2 - cy * dh, cx, cy, z };
}
