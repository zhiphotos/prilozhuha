// Сканер фото и бумаги: ровняет перекос по четырём углам, выравнивает свет, умеет забрать почерк на прозрачный фон.
export type Pt = { x: number; y: number };
export type ScanMode = "photo" | "paper" | "ink";

/** Читаем картинку с учётом поворота камеры. */
export async function loadBitmap(file: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Снимок не открылся"));
      el.src = url;
    });
    const scale = Math.min(1, 2600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Ищет лист на снимке: область, которая заметно отличается от цвета по краям кадра. Если не нашли, рамка почти во весь кадр. */
export function autoCorners(source: HTMLCanvasElement): Pt[] {
  const w = 96;
  const h = Math.max(8, Math.round((source.height / source.width) * w));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const px = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  // Средний цвет рамки кадра в 3 пикселя.
  let br = 0;
  let bg = 0;
  let bb = 0;
  let n = 0;
  for (let x = 0; x < w; x += 1) {
    for (const y of [0, 1, 2, h - 3, h - 2, h - 1]) {
      const [r, g, b] = px(x, y);
      br += r;
      bg += g;
      bb += b;
      n += 1;
    }
  }
  for (let y = 3; y < h - 3; y += 1) {
    for (const x of [0, 1, 2, w - 3, w - 2, w - 1]) {
      const [r, g, b] = px(x, y);
      br += r;
      bg += g;
      bb += b;
      n += 1;
    }
  }
  br /= n;
  bg /= n;
  bb /= n;
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  let count = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [r, g, b] = px(x, y);
      if (Math.hypot(r - br, g - bg, b - bb) > 42) {
        count += 1;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  const sx = source.width / w;
  const sy = source.height / h;
  if (count < w * h * 0.12 || x1 - x0 < w * 0.3 || y1 - y0 < h * 0.3) {
    const mx = source.width * 0.04;
    const my = source.height * 0.04;
    return [
      { x: mx, y: my },
      { x: source.width - mx, y: my },
      { x: source.width - mx, y: source.height - my },
      { x: mx, y: source.height - my },
    ];
  }
  const pad = 1;
  return [
    { x: Math.max(0, x0 - pad) * sx, y: Math.max(0, y0 - pad) * sy },
    { x: Math.min(w, x1 + 1 + pad) * sx, y: Math.max(0, y0 - pad) * sy },
    { x: Math.min(w, x1 + 1 + pad) * sx, y: Math.min(h, y1 + 1 + pad) * sy },
    { x: Math.max(0, x0 - pad) * sx, y: Math.min(h, y1 + 1 + pad) * sy },
  ];
}

/** Матрица перспективы: квадрат 0..1 → четыре угла (метод Хекберта). Возвращает коэффициенты a..h. */
function homography(p: Pt[]) {
  const [p0, p1, p2, p3] = p;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0;
  let h = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  return { a: p1.x - p0.x + g * p1.x, b: p3.x - p0.x + h * p3.x, c: p0.x, d: p1.y - p0.y + g * p1.y, e: p3.y - p0.y + h * p3.y, f: p0.y, g, h };
}

/** Вырезает четырёхугольник и растягивает его в прямоугольник. */
export function warp(source: HTMLCanvasElement, corners: Pt[], maxSide = 2100): HTMLCanvasElement {
  const wTop = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
  const wBot = Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y);
  const hL = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
  const hR = Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y);
  let ow = Math.max(wTop, wBot);
  let oh = Math.max(hL, hR);
  const k = Math.min(1, maxSide / Math.max(ow, oh));
  ow = Math.max(8, Math.round(ow * k));
  oh = Math.max(8, Math.round(oh * k));
  const out = document.createElement("canvas");
  out.width = ow;
  out.height = oh;
  const sctx = source.getContext("2d", { willReadFrequently: true })!;
  const src = sctx.getImageData(0, 0, source.width, source.height);
  const octx = out.getContext("2d")!;
  const dst = octx.createImageData(ow, oh);
  const m = homography(corners);
  const sw = source.width;
  const sh = source.height;
  for (let y = 0; y < oh; y += 1) {
    const v = (y + 0.5) / oh;
    for (let x = 0; x < ow; x += 1) {
      const u = (x + 0.5) / ow;
      const den = m.g * u + m.h * v + 1;
      const sx = (m.a * u + m.b * v + m.c) / den;
      const sy = (m.d * u + m.e * v + m.f) / den;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(sx)));
      const y0 = Math.max(0, Math.min(sh - 1, Math.floor(sy)));
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = Math.max(0, Math.min(1, sx - x0));
      const fy = Math.max(0, Math.min(1, sy - y0));
      const o = (y * ow + x) * 4;
      for (let ch = 0; ch < 4; ch += 1) {
        const a = src.data[(y0 * sw + x0) * 4 + ch];
        const b = src.data[(y0 * sw + x1) * 4 + ch];
        const c = src.data[(y1 * sw + x0) * 4 + ch];
        const d = src.data[(y1 * sw + x1) * 4 + ch];
        dst.data[o + ch] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
      }
    }
  }
  octx.putImageData(dst, 0, 0);
  return out;
}

