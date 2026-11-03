// Фильтры «в духе плёночных приложений» из открытой библиотеки CSSgram (https://github.com/una/CSSgram).
// Рецепты (цепочка CSS-фильтров и наложенные слои с режимами смешивания) перенесены в пиксельный расчёт, чтобы экран,
// предпросмотр печати и PDF считались одним и тем же кодом (холст Safari не умеет CSS-фильтры).
//
// CSSgram: The MIT License (MIT). Copyright (c) 2015 Una Kravets
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and
// this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED
// "AS IS", WITHOUT WARRANTY OF ANY KIND. Подробности и список взятого: docs/photo-presets-sources.md.

export type Blend = "overlay" | "soft-light" | "lighten" | "darken" | "exclusion" | "color-burn" | "screen" | "multiply";
export type Rgba = [number, number, number, number];
export type Filter = ["contrast" | "brightness" | "saturate" | "sepia" | "hue-rotate", number];
export type Layer = { fill: Rgba | { stops: { c: Rgba; at: number }[] }; blend: Blend; opacity?: number };
export type Recipe = { filters: Filter[]; layers: Layer[] };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const RECIPES = {
  clarendon: { filters: [["contrast", 1.2], ["saturate", 1.35]], layers: [{ fill: [127, 187, 227, 0.2], blend: "overlay" }] },
  gingham: { filters: [["brightness", 1.05], ["hue-rotate", -10]], layers: [{ fill: [230, 230, 250, 1], blend: "soft-light" }] },
  nashville: { filters: [["sepia", 0.2], ["contrast", 1.2], ["brightness", 1.05], ["saturate", 1.2]], layers: [{ fill: [247, 176, 153, 0.56], blend: "darken" }, { fill: [0, 70, 150, 0.4], blend: "lighten" }] },
  valencia: { filters: [["contrast", 1.08], ["brightness", 1.08], ["sepia", 0.08]], layers: [{ fill: [58, 3, 57, 1], blend: "exclusion", opacity: 0.5 }] },
  xpro2: { filters: [["sepia", 0.3]], layers: [{ fill: { stops: [{ c: [230, 231, 224, 1], at: 0.4 }, { c: [43, 42, 161, 0.6], at: 1.1 }] }, blend: "color-burn" }] },
  walden: { filters: [["brightness", 1.1], ["hue-rotate", -10], ["sepia", 0.3], ["saturate", 1.6]], layers: [{ fill: [0, 68, 204, 1], blend: "screen", opacity: 0.3 }] },
  y1977: { filters: [["contrast", 1.1], ["brightness", 1.1], ["saturate", 1.3]], layers: [{ fill: [243, 106, 188, 0.3], blend: "screen" }] },
  earlybird: { filters: [["contrast", 0.9], ["sepia", 0.2]], layers: [{ fill: { stops: [{ c: [208, 186, 142, 1], at: 0.2 }, { c: [54, 3, 9, 1], at: 0.85 }, { c: [29, 2, 16, 1], at: 1 }] }, blend: "overlay" }] },
} satisfies Record<string, Recipe>;

