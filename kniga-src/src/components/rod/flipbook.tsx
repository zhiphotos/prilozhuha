import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Download, ImagePlus, PenLine, X } from "lucide-react";
import { toast } from "sonner";
import { useNav } from "@/components/rod/chrome";
import { FlipBookCss } from "@/components/rod/flipbook-css";
import wireTex from "@/assets/book/bindings/wire.png";
import discTex from "@/assets/book/bindings/disc.png";
import combTex from "@/assets/book/bindings/comb.png";
import ringsTex from "@/assets/book/bindings/rings.png";
import codexTex from "@/assets/book/bindings/codex.png";
import oakUrl from "@/assets/book/backgrounds/oak.jpg";
import walnutUrl from "@/assets/book/backgrounds/walnut.jpg";
import linenUrl from "@/assets/book/backgrounds/linen.jpg";
import stoneUrl from "@/assets/book/backgrounds/stone.jpg";
import { BINDINGS, BOW_TILT, buildBowMesh, type BindingId } from "@/lib/page-curl/geometry";
import { CurlRenderer } from "@/lib/page-curl/renderer";
import { PAGE_RATIO } from "@/lib/rod/page-style";
import { downloadFamilyBook, paintPage } from "@/lib/rod/print-book";
import { saveMedia, resolveMedia } from "@/lib/rod/media";
import { spreadGhosts } from "@/lib/rod/spread";
import { turnPage } from "@/lib/rod/sounds";
import { backPage, useRod } from "@/lib/rod/store";
import type { BookPage, PageBlock } from "@/lib/rod/types";
import { cn } from "@/lib/cn";

type Face =
  | { kind: "page"; page: BookPage; number: number }
  | { kind: "cover" }
  | { kind: "endpaper" }
  | { kind: "blank" }
  | { kind: "back" };

type Mode = "corner" | "edge" | "bow";
type Live = {
  active: boolean; dir: 1 | -1; mode: Mode; grabT: number; grabS: number;
  x: number; y: number; vx: number; vy: number; downX: number; downY: number; followX: number; followY: number;
  goalX: number; goalY: number; tex: boolean;
  anim: { destX: number; destY: number; flip: boolean; fromX: number; fromY: number; t: number; dur: number } | null;
};
type Box = { w: number; h: number; gutter: number; pageX: number; pageY: number; pageW: number; pageH: number };

const SHOWN_BINDINGS: BindingId[] = ["codex", "wire", "comb"];
const BINDING_NAMES: Record<BindingId, string> = { codex: "Обычная книга", wire: "Пружина", disc: "Диски", comb: "Гребень", rings: "Кольца" };
const BINDING_TEX: Record<BindingId, string> = { codex: codexTex, wire: wireTex, disc: discTex, comb: combTex, rings: ringsTex };
const BACKGROUNDS = [
  { id: "night", name: "Ночь", src: "", light: false },
  { id: "oak", name: "Дуб", src: oakUrl, light: true },
  { id: "walnut", name: "Орех", src: walnutUrl, light: false },
  { id: "linen", name: "Лён", src: linenUrl, light: true },
  { id: "stone", name: "Камень", src: stoneUrl, light: false },
] as const;
type BgId = (typeof BACKGROUNDS)[number]["id"] | "custom";

const LS_BIND = "kniga-flip-binding";
const LS_BG = "kniga-flip-bg";
const LS_BGREF = "kniga-flip-bgref";
const FACE_PX = 1000;

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* приватный режим */ }
}

function channelFor(id: BindingId): number {
  return id === "rings" ? 36 : id === "comb" ? 22 : id === "disc" ? 18 : id === "wire" ? 16 : 0;
}
function layoutOf(w: number, h: number, channel: number): Box {
  const gutter = w / 2;
  const inset = channel / 2;
  return { w, h, gutter, pageX: gutter + inset, pageY: 0, pageW: Math.max(8, w / 2 - inset), pageH: h };
}
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Страницы рисует тот же код, что и печать: в листалке видно ровно то, что будет в PDF. paintPage держит общее состояние, поэтому по одной. */
let paintQueue: Promise<unknown> = Promise.resolve();
function paintQueued(page: BookPage, meta: { dedicatee: string; collector: string }, ghosts: PageBlock[]): Promise<HTMLCanvasElement> {
  const job = paintQueue.then(async () => {
    const full = await paintPage(page, meta, { size: 20, bleed: 0, spine: 0 }, ghosts);
    // Большой холст печати занимает десятки мегабайт: в памяти держим уменьшенную копию.
    const small = document.createElement("canvas");
    small.width = FACE_PX;
    small.height = Math.round(FACE_PX * (full.height / full.width));
    small.getContext("2d")?.drawImage(full, 0, 0, small.width, small.height);
    full.width = 0;
    return small;
  });
  paintQueue = job.catch(() => undefined);
  return job;
}

