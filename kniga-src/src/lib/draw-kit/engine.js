import { parseColor, rgbaBytes } from "./color.js";
import { BUILTIN_BRUSHES, BRUSH_PACK_FORMAT, defineBrush } from "./brushes.js";
import { floodRegion, paintPixels } from "./flood.js";
import { planStamps, targetContour, walkSegment } from "./geometry.js";

/**
 * Инструменты рисования для уже существующей «Книги рода».
 * Не страница и не приложение: прозрачный холст, который кладут поверх листа.
 *
 * Заливка цветом: контур одним движением, затем pressColor("#8c3a3a").
 * Если контур из нескольких линий — fillAt(x, y, цвет) или инструмент "fill" и тап внутрь.
 * Открытый контур весь лист не закрашивает.
 *
 * @param {{
 *   canvas?: HTMLCanvasElement,
 *   width?: number,
 *   height?: number,
 *   dpr?: number,
 *   closeSlop?: number,
 * }} [options]
 */
export function createDrawTools(options = {}) {
  const closeSlop = options.closeSlop ?? 28;
  const view = options.canvas ?? document.createElement("canvas");
  const fills = document.createElement("canvas");
  const strokeLayer = document.createElement("canvas");
  const viewCtx = must2d(view);
  const fillCtx = must2d(fills);
  const strokeCtx = must2d(strokeLayer);

  /** @type {Map<string, Brush>} */
  const brushes = new Map();
  /** @type {Op[]} */
  const ops = [];
  let nextId = 1;
  let cssW = options.width ?? 800;
  let cssH = options.height ?? 1100;
  let dpr = options.dpr ?? (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  let tool = "draw";
  let color = "#1c1410";
  let size = 4;
  let brushId = "pen";
  /** @type {Live | null} */
  let live = null;
  let unbind = () => {};

  for (const raw of BUILTIN_BRUSHES) addBrush(raw);
  resize(cssW, cssH);

  function brushOf(id = brushId) {
    const brush = brushes.get(id);
    if (!brush) throw new Error(`Нет кисти «${id}»`);
    return brush;
  }

  function resize(width, height, nextDpr = dpr) {
    cssW = width;
    cssH = height;
    dpr = nextDpr || 1;
    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    for (const canvas of [view, fills, strokeLayer]) {
      canvas.width = bw;
      canvas.height = bh;
    }
    if (!options.canvas) {
      view.style.width = `${cssW}px`;
      view.style.height = `${cssH}px`;
    }
    redraw();
  }

  function redraw() {
    fillCtx.setTransform(1, 0, 0, 1, 0, 0);
    strokeCtx.setTransform(1, 0, 0, 1, 0, 0);
    fillCtx.clearRect(0, 0, fills.width, fills.height);
    strokeCtx.clearRect(0, 0, strokeLayer.width, strokeLayer.height);
    for (const op of ops) {
      if (op.type === "stroke") {
        const stroke = op.stroke;
        if (stroke.fill) paintContour(fillCtx, stroke, stroke.fill);
        for (const stamp of planStamps(stroke.points, stepOf(stroke))) {
          stampAt(strokeCtx, brushOf(stroke.brushId), stamp, stroke.color, stroke.size);
        }
      } else {
        replayBucket(op);
      }
    }
    composite();
  }

  function composite() {
    viewCtx.setTransform(1, 0, 0, 1, 0, 0);
    viewCtx.clearRect(0, 0, view.width, view.height);
    viewCtx.drawImage(fills, 0, 0);
    viewCtx.drawImage(strokeLayer, 0, 0);
  }

  function stepOf(stroke) {
    return Math.max(0.35, brushOf(stroke.brushId).spacing * stroke.size);
  }

  function pointerDown(x, y, pressure = 1) {
    if (tool === "fill") return fillAt(x, y, color);
    const brush = brushOf();
    const point = { x, y, pressure };
    /** @type {Stroke} */
    const stroke = {
      id: nextId++,
      points: [point],
      brushId: brush.id,
      color,
      size,
      closed: false,
      fill: null,
    };
    ops.push({ type: "stroke", stroke });
    live = { stroke, since: 0, last: point, placed: false };
    return { ok: true, strokeId: stroke.id };
  }

  function pointerMove(x, y, pressure = 1) {
    if (!live || tool !== "draw") return;
    const point = { x, y, pressure };
    const stroke = live.stroke;
    const from = live.last;
    if (!live.placed) {
      const dx = point.x - from.x;
      const dy = point.y - from.y;
      const angle = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
      stampAt(
        strokeCtx,
        brushOf(stroke.brushId),
        { x: from.x, y: from.y, angle, pressure: from.pressure ?? 1 },
        stroke.color,
        stroke.size,
      );
      live.placed = true;
    }
    stroke.points.push(point);
    live.since = walkSegment(from, point, live.since, stepOf(stroke), (stamp) => {
      stampAt(strokeCtx, brushOf(stroke.brushId), stamp, stroke.color, stroke.size);
    });
    live.last = point;
    composite();
  }

  function pointerUp() {
    if (!live) return null;
    const stroke = live.stroke;
    if (!live.placed) {
      stampAt(
        strokeCtx,
        brushOf(stroke.brushId),
        { x: live.last.x, y: live.last.y, angle: 0, pressure: live.last.pressure ?? 1 },
        stroke.color,
        stroke.size,
      );
      composite();
    }
    live = null;
    return { strokeId: stroke.id, closed: stroke.closed };
  }

  /**
   * Нажали цвет — залить последний настоящий контур.
   * @param {string} next
   */
  function pressColor(next) {
    color = parseColor(next).css;
    const found = targetContour(contours(), closeSlop);
    if (!found) return { ok: false, reason: "no-contour" };
    if (found.open) {
      return {
        ok: false,
        reason: "open",
        gap: Math.round(found.gap),
        strokeId: found.stroke.id,
      };
    }
    seal(found.stroke);
    found.stroke.fill = color;
    redraw();
    return { ok: true, how: "contour", strokeId: found.stroke.id };
  }

  /**
   * Тап внутрь фигуры. Координаты — CSS-пиксели от левого верхнего угла холста.
   * Стены берутся только со слоя линий, поэтому повторный тап перекрашивает область.
   * @param {number} x
   * @param {number} y
   * @param {string} [next]
   * @param {{ gap?: number, edgeIsWall?: boolean }} [opts]
   */
  function fillAt(x, y, next = color, opts = {}) {
    const parsed = resolveColor(next);
    color = parsed.css;
    const data = strokeCtx.getImageData(0, 0, strokeLayer.width, strokeLayer.height);
    const region = floodRegion(data.data, strokeLayer.width, strokeLayer.height, x * dpr, y * dpr, {
      gap: opts.gap ?? 1,
      edgeIsWall: opts.edgeIsWall ?? false,
    });
    if (!region.ok) return region;
    const paint = fillCtx.getImageData(0, 0, fills.width, fills.height);
    paintPixels(paint.data, region.pixels, rgbaBytes(parsed));
    fillCtx.putImageData(paint, 0, 0);
    ops.push({
      type: "bucket",
      x,
      y,
      color: parsed.css,
      gap: opts.gap ?? 1,
      edgeIsWall: opts.edgeIsWall ?? false,
    });
    composite();
    return { ok: true, how: "bucket", pixels: region.pixels.length };
  }

  function seal(stroke) {
    if (stroke.closed) return;
    const first = stroke.points[0];
    const last = stroke.points[stroke.points.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) > 0.5) {
      stroke.points.push({ x: first.x, y: first.y, pressure: last.pressure ?? 1 });
    }
    stroke.closed = true;
  }

  function setTool(next) {
    if (next !== "draw" && next !== "fill") throw new Error("Инструмент: draw или fill");
    tool = next;
    live = null;
  }

  function setColor(next) {
    color = parseColor(next).css;
  }

  function setSize(next) {
    const brush = brushOf();
    size = Math.max(brush.minSize, Math.min(brush.maxSize, next));
  }

  function setBrush(id) {
    const brush = brushOf(id);
    brushId = brush.id;
    if (size < brush.minSize || size > brush.maxSize) size = brush.defaultSize;
  }

  function addBrush(partial) {
    const brush = defineBrush(partial);
    if (brush.procedural === "leaf" && !brush.image) brush.image = drawLeafTip();
    brush.__tint = new Map();
    brushes.set(brush.id, brush);
    return brush.id;
  }

  async function addBrushFromFile(file, partial = {}) {
    const image = await createImageBitmap(file);
    const base =
      typeof file.name === "string" ? file.name.replace(/\.[^.]+$/, "") : `stamp-${nextId}`;
    const id = partial.id || base.toLowerCase().replace(/\s+/g, "-") || `stamp-${nextId++}`;
    return addBrush({
      tip: "image",
      spacing: 0.85,
      angleMode: "direction",
      defaultSize: 32,
      minSize: 8,
      maxSize: 160,
      pressureSize: false,
      ...partial,
      id,
      name: partial.name || base,
      image,
    });
  }

  async function loadPack(pack) {
    const data = await readPack(pack);
    if (data.format !== BRUSH_PACK_FORMAT) {
      throw new Error(`Ожидался формат ${BRUSH_PACK_FORMAT}`);
    }
    if (!Array.isArray(data.brushes)) throw new Error("В пачке нет списка brushes");
    const ids = [];
    for (const item of data.brushes) {
      let image = null;
      if (item.tip === "image" && !item.procedural) {
        if (typeof item.image !== "string") throw new Error(`У кисти ${item.id} нет картинки`);
        image = await loadImage(item.image);
      }
      ids.push(addBrush({ ...item, image }));
    }
    return ids;
  }

  function exportPack(ids = [...brushes.keys()]) {
    return {
      format: BRUSH_PACK_FORMAT,
      brushes: ids.map((id) => serializeBrush(brushOf(id))),
    };
  }

  function listBrushes() {
    return [...brushes.values()].map((brush) => ({
      id: brush.id,
      name: brush.name,
      tip: brush.tip,
      defaultSize: brush.defaultSize,
      minSize: brush.minSize,
      maxSize: brush.maxSize,
    }));
  }

  function clear() {
    ops.length = 0;
    live = null;
    redraw();
  }

  function removeStroke(id) {
    const index = ops.findIndex((op) => op.type === "stroke" && op.stroke.id === id);
    if (index < 0) return false;
    ops.splice(index, 1);
    redraw();
    return true;
  }

  function contours() {
    const list = [];
    for (const op of ops) if (op.type === "stroke") list.push(op.stroke);
    return list;
  }

  function replayBucket(op) {
    const data = strokeCtx.getImageData(0, 0, strokeLayer.width, strokeLayer.height);
    const region = floodRegion(data.data, strokeLayer.width, strokeLayer.height, op.x * dpr, op.y * dpr, {
      gap: op.gap,
      edgeIsWall: op.edgeIsWall,
    });
    if (!region.ok) return;
    const paint = fillCtx.getImageData(0, 0, fills.width, fills.height);
    paintPixels(paint.data, region.pixels, rgbaBytes(resolveColor(op.color)));
    fillCtx.putImageData(paint, 0, 0);
  }

  /** @param {HTMLElement} el */
  function bind(el) {
    unbind();
    el.style.touchAction = "none";
    const down = (event) => {
      if (event.button != null && event.button !== 0) return;
      el.setPointerCapture?.(event.pointerId);
      const p = localPoint(el, event);
      pointerDown(p.x, p.y, event.pressure || 1);
    };
    const move = (event) => {
      if (!live) return;
      const p = localPoint(el, event);
      pointerMove(p.x, p.y, event.pressure || 1);
    };
    const up = () => {
      pointerUp();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    unbind = () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      unbind = () => {};
    };
    return unbind;
  }

  function paintContour(ctx, stroke, fill) {
    const pts = stroke.points;
    if (pts.length < 3) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x * dpr, pts[0].y * dpr);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * dpr, pts[i].y * dpr);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill("evenodd");
    ctx.restore();
  }

  function stampAt(ctx, brush, stamp, stampColor, stampSize) {
    const jitter = (amount) => (amount ? (Math.random() * 2 - 1) * amount : 0);
    const pressureScale = brush.pressureSize ? 0.35 + 0.65 * clamp01(stamp.pressure ?? 1) : 1;
    const pxSize = Math.max(0.5, stampSize * (1 + jitter(brush.sizeJitter)) * pressureScale);
    const radius = (pxSize * dpr) / 2;
    const alpha = clamp01(brush.opacity * (1 + jitter(brush.opacityJitter)));
    const dir = brush.angleMode === "random" ? Math.random() * Math.PI * 2 : stamp.angle;
    const scatter = jitter(brush.scatter) * pxSize * dpr;
    const ox = Math.cos(dir + Math.PI / 2) * scatter;
    const oy = Math.sin(dir + Math.PI / 2) * scatter;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(stamp.x * dpr + ox, stamp.y * dpr + oy);
    ctx.rotate(dir + (brush.angle * Math.PI) / 180);
    if (brush.tip === "calligraphy") {
      ctx.scale(1, brush.squeeze);
      ctx.fillStyle = stampColor;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (brush.tip === "image" && brush.image) {
      const tip = tintStamp(brush, stampColor);
      const side = radius * 2;
      ctx.drawImage(tip, -side / 2, -side / 2, side, side);
    } else {
      const hardness = clamp01(brush.hardness);
      if (hardness >= 0.98) {
        ctx.fillStyle = stampColor;
      } else {
        const fade = transparentRgb(stampColor);
        const g = ctx.createRadialGradient(0, 0, radius * hardness, 0, 0, radius);
        g.addColorStop(0, stampColor);
        g.addColorStop(1, fade);
        ctx.fillStyle = g;
      }
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function resolveColor(input) {
    const parsed = parseColor(input);
    if (!parsed.unresolved) return parsed;
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const ctx = must2d(probe);
    ctx.fillStyle = "#000";
    ctx.fillStyle = parsed.css;
    ctx.fillRect(0, 0, 1, 1);
    const px = ctx.getImageData(0, 0, 1, 1).data;
    return { r: px[0], g: px[1], b: px[2], a: px[3] / 255, css: parsed.css };
  }

  return {
    view,
    resize,
    redraw,
    bind,
    pointerDown,
    pointerMove,
    pointerUp,
    pressColor,
    fillAt,
    setTool,
    setColor,
    setSize,
    setBrush,
    addBrush,
    addBrushFromFile,
    loadPack,
    exportPack,
    listBrushes,
    clear,
    removeStroke,
    get tool() {
      return tool;
    },
    get color() {
      return color;
    },
    get size() {
      return size;
    },
    get brushId() {
      return brushId;
    },
    get strokes() {
      return contours().map((stroke) => ({ ...stroke, points: stroke.points.slice() }));
    },
  };
}

function tintStamp(brush, color) {
  const hit = brush.__tint.get(color);
  if (hit) return hit;
  const source = brush.image;
  const canvas = document.createElement("canvas");
  canvas.width = source.width || source.naturalWidth || 1;
  canvas.height = source.height || source.naturalHeight || 1;
  const ctx = must2d(canvas);
  ctx.drawImage(source, 0, 0);
  if (brush.tint) {
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  brush.__tint.set(color, canvas);
  return canvas;
}

function drawLeafTip() {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = must2d(canvas);
  ctx.translate(48, 48);
  ctx.rotate(-0.7);
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.moveTo(0, -36);
  ctx.bezierCurveTo(30, -18, 26, 18, 0, 36);
  ctx.bezierCurveTo(-26, 18, -30, -18, 0, -36);
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.bezierCurveTo(2, -8, -2, 8, 0, 26);
  ctx.stroke();
  return canvas;
}

function serializeBrush(brush) {
  const out = {
    id: brush.id,
    name: brush.name,
    tip: brush.tip,
    spacing: brush.spacing,
    opacity: brush.opacity,
    hardness: brush.hardness,
    squeeze: brush.squeeze,
    sizeJitter: brush.sizeJitter,
    opacityJitter: brush.opacityJitter,
    scatter: brush.scatter,
    angleMode: brush.angleMode,
    angle: brush.angle,
    pressureSize: brush.pressureSize,
    defaultSize: brush.defaultSize,
    minSize: brush.minSize,
    maxSize: brush.maxSize,
    tint: brush.tint,
  };
  if (brush.procedural) out.procedural = brush.procedural;
  else if (brush.tip === "image" && brush.image) out.image = imageToDataUrl(brush.image);
  return out;
}

function imageToDataUrl(image) {
  if (typeof image.toDataURL === "function") {
    try {
      return image.toDataURL("image/png");
    } catch {
      /* нет CORS — снимем копию */
    }
  }
  if (typeof image.src === "string" && image.src.startsWith("data:")) return image.src;
  const canvas = document.createElement("canvas");
  canvas.width = image.width || image.naturalWidth || 1;
  canvas.height = image.height || image.naturalHeight || 1;
  must2d(canvas).drawImage(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось прочитать картинку кисти"));
    image.src = url;
  });
}

async function readPack(pack) {
  if (typeof pack === "string") {
    if (pack.trim().startsWith("{")) return JSON.parse(pack);
    const response = await fetch(pack);
    if (!response.ok) throw new Error("Не удалось загрузить пачку кистей");
    return response.json();
  }
  if (typeof Blob !== "undefined" && pack instanceof Blob) return JSON.parse(await pack.text());
  return pack;
}

function localPoint(el, event) {
  const rect = el.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function transparentRgb(color) {
  try {
    const parsed = parseColor(color);
    if (!parsed.unresolved) return `rgba(${parsed.r},${parsed.g},${parsed.b},0)`;
  } catch {
    /* оставляем прозрачный край */
  }
  return "rgba(0,0,0,0)";
}

function must2d(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Холст 2d недоступен");
  return ctx;
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   tip: "round" | "calligraphy" | "image",
 *   spacing: number,
 *   opacity: number,
 *   hardness: number,
 *   squeeze: number,
 *   sizeJitter: number,
 *   opacityJitter: number,
 *   scatter: number,
 *   angleMode: string,
 *   angle: number,
 *   pressureSize: boolean,
 *   defaultSize: number,
 *   minSize: number,
 *   maxSize: number,
 *   image: CanvasImageSource | null,
 *   procedural: string | null,
 *   tint: boolean,
 *   __tint: Map<string, HTMLCanvasElement>,
 * }} Brush
 */

/**
 * @typedef {{
 *   id: number,
 *   points: {x:number,y:number,pressure?:number}[],
 *   brushId: string,
 *   color: string,
 *   size: number,
 *   closed: boolean,
 *   fill: string | null,
 * }} Stroke
 */

/**
 * @typedef {{
 *   stroke: Stroke,
 *   since: number,
 *   last: {x:number,y:number,pressure?:number},
 *   placed: boolean,
 * }} Live
 */