/** Фон листа по пикселям: убираем чернила максимумом и размываем. Нужен, чтобы выровнять свет и забрать почерк. */
function paperLevel(canvas: HTMLCanvasElement): { data: Float32Array; w: number; h: number; scale: number } {
  const scale = 8;
  const w = Math.max(2, Math.round(canvas.width / scale));
  const h = Math.max(2, Math.round(canvas.height / scale));
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(canvas, 0, 0, w, h);
  const px = sctx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h * 3);
  const radius = 3;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          const i = (yy * w + xx) * 4;
          r = Math.max(r, px[i]);
          g = Math.max(g, px[i + 1]);
          b = Math.max(b, px[i + 2]);
        }
      }
      const o = (y * w + x) * 3;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
    }
  }
  // Лёгкое размытие 3×3, два прохода.
  const tmp = new Float32Array(out.length);
  for (let pass = 0; pass < 2; pass += 1) {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        for (let ch = 0; ch < 3; ch += 1) {
          let sum = 0;
          let cnt = 0;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const xx = Math.min(w - 1, Math.max(0, x + dx));
              const yy = Math.min(h - 1, Math.max(0, y + dy));
              sum += out[(yy * w + xx) * 3 + ch];
              cnt += 1;
            }
          }
          tmp[(y * w + x) * 3 + ch] = sum / cnt;
        }
      }
    }
    out.set(tmp);
  }
  return { data: out, w, h, scale };
}

function levelAt(level: ReturnType<typeof paperLevel>, x: number, y: number): [number, number, number] {
  const fx = Math.min(level.w - 1, Math.max(0, x / level.scale - 0.5));
  const fy = Math.min(level.h - 1, Math.max(0, y / level.scale - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(level.w - 1, x0 + 1);
  const y1 = Math.min(level.h - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const get = (xx: number, yy: number, ch: number) => level.data[(yy * level.w + xx) * 3 + ch];
  const res: number[] = [];
  for (let ch = 0; ch < 3; ch += 1) {
    res.push(get(x0, y0, ch) * (1 - tx) * (1 - ty) + get(x1, y0, ch) * tx * (1 - ty) + get(x0, y1, ch) * (1 - tx) * ty + get(x1, y1, ch) * tx * ty);
  }
  return [Math.max(1, res[0]), Math.max(1, res[1]), Math.max(1, res[2])];
}

/** Фото: выравниваем неравномерный свет и чуть подтягиваем контраст. Бумага: белый лист, чёткий текст. Почерк: чернила на прозрачном фоне. */
export function enhance(canvas: HTMLCanvasElement, mode: ScanMode): HTMLCanvasElement {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const level = paperLevel(canvas);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const i = (y * canvas.width + x) * 4;
      const [br, bg, bb] = levelAt(level, x, y);
      const rr = d[i] / br;
      const rg = d[i + 1] / bg;
      const rb = d[i + 2] / bb;
      if (mode === "ink") {
        const dark = 1 - Math.min(rr, rg, rb);
        const alpha = Math.max(0, Math.min(1, (dark - 0.07) / 0.45));
        if (alpha <= 0.01) {
          d[i + 3] = 0;
          continue;
        }
        d[i] = Math.max(0, Math.min(255, (d[i] - br * (1 - alpha)) / alpha));
        d[i + 1] = Math.max(0, Math.min(255, (d[i + 1] - bg * (1 - alpha)) / alpha));
        d[i + 2] = Math.max(0, Math.min(255, (d[i + 2] - bb * (1 - alpha)) / alpha));
        d[i + 3] = Math.round(alpha * 255);
      } else if (mode === "paper") {
        const gain = (v: number) => Math.max(0, Math.min(255, ((v - 0.78) / 0.2) * 255 * 0.98));
        d[i] = gain(rr);
        d[i + 1] = gain(rg);
        d[i + 2] = gain(rb);
      } else {
        // Фото: делим на фон лишь частично, чтобы не потерять естественные тона.
        const mix = 0.6;
        const f = (v: number, b: number) => Math.max(0, Math.min(255, v * (1 - mix) + (v / b) * 255 * mix * 0.97));
        d[i] = f(d[i], br);
        d[i + 1] = f(d[i + 1], bg);
        d[i + 2] = f(d[i + 2], bb);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function canvasBlob(canvas: HTMLCanvasElement, png: boolean): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Не удалось сохранить скан"))), png ? "image/png" : "image/jpeg", 0.9));
}
