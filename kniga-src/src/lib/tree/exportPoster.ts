import { buildJpegPdf } from "../rod/pdf.ts";
import { fullName, kinship, yearsOf } from "./kinship.ts";
import { layoutTree } from "./layout.ts";
import { PLATE_GAP, PLATE_H, PLATE_W, PORTRAIT_R, ROW_H } from "./metrics.ts";
import { layoutTaiga, TAIGA_FRAME, TAIGA_FRAMES } from "./taiga.ts";
import { layoutBoheme, BOHEME_FRAME, BOHEME_FRAMES } from "./boheme.ts";
import { layoutGzhel, GZHEL_FRAME, GZHEL_FRAMES } from "./gzhel.ts";
import { layoutCameo, FRAME, FRAMES } from "./cameo.ts";
import { layoutPoster } from "./poster.ts";
import { type TreeStyle } from "./styles.ts";
import type { TreeData, UnionStatus } from "./types.ts";

const INK = "#1c1612";

function lineColor(status: UnionStatus, dark: boolean): string {
  if (dark) {
    if (status === "divorced") return "#e0b15c";
    if (status === "widowed") return "#c9b6ea";
    if (status === "partner") return "#e0b56a";
    return "#f0a8c4";
  }
  if (status === "divorced") return "#8a6230";
  if (status === "widowed") return "#6d5488";
  if (status === "partner") return "#e0b56a";
  return "#9d3a5c";
}

