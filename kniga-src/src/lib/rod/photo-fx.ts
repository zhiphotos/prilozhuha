// Пресеты обработки фото («вайбовые» эффекты в один тап + ползунок силы).
// Неразрушающе: у блока хранится только { id, amount, c1?, c2? }; оригинал фото не меняется.
// Один конвейер для экрана, предпросмотра печати и PDF: renderFx(картинка, fx, maxSide) → холст. Результат кэшируется.
// Все размеры зависят от размера картинки (зерно, штрих, растр), поэтому на превью 1000 px и в печати 3000 px вид одинаковый.

export type FxId = "sketch" | "bw" | "sepia" | "film" | "duotone" | "halftone" | "riso" | "cyanotype" | "pastel" | "vintage" | "vignette" | "dreamy" | "xerox" | "cross";
export type PhotoFx = { id: FxId; /** Сила 1..100 */ amount: number; /** Цвета для дуотона и ризографа */ c1?: string; c2?: string };

type Def = { id: FxId; label: string; amount: number; colors?: [string, string] };
export const FX_LIST: Def[] = [
  { id: "sketch", label: "Рисунок", amount: 70 },
  { id: "bw", label: "Чёрно-белое", amount: 60 },
  { id: "sepia", label: "Сепия", amount: 80 },
  { id: "film", label: "Плёнка", amount: 60 },
  { id: "duotone", label: "Дуотон", amount: 100, colors: ["#8e3d52", "#f6d5dc"] },
  { id: "halftone", label: "Газетный растр", amount: 60 },
  { id: "riso", label: "Ризограф", amount: 70, colors: ["#e8457c", "#2a5fb0"] },
  { id: "cyanotype", label: "Цианотипия", amount: 80 },
  { id: "pastel", label: "Акварель", amount: 70 },
  { id: "vintage", label: "Тёплый винтаж", amount: 70 },
  { id: "vignette", label: "Виньетка", amount: 60 },
  { id: "dreamy", label: "Мечта", amount: 60 },
  { id: "xerox", label: "Ксерокс", amount: 55 },
  { id: "cross", label: "Кросс-процесс", amount: 60 },
];
/** Цвета книги для дуотона и ризографа. */
export const FX_COLORS = ["#2a2420", "#8e3d52", "#c45d72", "#f6d5dc", "#6f8a68", "#dce6d6", "#2a5fb0", "#e8457c", "#f2c94c", "#fbf8f3"];

const IDS = new Set<string>(FX_LIST.map((d) => d.id));
const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Настройка пригодна или нет. Неизвестный пресет (из новой версии), мусор и сила 0 дают «без эффекта», книга открывается как раньше. */
export function cleanFx(value: unknown): PhotoFx | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { id, amount, c1, c2 } = value as Record<string, unknown>;
  const n = Number(amount);
  if (typeof id !== "string" || !IDS.has(id) || !Number.isFinite(n) || n < 1) return undefined;
  return { id: id as FxId, amount: clamp(Math.round(n), 1, 100), ...(typeof c1 === "string" && HEX.test(c1) ? { c1: c1.toLowerCase() } : null), ...(typeof c2 === "string" && HEX.test(c2) ? { c2: c2.toLowerCase() } : null) };
}

/** Новый пресет с его силой и цветами по умолчанию; при смене пресета свои цвета и сила сохраняются, если подходят. */
export function pickFx(id: FxId, prev?: PhotoFx): PhotoFx {
  const def = FX_LIST.find((d) => d.id === id)!;
  return { id, amount: def.amount, ...(def.colors ? { c1: prev?.c1 ?? def.colors[0], c2: prev?.c2 ?? def.colors[1] } : null) };
}

/** Строка для кэша и сравнения: всё, от чего зависит картинка. */
export function fxKey(fx: PhotoFx): string {
  return `${fx.id}:${fx.amount}:${fx.c1 ?? ""}:${fx.c2 ?? ""}`;
}

// ——— пиксельные помощники
const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Постоянный «случайный» шум 0..1 по координате: одинаковый при каждой отрисовке (не мерцает, экран = печать). */
export function noise(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 100000) / 100000;
}
const lumaAt = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

