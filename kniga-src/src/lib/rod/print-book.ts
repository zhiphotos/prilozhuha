// Печатная версия: каждая страница рисуется на холсте 300 dpi по тем же правилам, что и на экране.
import { resolveMedia } from "@/lib/rod/media";
import { cropGeom } from "@/lib/rod/crop";
import { strokeGeom } from "@/lib/rod/ink";
import { maskImageUrl } from "@/lib/rod/mask";
import {
  COLORS,
  FONT_FAMILY,
  PAGE_RATIO,
  blockW,
  POLAROID,
  fontFamily,
  fontWeight,
  isDark,
  lookColors,
  lookPad,
  stickerRatio,
  stickerUrl,
  textMetrics,
} from "@/lib/rod/page-style";
import { MM, buildJpegPdf, type PdfSheet } from "@/lib/rod/pdf";
import type { PrintSetup } from "@/lib/rod/page-style";
import { shapeParts, shapeStyle } from "@/lib/rod/shapes";
import { spreadGhosts } from "@/lib/rod/spread";
import { backPage } from "@/lib/rod/store";
import type { BookPage, PageBlock, PaperKind, SpineSetup } from "@/lib/rod/types";

export type CoverMeta = { dedicatee: string; collector: string };

const DPI = 300;
const PX_PER_MM = DPI / 25.4;

// Размеры текущей страницы. Рисование идёт по одной странице за раз, поэтому хватает модульных переменных.
let W = 2126;
let H = Math.round(W * PAGE_RATIO);
let U = W / 100;

const SHADOW = "rgba(42, 36, 32, 0.3)";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function loadMedia(src: string) {
  return loadImage(await resolveMedia(src));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  text.split("\n").forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      return;
    }
    let line = "";
    // Слово длиннее строки режем по буквам — как на экране (break-words), иначе оно уезжает за край листа.
    const pieces = words.flatMap((word) => {
      if (ctx.measureText(word).width <= maxWidth) return [word];
      const parts: string[] = [];
      let chunk = "";
      for (const ch of word) {
        if (chunk && ctx.measureText(chunk + ch).width > maxWidth) {
          parts.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      if (chunk) parts.push(chunk);
      return parts;
    });
    pieces.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
  });
  return lines;
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(1, w), Math.max(1, h), Math.min(r, w / 2, h / 2));
}

/** Рисует картинку «обрезкой по рамке», без растягивания. */
function cover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / image.width, h / image.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h);
}

const alphaCache = new WeakMap<HTMLImageElement, boolean>();

/** Есть ли у картинки прозрачные места (вырезанный PNG). Под такой не кладём белую подложку. */
function hasAlpha(image: HTMLImageElement): boolean {
  const known = alphaCache.get(image);
  if (known !== undefined) return known;
  const c = document.createElement("canvas");
  c.width = 48;
  c.height = 48;
  const x = c.getContext("2d", { willReadFrequently: true });
  let result = false;
  if (x) {
    x.drawImage(image, 0, 0, 48, 48);
    const data = x.getImageData(0, 0, 48, 48).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 245) {
        result = true;
        break;
      }
    }
  }
  alphaCache.set(image, result);
  return result;
}

/** «Обрезка по рамке» с учётом кадрирования: то, что выбрано пальцем. */
function coverCropped(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number, crop?: { cx: number; cy: number; z: number }) {
  if (!crop) {
    cover(ctx, image, x, y, w, h);
    return;
  }
  const g = cropGeom({ w, h }, image.height / Math.max(1, image.width), crop);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(image, x + g.left, y + g.top, g.dw, g.dh);
  ctx.restore();
}

