import type { BookPage, FontKind, InkStroke, PageBlock, PaperKind, StickerKind } from "@/lib/rod/types";

const PAGE_W = 510.24;
const PAGE_H = 680.32;

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function paperColor(paper: PaperKind): string {
  if (paper === "rose") return cssVar("--color-blush", "#f6d5dc");
  if (paper === "sage") return cssVar("--color-sage-soft", "#dce6d6");
  return cssVar("--color-paper", "#faf7f2");
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  text.split("\n").forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      if (lines.length < maxLines) lines.push("");
      return;
    }
    let line = "";
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth) line = next;
      else {
        if (line && lines.length < maxLines) lines.push(line);
        line = word;
      }
    });
    if (line && lines.length < maxLines) lines.push(line);
  });
  return lines.slice(0, maxLines);
}

function fontOf(font: FontKind, size: "sm" | "md" | "lg", canvasH: number): { css: string; px: number; gap: number } {
  const base = canvasH / 620;
  if (font === "script") return { css: `500 ${Math.round(30 * base)}px Caveat, cursive`, px: 30 * base, gap: 1.05 };
  if (font === "sans") return { css: `500 ${Math.round(16 * base)}px Manrope, sans-serif`, px: 16 * base, gap: 1.35 };
  if (size === "lg") return { css: `560 ${Math.round(34 * base)}px Fraunces, Georgia, serif`, px: 34 * base, gap: 1.08 };
  if (size === "sm") return { css: `480 ${Math.round(15 * base)}px Fraunces, Georgia, serif`, px: 15 * base, gap: 1.35 };
  return { css: `520 ${Math.round(20 * base)}px Fraunces, Georgia, serif`, px: 20 * base, gap: 1.25 };
}

function paintText(ctx: CanvasRenderingContext2D, text: string, font: FontKind, size: "sm" | "md" | "lg", x: number, y: number, w: number, color: string, canvasH: number) {
  const spec = fontOf(font, size, canvasH);
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = spec.css;
  ctx.textBaseline = "top";
  const lines = wrap(ctx, text, w, size === "sm" ? 14 : 8);
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * spec.px * spec.gap, w);
  });
  ctx.restore();
}

async function paintBlock(ctx: CanvasRenderingContext2D, block: PageBlock, width: number, height: number, ink: string, paper: string, muted: string) {
  const x = (block.x / 100) * width;
  const y = (block.y / 100) * height;
  const rotate = block.rotate ?? 0;
  ctx.save();
  if (block.type === "photo") {
    const w = (block.w / 100) * width;
    const h = (block.h / 100) * height;
    const image = await loadImage(block.frame === "sticker" && block.cut ? block.cut : block.src);
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.shadowColor = "rgba(28, 25, 21, 0.28)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 12;
    if (block.frame === "polaroid") {
      ctx.fillStyle = paper;
      round(ctx, -w / 2, -h / 2, w, h, 8);
      ctx.fill();
      ctx.shadowColor = "transparent";
      if (image) ctx.drawImage(image, -w / 2 + 10, -h / 2 + 10, w - 20, h * 0.72);
    } else if (block.frame === "tape") {
      if (image) roundImage(ctx, image, -w / 2, -h / 2, w, h, 6);
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "rgba(246, 213, 220, 0.86)";
      ctx.fillRect(-w * 0.18, -h / 2 - 8, w * 0.36, 22);
    } else if (block.frame === "sticker" && block.cut) {
      if (image) ctx.drawImage(image, -w / 2, -h / 2, w, h * 0.86);
    } else if (block.frame === "sticker") {
      ctx.fillStyle = paper;
      round(ctx, -w / 2, -h / 2, w, h * 0.9, 14);
      ctx.fill();
      ctx.shadowColor = "transparent";
      if (image) roundImage(ctx, image, -w / 2 + 8, -h / 2 + 8, w - 16, h * 0.72, 10);
    } else if (image) {
      roundImage(ctx, image, -w / 2, -h / 2, w, h, 10);
    }
    ctx.shadowColor = "transparent";
    if (block.caption.trim()) {
      ctx.fillStyle = ink;
      ctx.font = `${Math.round(height / 62)}px Manrope, sans-serif`;
      ctx.textBaseline = "bottom";
      ctx.fillText(block.caption, -w / 2 + 8, h / 2 - 6, w - 16);
    }
  } else if (block.type === "text") {
    const w = (block.w / 100) * width;
    ctx.translate(x + w / 2, y);
    ctx.rotate((rotate * Math.PI) / 180);
    paintText(ctx, block.text, block.font, block.size, -w / 2, 0, w, ink, height);
  } else if (block.type === "sticker") {
    const w = ((block.w ?? stickerWidth(block.kind)) / 100) * width;
    const boxH = block.kind === "tape" ? height * 0.04 : block.kind === "bubble" ? height * 0.18 : w;
    ctx.translate(x + w / 2, y + boxH / 2);
    ctx.rotate((rotate * Math.PI) / 180);
    paintSticker(ctx, block.kind, w, boxH, block.text ?? "", ink, paper);
  } else if (block.type === "chip") {
    ctx.translate(x, y);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.fillStyle = ink;
    const label = `${block.kind === "date" ? "Дата" : "Место"} · ${block.text}`;
    ctx.font = `${Math.round(height / 58)}px Manrope, sans-serif`;
    const tw = Math.min(ctx.measureText(label).width + 28, width * 0.7);
    round(ctx, 0, 0, tw, height * 0.035, 20);
    ctx.fill();
    ctx.fillStyle = paper;
    ctx.textBaseline = "middle";
    ctx.fillText(label, 14, height * 0.018, tw - 24);
  } else if (block.type === "voice" || block.type === "doc") {
    const w = (block.w / 100) * width;
    ctx.translate(x, y);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.fillStyle = block.type === "doc" ? "rgba(250, 247, 242, 0.8)" : "rgba(250, 247, 242, 0.88)";
    round(ctx, 0, 0, w, height * 0.22, 18);
    ctx.fill();
    ctx.strokeStyle = muted;
    ctx.stroke();
    const title = block.type === "voice" ? block.title : block.title;
    const body = block.type === "voice" ? block.transcript : block.note;
    paintText(ctx, title, "serif", "md", 16, 14, w - 32, ink, height);
    paintText(ctx, body, "serif", "sm", 16, height * 0.055, w - 32, ink, height);
  }
  ctx.restore();
}