function grayOf(d: Uint8ClampedArray, n: number): Float32Array {
  const g = new Float32Array(n);
  for (let p = 0; p < n; p += 1) g[p] = lumaAt(d, p * 4);
  return g;
}

/** Размытие (три прохода «ящиком» ≈ по Гауссу) одного канала. */
export function blur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.max(1, Math.round(radius));
  const a = Float32Array.from(src);
  const b = new Float32Array(src.length);
  for (let pass = 0; pass < 3; pass += 1) {
    for (let y = 0; y < h; y += 1) {
      let sum = 0;
      const row = y * w;
      for (let x = -r; x <= r; x += 1) sum += a[row + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x += 1) {
        b[row + x] = sum / (2 * r + 1);
        sum += a[row + clamp(x + r + 1, 0, w - 1)] - a[row + clamp(x - r, 0, w - 1)];
      }
    }
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      for (let y = -r; y <= r; y += 1) sum += b[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y += 1) {
        a[y * w + x] = sum / (2 * r + 1);
        sum += b[clamp(y + r + 1, 0, h - 1) * w + x] - b[clamp(y - r, 0, h - 1) * w + x];
      }
    }
  }
  return a;
}

type Ctx = { d: Uint8ClampedArray; w: number; h: number; s: number; k: number; c1: [number, number, number]; c2: [number, number, number]; canvas: HTMLCanvasElement };
const PAPER_RGB: [number, number, number] = [246, 241, 229];

function eachPixel(c: Ctx, fn: (r: number, g: number, b: number, x: number, y: number, p: number) => [number, number, number]) {
  const { d, w, h } = c;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const [r, g, b] = fn(d[i], d[i + 1], d[i + 2], x, y, y * w + x);
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
  }
}

const gradient3 = (t: number, a: number[], m: number[], z: number[]): [number, number, number] =>
  t < 0.5 ? [lerp(a[0], m[0], t * 2), lerp(a[1], m[1], t * 2), lerp(a[2], m[2], t * 2)] : [lerp(m[0], z[0], (t - 0.5) * 2), lerp(m[1], z[1], (t - 0.5) * 2), lerp(m[2], z[2], (t - 0.5) * 2)];