function contain(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function shadow(ctx: CanvasRenderingContext2D, blur = 2.4, offset = 1.2) {
  ctx.shadowColor = SHADOW;
  ctx.shadowBlur = blur * U;
  ctx.shadowOffsetY = offset * U;
}

function noShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function paintPaper(ctx: CanvasRenderingContext2D, paper: PaperKind, bleed: number, custom?: string) {
  const bg: Record<PaperKind, string> = {
    cream: "#fbf8f3",
    lined: "#fbf8f3",
    dots: "#fbf8f3",
    rose: "#f8e4e8",
    sage: "#e7eee2",
    kraft: "#ece0cf",
  };
  ctx.fillStyle = custom || bg[paper];
  ctx.fillRect(-bleed, -bleed, W + bleed * 2, H + bleed * 2);
  if (paper === "lined") {
    ctx.fillStyle = COLORS.line;
    for (let y = 9 * U + 6.6 * U; y < H + bleed; y += 6.8 * U) ctx.fillRect(-bleed, y, W + bleed * 2, 0.2 * U);
  }
  if (paper === "dots") {
    ctx.fillStyle = "#d9cfc2";
    for (let y = 2.5 * U - Math.ceil(bleed / (5 * U)) * 5 * U; y < H + bleed; y += 5 * U) {
      for (let x = 2.5 * U - Math.ceil(bleed / (5 * U)) * 5 * U; x < W + bleed; x += 5 * U) {
        ctx.beginPath();
        ctx.arc(x, y, 0.34 * U, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function spaced(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let x = cx - total / 2;
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, x, y);
    x += widths[i] + spacing;
  });
}

async function paintCover(ctx: CanvasRenderingContext2D, meta: CoverMeta) {
  ctx.save();
  ctx.strokeStyle = "rgba(142, 61, 82, 0.25)";
  ctx.lineWidth = 0.35 * U;
  rounded(ctx, 4 * U, 4 * U, W - 8 * U, H - 8 * U, 2 * U);
  ctx.stroke();
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.roseDeep;
  ctx.font = `500 ${2.6 * U}px ${FONT_FAMILY.sans}`;
  let y = H * 0.15;
  spaced(ctx, "СЕМЕЙНАЯ ЛЕТОПИСЬ", W / 2, y, 0.6 * U);
  y += 2.6 * U * 1.5 + 3 * U;
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = "center";
  ctx.font = `600 ${14 * U}px ${FONT_FAMILY.serif}`;
  ctx.fillText("Книга", W / 2, y);
  ctx.fillText("рода", W / 2, y + 14 * U * 0.95);
  y += 14 * U * 0.95 * 2 + 3 * U;
  const branch = await loadImage(stickerUrl("branch"));
  if (branch) ctx.drawImage(branch, W / 2 - 15 * U, y, 30 * U, 30 * U * stickerRatio("branch"));
  ctx.textBaseline = "bottom";
  const bottom = H * 0.9;
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 ${3 * U}px ${FONT_FAMILY.sans}`;
  const collector = meta.collector.trim();
  if (collector) ctx.fillText(`собрал(а) ${collector}`, W / 2, bottom);
  ctx.fillStyle = COLORS.roseDeep;
  ctx.font = `500 ${7 * U}px ${FONT_FAMILY.script}`;
  ctx.fillText(meta.dedicatee.trim() ? `для тебя, ${meta.dedicatee.trim()}` : "для тех, кто откроет позже", W / 2, collector ? bottom - 5 * U : bottom);
  ctx.restore();
}

function rotateAround(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, deg: number) {
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.translate(-w / 2, -h / 2);
}

function paintText(ctx: CanvasRenderingContext2D, block: Extract<PageBlock, { type: "text" }>, dark = false) {
  if (!block.text.trim()) return;
  const metrics = textMetrics(block.font, block.size, block.px);
  const pad = lookPad(block.look);
  const colors = lookColors(block.look, block.color, block.bg, dark);
  const px = metrics.size * U;
  const lh = px * metrics.leading;
  ctx.font = `${fontWeight(block.font)} ${px}px ${fontFamily(block.font)}`;
  const boxW = (block.w / 100) * W;
  const innerW = boxW - pad.x * 2 * U;
  const lines = wrap(ctx, block.text, innerW);
  const textW = Math.max(...lines.map((line) => ctx.measureText(line).width), 0);
  const bgW = block.look === "pill" ? Math.min(boxW, textW + pad.x * 2 * U) : boxW;
  const bgH = lines.length * lh + pad.y * 2 * U;
  const x = (block.x / 100) * W;
  const y = (block.y / 100) * H;
  ctx.save();
  rotateAround(ctx, x, y, boxW, bgH, block.rotate ?? 0);
  if (block.look === "card" || block.look === "pill") {
    ctx.fillStyle = colors.bg;
    if (block.look === "card") shadow(ctx, 2, 0.8);
    rounded(ctx, 0, 0, bgW, bgH, block.look === "pill" ? bgH / 2 : pad.radius * U);
    ctx.fill();
    noShadow(ctx);
  }
  ctx.fillStyle = colors.fg;
  ctx.textBaseline = "middle";
  const center = block.align === "center";
  const right = block.align === "right";
  ctx.textAlign = center ? "center" : right ? "right" : "left";
  lines.forEach((line, index) => {
    const ly = pad.y * U + index * lh + lh / 2;
    ctx.fillText(line, center ? bgW / 2 : right ? bgW - pad.x * U : pad.x * U, ly);
  });
  ctx.restore();
}

async function paintPhoto(ctx: CanvasRenderingContext2D, block: Extract<PageBlock, { type: "photo" }>) {
  const x = (block.x / 100) * W;
  const y = (block.y / 100) * H;
  const w = (block.w / 100) * W;
  const h = (block.h / 100) * H;
  const lifted = block.frame === "sticker" && Boolean(block.cut);
  const image = await loadMedia(lifted && block.cut ? block.cut : block.src);
  const lit = block.shadow !== false;
  ctx.save();
  rotateAround(ctx, x, y, w, h, block.rotate ?? 0);
  if (lifted) {
    if (lit) shadow(ctx, 1, 0.8);
    if (image) contain(ctx, image, 0, 0, w, h);
  } else if (block.frame === "polaroid") {
    const side = (POLAROID.side / 100) * w;
    const top = (POLAROID.top / 100) * w;
    const bottom = (POLAROID.bottom / 100) * w;
    if (lit) shadow(ctx);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    noShadow(ctx);
    if (image) coverCropped(ctx, image, side, top, w - side * 2, h - top - bottom, block.crop);
    if (block.caption.trim()) {
      const size = Math.min(5, block.w * 0.075) * U;
      ctx.fillStyle = COLORS.ink;
      ctx.font = `500 ${size}px ${FONT_FAMILY.script}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(block.caption, w / 2, h - bottom / 2, w - side * 2);
    }
  } else if (block.frame === "sticker") {
    const border = 1.4 * U;
    if (lit) shadow(ctx);
    ctx.fillStyle = "#ffffff";
    rounded(ctx, 0, 0, w, h, 2.2 * U);
    ctx.fill();
    noShadow(ctx);
    ctx.save();
    rounded(ctx, border, border, w - border * 2, h - border * 2, 0.9 * U);
    ctx.clip();
    if (image) coverCropped(ctx, image, border, border, w - border * 2, h - border * 2, block.crop);
    ctx.restore();
  } else {
    const radius = block.frame === "tape" ? 0.6 * U : lit ? 1.4 * U : 0;
    const transparent = image ? hasAlpha(image) : false;
    if (transparent) {
      // Вырезанный PNG: никакой белой подложки, тень (если включена) по самому рисунку.
      if (lit) shadow(ctx, 1.6, 0.9);
      if (image) coverCropped(ctx, image, 0, 0, w, h, block.crop);
      noShadow(ctx);
    } else {
      if (lit) {
        shadow(ctx);
        ctx.fillStyle = "#ffffff";
        rounded(ctx, 0, 0, w, h, radius);
        ctx.fill();
        noShadow(ctx);
      }
      ctx.save();
      rounded(ctx, 0, 0, w, h, radius);
      ctx.clip();
      if (image) coverCropped(ctx, image, 0, 0, w, h, block.crop);
      ctx.restore();
    }
    if (block.frame === "tape") {
      const tape = await loadImage(stickerUrl("tape"));
      if (tape) {
        const tw = w * 0.4;
        const th = tw * stickerRatio("tape");
        ctx.translate(w / 2, 0);
        ctx.rotate((-3 * Math.PI) / 180);
        ctx.drawImage(tape, -tw / 2, -th / 2, tw, th);
      }
    }
  }
  ctx.restore();
}

function paintShape(ctx: CanvasRenderingContext2D, block: Extract<PageBlock, { type: "shape" }>) {
  const x = (block.x / 100) * W;
  const y = (block.y / 100) * H;
  const w = (block.w / 100) * W;
  const h = (block.h / 100) * H;
  const style = shapeStyle(block);
  ctx.save();
  rotateAround(ctx, x, y, w, h, block.rotate ?? 0);
  ctx.scale(U, U);
  for (const part of shapeParts(block.shape, block.w, block.h, style.strokeW)) {
    const path = new Path2D(part.d);
    if (part.fill && style.fill) {
      ctx.fillStyle = style.fill;
      ctx.fill(path);
    }
    if (part.stroke && style.stroke) {
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = style.strokeW;
      ctx.lineCap = part.cap ?? "round";
      ctx.lineJoin = "round";
      ctx.setLineDash(part.dash ? part.dash.split(" ").map(Number) : []);
      ctx.stroke(path);
    }
  }
  ctx.restore();
}

function paintStrokeList(ctx: CanvasRenderingContext2D, strokes: import("@/lib/rod/types").InkStroke[]) {
  for (const stroke of strokes) {
    const g = strokeGeom(stroke);
    if (!g.d) continue;
    const path = new Path2D(g.d);
    ctx.save();
    ctx.globalAlpha *= g.alpha;
    if (g.fill) {
      ctx.fillStyle = g.color;
      ctx.fill(path);
    } else {
      for (const l of [{ width: g.width, color: g.color, alpha: 1, dash: g.dash, cap: g.cap }, ...(g.layers ?? [])]) {
        ctx.save();
        ctx.globalAlpha *= l.alpha;
        ctx.strokeStyle = l.color;
        ctx.lineWidth = l.width;
        ctx.lineCap = l.cap;
        ctx.lineJoin = "round";
        ctx.setLineDash(l.dash ? l.dash.split(" ").map(Number) : []);
        ctx.stroke(path);
        ctx.restore();
      }
    }
    ctx.restore();
  }
}

function paintInk(ctx: CanvasRenderingContext2D, block: Extract<PageBlock, { type: "ink" }>) {
  const x = (block.x / 100) * W;
  const y = (block.y / 100) * H;
  const w = (block.w / 100) * W;
  const h = (block.h / 100) * H;
  ctx.save();
  rotateAround(ctx, x, y, w, h, block.rotate ?? 0);
  ctx.scale(w / block.ow, h / block.oh);
  paintStrokeList(ctx, block.strokes);
  ctx.restore();
}

async function paintSticker(ctx: CanvasRenderingContext2D, block: Extract<PageBlock, { type: "sticker" }>) {
  const image = await loadImage(stickerUrl(block.kind));
  if (!image) return;
  const w = ((block.w ?? 15) / 100) * W;
  const h = w * stickerRatio(block.kind);
  const x = (block.x / 100) * W;
  const y = (block.y / 100) * H;
  ctx.save();
  rotateAround(ctx, x, y, w, h, block.rotate ?? 0);
  ctx.shadowColor = "rgba(42, 36, 32, 0.22)";
  ctx.shadowBlur = 1 * U;
  ctx.shadowOffsetY = 0.6 * U;
  ctx.drawImage(image, 0, 0, w, h);
  ctx.restore();
}

function paintStrokes(ctx: CanvasRenderingContext2D, page: BookPage) {
  ctx.save();
  ctx.scale(U, U);
  paintStrokeList(ctx, page.strokes);
  ctx.restore();
}

/** Рисует блок на отдельном слое, чтобы применить прозрачность, режим наложения и ластик (маску). */
async function paintBlock(ctx: CanvasRenderingContext2D, block: PageBlock, dark: boolean) {
  const draw = async (target: CanvasRenderingContext2D) => {
    if (block.type === "text") paintText(target, block, dark);
    else if (block.type === "photo") await paintPhoto(target, block);
    else if (block.type === "sticker") await paintSticker(target, block);
    else if (block.type === "shape") paintShape(target, block);
    else if (block.type === "ink") paintInk(target, block);
  };
  const mask = block.mask && block.mask.strokes.length ? block.mask : null;
  if (!mask && block.opacity === undefined && !block.blend) {
    await draw(ctx);
    return;
  }
  const layer = document.createElement("canvas");
  layer.width = ctx.canvas.width;
  layer.height = ctx.canvas.height;
  const lc = layer.getContext("2d");
  if (!lc) {
    await draw(ctx);
    return;
  }
  lc.setTransform(ctx.getTransform());
  await draw(lc);
  if (mask) {
    const image = await loadImage(maskImageUrl(mask));
    if (image) {
      const bw = (blockW(block as { type: string; w?: number }) / 100) * W;
      const bh = "h" in block && typeof block.h === "number" ? (block.h / 100) * H : (mask.h / 100) * bw;
      const bx = (block.x / 100) * W;
      const by = (block.y / 100) * H;
      lc.save();
      lc.globalCompositeOperation = "destination-in";
      lc.translate(bx + bw / 2, by + bh / 2);
      lc.rotate(((block.rotate ?? 0) * Math.PI) / 180);
      lc.drawImage(image, -bw / 2, -bh / 2, bw, bh);
      lc.restore();
    }
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = block.opacity ?? 1;
  if (block.blend) ctx.globalCompositeOperation = block.blend === "soft-light" ? "soft-light" : block.blend;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
  layer.width = 0;
  layer.height = 0;
}

/** Страница в печатном размере: обрезной формат + вылеты. Без setup — превью 18 см без вылетов. */
export async function paintPage(page: BookPage, meta: CoverMeta, setup?: PrintSetup, ghosts: PageBlock[] = []): Promise<HTMLCanvasElement> {
  const trim = setup ? Math.round(setup.size * 10 * PX_PER_MM) : 2126;
  const bleed = setup ? Math.round(setup.bleed * PX_PER_MM) : 0;
  W = trim;
  H = Math.round(trim * PAGE_RATIO);
  U = W / 100;
  const canvas = document.createElement("canvas");
  canvas.width = W + bleed * 2;
  canvas.height = H + bleed * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Не удалось собрать страницу");
  ctx.translate(bleed, bleed);
  paintPaper(ctx, page.paper, bleed, page.bg);
  if (page.kind === "cover" && !page.designed) await paintCover(ctx, meta);
  await loadFonts([...ghosts, ...page.blocks]);
  for (const block of ghosts) await paintBlock(ctx, block, isDark(page.bg));
  for (const block of page.blocks) await paintBlock(ctx, block, isDark(page.bg));
  paintStrokes(ctx, page);
  return canvas;
}

/** Свои шрифты (почерк) должны быть готовы до того, как холст начнёт писать буквами. */
async function loadFonts(blocks: PageBlock[]) {
  if (typeof document === "undefined" || !document.fonts) return;
  const specs = new Set<string>();
  for (const block of blocks) if (block.type === "text") specs.add(`${fontWeight(block.font)} 40px ${fontFamily(block.font)}`);
  await Promise.all([...specs].map((spec) => document.fonts.load(spec, "Книга рода аА").catch(() => [])));
}

function canvasJpeg(canvas: HTMLCanvasElement): Promise<PdfSheet> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error("Страница не записалась"));
          return;
        }
        resolve({ bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height });
      },
      "image/jpeg",
      0.93,
    );
  });
}