export function FlipBookScreen({ pageId }: { pageId?: string }) {
  const [webgl] = useState(() => {
    try {
      const probe = document.createElement("canvas");
      return Boolean(probe.getContext("webgl") || probe.getContext("experimental-webgl"));
    } catch {
      return false;
    }
  });
  return webgl ? <Stage pageId={pageId} /> : <FlipBookCss pageId={pageId} />;
}

function Stage({ pageId }: { pageId?: string }) {
  const nav = useNav();
  const pages = useRod((state) => state.pages);
  const dedicatee = useRod((state) => state.dedicatee);
  const collector = useRod((state) => state.collector);
  const back = useRod((state) => state.back);
  const meta = useMemo(() => ({ dedicatee, collector }), [dedicatee, collector]);

  const faces = useMemo<Face[]>(() => {
    const list: Face[] = [];
    const rest = pages.slice();
    const coverPage = rest[0]?.kind === "cover" ? rest.shift() : null;
    list.push(coverPage ? { kind: "page", page: coverPage, number: 0 } : { kind: "cover" });
    list.push({ kind: "endpaper" });
    rest.forEach((page, i) => list.push({ kind: "page", page, number: i + 1 }));
    if (list.length % 2 === 1) list.push({ kind: "blank" });
    list.push({ kind: "endpaper" }, { kind: "back" });
    return list;
  }, [pages]);
  const backFace = useMemo(() => back ?? backPage(pages[0]?.kind === "cover" ? pages[0] : null), [back, pages]);
  /** Развороты: слева faces[2k+1], справа faces[2k+2]. Заднюю обложку видно в PDF и в печати. */
  const spreadCount = Math.max(1, (faces.length - 2) / 2);

  const startIndex = useMemo(() => {
    if (!pageId) return -1;
    const at = faces.findIndex((face) => face.kind === "page" && face.page.id === pageId);
    return at <= 0 ? -1 : Math.min(spreadCount - 1, Math.floor((at - 1) / 2));
  }, [faces, pageId, spreadCount]);

  const frameRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const curlRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLCanvasElement>(null);
  const rightRef = useRef<HTMLCanvasElement>(null);
  const underRef = useRef<HTMLCanvasElement>(null);
  const underLeftRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CurlRenderer | null>(null);
  const backCanvas = useRef<HTMLCanvasElement | null>(null);
  const liveRef = useRef<Live | null>(null);
  const indexRef = useRef(startIndex);
  const bindingRef = useRef<BindingId>("wire");
  const spreadsRef = useRef(spreadCount);
  const facesRef = useRef(faces);
  const boxRef = useRef<Box>(layoutOf(880, 440, channelFor("wire")));
  const bitmaps = useRef(new Map<string, { source: unknown; canvas: HTMLCanvasElement }>());
  const pending = useRef(new Set<string>());

  const [binding, setBinding] = useState<BindingId>(() => {
    const saved = lsGet(LS_BIND);
    return SHOWN_BINDINGS.some((id) => id === saved) ? (saved as BindingId) : "wire";
  });
  const [bg, setBg] = useState<BgId>(() => {
    const saved = lsGet(LS_BG);
    return saved === "custom" || BACKGROUNDS.some((item) => item.id === saved) ? (saved as BgId) : "night";
  });
  const [customBg, setCustomBg] = useState("");
  const [index, setIndex] = useState(startIndex);
  const [curlDir, setCurlDir] = useState<0 | 1 | -1>(0);
  const [size, setSize] = useState({ w: 600, h: 300 });
  const [paintTick, setPaintTick] = useState(0);
  const [glError, setGlError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  bindingRef.current = binding;
  spreadsRef.current = spreadCount;
  facesRef.current = faces;

  useEffect(() => {
    const ref = lsGet(LS_BGREF);
    if (ref) void resolveMedia(ref).then(setCustomBg).catch(() => undefined);
  }, []);

  // Слой с изгибом (WebGL)
  useEffect(() => {
    const canvas = curlRef.current;
    if (!canvas) return;
    try {
      const renderer = new CurlRenderer(canvas);
      renderer.clear();
      const backTile = document.createElement("canvas");
      backTile.width = 8;
      backTile.height = 8;
      const ctx = backTile.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#efe6d4";
        ctx.fillRect(0, 0, 8, 8);
      }
      renderer.setBack(backTile);
      rendererRef.current = renderer;
    } catch (error) {
      setGlError(error instanceof Error ? error.message : "WebGL недоступен");
    }
  }, []);

  // Размер книги по свободному месту
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const fit = () => {
      const rect = area.getBoundingClientRect();
      const pad = 16;
      const aw = Math.max(120, rect.width - pad * 2);
      const ah = Math.max(120, rect.height - pad * 2);
      const closed = indexRef.current < 0;
      const ratio = closed ? 1 : 2;
      const w = Math.min(aw * (closed ? 0.8 : 1), (ah / PAGE_RATIO) * ratio, 900);
      setSize({ w, h: (w / ratio) * PAGE_RATIO });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(area);
    return () => observer.disconnect();
  }, [index]);

  const faceKey = (face: Face | undefined): string => {
    if (!face) return "none";
    return face.kind === "page" ? `p:${face.page.id}` : face.kind;
  };
  const faceSource = useCallback((face: Face): unknown => (face.kind === "page" ? face.page : face.kind === "back" ? backFace : face.kind), [backFace]);

  /** Рисует грань на канвас сцены: готовая картинка, а пока её нет, чистая бумага и запрос на отрисовку. */
  const drawFace = useCallback(
    (canvas: HTMLCanvasElement | null, face: Face | undefined, side: "left" | "right" | "full", cssW: number, cssH: number) => {
      if (!canvas || cssW < 2 || cssH < 2) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(cssW * dpr));
      const h = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#fbf8f3";
      ctx.fillRect(0, 0, w, h);
      if (!face) return;
      if (face.kind === "endpaper") {
        ctx.fillStyle = "#5f2f3f";
        ctx.fillRect(0, 0, w, h);
      } else if (face.kind !== "blank") {
        const key = faceKey(face);
        const source = faceSource(face);
        const hit = bitmaps.current.get(key);
        if (hit && hit.source === source) {
          ctx.drawImage(hit.canvas, 0, 0, hit.canvas.width, hit.canvas.height, 0, 0, w, h);
        } else if (!pending.current.has(key)) {
          pending.current.add(key);
          const page: BookPage =
            face.kind === "page" ? face.page : face.kind === "back" ? backFace : { id: "cover", title: "Обложка", kind: "cover", paper: "rose", strokes: [], blocks: [] };
          const ghosts = face.kind === "page" ? spreadGhosts(pages, face.page.id) : [];
          void paintQueued(page, meta, ghosts)
            .then((done) => {
              bitmaps.current.set(key, { source, canvas: done });
              setPaintTick((value) => value + 1);
            })
            .catch(() => undefined)
            .finally(() => pending.current.delete(key));
        }
      }
      if (side !== "full") {
        const shade = ctx.createLinearGradient(side === "right" ? 0 : w, 0, side === "right" ? w * 0.14 : w * 0.86, 0);
        shade.addColorStop(0, "rgba(42,36,32,0.22)");
        shade.addColorStop(1, "rgba(42,36,32,0)");
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, w, h);
      }
    },
    [backFace, faceSource, meta, pages],
  );

  /** Оборот листа: в момент поворота видна изнанка, то есть страница с другой стороны, а не пустая бумага. */
  const prepareBack = useCallback(() => {
    const live = liveRef.current;
    const renderer = rendererRef.current;
    if (!live?.active || !renderer) return;
    const box = boxRef.current;
    const f = facesRef.current;
    const cur = indexRef.current;
    const closed = cur < 0;
    const face = closed ? f[1] : live.dir === 1 ? f[2 * (cur + 1) + 1] : cur > 0 ? f[2 * (cur - 1) + 2] : f[1];
    if (!backCanvas.current) backCanvas.current = document.createElement("canvas");
    drawFace(backCanvas.current, face, closed ? "full" : live.dir === 1 ? "left" : "right", closed ? box.w : box.pageW, closed ? box.h : box.pageH);
    renderer.setBack(backCanvas.current);
  }, [drawFace]);
  const prepareBackRef = useRef(prepareBack);
  prepareBackRef.current = prepareBack;

  const paintPages = useCallback(() => {
    const box = boxRef.current;
    const f = facesRef.current;
    const current = indexRef.current;
    if (current < 0) {
      drawFace(rightRef.current, f[0], "full", box.w, box.h);
      drawFace(underRef.current, f[1], "full", box.w, box.h);
      return;
    }
    drawFace(leftRef.current, f[2 * current + 1], "left", box.pageW, box.pageH);
    drawFace(rightRef.current, f[2 * current + 2], "right", box.pageW, box.pageH);
    const next = current + 1;
    drawFace(underRef.current, next < spreadsRef.current ? f[2 * next + 2] : f[f.length - 2], "right", box.pageW, box.pageH);
    drawFace(underLeftRef.current, current > 0 ? f[2 * (current - 1) + 1] : f[0], "left", box.pageW, box.pageH);
  }, [drawFace]);

  /** Слой с изгибом лежит на весь экран: лист может подняться за рамку книги. Сообщаем рендереру, где рамка. */
  const resizeCurl = () => {
    const frame = frameRef.current;
    const curl = curlRef.current;
    const renderer = rendererRef.current;
    if (!frame || !curl || !renderer) return;
    const fr = frame.getBoundingClientRect();
    const cr = curl.getBoundingClientRect();
    renderer.resize(cr.width, cr.height, cr.left - fr.left, cr.top - fr.top, Math.min(2, window.devicePixelRatio || 1));
  };

  // Перерисовать при смене размера, разворота, сшивки, страниц или когда пришла картинка страницы
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const rect = frame.getBoundingClientRect();
      boxRef.current = layoutOf(rect.width || size.w, rect.height || size.h, channelFor(bindingRef.current));
      resizeCurl();
      if (!liveRef.current?.active) rendererRef.current?.clear();
      paintPages();
      prepareBack();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    if (curlRef.current) observer.observe(curlRef.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, index, binding, paintPages, prepareBack, paintTick]);

  // Сброс картинок, если страницы поменялись снаружи
  useEffect(() => {
    bitmaps.current.forEach((entry, key) => {
      const face = faces.find((item) => faceKey(item) === key);
      if (!face || faceSource(face) !== entry.source) bitmaps.current.delete(key);
    });
  }, [faces, faceSource]);

  const goTo = (next: number) => {
    indexRef.current = next;
    setIndex(next);
  };

  function step(dt: number) {
    const live = liveRef.current;
    const renderer = rendererRef.current;
    if (!live?.active || !renderer) return;
    if (live.anim) {
      // Полёт листа по времени: ровное ускорение и торможение, без пружины (она давала лаги).
      live.anim.t += dt;
      const u = Math.min(1, live.anim.t / live.anim.dur);
      const e = u * u * (3 - 2 * u);
      live.x = live.anim.fromX + (live.anim.destX - live.anim.fromX) * e;
      live.y = live.anim.fromY + (live.anim.destY - live.anim.fromY) * e;
      if (u >= 1) {
        const flipped = live.anim.flip;
        liveRef.current = null;
        renderer.clear();
        setCurlDir(0);
        if (flipped) {
          const cur = indexRef.current;
          const next = cur < 0 ? 0 : live.dir === 1 ? Math.min(spreadsRef.current - 1, cur + 1) : cur - 1;
          turnPage();
          goTo(next);
        }
        return;
      }
    }
    const box = boxRef.current;
    const closedNow = indexRef.current < 0;
    const bind = BINDINGS.find((item) => item.id === bindingRef.current) ?? BINDINGS[1];
    const mesh = closedNow
      ? buildBowMesh({ hingeX: 0, top: 0, width: box.w, height: box.h, fingerX: live.x, fingerY: live.y, grabT: live.grabT, grabS: live.grabS, ringR: 0, stiff: 1.45, dir: 1 })
      : buildBowMesh({ hingeX: live.dir === 1 ? box.pageX : box.pageW, top: box.pageY, width: box.pageW, height: box.pageH, fingerX: live.x, fingerY: live.y, grabT: live.grabT, grabS: live.grabS, ringR: 0, stiff: bind.stiff, dir: live.dir });
    if (!live.tex) {
      const front = closedNow || live.dir === 1 ? rightRef.current : leftRef.current;
      if (front) renderer.setFront(front);
      prepareBackRef.current();
      live.tex = true;
    }
    renderer.clear();
    renderer.draw(mesh, {
      hingeX: closedNow ? 0 : live.dir === 1 ? box.pageX : box.pageW,
      lift: 1.08,
      focal: Math.max(box.w, box.h) * 2.2,
      tilt: BOW_TILT,
      dir: closedNow ? 1 : live.dir,
    });
  }

  // Кадр анимации. step читает только ссылки, поэтому достаточно одного запуска.
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      stepRef.current(dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const beginLive = (point: { x: number; y: number }): Live | null => {
    const box = boxRef.current;
    const base = { active: true, mode: "bow" as Mode, vx: 0, vy: 0, downX: point.x, downY: point.y, followX: point.x, followY: point.y, goalX: point.x, goalY: point.y, x: point.x, y: point.y, tex: false, anim: null };
    if (indexRef.current < 0) {
      if (point.x < box.w * 0.12 || point.y < 0 || point.y > box.h) return null;
      return { ...base, dir: 1, grabT: clamp01(point.y / box.h), grabS: Math.min(1, Math.max(0.2, point.x / box.w)) };
    }
    const onRight = point.x >= box.gutter;
    const localX = onRight ? point.x - box.pageX : box.pageW - point.x;
    const localY = point.y - box.pageY;
    if (localX < -12 || localY < -12 || localX > box.pageW + 12 || localY > box.pageH + 12) return null;
    if (!onRight && point.x > box.pageW + 12) return null;
    return { ...base, dir: onRight ? 1 : -1, grabT: clamp01(localY / box.pageH), grabS: Math.min(1, Math.max(0.2, localX / Math.max(1, box.pageW))) };
  };

  const finishLive = (live: Live, forceFlip?: boolean) => {
    live.x = live.goalX;
    live.y = live.goalY;
    const box = boxRef.current;
    const closed = indexRef.current < 0;
    const hinge = closed ? 0 : live.dir === 1 ? box.pageX : box.pageW;
    const span = closed ? box.w : box.pageW;
    const arm = live.grabS * span;
    const atEnd = indexRef.current >= spreadsRef.current - 1;
    const allow = closed ? true : live.dir === 1 ? !atEnd : true;
    const toward = forceFlip || (live.dir === 1 ? live.vx < -380 || live.x < hinge + arm * (closed ? 0.42 : 0.28) : live.vx > 380 || live.x > hinge - arm * 0.28);
    const naturalY = box.pageY + live.grabT * (closed ? box.h : box.pageH);
    const restX = hinge + live.dir * arm;
    const flipX = hinge - live.dir * arm;
    const flip = toward && allow;
    const destX = flip ? flipX : restX;
    const destY = naturalY;
    const dist = Math.hypot(destX - live.x, destY - live.y);
    const dur = reduced() ? 0.01 : Math.min(0.62, Math.max(0.28, dist / 980));
    live.anim = { destX, destY, flip, fromX: live.x, fromY: live.y, t: 0, dur };
  };

  const localPoint = (el: HTMLElement, event: { clientX: number; clientY: number }) => {
    const rect = el.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (liveRef.current?.active || glError) return;
    const live = beginLive(localPoint(event.currentTarget, event));
    if (!live) return;
    liveRef.current = live;
    setCurlDir(live.dir);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* синтетический указатель */
    }
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const live = liveRef.current;
    if (!live?.active || live.anim) return;
    const point = localPoint(event.currentTarget, event);
    const dt = 1 / 60;
    const nextX = live.followX + (point.x - live.downX);
    const nextY = live.followY + (point.y - live.downY);
    live.vx = (nextX - live.x) / dt;
    live.vy = (nextY - live.y) / dt;
    live.x = nextX;
    live.y = nextY;
    live.goalX = nextX;
    live.goalY = nextY;
  };
  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const live = liveRef.current;
    if (!live?.active || live.anim) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const moved = Math.hypot(live.goalX - live.followX, live.goalY - live.followY) > 8;
    finishLive(live, !moved);
  };

  /** Кнопки и клавиши: тот же лист, только перелистывается сам. */
  const flip = (dir: 1 | -1) => {
    if (liveRef.current?.active || glError) return;
    const box = boxRef.current;
    const cur = indexRef.current;
    if (dir === 1 && cur >= spreadsRef.current - 1) return;
    if (dir === -1 && cur < 0) return;
    const point = cur < 0 ? { x: box.w * 0.94, y: box.h * 0.5 } : dir === 1 ? { x: box.pageX + box.pageW * 0.94, y: box.h * 0.5 } : { x: box.pageW * 0.06, y: box.h * 0.5 };
    const live = beginLive(point);
    if (!live) return;
    liveRef.current = live;
    setCurlDir(live.dir);
    finishLive(live, true);
  };
  const flipRef = useRef(flip);
  flipRef.current = flip;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") flipRef.current(1);
      if (event.key === "ArrowLeft") flipRef.current(-1);
      if (event.key === "Escape") nav.back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);

  const printFile = () => {
    setSaving("Готовлю файл…");
    void downloadFamilyBook(pages, meta, (done, total) => setSaving(`Страница ${done + 1} из ${total}…`))
      .then(() => toast("Просмотр книги сохранён. Файл для типографии – в «Книга» → «Формат и печать»."))
      .catch(() => toast("Файл не собрался. Попробуйте ещё раз."))
      .finally(() => setSaving(null));
  };

  const pickBinding = (id: BindingId) => {
    if (liveRef.current?.active) return;
    setBinding(id);
    lsSet(LS_BIND, id);
  };
  const pickBg = (id: BgId) => {
    setBg(id);
    lsSet(LS_BG, id);
  };
  const uploadBg = (file: File | undefined) => {
    if (!file) return;
    void saveMedia(file)
      .then(async (ref) => {
        lsSet(LS_BGREF, ref);
        setCustomBg(await resolveMedia(ref));
        pickBg("custom");
      })
      .catch(() => toast("Фон не загрузился"));
  };

  const closed = index < 0;
  const surface = bg === "custom" ? { src: customBg, light: false } : (BACKGROUNDS.find((item) => item.id === bg) ?? BACKGROUNDS[0]);
  const box = layoutOf(size.w, size.h, channelFor(binding));
  const pageStyle = (side: "left" | "right"): CSSProperties => (side === "right" ? { left: box.pageX, width: box.pageW } : { left: 0, width: box.pageW });
  const leftFace = !closed ? faces[2 * index + 1] : undefined;
  const rightFace = !closed ? faces[2 * index + 2] : faces[0];
  const editable = rightFace?.kind === "page" ? rightFace : leftFace?.kind === "page" ? leftFace : null;
  const caption = (() => {
    if (closed) return "Обложка";
    const nums = [leftFace, rightFace].filter((f): f is Extract<Face, { kind: "page" }> => f?.kind === "page").map((f) => f.number);
    return nums.length === 2 ? `Страницы ${nums.join("–")}` : nums.length === 1 ? `Страница ${nums[0]}` : "Форзац";
  })();

  return (
    <div className={cn("kb-desk fixed inset-0 z-40", surface.light && "light")} style={surface.src ? { backgroundImage: `url(${surface.src})` } : undefined}>
      <header className="flex w-full items-center gap-2 px-3 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" className="grid size-11 place-items-center rounded-full bg-black/35 text-paper" aria-label="Закрыть книгу" onClick={() => nav.back()}>
          <X className="size-5" />
        </button>
        <p className="flex-1 truncate text-center text-base font-semibold">Книга рода</p>
        <button type="button" disabled={Boolean(saving) || pages.length === 0} onClick={printFile} className="flex h-11 items-center gap-2 rounded-full bg-black/35 px-4 text-sm font-semibold text-paper disabled:opacity-60">
          <Download className="size-4" />
          {saving ?? "PDF"}
        </button>
      </header>

      <div ref={areaRef} className="flex min-h-0 w-full flex-1 items-center justify-center">
        <div ref={frameRef} className="kb-frame plain" style={{ width: size.w, height: size.h }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
          {closed ? (
            <div className="kb-sheet kb-under" style={{ left: 0, width: "100%" }}>
              <canvas ref={underRef} />
            </div>
          ) : (
            <>
              <div className="kb-sheet kb-under" style={pageStyle("right")}>
                <canvas ref={underRef} />
              </div>
              <div className="kb-sheet kb-under" style={pageStyle("left")}>
                <canvas ref={underLeftRef} />
              </div>
              <img className={`kb-binding kb-binding-${binding}`} src={BINDING_TEX[binding]} alt="" draggable={false} />
            </>
          )}
          {closed ? (
            <div className="kb-sheet kb-top" style={{ left: 0, width: "100%" }}>
              <canvas ref={rightRef} style={{ opacity: curlDir === 1 ? 0 : 1 }} />
            </div>
          ) : (
            <>
              <div className="kb-sheet kb-top" style={pageStyle("left")}>
                <canvas ref={leftRef} style={{ opacity: curlDir === -1 ? 0 : 1 }} />
              </div>
              <div className="kb-sheet kb-top" style={pageStyle("right")}>
                <canvas ref={rightRef} style={{ opacity: curlDir === 1 ? 0 : 1 }} />
              </div>
            </>
          )}
          {closed ? <div className="kb-fore-edge" aria-hidden="true" /> : null}
          {closed ? <div className="kb-spine-edge" aria-hidden="true" /> : null}
          <canvas ref={curlRef} className="kb-curl" data-off={curlDir === 0 ? "1" : "0"} />
        </div>
      </div>

      <footer className="flex w-full flex-col items-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex w-full max-w-xl items-center justify-between gap-2">
          <button type="button" className="grid size-12 place-items-center rounded-full bg-black/35 text-paper disabled:opacity-40" disabled={closed} onClick={() => flip(-1)} aria-label="Назад">
            <ChevronLeft className="size-5" />
          </button>
          <div className="min-w-0 text-center">
            <p className="text-sm font-medium">{caption}</p>
            {editable ? (
              <button type="button" className="mt-0.5 inline-flex items-center gap-1 text-xs underline" onClick={() => nav.replace({ id: "editor", pageId: editable.page.id })}>
                <PenLine className="size-3" /> Изменить страницу
              </button>
            ) : (
              <p className="kb-muted text-xs">Потяните за край листа</p>
            )}
          </div>
          <button type="button" className="grid size-12 place-items-center rounded-full bg-black/35 text-paper disabled:opacity-40" disabled={index >= spreadCount - 1} onClick={() => flip(1)} aria-label="Вперёд">
            <ChevronRight className="size-5" />
          </button>
        </div>
        <div className="no-scrollbar flex max-w-full gap-1.5 overflow-x-auto" role="tablist" aria-label="Переплёт">
          {BINDINGS.filter((item) => SHOWN_BINDINGS.includes(item.id)).map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={item.id === binding} className="kb-chip shrink-0" onClick={() => pickBinding(item.id)}>
              {BINDING_NAMES[item.id]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2" role="radiogroup" aria-label="Фон за книгой">
          {BACKGROUNDS.map((item) => (
            <button key={item.id} type="button" role="radio" aria-checked={item.id === bg} aria-label={item.name} title={item.name} className="kb-swatch" style={item.src ? { backgroundImage: `url(${item.src})` } : undefined} onClick={() => pickBg(item.id)} />
          ))}
          <label className="kb-swatch cursor-pointer" role="radio" aria-checked={bg === "custom"} aria-label="Свой фон" title="Свой фон из фото" style={bg === "custom" && customBg ? { backgroundImage: `url(${customBg})` } : undefined}>
            <ImagePlus className="size-5" />
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                uploadBg(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </footer>
      {glError ? <p className="absolute inset-x-4 bottom-24 text-paper">{glError}</p> : null}
    </div>
  );
}