const EFFECTS: Record<FxId, (c: Ctx) => void> = {
  sketch(c) {
    // Карандашный набросок: инверсия, размытие и «осветление» дают контуры штрихом; слабее сила – больше исходного серого.
    const n = c.w * c.h;
    const g = grayOf(c.d, n);
    const inv = new Float32Array(n);
    for (let p = 0; p < n; p += 1) inv[p] = 255 - g[p];
    const b = blur(inv, c.w, c.h, c.k * (0.006 + 0.01 * c.s));
    eachPixel(c, (_r, _g, _b, x, y, p) => {
      const line = Math.min(255, (g[p] * 255) / Math.max(1, 255 - b[p]));
      const hatch = 0.97 + 0.03 * noise(x >> 1, y >> 1, 3);
      const shade = 0.72 + 0.28 * (g[p] / 255); // лёгкая тушёвка по тёмному, чтобы рисунок не был пустым
      const v = (lerp(g[p], line, 0.45 + 0.55 * c.s) * hatch * shade) / 255;
      const t = clamp(0.5 + (v - 0.5) * (1 + c.s * 0.5), 0, 1);
      return [PAPER_RGB[0] * t, PAPER_RGB[1] * t * 0.99, PAPER_RGB[2] * t * 0.96];
    });
  },
  bw(c) {
    eachPixel(c, (r, g, b) => {
      const x = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const y = lerp(x, smooth(0.06, 0.94, x), c.s);
      const v = (0.03 + y * 0.95) * 255;
      return [v, v, v];
    });
  },
  sepia(c) {
    const a = [34, 20, 10], m = [158, 106, 62], z = [244, 224, 184];
    eachPixel(c, (r, g, b, x, y) => {
      const t = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const faded = 0.06 + t * 0.9;
      const [sr, sg, sb] = gradient3(faded, a, m, z);
      const dx = x / c.w - 0.5, dy = y / c.h - 0.5;
      const vig = 1 - 0.35 * c.s * smooth(0.25, 0.75, Math.hypot(dx, dy));
      const k = clamp(c.s * 0.92 + 0.08, 0, 1);
      return [lerp(r, sr, k) * vig, lerp(g, sg, k) * vig, lerp(b, sb, k) * vig];
    });
  },
  film(c) {
    const cell = Math.max(1, Math.round(c.k / 650));
    eachPixel(c, (r, g, b, x, y) => {
      const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const curve = (v: number) => lerp(v, smooth(0, 1, v), 0.5 * c.s);
      const sh = 1 - l;
      let R = curve(r / 255) + 0.045 * c.s * l - 0.01 * c.s * sh;
      let G = curve(g / 255) + 0.012 * c.s * l + 0.012 * c.s * sh;
      let B = curve(b / 255) - 0.03 * c.s * l + 0.035 * c.s * sh;
      const n = (noise(Math.floor(x / cell), Math.floor(y / cell), 7) - 0.5) * 0.2 * c.s * (0.4 + 1.2 * l * (1 - l) * 2);
      const cn = (noise(Math.floor(x / cell), Math.floor(y / cell), 11) - 0.5) * 0.04 * c.s;
      R = R + n + cn; G = G + n; B = B + n - cn;
      const lift = 0.025 * c.s;
      return [(lift + R * (1 - lift)) * 255, (lift + G * (1 - lift)) * 255, (lift + B * (1 - lift)) * 255];
    });
  },
  duotone(c) {
    eachPixel(c, (r, g, b) => {
      const t = smooth(0.02, 0.98, (0.299 * r + 0.587 * g + 0.114 * b) / 255);
      return [lerp(r, lerp(c.c1[0], c.c2[0], t), c.s), lerp(g, lerp(c.c1[1], c.c2[1], t), c.s), lerp(b, lerp(c.c1[2], c.c2[2], t), c.s)];
    });
  },
  halftone(c) {
    // Газетный растр: точки по сетке под 45°, размер точки зависит от тёмного. Рисуется на холсте, потом снова читается как пиксели.
    const { w, h } = c;
    const g = blur(grayOf(c.d, w * h), w, h, Math.max(1, c.k * 0.006));
    const cell = Math.max(5, c.k * (0.03 - 0.014 * c.s));
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const x = out.getContext("2d")!;
    x.fillStyle = `rgb(${PAPER_RGB.join(",")})`;
    x.fillRect(0, 0, w, h);
    x.fillStyle = "rgb(30,27,31)";
    const cos = Math.SQRT1_2, sin = Math.SQRT1_2, diag = Math.hypot(w, h);
    for (let v = -diag; v < diag; v += cell) {
      for (let u = -diag; u < diag; u += cell) {
        const px = w / 2 + u * cos - v * sin, py = h / 2 + u * sin + v * cos;
        if (px < -cell || py < -cell || px > w + cell || py > h + cell) continue;
        const l = g[clamp(Math.round(py), 0, h - 1) * w + clamp(Math.round(px), 0, w - 1)] / 255;
        const cover = clamp((1 - l) * (0.7 + 0.8 * c.s), 0, 1);
        if (cover < 0.04) continue;
        x.beginPath();
        x.arc(px, py, cell * 0.72 * Math.sqrt(cover), 0, Math.PI * 2);
        x.fill();
      }
    }
    c.d.set(x.getImageData(0, 0, w, h).data);
  },
  riso(c) {
    const { w, h } = c;
    const g = grayOf(c.d, w * h);
    const sh = Math.max(1, Math.round(c.k * 0.006 * (0.6 + c.s)));
    const at = (x: number, y: number) => g[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)] / 255;
    eachPixel(c, (_r, _g, _b, x, y) => {
      const grain = 0.82 + 0.3 * noise(x, y, 5);
      const a = clamp(Math.pow(1 - at(x + sh, y + sh), 1.5) * (0.6 + 0.8 * c.s) * grain, 0, 1);
      const b = clamp(Math.pow(1 - at(x - sh, y - sh), 2.3) * (0.5 + 0.9 * c.s) * (0.82 + 0.3 * noise(x, y, 9)), 0, 1);
      const ink = (col: number[], cov: number, ch: number) => lerp(1, col[ch] / 255, cov);
      return [0, 1, 2].map((ch) => PAPER_RGB[ch] * ink(c.c1, a, ch) * ink(c.c2, b, ch)) as [number, number, number];
    });
  },
  cyanotype(c) {
    const a = [5, 26, 56], m = [28, 88, 142], z = [228, 240, 242];
    const low = new Float32Array(c.w * c.h);
    for (let y = 0; y < c.h; y += 1) for (let x = 0; x < c.w; x += 1) low[y * c.w + x] = noise(x >> 5, y >> 5, 2);
    const wash = blur(low, c.w, c.h, 14);
    eachPixel(c, (r, g, b, _x, _y, p) => {
      let t = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      t = smooth(0.04, 0.96, t) * (1 + (wash[p] - 0.5) * 0.14);
      const [cr, cg, cb] = gradient3(clamp(t, 0, 1), a, m, z);
      return [lerp(r, cr, 0.15 + 0.85 * c.s), lerp(g, cg, 0.15 + 0.85 * c.s), lerp(b, cb, 0.15 + 0.85 * c.s)];
    });
  },
  pastel(c) {
    // Акварель/пастель: смягчение, мягкое ограничение цветов, посветление и бумажная текстура.
    const { w, h } = c;
    const rad = Math.max(1, c.k * (0.003 + 0.008 * c.s));
    const chans = [0, 1, 2].map((ch) => {
      const a = new Float32Array(w * h);
      for (let p = 0; p < a.length; p += 1) a[p] = c.d[p * 4 + ch];
      return blur(a, w, h, rad);
    });
    eachPixel(c, (_r, _g, _b, x, y, p) => {
      const l = (0.299 * chans[0][p] + 0.587 * chans[1][p] + 0.114 * chans[2][p]) / 255;
      const fiber = 1 - 0.09 * c.s * (0.55 * noise(x >> 1, y >> 1, 4) + 0.45 * noise(x >> 3, y >> 3, 8));
      const out = [0, 1, 2].map((ch) => {
        let v = chans[ch][p] / 255;
        v = lerp(v, Math.round(v * 6) / 6, 0.35 * c.s);
        v = l + (v - l) * (1 + 0.15 * c.s);
        v = 0.12 * c.s + v * (1 - 0.18 * c.s);
        return clamp(v * fiber * (ch === 2 ? 0.985 : 1), 0, 1) * 255;
      });
      return out as [number, number, number];
    });
  },
  vintage(c) {
    eachPixel(c, (r, g, b) => {
      const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const des = 1 - 0.3 * c.s;
      let R = (l + (r / 255 - l) * des - 0.5) * (1 - 0.16 * c.s) + 0.5;
      let G = (l + (g / 255 - l) * des - 0.5) * (1 - 0.16 * c.s) + 0.5;
      let B = (l + (b / 255 - l) * des - 0.5) * (1 - 0.16 * c.s) + 0.5;
      R = R * (1 + 0.07 * c.s) + 0.1 * c.s * (1 - R) * 0.55;
      G = G * (1 + 0.01 * c.s) + 0.06 * c.s * (1 - G) * 0.5;
      B = B * (1 - 0.14 * c.s) + 0.03 * c.s;
      const fade = 0.03 * c.s;
      return [clamp(lerp(R, 0.96, fade), 0, 1) * 255, clamp(lerp(G, 0.94, fade), 0, 1) * 255, clamp(lerp(B, 0.88, fade), 0, 1) * 255];
    });
  },
  vignette(c) {
    eachPixel(c, (r, g, b, x, y) => {
      const dx = (x / c.w - 0.5) * 2, dy = (y / c.h - 0.5) * 2;
      const f = 1 - c.s * 0.8 * smooth(0.45, 1.35, Math.hypot(dx, dy));
      return [r * f, g * f * 0.995, b * f * 0.985];
    });
  },
  dreamy(c) {
    const { w, h } = c;
    const rad = Math.max(2, c.k * 0.028);
    const bl = [0, 1, 2].map((ch) => {
      const a = new Float32Array(w * h);
      for (let p = 0; p < a.length; p += 1) a[p] = c.d[p * 4 + ch];
      return blur(a, w, h, rad);
    });
    eachPixel(c, (r, g, b, _x, _y, p) => {
      const o = [r, g, b].map((v, ch) => {
        const base = v / 255, glow = (bl[ch][p] / 255) * 0.85 * c.s;
        let s = 1 - (1 - base) * (1 - glow);
        s = lerp(s, 0.5 + (s - 0.5) * 0.88 + 0.06, 0.6 * c.s);
        return s;
      });
      return [clamp(o[0] * (1 + 0.03 * c.s), 0, 1) * 255, clamp(o[1], 0, 1) * 255, clamp(o[2] * (1 + 0.015 * c.s) + 0.02 * c.s, 0, 1) * 255];
    });
  },
  xerox(c) {
    const n = c.w * c.h;
    const g = grayOf(c.d, n);
    const local = blur(g, c.w, c.h, c.k * 0.05);
    eachPixel(c, (_r, _g, _b, x, y, p) => {
      const v = (g[p] - local[p]) * (1.6 + 1.2 * c.s) + 128 + (noise(x, y, 6) - 0.5) * 34 * (0.5 + c.s);
      const thr = 112 + 38 * (1 - c.s);
      const t = smooth(thr - 22, thr + 22, v);
      const toner = 22 + 12 * noise(x >> 1, y >> 1, 13);
      return [lerp(toner, 250, t), lerp(toner, 249, t), lerp(toner, 244, t)];
    });
  },
  cross(c) {
    eachPixel(c, (r, g, b) => {
      const R = smooth(0, 1, r / 255), G = lerp(g / 255, smooth(0, 1, g / 255), 0.5), B = (b / 255) * 0.75 + 0.14;
      const k = c.s;
      return [lerp(r, clamp(R * 1.04 + 0.02, 0, 1) * 255, k), lerp(g, clamp(G * 1.02 + 0.015, 0, 1) * 255, k), lerp(b, clamp(B * (1 - 0.1 * (g / 255)), 0, 1) * 255, k)];
    });
  },
};