async function fontsReady() {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    [
      `600 40px ${FONT_FAMILY.serif}`,
      `500 40px ${FONT_FAMILY.sans}`,
      `500 40px ${FONT_FAMILY.script}`,
    ].map((spec) => document.fonts.load(spec, "Книга рода").catch(() => [])),
  );
  await document.fonts.ready;
}

function save(pdf: Uint8Array, name: string) {
  const blob = new Blob([Uint8Array.from(pdf)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Превью всей книги одним файлом — посмотреть или распечатать дома. */
export async function downloadFamilyBook(pages: BookPage[], meta: CoverMeta, onProgress?: (done: number, total: number) => void) {
  if (!pages.length) throw new Error("В книге ещё нет страниц");
  await fontsReady();
  const sheets: PdfSheet[] = [];
  for (const [index, page] of pages.entries()) {
    onProgress?.(index, pages.length);
    const sheet = await canvasJpeg(await paintPage(page, meta, { size: 20, bleed: 0, spine: 0 }, spreadGhosts(pages, page.id)));
    sheets.push({ ...sheet, pageW: 200 * MM, pageH: 200 * MM });
  }
  save(buildJpegPdf(sheets), "Книга рода — просмотр.pdf");
}

/**
 * Блок страниц для типографии: без обложки, каждая страница с вылетами, 300 dpi,
 * число страниц чётное (в конце добавляется чистая).
 */
export async function downloadPrintBlock(pages: BookPage[], meta: CoverMeta, setup: PrintSetup, onProgress?: (done: number, total: number) => void) {
  const inner = pages.filter((page) => page.kind !== "cover");
  if (!inner.length) throw new Error("В книге ещё нет страниц");
  const list = inner.length % 2 ? [...inner, { id: "blank", title: "", kind: "page" as const, paper: inner[inner.length - 1].paper, strokes: [], blocks: [] }] : inner;
  await fontsReady();
  const side = (setup.size * 10 + setup.bleed * 2) * MM;
  const sheets: PdfSheet[] = [];
  for (const [index, page] of list.entries()) {
    onProgress?.(index, list.length);
    const sheet = await canvasJpeg(await paintPage(page, meta, setup, spreadGhosts(inner, page.id)));
    sheets.push({ ...sheet, pageW: side, pageH: side, bleed: setup.bleed * MM });
  }
  save(buildJpegPdf(sheets), `Книга рода — блок ${setup.size}x${setup.size} (${list.length} стр).pdf`);
  return list.length;
}

export const PAPER_BG: Record<PaperKind, string> = { cream: "#fbf8f3", lined: "#fbf8f3", dots: "#fbf8f3", rose: "#f8e4e8", sage: "#e7eee2", kraft: "#ece0cf" };

/** Надпись на корешке по умолчанию. */
export function spineText(spine: SpineSetup, meta: CoverMeta): string {
  return spine.text.trim() || (meta.dedicatee.trim() ? `Книга рода · ${meta.dedicatee.trim()}` : "Книга рода");
}

/** Обложка разворотом: задняя сторона + корешок + лицевая, с вылетами (или загибом) по краям. */
export async function downloadPrintCover(pages: BookPage[], meta: CoverMeta, setup: PrintSetup, extra: { back?: BookPage | null; spine?: SpineSetup } = {}) {
  await fontsReady();
  const cover = pages.find((page) => page.kind === "cover") ?? { id: "cover", title: "Обложка", kind: "cover" as const, paper: "rose" as const, strokes: [], blocks: [] };
  const backSource = extra.back ?? backPage(cover.kind === "cover" ? (cover as BookPage) : null);
  const spineSet = extra.spine ?? { text: "", font: "serif" as const, size: 0 };
  // Обе стороны с вылетами: фото на всю обложку доходит до края под обрез.
  const front = await paintPage(cover, meta, setup);
  const back = await paintPage(backSource, meta, setup);
  const bleed = Math.round(setup.bleed * PX_PER_MM);
  const trim = front.width - bleed * 2;
  const spine = Math.round(setup.spine * PX_PER_MM);
  const canvas = document.createElement("canvas");
  canvas.width = trim * 2 + spine + bleed * 2;
  canvas.height = trim + bleed * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Не удалось собрать обложку");
  const frontColor = cover.bg || PAPER_BG[cover.paper];
  const backColor = backSource.bg || PAPER_BG[backSource.paper];
  const spineColor = spineSet.bg || frontColor;
  ctx.fillStyle = backColor;
  ctx.fillRect(0, 0, bleed + trim, canvas.height);
  ctx.fillStyle = spineColor;
  ctx.fillRect(bleed + trim, 0, spine, canvas.height);
  ctx.fillStyle = frontColor;
  ctx.fillRect(bleed + trim + spine, 0, trim + bleed, canvas.height);
  // Задняя: без вылета у корешка (справа).
  ctx.drawImage(back, 0, 0, trim + bleed, back.height, 0, 0, trim + bleed, back.height);
  // Корешок
  if (spine > 0) {
    ctx.save();
    const U2 = trim / 100;
    const auto = Math.min(spine * 0.55, 6 * U2);
    const fontPx = spineSet.size > 0 ? Math.min(spine * 0.9, (spineSet.size / 10) * (U2 * 1)) : auto;
    if (fontPx > 14) {
      ctx.translate(bleed + trim + spine / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = spineSet.color || (isDark(spineColor) ? "#fbf8f3" : COLORS.ink);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${fontWeight(spineSet.font)} ${fontPx}px ${fontFamily(spineSet.font)}`;
      ctx.fillText(spineText(spineSet, meta), 0, 0, trim * 0.8);
    }
    ctx.restore();
  }
  // Лицевая сторона
  // Лицевая: без вылета у корешка (слева).
  ctx.drawImage(front, bleed, 0, trim + bleed, front.height, bleed + trim + spine, 0, trim + bleed, front.height);
  const sheet = await canvasJpeg(canvas);
  const pdf = buildJpegPdf([{ ...sheet, pageW: canvas.width / PX_PER_MM * MM, pageH: canvas.height / PX_PER_MM * MM, bleed: setup.bleed * MM }]);
  save(pdf, `Книга рода — обложка ${setup.size}x${setup.size}, корешок ${setup.spine} мм.pdf`);
}