function stickerWidth(kind: StickerKind): number {
  if (kind === "bubble") return 48;
  if (kind === "tape") return 36;
  return 16;
}

function paintSticker(ctx: CanvasRenderingContext2D, kind: StickerKind, w: number, h: number, text: string, ink: string, paper: string) {
  ctx.save();
  if (kind === "tape") {
    ctx.fillStyle = "rgba(246, 213, 220, 0.92)";
    ctx.fillRect(-w / 2, -h / 2, w, h);
  } else if (kind === "bubble") {
    ctx.fillStyle = ink;
    round(ctx, -w / 2, -h / 2, w, h * 0.82, 22);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, h * 0.3);
    ctx.lineTo(-w * 0.05, h * 0.48);
    ctx.lineTo(w * 0.02, h * 0.3);
    ctx.fill();
    ctx.fillStyle = paper;
    ctx.font = `${Math.round(h * 0.28)}px Caveat, cursive`;
    ctx.textBaseline = "top";
    wrap(ctx, text || " ", w * 0.8, 4).forEach((line, index) => {
      ctx.fillText(line, -w * 0.4, -h * 0.32 + index * h * 0.22, w * 0.8);
    });
  } else {
    ctx.fillStyle = "rgba(246, 213, 220, 0.95)";
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(w, h) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8e3d52";
    ctx.beginPath();
    if (kind === "star") star(ctx, 0, 0, Math.min(w, h) * 0.28);
    else ctx.arc(0, 0, Math.min(w, h) * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.moveTo(x, y - r);
  for (let i = 1; i < 10; i++) {
    const radius = i % 2 ? r * 0.42 : r;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.closePath();
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(1, w), Math.max(1, h), r);
}

function roundImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  round(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(image, x, y, w, h);
  ctx.restore();
}

function paintStrokes(ctx: CanvasRenderingContext2D, strokes: InkStroke[], width: number, height: number) {
  strokes.forEach((stroke) => {
    ctx.beginPath();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = stroke.width * (width / 280);
    ctx.strokeStyle = stroke.color === "rose" ? cssVar("--color-rose", "#c45d72") : stroke.color === "sage" ? cssVar("--color-sage", "#6f8a68") : cssVar("--color-ink", "#1c1915");
    for (let i = 0; i < stroke.points.length; i += 2) {
      const x = (stroke.points[i] / 100) * width;
      const y = (stroke.points[i + 1] / 100) * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });
}

export async function paintPage(page: BookPage, meta: { dedicatee: string; collector: string; percent: number }): Promise<HTMLCanvasElement> {
  const width = 1500;
  const height = 2000;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Не удалось собрать страницу");
  const ink = cssVar("--color-ink", "#1c1915");
  const paper = cssVar("--color-paper", "#faf7f2");
  const muted = cssVar("--color-muted", "#6f675e");
  ctx.fillStyle = paperColor(page.paper);
  ctx.fillRect(0, 0, width, height);
  if (page.paper === "lined") {
    ctx.strokeStyle = "rgba(228, 220, 208, 0.9)";
    ctx.lineWidth = 2;
    for (let y = 90; y < height; y += 78) {
      ctx.beginPath();
      ctx.moveTo(48, y);
      ctx.lineTo(width - 48, y);
      ctx.stroke();
    }
  }
  if (page.kind === "cover") {
    ctx.fillStyle = cssVar("--color-rose-deep", "#8e3d52");
    ctx.font = `${Math.round(height / 26)}px Caveat, cursive`;
    ctx.textBaseline = "top";
    ctx.fillText(meta.dedicatee.trim() ? `для ${meta.dedicatee.trim()}` : "для тех, кто откроет позже", 72, height - 460);
    ctx.fillStyle = ink;
    ctx.font = `560 ${Math.round(height / 14)}px Fraunces, Georgia, serif`;
    ctx.fillText("Книга рода", 72, height - 360);
    ctx.font = `${Math.round(height / 52)}px Manrope, sans-serif`;
    ctx.fillText(meta.collector.trim() || "семейный архив, который можно продолжать", 72, height - 200, width - 140);
    ctx.fillStyle = muted;
    ctx.fillText(`Собрано на ${meta.percent}%. Это не дерево. Это живая книга.`, 72, height - 130, width - 140);
  }
  for (const block of page.blocks) {
    await paintBlock(ctx, block, width, height, ink, paper, muted);
  }
  paintStrokes(ctx, page.strokes, width, height);
  return canvas;
}

function canvasJpeg(canvas: HTMLCanvasElement): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("Страница не записалась"));
        return;
      }
      resolve({ bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height });
    }, "image/jpeg", 0.92);
  });
}