/** Пресет на готовых пикселях RGBA (меняет массив на месте). Отдельно от холста, чтобы логику можно было проверять без браузера. */
export function applyFxPixels(d: Uint8ClampedArray, w: number, h: number, fx: PhotoFx, canvas?: HTMLCanvasElement) {
  const def = FX_LIST.find((x) => x.id === fx.id)!;
  EFFECTS[fx.id]({ d, w, h, s: clamp(fx.amount, 1, 100) / 100, k: Math.min(w, h), c1: rgb(fx.c1 ?? def.colors?.[0] ?? "#000000"), c2: rgb(fx.c2 ?? def.colors?.[1] ?? "#ffffff"), canvas: canvas as HTMLCanvasElement });
}

/** Применяет пресет к картинке и возвращает новый холст (не больше maxSide по большой стороне). Оригинал не меняется. */
export function renderFx(source: CanvasImageSource & { width: number; height: number }, fx: PhotoFx, maxSide: number): HTMLCanvasElement {
  const sw = Math.max(1, (source as { naturalWidth?: number }).naturalWidth || source.width);
  const sh = Math.max(1, (source as { naturalHeight?: number }).naturalHeight || source.height);
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.drawImage(source, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  applyFxPixels(img.data, w, h, fx, canvas);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ——— кэш готовых картинок (последние несколько, чтобы телефон не копил память)
const CACHE = new Map<string, HTMLCanvasElement>();
const LIMIT = 8;
function srcKey(src: string): string {
  if (src.length < 120) return src;
  let h = 5381;
  for (let i = 0; i < src.length; i += Math.max(1, Math.floor(src.length / 4000))) h = (Math.imul(h, 33) + src.charCodeAt(i)) | 0;
  return `${src.length}:${h}`;
}
export function cachedFx(src: string, source: CanvasImageSource & { width: number; height: number }, fx: PhotoFx, maxSide: number): HTMLCanvasElement {
  const key = `${srcKey(src)}|${fxKey(fx)}|${maxSide}`;
  const hit = CACHE.get(key);
  if (hit) {
    CACHE.delete(key);
    CACHE.set(key, hit);
    return hit;
  }
  const out = renderFx(source, fx, maxSide);
  CACHE.set(key, out);
  while (CACHE.size > LIMIT) CACHE.delete(CACHE.keys().next().value as string);
  return out;
}
export const PREVIEW_SIDE = 1100;
export const PRINT_SIDE = 3000;
