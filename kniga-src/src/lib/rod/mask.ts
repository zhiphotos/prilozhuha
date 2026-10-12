// Ластик для текста, фото и стикеров: стёртое запоминается кругами по линии и применяется как маска.
import type { CSSProperties } from "react";
import type { EraseMask } from "@/lib/rod/types";

const f = (v: number) => Math.round(v * 100) / 100;

function maskSvg(mask: EraseMask): string {
  const h = Math.max(1, mask.h);
  const lines = mask.strokes
    .map((s) => {
      const d = s.pts.length >= 4 ? s.pts.reduce((acc, v, i) => acc + (i % 2 === 0 ? `${i ? "L" : "M"}${f(v)} ` : `${f(v)}`), "") : `M${f(s.pts[0])} ${f(s.pts[1])}L${f(s.pts[0] + 0.01)} ${f(s.pts[1])}`;
      return `<path d="${d}" fill="none" stroke="#000" stroke-width="${f(s.r * 2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="${f(h)}" viewBox="0 0 100 ${f(h)}" preserveAspectRatio="none"><defs><mask id="m"><rect width="100" height="${f(h)}" fill="#fff"/>${lines}</mask></defs><rect width="100" height="${f(h)}" fill="#000" mask="url(#m)"/></svg>`;
}

export function maskDataUrl(mask: EraseMask): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(maskSvg(mask))}`;
}

/** CSS-маска по готовому адресу картинки. */
export function maskStyleFromUrl(href: string): CSSProperties {
  const url = `url("${href}")`;
  return {
    WebkitMaskImage: url,
    maskImage: url,
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  };
}

/** CSS-маска блока (или ничего, если ластиком ещё не касались). */
export function maskStyle(mask: EraseMask | undefined): CSSProperties | undefined {
  if (!mask || !mask.strokes.length) return undefined;
  return maskStyleFromUrl(maskDataUrl(mask));
}

/** Для печати: превращает маску в картинку с прозрачными дырами, которой вырезаем блок с холста. */
export function maskImageUrl(mask: EraseMask): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(maskSvg(mask))}`;
}