export function buildJpegPdf(images: { bytes: Uint8Array; width: number; height: number }[], pageW = PAGE_W, pageH = PAGE_H): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let position = 0;
  const offsets: number[] = [0];
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(bytes);
    position += bytes.length;
  };
  const obj = (body: string | Uint8Array) => {
    offsets.push(position);
    const index = offsets.length - 1;
    push(`${index} 0 obj\n`);
    push(body);
    push("\nendobj\n");
  };

  push("%PDF-1.4\n");
  const kids: string[] = [];
  images.forEach((_, index) => {
    kids.push(`${3 + index * 3} 0 R`);
  });
  obj(`<< /Type /Catalog /Pages 2 0 R >>`);
  obj(`<< /Type /Pages /Count ${images.length} /Kids [${kids.join(" ")}] >>`);
  images.forEach((image) => {
    const pageIndex = offsets.length;
    const content = `q\n${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
    obj(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Contents ${pageIndex + 1} 0 R /Resources << /XObject << /Im0 ${pageIndex + 2} 0 R >> >> >>`,
    );
    obj(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);
    offsets.push(position);
    const imageIndex = offsets.length - 1;
    push(`${imageIndex} 0 obj\n`);
    push(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`);
    push(image.bytes);
    push("\nendstream\nendobj\n");
  });

  const xref = position;
  const size = offsets.length;
  let table = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let index = 1; index < size; index++) {
    table += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  push(table);
  push(`trailer << /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const out = new Uint8Array(position);
  let cursor = 0;
  chunks.forEach((chunk) => {
    out.set(chunk, cursor);
    cursor += chunk.length;
  });
  return out;
}

export async function downloadFamilyBook(pages: BookPage[], meta: { dedicatee: string; collector: string; percent: number }) {
  if (!pages.length) throw new Error("В книге ещё нет страниц");
  if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready;
  const sheets = [];
  for (const page of pages) {
    sheets.push(await canvasJpeg(await paintPage(page, meta)));
  }
  const pdf = buildJpegPdf(sheets);
  const blob = new Blob([Uint8Array.from(pdf)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "Книга рода.pdf";
  link.click();
  URL.revokeObjectURL(url);
}
