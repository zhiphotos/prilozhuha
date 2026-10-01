// Печатная версия: каждая страница рисуется на холсте 300 dpi по тем же правилам, что и на экране.
import { resolveMedia } from "@/lib/rod/media";
import {
  COLORS,
  FONT_FAMILY,
  FONT_WEIGHT,
  PAGE_RATIO,
  POLAROID,
  lookColors,
  lookPad,
  stickerRatio,
  stickerUrl,
  textMetrics,
} from "@/lib/rod/page-style";
import { MM, buildJpegPdf, type PdfSheet } from "@/lib/rod/pdf";
import type { PrintSetup } from "@/lib/rod/page-style";
import type { BookPage, PageBlock, PaperKind } from "@/lib/rod/types";

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
    words.forEach((word) => {
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

function paintPaper(ctx: CanvasRenderingContext2D, paper: PaperKind, bleed: number) {
  const bg: Record<PaperKind, string> = {
    cream: "#fbf8f3",
    lined: "#fbf8f3",
    dots: "#fbf8f3",
    rose: "#f8e4e8",
    sage: "#e7eee2",
    kraft: "#ece0cf",
  };
  ctx.fillStyle = bg[paper];
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

function paintText(ctx: CanvasRenderingContext2D, block: Extract<PageBlock, { type: "text" }>) {
  if (!block.text.trim()) return;
  const metrics = textMetrics(block.font, block.size);
  const pad = lookPad(block.look);
  const colors = lookColors(block.look);
  const px = metrics.size * U;
  const lh = px * metrics.leading;
  ctx.font = `${FONT_WEIGHT[block.font]} ${px}px ${FONT_FAMILY[block.font]}`;
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
  ctx.textAlign = center ? "center" : "left";
  lines.forEach((line, index) => {
    const ly = pad.y * U + index * lh + lh / 2;
    ctx.fillText(line, center ? bgW / 2 : pad.x * U, ly);
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
  ctx.save();
  rotateAround(ctx, x, y, w, h, block.rotate ?? 0);
  if (lifted) {
    shadow(ctx, 1, 0.8);
    if (image) contain(ctx, image, 0, 0, w, h);
  } else if (block.frame === "polaroid") {
    const side = (POLAROID.side / 100) * w;
    const top = (POLAROID.top / 100) * w;
    const bottom = (POLAROID.bottom / 100) * w;
    shadow(ctx);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    noShadow(ctx);
    if (image) cover(ctx, image, side, top, w - side * 2, h - top - bottom);
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
    shadow(ctx);
    ctx.fillStyle = "#ffffff";
    rounded(ctx, 0, 0, w, h, 2.2 * U);
    ctx.fill();
    noShadow(ctx);
    ctx.save();
    rounded(ctx, border, border, w - border * 2, h - border * 2, 0.9 * U);
    ctx.clip();
    if (image) cover(ctx, image, border, border, w - border * 2, h - border * 2);
    ctx.restore();
  } else {
    const radius = block.frame === "tape" ? 0.6 * U : 1.4 * U;
    shadow(ctx);
    ctx.fillStyle = "#ffffff";
    rounded(ctx, 0, 0, w, h, radius);
    ctx.fill();
    noShadow(ctx);
    ctx.save();
    rounded(ctx, 0, 0, w, h, radius);
    ctx.clip();
    if (image) cover(ctx, image, 0, 0, w, h);
    ctx.restore();
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
  page.strokes.forEach((stroke) => {
    ctx.save();
    ctx.beginPath();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = stroke.alpha ?? 1;
    ctx.lineWidth = stroke.width * U;
    ctx.strokeStyle =
      stroke.color === "rose" ? COLORS.rose : stroke.color === "sage" ? COLORS.sage : stroke.color === "gold" ? "#d9a441" : stroke.color === "white" ? "#ffffff" : COLORS.ink;
    for (let i = 0; i + 1 < stroke.points.length; i += 2) {
      const px = (stroke.points[i] / 100) * W;
      const py = (stroke.points[i + 1] / 100) * H;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  });
}

/** Страница в печатном размере: обрезной формат + вылеты. Без setup — превью 18 см без вылетов. */
export async function paintPage(page: BookPage, meta: CoverMeta, setup?: PrintSetup): Promise<HTMLCanvasElement> {
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
  paintPaper(ctx, page.paper, bleed);
  if (page.kind === "cover" && !page.designed) await paintCover(ctx, meta);
  for (const block of page.blocks) {
    if (block.type === "text") paintText(ctx, block);
    else if (block.type === "photo") await paintPhoto(ctx, block);
    else if (block.type === "sticker") await paintSticker(ctx, block);
  }
  paintStrokes(ctx, page);
  return canvas;
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
    const sheet = await canvasJpeg(await paintPage(page, meta, { size: 20, bleed: 0, spine: 0 }));
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
    const sheet = await canvasJpeg(await paintPage(page, meta, setup));
    sheets.push({ ...sheet, pageW: side, pageH: side, bleed: setup.bleed * MM });
  }
  save(buildJpegPdf(sheets), `Книга рода — блок ${setup.size}x${setup.size} (${list.length} стр).pdf`);
  return list.length;
}

/** Обложка разворотом: задняя сторона + корешок + лицевая, с вылетами (или загибом) по краям. */
export async function downloadPrintCover(pages: BookPage[], meta: CoverMeta, setup: PrintSetup) {
  await fontsReady();
  const cover = pages.find((page) => page.kind === "cover") ?? { id: "cover", title: "Обложка", kind: "cover" as const, paper: "rose" as const, strokes: [], blocks: [] };
  const front = await paintPage(cover, meta, { ...setup, bleed: 0 });
  const trim = front.width;
  const bleed = Math.round(setup.bleed * PX_PER_MM);
  const spine = Math.round(setup.spine * PX_PER_MM);
  const canvas = document.createElement("canvas");
  canvas.width = trim * 2 + spine + bleed * 2;
  canvas.height = trim + bleed * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Не удалось собрать обложку");
  const bg: Record<PaperKind, string> = { cream: "#fbf8f3", lined: "#fbf8f3", dots: "#fbf8f3", rose: "#f8e4e8", sage: "#e7eee2", kraft: "#ece0cf" };
  ctx.fillStyle = bg[cover.paper];
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Задняя сторона
  W = trim;
  H = trim;
  U = trim / 100;
  ctx.save();
  ctx.translate(bleed, bleed);
  ctx.fillStyle = COLORS.roseDeep;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `500 ${4.2 * U}px ${FONT_FAMILY.script}`;
  ctx.fillText("Эту книгу можно продолжать.", trim / 2, trim * 0.46);
  ctx.fillText("Следующую страницу допишет уже другой.", trim / 2, trim * 0.46 + 5.4 * U);
  ctx.restore();
  // Корешок
  if (spine > 0) {
    ctx.save();
    ctx.fillStyle = "rgba(142, 61, 82, 0.08)";
    ctx.fillRect(bleed + trim, 0, spine, canvas.height);
    const fontPx = Math.min(spine * 0.55, 6 * U);
    if (fontPx > 14) {
      ctx.translate(bleed + trim + spine / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = COLORS.ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `600 ${fontPx}px ${FONT_FAMILY.serif}`;
      ctx.fillText(meta.dedicatee.trim() ? `Книга рода · ${meta.dedicatee.trim()}` : "Книга рода", 0, 0, trim * 0.8);
    }
    ctx.restore();
  }
  // Лицевая сторона
  ctx.drawImage(front, bleed + trim + spine, bleed);
  const sheet = await canvasJpeg(canvas);
  const pdf = buildJpegPdf([{ ...sheet, pageW: canvas.width / PX_PER_MM * MM, pageH: canvas.height / PX_PER_MM * MM, bleed: setup.bleed * MM }]);
  save(pdf, `Книга рода — обложка ${setup.size}x${setup.size}, корешок ${setup.spine} мм.pdf`);
}