/** Цепочка CSS-фильтров по спецификации (матрицы saturate, sepia, hue-rotate), значения 0..1 по каналам, на месте. */
export function applyFilter(px: [number, number, number], [name, v]: Filter): [number, number, number] {
  const [r, g, b] = px;
  switch (name) {
    case "brightness": return [clamp01(r * v), clamp01(g * v), clamp01(b * v)];
    case "contrast": return [clamp01((r - 0.5) * v + 0.5), clamp01((g - 0.5) * v + 0.5), clamp01((b - 0.5) * v + 0.5)];
    case "saturate": return [
      clamp01((0.213 + 0.787 * v) * r + (0.715 - 0.715 * v) * g + (0.072 - 0.072 * v) * b),
      clamp01((0.213 - 0.213 * v) * r + (0.715 + 0.285 * v) * g + (0.072 - 0.072 * v) * b),
      clamp01((0.213 - 0.213 * v) * r + (0.715 - 0.715 * v) * g + (0.072 + 0.928 * v) * b),
    ];
    case "sepia": { const k = 1 - clamp01(v); return [
      clamp01((0.393 + 0.607 * k) * r + (0.769 - 0.769 * k) * g + (0.189 - 0.189 * k) * b),
      clamp01((0.349 - 0.349 * k) * r + (0.686 + 0.314 * k) * g + (0.168 - 0.168 * k) * b),
      clamp01((0.272 - 0.272 * k) * r + (0.534 - 0.534 * k) * g + (0.131 + 0.869 * k) * b),
    ]; }
    case "hue-rotate": { const a = (v * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return [
      clamp01((0.213 + c * 0.787 - s * 0.213) * r + (0.715 - c * 0.715 - s * 0.715) * g + (0.072 - c * 0.072 + s * 0.928) * b),
      clamp01((0.213 - c * 0.213 + s * 0.143) * r + (0.715 + c * 0.285 + s * 0.14) * g + (0.072 - c * 0.072 - s * 0.283) * b),
      clamp01((0.213 - c * 0.213 - s * 0.787) * r + (0.715 - c * 0.715 + s * 0.715) * g + (0.072 + c * 0.928 + s * 0.072) * b),
    ]; }
  }
}

/** Режимы смешивания по W3C Compositing: cb – низ, cs – накладываемый цвет. */
export function blendChannel(mode: Blend, cb: number, cs: number): number {
  switch (mode) {
    case "multiply": return cb * cs;
    case "screen": return cb + cs - cb * cs;
    case "overlay": return cb <= 0.5 ? 2 * cb * cs : 1 - 2 * (1 - cb) * (1 - cs);
    case "lighten": return Math.max(cb, cs);
    case "darken": return Math.min(cb, cs);
    case "exclusion": return cb + cs - 2 * cb * cs;
    case "color-burn": return cb >= 1 ? 1 : cs <= 0 ? 0 : 1 - Math.min(1, (1 - cb) / cs);
    case "soft-light": {
      if (cs <= 0.5) return cb - (1 - 2 * cs) * cb * (1 - cb);
      const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
      return cb + (2 * cs - 1) * (d - cb);
    }
  }
}

function stopColor(stops: { c: Rgba; at: number }[], t: number): Rgba {
  if (t <= stops[0].at) return stops[0].c;
  for (let i = 1; i < stops.length; i += 1) {
    if (t <= stops[i].at) {
      const a = stops[i - 1], b = stops[i], k = (t - a.at) / Math.max(1e-6, b.at - a.at);
      return [0, 1, 2, 3].map((j) => a.c[j] + (b.c[j] - a.c[j]) * k) as Rgba;
    }
  }
  return stops[stops.length - 1].c;
}

/** Рецепт на пикселях RGBA (на месте). s: 0..1 – доля эффекта (0 – оригинал, 1 – как в рецепте). */
export function applyRecipe(d: Uint8ClampedArray, w: number, h: number, recipe: Recipe, s: number) {
  const radius = Math.hypot(w / 2, h / 2); // radial-gradient(circle): до дальнего угла
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const o: [number, number, number] = [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255];
      let p = o;
      for (const f of recipe.filters) p = applyFilter(p, f);
      const t = Math.hypot(x - w / 2, y - h / 2) / radius;
      for (const layer of recipe.layers) {
        const c = Array.isArray(layer.fill) ? layer.fill : stopColor(layer.fill.stops, t);
        const a = (c[3] ?? 1) * (layer.opacity ?? 1);
        if (a <= 0) continue;
        p = p.map((v, ch) => (1 - a) * v + a * blendChannel(layer.blend, v, c[ch] / 255)) as [number, number, number];
      }
      d[i] = (o[0] + (p[0] - o[0]) * s) * 255;
      d[i + 1] = (o[1] + (p[1] - o[1]) * s) * 255;
      d[i + 2] = (o[2] + (p[2] - o[2]) * s) * 255;
    }
  }
}