function pillText(status: UnionStatus): string {
  if (status === "divorced") return "РАЗВОД";
  if (status === "widowed") return "ВДОВСТВО";
  if (status === "partner") return "СОЮЗ";
  return "БРАК";
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function fitScale(width: number, height: number) {
  let scale = 2;
  while (scale > 0.4 && (width * scale > 4096 || height * scale > 4096 || width * height * scale * scale > 16_000_000)) scale *= 0.84;
  return scale;
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

async function savePng(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("png");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "kniga-roda.png";
  link.click();
  URL.revokeObjectURL(url);
}

/** Лист древа одним PDF: страница по размеру картинки, чтобы ничего не резалось и не масштабировалось. */
async function savePdf(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("pdf");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // 96 точек на дюйм: 1 px = 0,75 pt; у PDF предел страницы 14400 pt.
  const k = Math.min(0.75, 14400 / Math.max(canvas.width, canvas.height));
  const pdf = buildJpegPdf([{ bytes, width: canvas.width, height: canvas.height, pageW: canvas.width * k, pageH: canvas.height * k }]);
  const file = new Blob([Uint8Array.from(pdf)], { type: "application/pdf" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "kniga-roda.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** PDF из нескольких листов: у каждого свой размер, ничего не сжимается в одну полосу. */
async function savePdfSheets(input: { canvases: HTMLCanvasElement[]; raster: number }) {
  const canvases = input.canvases;
  const sheets = [];
  for (const canvas of canvases) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error("pdf");
    // Холст нарисован в 1,5 раза крупнее листа: лист в PDF – по размеру схемы (96 точек на дюйм), картинка внутри чёткая при увеличении.
    const k = 1 / input.raster;
    sheets.push({ bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height, pageW: canvas.width * k, pageH: canvas.height * k });
  }
  const pdf = buildJpegPdf(sheets);
  const file = new Blob([Uint8Array.from(pdf)], { type: "application/pdf" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "kniga-roda.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function exportPoster(data: TreeData, style: TreeStyle = "work", banner = "", paper: "white" | "black" = "white", flow: "down" | "up" = "down", format: "png" | "pdf" = "png", print: PrintOptions = DEFAULT_PRINT): Promise<void> {
  const out = format === "pdf" ? savePdf : savePng;
  await document.fonts.load('600 64px "Cormorant Garamond"');
  await document.fonts.load('500 22px Manrope');
  const titleOf = (fallback: string) => banner.trim() || fallback;
  if (style === "taiga") return out(await renderTaiga(data, titleOf, flow));
  if (style === "boheme") return out(await renderBoheme(data, titleOf, flow));
  if (style === "gzhel") return out(await renderGzhel(data, titleOf, flow));
  if (style === "cameo") return out(await renderCameo(data, titleOf, flow));
  if (style === "carved") return out(await renderLiving(data, titleOf, flow));
  if (format === "pdf") return savePdfSheets(await renderWorkSheets(data, paper, flow, print));
  if (format === "png") {
    // Длинное древо в одну ленту нечитаемо: большие схемы выводим полосами друг под другом в высоком разрешении.
    const prep = await prepareWork(data, paper, flow);
    if (prep.layout.width > 7000) return out(drawBandsPng(prep));
  }
  await out(await renderWork(data, paper, flow));
}

function drawBandsPng(prep: WorkPrep): HTMLCanvasElement {
  const { layout, tone } = prep;
  const xs = layout.nodes.map((n) => n.x);
  const left = Math.min(...xs) - PLATE_W / 2 - 40;
  const right = Math.max(...xs) + PLATE_W / 2 + 40;
  const n = Math.max(2, Math.ceil((right - left) / 4200));
  // Не больше ~100 мегапикселей: иначе телефон не соберёт картинку; крупно печатать лучше через PDF.
  const estPx = ((right - left) / n + 80) * (n * (layout.height + 180) + 210);
  const s = Math.min(1, Math.sqrt(100e6 / estPx));
  const { canvas, bandOf, place } = drawBands(prep, n, [left, right], s, 40, 110, 60, 100);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = tone.footer;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = '600 44px "Cormorant Garamond", serif';
  ctx.fillText("Книга Рода", 40, 70);
  ctx.font = "500 22px Manrope, sans-serif";
  ctx.globalAlpha = 0.65;
  for (let i = 0; i < n; i++) {
    const [, y] = place(left + (i * (right - left)) / n, 0);
    ctx.fillText(`полоса ${i + 1} из ${n}${i < n - 1 ? " · продолжение справа ниже" : ""}`, 44, y - 8 > 90 ? y - 8 : 96);
  }
  ctx.globalAlpha = 1;
  void bandOf;
  return canvas;
}

type WorkPrep = {
  dark: boolean;
  tone: { sheet: string; blood: string; plate: string; ink: string; role: string; muted: string; ring: string; pill: string; empty: string; footer: string };
  layout: ReturnType<typeof layoutTree>;
  data: TreeData;
  people: Map<string, TreeData["people"][number]>;
  photos: Map<string, HTMLImageElement | null>;
};

async function prepareWork(data: TreeData, paper: "white" | "black", flow: "down" | "up"): Promise<WorkPrep> {
  const dark = paper === "black";
  const tone = dark
    ? { sheet: "#100e0c", blood: "#8eb6ff", plate: "#241c16", ink: "#f4efe4", role: "#e7b39a", muted: "#cbbba6", ring: "#f4efe4", pill: "#1a1612", empty: "#3a2e26", footer: "#f4efe4" }
    : { sheet: "#fbf7f0", blood: "#1e4f8f", plate: "#f6f1e7", ink: "#1c1612", role: "#8d4e3a", muted: "#7d7368", ring: "#fffaf2", pill: "#fffaf2", empty: "#d7c3a4", footer: "#1c1612" };
  let own = "";
  try {
    own = localStorage.getItem("kniga-tree-line") ?? "";
  } catch {
    own = "";
  }
  if (/^#[0-9a-f]{6}$/i.test(own)) tone.blood = own;
  const layout = layoutTree(data.people, data.unions, data.focusId, flow);
  const people = new Map(data.people.map((p) => [p.id, p]));
  const photos = new Map<string, HTMLImageElement | null>();
  await Promise.all([...people.values()].map(async (p) => photos.set(p.id, await loadImage(p.photo))));
  return { dark, tone, layout, data, people, photos };
}

/** Рисует древо в текущих координатах холста (масштаб и сдвиг уже заданы снаружи). */
function drawWork(ctx: CanvasRenderingContext2D, prep: WorkPrep, sheetW: number, sheetH: number) {
  const { dark, tone, layout, data, people, photos } = prep;
  ctx.fillStyle = tone.sheet;
  ctx.fillRect(0, 0, sheetW, sheetH);
  ctx.strokeStyle = tone.blood;
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  const hidden = new Set(layout.detached ?? []);
  for (const bus of layout.buses) {
    const min = bus.xs[0];
    const max = bus.xs[bus.xs.length - 1];
    ctx.beginPath();
    if (bus.fromX != null && bus.fromY != null && min != null && max != null) {
      ctx.moveTo(bus.fromX, bus.fromY);
      ctx.lineTo(bus.fromX, bus.busY);
      ctx.lineTo(bus.fromX < min ? min : bus.fromX > max ? max : bus.fromX, bus.busY);
    }
    if (bus.partnerXs && bus.partnerTop != null && bus.bracketY !== undefined) {
      for (const x of bus.partnerXs) {
        ctx.moveTo(x, bus.partnerTop);
        ctx.lineTo(x, bus.bracketY);
      }
      ctx.moveTo(Math.min(...bus.partnerXs), bus.bracketY);
      ctx.lineTo(Math.max(...bus.partnerXs), bus.bracketY);
      const mid = bus.fromX ?? (bus.partnerXs[0]! + bus.partnerXs[1]!) / 2;
      ctx.moveTo(mid, bus.bracketY);
      ctx.lineTo(mid, bus.busY);
      ctx.moveTo(Math.min(mid, ...bus.xs), bus.busY);
      ctx.lineTo(Math.max(mid, ...bus.xs), bus.busY);
    } else if (min != null && max != null && bus.xs.length > 1) {
      ctx.moveTo(min, bus.busY);
      ctx.lineTo(max, bus.busY);
    }
    for (const x of bus.xs) {
      ctx.moveTo(x, bus.busY);
      ctx.lineTo(x, bus.childTop);
    }
    ctx.stroke();
  }
  for (const link of layout.spouses) {
    const color = lineColor(link.status, dark);
    ctx.strokeStyle = color;
    ctx.setLineDash(link.status === "divorced" ? [6, 7] : []);
    if (link.bracketY === undefined) {
      ctx.beginPath();
      const dir = Math.sign(link.x2 - link.x1) || 1;
      ctx.moveTo(link.x1 + dir * (PORTRAIT_R + 2), link.y1);
      ctx.lineTo(link.x2 - dir * (PORTRAIT_R + 2), link.y2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const text = pillText(link.status);
    const w = text.length > 7 ? 112 : 78;
    const mx = (link.x1 + link.x2) / 2;
    const py = link.bracketY ?? link.y1;
    ctx.fillStyle = tone.pill;
    roundRect(ctx, mx - w / 2, py - 12, w, 24, 12);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "700 10px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, mx, py);
  }
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = dark ? "rgba(244,226,196,0.72)" : "rgba(60,42,28,0.72)";
  ctx.font = "600 13px Manrope, sans-serif";
  ctx.textAlign = "left";
  for (const label of layout.labels) ctx.fillText(label.text, 18, label.y);
  for (const node of layout.nodes) {
    const person = people.get(node.id);
    if (!person) continue;
    const photo = photos.get(node.id);
    ctx.save();
    ctx.beginPath();
    ctx.arc(node.x, node.y, PORTRAIT_R, 0, Math.PI * 2);
    ctx.clip();
    if (photo) ctx.drawImage(photo, node.x - PORTRAIT_R, node.y - PORTRAIT_R, PORTRAIT_R * 2, PORTRAIT_R * 2);
    else {
      ctx.fillStyle = tone.empty;
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = tone.ring;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(node.x, node.y, PORTRAIT_R, 0, Math.PI * 2);
    ctx.stroke();
    if (hidden.has(node.id)) {
      ctx.fillStyle = tone.pill;
      ctx.beginPath();
      ctx.arc(node.x - 32, node.y - 32, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dark ? "#e0b56a" : "#8d4e3a";
      ctx.font = "700 14px Manrope, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("↑", node.x - 32, node.y - 31);
      ctx.textBaseline = "alphabetic";
    }
    const top = node.y + PORTRAIT_R + PLATE_GAP;
    ctx.fillStyle = tone.plate;
    roundRect(ctx, node.x - PLATE_W / 2, top, PLATE_W, PLATE_H, 14);
    ctx.fill();
    ctx.fillStyle = tone.ink;
    ctx.textAlign = "center";
    ctx.font = '600 16px "Cormorant Garamond", serif';
    ctx.fillText(fullName(person), node.x, top + 24, PLATE_W - 14);
    ctx.fillStyle = tone.role;
    ctx.font = "700 11px Manrope, sans-serif";
    ctx.fillText(kinship(data.people, data.unions, data.focusId, person.id).card, node.x, top + 42);
    ctx.fillStyle = tone.muted;
    ctx.font = "11px Manrope, sans-serif";
    ctx.fillText(yearsOf(person), node.x, top + 60);
  }
}

async function renderWork(data: TreeData, paper: "white" | "black", flow: "down" | "up"): Promise<HTMLCanvasElement> {
  const prep = await prepareWork(data, paper, flow);
  const { layout, tone } = prep;
  const footer = 120;
  const scale = fitScale(layout.width, layout.height + footer);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(layout.width * scale);
  canvas.height = Math.ceil((layout.height + footer) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.scale(scale, scale);
  drawWork(ctx, prep, layout.width, layout.height + footer);
  paintFooter(ctx, canvas, layout.height, scale, tone.footer);
  return canvas;
}

/** Границы листов по горизонтали: примерно по ширине листа, но между карточками, чтобы карточка не резалась пополам. */
function columnEdges(xs: number[], from: number, to: number, target: number): number[] {
  const sorted = [...new Set(xs.map((x) => Math.round(x)))].sort((a, b) => a - b);
  const clear = (b: number) => sorted.every((x) => Math.abs(x - b) >= PLATE_W / 2 + 8);
  const edges = [from];
  while (edges[edges.length - 1]! < to) {
    const start = edges[edges.length - 1]!;
    if (start + target >= to) {
      edges.push(to);
      break;
    }
    let best = start + target;
    for (let b = start + target; b > start + target * 0.3; b -= 8) {
      if (clear(b)) {
        best = b;
        break;
      }
    }
    edges.push(best);
  }
  return edges;
}

export type PrintOptions = { paper: "A4" | "A3"; scale: "large" | "medium" | "small" };
export const DEFAULT_PRINT: PrintOptions = { paper: "A4", scale: "medium" };
/** Страница в пунктах (альбомная ориентация) и сколько пунктов бумаги приходится на одну единицу схемы. */
const PAGE_PT = { A4: { w: 842, h: 595 }, A3: { w: 1191, h: 842 } } as const;
const PT_PER_UNIT = { large: 0.7, medium: 0.55, small: 0.42 } as const;
const RASTER = 2.4;

/** Подпись про печать: сколько листов и какой размер карточки получится. */
export function printPlan(layoutWidth: number, layoutHeight: number, opts: PrintOptions) {
  const page = PAGE_PT[opts.paper];
  const wanted = PT_PER_UNIT[opts.scale];
  const usableH = page.h - 56;
  // Число рядов поколений на листе целое: подгоняем масштаб так, чтобы листа хватило ровно на них (без пустой полосы внизу).
  const rows = Math.max(1, Math.round(usableH / wanted / ROW_H));
  const k = usableH / (rows * ROW_H);
  const sheetW = (page.w - 40) / k;
  return { k, sheetW, rows, cardCm: Math.round(((PLATE_W * k) / 72) * 2.54 * 10) / 10, estSheets: Math.ceil(layoutWidth / sheetW) * Math.ceil(layoutHeight / (rows * ROW_H)) };
}

/** Рисует схему полосами друг под другом (как строки текста): длинное древо занимает страницу целиком, а не тонкую ленту. */
function drawBands(prep: WorkPrep, bands: number, bandX: [number, number], s: number, pad: number, top: number, gap: number, extraH = 0): { canvas: HTMLCanvasElement; bandOf: (x: number) => number; place: (x: number, y: number) => [number, number] } {
  const { layout, tone } = prep;
  const [left, right] = bandX;
  const bw = (right - left) / bands;
  const bh = layout.height + 120;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(bw * s + pad * 2);
  canvas.height = Math.ceil(top + bands * (bh * s + gap) + extraH);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = tone.sheet;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const total = layout.width + Math.abs(left) + 2000;
  for (let i = 0; i < bands; i++) {
    const oy = top + i * (bh * s + gap);
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, oy, bw * s, bh * s);
    ctx.clip();
    ctx.setTransform(s, 0, 0, s, pad - (left + i * bw) * s, oy);
    drawWork(ctx, prep, total, layout.height + 200);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (i > 0) { ctx.strokeStyle = tone.muted; ctx.globalAlpha = 0.5; ctx.setLineDash([6, 6]); ctx.strokeRect(pad, oy, bw * s, bh * s); ctx.setLineDash([]); ctx.globalAlpha = 1; } else { ctx.strokeStyle = tone.muted; ctx.globalAlpha = 0.5; ctx.setLineDash([6, 6]); ctx.strokeRect(pad, oy, bw * s, bh * s); ctx.setLineDash([]); ctx.globalAlpha = 1; }
  }
  const bandOf = (x: number) => Math.min(bands - 1, Math.max(0, Math.floor((x - left) / bw)));
  const place = (x: number, y: number): [number, number] => {
    const i = bandOf(x);
    return [pad + (x - left - i * bw) * s, top + i * (bh * s + gap) + y * s];
  };
  return { canvas, bandOf, place };
}

/**
 * Схема для PDF: листы A4/A3 с читаемым размером карточек (масштаб выбирает человек), страницы настоящего размера.
 * Первая страница: обзор (схема полосами) с номерами листов. Границы листов идут между семьями, на краях метки продолжения.
 */
async function renderWorkSheets(data: TreeData, paper: "white" | "black", flow: "down" | "up", opts: PrintOptions = DEFAULT_PRINT): Promise<{ canvases: HTMLCanvasElement[]; raster: number }> {
  const prep = await prepareWork(data, paper, flow);
  const { layout, tone } = prep;
  const page = PAGE_PT[opts.paper];
  const plan = printPlan(layout.width, layout.height, opts);
  const K = plan.k * RASTER;
  const SHEET_W = plan.sheetW;
  const SHEET_H = plan.rows * ROW_H;
  const xs = layout.nodes.map((n) => n.x);
  const left = Math.min(...xs) - PLATE_W / 2 - 40;
  const right = Math.max(...xs) + PLATE_W / 2 + 40;
  const minY = Math.min(...layout.nodes.map((n) => n.y));
  const base = minY - 130;
  const rowsCount = Math.max(1, Math.ceil((layout.height + 120 - base) / SHEET_H));
  type Tile = { x0: number; x1: number; y0: number; y1: number; r: number; c: number };
  const tiles: Tile[] = [];
  for (let r = 0; r < rowsCount; r++) {
    const y0 = base + r * SHEET_H;
    const y1 = y0 + SHEET_H;
    // Границы листов считаем отдельно для каждой полосы рядов: режем только в промежутках между карточками этой полосы.
    const bandXs = layout.nodes.filter((n) => n.y + 140 > y0 && n.y - PORTRAIT_R < y1).map((n) => n.x);
    if (!bandXs.length) continue;
    const bl = Math.min(...bandXs) - PLATE_W / 2 - 40;
    const br = Math.max(...bandXs) + PLATE_W / 2 + 40;
    const cols = columnEdges(bandXs, bl, br, SHEET_W);
    for (let c = 0; c < cols.length - 1; c++) {
      const t = { x0: cols[c]!, x1: cols[c + 1]!, y0, y1, r, c };
      const has = layout.nodes.some((n) => n.x + PLATE_W / 2 > t.x0 && n.x - PLATE_W / 2 < t.x1 && n.y + 140 > t.y0 && n.y - PORTRAIT_R < t.y1);
      if (has) tiles.push(t);
    }
  }
  const numberOf = new Map(tiles.map((t, i) => [t, i + 1]));
  const neighbor = (t: Tile, dr: number, dc: number): number | undefined => {
    if (dr === 0) return numberOf.get(tiles.find((o) => o.r === t.r && o.c === t.c + dc) as Tile);
    const cx = (t.x0 + t.x1) / 2;
    const hit = tiles.find((o) => o.r === t.r + dr && o.x0 <= cx && o.x1 > cx);
    return hit ? numberOf.get(hit) : undefined;
  };
  const out: HTMLCanvasElement[] = [];
  const PW = Math.round(page.w * RASTER);
  const PH = Math.round(page.h * RASTER);
  // Обзор: схема полосами, чтобы заполнить страницу; выбираем число полос с самым крупным масштабом.
  {
    let best = { n: 1, s: 0 };
    for (let n = 1; n <= 14; n++) {
      const bw = (right - left) / n;
      const s = Math.min((PW - 60) / bw, (PH - 140 - (n - 1) * 24) / (n * (layout.height + 120)));
      if (s > best.s) best = { n, s };
    }
    const bands = drawBands(prep, best.n, [left, right], best.s, 30, 100, 24);
    const ov = document.createElement("canvas");
    ov.width = PW;
    ov.height = PH;
    const octx = ov.getContext("2d");
    if (!octx) throw new Error("canvas");
    octx.fillStyle = tone.sheet;
    octx.fillRect(0, 0, PW, PH);
    octx.drawImage(bands.canvas, (PW - bands.canvas.width) / 2, 0);
    const dx = (PW - bands.canvas.width) / 2;
    octx.fillStyle = tone.footer;
    octx.font = `600 ${Math.round(18 * RASTER)}px "Cormorant Garamond", serif`;
    octx.textAlign = "left";
    octx.fillText(`Книга Рода · обзор · листов: ${tiles.length}, ${opts.paper}, карточка ≈ ${plan.cardCm} см`, 30, 56);
    octx.lineWidth = 2;
    octx.strokeStyle = "#c0392b";
    octx.fillStyle = "#c0392b";
    octx.font = `700 ${Math.max(14, Math.round(5.5 * RASTER))}px Manrope, sans-serif`;
    tiles.forEach((t, i) => {
      const [px, py] = bands.place(Math.max(t.x0, left), t.y0);
      const w = (Math.min(t.x1, right) - t.x0) * best.s;
      octx.strokeRect(dx + px, py, w, (t.y1 - t.y0) * best.s);
      octx.fillText(String(i + 1), dx + px + 3, py + Math.max(14, 5.5 * RASTER));
    });
    out.push(ov);
  }
  for (const [i, t] of tiles.entries()) {
    const canvas = document.createElement("canvas");
    canvas.width = PW;
    canvas.height = PH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = tone.sheet;
    ctx.fillRect(0, 0, PW, PH);
    const ox = 20 * RASTER;
    const oy = 16 * RASTER;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, (t.x1 - t.x0) * K, (t.y1 - t.y0) * K);
    ctx.clip();
    ctx.setTransform(K, 0, 0, K, ox - t.x0 * K, oy - t.y0 * K);
    drawWork(ctx, prep, layout.width + Math.abs(left) + 2000, layout.height + 200);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = tone.footer;
    ctx.textBaseline = "alphabetic";
    ctx.globalAlpha = 0.6;
    ctx.textAlign = "left";
    ctx.font = `500 ${Math.round(8 * RASTER)}px Manrope, sans-serif`;
    ctx.fillText(`Книга Рода · лист ${i + 1} из ${tiles.length}`, ox, PH - 12 * RASTER);
    ctx.globalAlpha = 1;
    // Метки продолжения: куда уходит схема за краем листа.
    ctx.fillStyle = "#c0392b";
    ctx.font = `700 ${Math.round(8 * RASTER)}px Manrope, sans-serif`;
    const mark = (text: string, x: number, y: number, align: CanvasTextAlign) => { ctx.textAlign = align; ctx.fillText(text, x, y); };
    const R = neighbor(t, 0, 1), L = neighbor(t, 0, -1), D = neighbor(t, 1, 0), U = neighbor(t, -1, 0);
    if (R) mark(`продолжение → лист ${R}`, PW - ox, PH - 12 * RASTER, "right");
    if (L) mark(`← с листа ${L}`, PW / 2, PH - 12 * RASTER, "center");
    if (D) mark(`↓ лист ${D}`, PW - ox, oy + 8 * RASTER, "right");
    if (U) mark(`↑ с листа ${U}`, PW / 2, oy + 8 * RASTER, "center");
    out.push(canvas);
  }
  return { canvases: out, raster: RASTER };
}

function paintFooter(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, sheetHeight: number, scale: number, color: string) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `500 ${Math.round(22 * scale)}px "Cormorant Garamond", serif`;
  ctx.fillText("Книга Рода", canvas.width / 2, sheetHeight * scale + 48 * scale);
  ctx.restore();
}

async function renderLiving(data: TreeData, titleOf: (fallback: string) => string, flow: "down" | "up"): Promise<HTMLCanvasElement> {
  const poster = layoutPoster(data.people, data.unions, data.focusId, flow);
  const footer = 88;
  const scale = fitScale(poster.width, poster.height + footer);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(poster.width * scale);
  canvas.height = Math.ceil((poster.height + footer) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  const people = new Map(data.people.map((p) => [p.id, p]));
  const photos = new Map<string, HTMLImageElement | null>();
  const bg = await loadImage("/tree/oak-white.jpg");
  await Promise.all([...people.values()].map(async (p) => photos.set(p.id, await loadImage(p.photo))));
  ctx.scale(scale, scale);
  ctx.fillStyle = "#f7f6f3";
  ctx.fillRect(0, 0, poster.width, poster.height + footer);
  if (bg) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, poster.width, poster.height);
    ctx.clip();
    drawCover(ctx, bg, poster.width, poster.height);
    ctx.restore();
  }
  ctx.strokeStyle = "rgba(55,48,40,0.38)";
  ctx.lineWidth = 1.15;
  for (const d of poster.links) ctx.stroke(new Path2D(d));
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = '500 11px Manrope, sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(titleOf(poster.title), poster.titleX, poster.titleY);
  for (const node of poster.nodes) {
    const person = people.get(node.id);
    if (!person) continue;
    const w = node.w;
    const h = poster.cardH;
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    roundRect(ctx, node.x - w / 2, node.y - h / 2, w, h, 16);
    ctx.fill();
    const photo = photos.get(node.id);
    const pr = 18;
    if (photo) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(node.x - w / 2 + 28, node.y, pr, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(photo, node.x - w / 2 + 28 - pr, node.y - pr, pr * 2, pr * 2);
      ctx.restore();
    }
    ctx.fillStyle = "#171717";
    ctx.font = '500 13px Manrope, sans-serif';
    ctx.textAlign = "left";
    ctx.fillText(fullName(person), node.x - w / 2 + 52, node.y - 6, w - 60);
    ctx.fillStyle = "#737373";
    ctx.font = "11px Manrope, sans-serif";
    ctx.fillText(yearsOf(person), node.x - w / 2 + 52, node.y + 10);
  }
  paintFooter(ctx, canvas, poster.height, scale, INK);
  return canvas;
}

type FrameSpec = { src: string; hole: number };
type Sheet = { width: number; height: number; nodes: { id: string; x: number; y: number }[]; vines: string[]; marks: { x: number; y: number; text: string }[]; title: string };

async function renderFramed(
  data: TreeData,
  titleOf: (fallback: string) => string,
  sheet: Sheet,
  frames: readonly FrameSpec[],
  size: number,
  ink: string,
  paper: string,
  opts: { bg?: string; blur?: number; veil?: string; sprigs?: boolean } = {},
): Promise<HTMLCanvasElement> {
  const footer = 72;
  const scale = fitScale(sheet.width, sheet.height + footer);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(sheet.width * scale);
  canvas.height = Math.ceil((sheet.height + footer) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  const people = new Map(data.people.map((p) => [p.id, p]));
  const loaded = await Promise.all(frames.map((frame) => loadImage(frame.src)));
  const photos = new Map<string, HTMLImageElement | null>();
  const bg = opts.bg ? await loadImage(opts.bg) : null;
  const sprig = opts.sprigs ? await loadImage("/tree/boheme/sprig.png") : null;
  await Promise.all([...people.values()].map(async (p) => photos.set(p.id, await loadImage(p.photo))));
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, sheet.width, sheet.height);
  ctx.clip();
  if (bg) {
    if (opts.blur) ctx.filter = `blur(${opts.blur}px)`;
    drawCover(ctx, bg, sheet.width, sheet.height);
    ctx.filter = "none";
  }
  if (opts.veil) {
    ctx.fillStyle = opts.veil;
    ctx.fillRect(0, 0, sheet.width, sheet.height);
  }
  ctx.restore();
  if (sprig) {
    const s = 170;
    ctx.drawImage(sprig, 0, 0, s, s);
    ctx.save();
    ctx.translate(sheet.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(sprig, 0, 0, s, s);
    ctx.restore();
    ctx.save();
    ctx.translate(0, sheet.height);
    ctx.scale(1, -1);
    ctx.drawImage(sprig, 0, 0, s, s);
    ctx.restore();
    ctx.save();
    ctx.translate(sheet.width, sheet.height);
    ctx.scale(-1, -1);
    ctx.drawImage(sprig, 0, 0, s, s);
    ctx.restore();
  }
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.font = '34px "Cormorant Garamond", serif';
  ctx.fillText(titleOf(sheet.title), sheet.width / 2, 48);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1.15;
  ctx.lineCap = "round";
  for (const d of sheet.vines) ctx.stroke(new Path2D(d));
  ctx.globalAlpha = 1;
  ctx.font = 'italic 12px "Cormorant Garamond", serif';
  for (const mark of sheet.marks) ctx.fillText(mark.text, mark.x, mark.y);
  for (const node of sheet.nodes) {
    const person = people.get(node.id);
    if (!person) continue;
    let n = 0;
    for (const ch of person.id) n = (n + ch.charCodeAt(0)) % frames.length;
    const spec = frames[n]!;
    const photoR = size * spec.hole;
    const photo = photos.get(node.id);
    ctx.save();
    ctx.beginPath();
    ctx.arc(node.x, node.y, photoR, 0, Math.PI * 2);
    ctx.clip();
    if (photo) ctx.drawImage(photo, node.x - photoR, node.y - photoR, photoR * 2, photoR * 2);
    else {
      ctx.fillStyle = "#3a332c";
      ctx.fillRect(node.x - photoR, node.y - photoR, photoR * 2, photoR * 2);
    }
    ctx.restore();
    const frame = loaded[n];
    if (frame) ctx.drawImage(frame, node.x - size, node.y - size, size * 2, size * 2);
    const role = kinship(data.people, data.unions, data.focusId, person.id).card;
    const years = yearsOf(person);
    const top = node.y + size + 4;
    ctx.fillStyle = ink;
    ctx.font = '15px "Cormorant Garamond", serif';
    ctx.fillText(fullName(person), node.x, top + 16, 210);
    ctx.globalAlpha = 0.86;
    ctx.font = '11px "Cormorant Garamond", serif';
    ctx.fillText(role, node.x, top + 34);
    if (years) {
      ctx.globalAlpha = 0.72;
      ctx.fillText(years, node.x, top + 50);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  paintFooter(ctx, canvas, sheet.height, scale, ink === "#f4efe4" || ink === "#f4f7f2" || ink === "#f6f1e6" ? "#f4efe4" : INK);
  return canvas;
}

async function renderCameo(data: TreeData, titleOf: (fallback: string) => string, flow: "down" | "up") {
  return renderFramed(data, titleOf, layoutCameo(data.people, data.unions, data.focusId, flow), FRAMES, FRAME, "#f4efe4", "#000");
}

async function renderGzhel(data: TreeData, titleOf: (fallback: string) => string, flow: "down" | "up") {
  const sheet = layoutGzhel(data.people, data.unions, data.focusId, flow);
  const canvas = await renderFramed(data, titleOf, sheet, GZHEL_FRAMES, GZHEL_FRAME, "#163a78", "#fbfcfe");
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const scale = canvas.width / sheet.width;
  const frames = await Promise.all([1, 2, 4, 5].map((n) => loadImage(`/tree/gzhel/frame-${n}.png`)));
  const tile = 92;
  const inset = 16;
  const spots = [
    [inset, inset, frames[0]],
    [sheet.width - inset - tile, inset, frames[1]],
    [inset, sheet.height - inset - tile, frames[2]],
    [sheet.width - inset - tile, sheet.height - inset - tile, frames[3]],
  ] as const;
  ctx.save();
  ctx.scale(scale, scale);
  for (const [x, y, img] of spots) if (img) ctx.drawImage(img, x, y, tile, tile);
  ctx.restore();
  return canvas;
}

async function renderBoheme(data: TreeData, titleOf: (fallback: string) => string, flow: "down" | "up") {
  return renderFramed(data, titleOf, layoutBoheme(data.people, data.unions, data.focusId, flow), BOHEME_FRAMES, BOHEME_FRAME, "#f6f1e6", "#1a2418", {
    bg: "/tree/boheme/bg.jpg",
    blur: 10,
    veil: "rgba(16,22,14,0.42)",
    sprigs: true,
  });
}

async function renderTaiga(data: TreeData, titleOf: (fallback: string) => string, flow: "down" | "up") {
  return renderFramed(data, titleOf, layoutTaiga(data.people, data.unions, data.focusId, flow), TAIGA_FRAMES, TAIGA_FRAME, "#f4f7f2", "#142018", {
    bg: "/tree/taiga/bg.jpg",
    blur: 3,
    veil: "rgba(14,22,18,0.35)",
  });
}
