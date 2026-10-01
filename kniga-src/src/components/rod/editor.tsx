import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  AlignCenter,
  AlignLeft,
  ArrowDownToLine,
  ArrowUpToLine,
  BookOpen,
  Camera,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Eraser,
  Highlighter,
  ImagePlus,
  Images,
  Mic,
  MoreHorizontal,
  PenLine,
  Redo2,
  RotateCcw,
  Scissors,
  Search,
  Smile,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Button, Sheet, useNav } from "@/components/rod/chrome";
import { BlockArt, InkLayer, PageSheet, PlacedBlock, boxOf, inkColor, PAGE_H } from "@/components/rod/page-view";
import { imageFromTransfer, importImage, importImageUrl } from "@/lib/rod/image";
import { coverDesigns } from "@/lib/rod/layouts";
import { liftSubject } from "@/lib/rod/lift";
import { mediaDataUrl, resolveMedia, saveMedia, useMedia } from "@/lib/rod/media";
import { FONT_FAMILY, PAGE_RATIO, PAPER, POLAROID, STICKERS, STICKER_ORDER, defaultStickerWidth, pageSide, safeArea, stickerRatio, stickerUrl } from "@/lib/rod/page-style";
import { FONT_LABEL, findPrompt } from "@/lib/rod/pages";
import { scratch, stickSound, turnPage } from "@/lib/rod/sounds";
import { recognition } from "@/lib/rod/speech";
import { useRod } from "@/lib/rod/store";
import type { BookPage, FontKind, InkStroke, PageBlock, PaperKind, PhotoFrame, TextLook } from "@/lib/rod/types";
import { cn } from "@/lib/cn";

type Tool = "hand" | "pen" | "marker" | "erase";
type Panel = "photo" | "pinterest" | "stickers" | "help" | "menu" | "covers" | null;
type PhotoStyle = "cutout" | "polaroid" | "none" | "tape" | "sticker";
type Box = { x: number; y: number; w: number; h: number | null; rotate: number };
type Gesture = {
  id: string;
  mode: "move" | "size" | "turn";
  pointerId: number;
  startX: number;
  startY: number;
  box: Box;
  moved: boolean;
  wasSelected: boolean;
  center?: { x: number; y: number };
  angle0?: number;
  ratio?: number | null;
  last?: Box;
};

const STYLE_KEY = "kniga-photo-style";
const STYLES: { id: PhotoStyle; label: string }[] = [
  { id: "cutout", label: "Стикер без фона" },
  { id: "polaroid", label: "Полароид" },
  { id: "sticker", label: "С белой каймой" },
  { id: "tape", label: "На скотче" },
  { id: "none", label: "Просто фото" },
];

const INK: InkStroke["color"][] = ["ink", "rose", "sage", "gold", "white"];

const id = () => crypto.randomUUID();
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function loadRatio(src: string): Promise<number> {
  return resolveMedia(src).then(
    (url) =>
      new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image.height / Math.max(1, image.width));
        image.onerror = () => resolve(0.75);
        image.src = url;
      }),
  );
}

function savedStyle(): PhotoStyle {
  try {
    const value = localStorage.getItem(STYLE_KEY) as PhotoStyle | null;
    return value && STYLES.some((item) => item.id === value) ? value : "cutout";
  } catch {
    return "cutout";
  }
}

export function EditorScreen({ pageId }: { pageId: string }) {
  const nav = useNav();
  const pages = useRod((state) => state.pages);
  const updatePage = useRod((state) => state.updatePage);
  const removePage = useRod((state) => state.removePage);
  const restorePage = useRod((state) => state.restorePage);
  const duplicatePage = useRod((state) => state.duplicatePage);
  const movePage = useRod((state) => state.movePage);
  const dedicatee = useRod((state) => state.dedicatee);
  const collector = useRod((state) => state.collector);
  const archive = useRod((state) => state.photos);
  const print = useRod((state) => state.print);
  const page = pages.find((item) => item.id === pageId) ?? null;
  const index = pages.findIndex((item) => item.id === pageId);
  const meta = useMemo(() => ({ dedicatee, collector }), [dedicatee, collector]);

  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("hand");
  const [ink, setInk] = useState<InkStroke["color"]>("ink");
  const [thin, setThin] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [slotTarget, setSlotTarget] = useState<string | null>(null);
  const [style, setStyleState] = useState<PhotoStyle>(() => savedStyle());
  const [ghost, setGhost] = useState<{ id: string; box: Box } | null>(null);
  const [live, setLive] = useState<InkStroke | null>(null);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [dropping, setDropping] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [, setTick] = useState(0);

  const sheetRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const drawing = useRef<{ pointerId: number; points: number[]; erase: boolean } | null>(null);
  const undo = useRef<BookPage[]>([]);
  const redo = useRef<BookPage[]>([]);
  const lastGroup = useRef<{ key: string; at: number } | null>(null);
  const [size, setSize] = useState({ w: 320, h: 427 });

  const setStyle = (next: PhotoStyle) => {
    setStyleState(next);
    try {
      localStorage.setItem(STYLE_KEY, next);
    } catch {
      /* без запоминания */
    }
  };

  // Страница вписывается в экран целиком: лист всегда виден, без прокрутки.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => {
      const rect = stage.getBoundingClientRect();
      const w = Math.max(160, Math.min(rect.width - 8, (rect.height - 8) / PAGE_RATIO, 720));
      setSize({ w, h: w * PAGE_RATIO });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [page?.id]);

  useEffect(() => {
    undo.current = [];
    redo.current = [];
    setSelected(null);
    setEditing(null);
    setTick((value) => value + 1);
  }, [pageId]);

  const current = useCallback(() => useRod.getState().pages.find((item) => item.id === pageId) ?? null, [pageId]);

  /** Любое изменение страницы идёт через commit — так работает «Отменить». */
  const commit = useCallback(
    (updater: (page: BookPage) => BookPage, group?: string) => {
      const before = current();
      if (!before) return;
      const now = Date.now();
      const same = group && lastGroup.current?.key === group && now - lastGroup.current.at < 4000;
      if (!same) {
        undo.current = [...undo.current.slice(-79), before];
        redo.current = [];
      }
      lastGroup.current = group ? { key: group, at: now } : null;
      updatePage(pageId, updater);
      setTick((value) => value + 1);
    },
    [current, pageId, updatePage],
  );

  const doUndo = () => {
    const prev = undo.current.pop();
    const now = current();
    if (!prev || !now) return;
    redo.current.push(now);
    lastGroup.current = null;
    updatePage(pageId, () => prev);
    setSelected(null);
    setEditing(null);
    setTick((value) => value + 1);
  };

  const doRedo = () => {
    const next = redo.current.pop();
    const now = current();
    if (!next || !now) return;
    undo.current.push(now);
    lastGroup.current = null;
    updatePage(pageId, () => next);
    setTick((value) => value + 1);
  };

  const patchBlock = (blockId: string, partial: Partial<PageBlock>, group?: string) =>
    commit((p) => ({ ...p, blocks: p.blocks.map((b) => (b.id === blockId ? ({ ...b, ...partial } as PageBlock) : b)) }), group);

  const removeBlock = (blockId: string) => {
    commit((p) => ({ ...p, blocks: p.blocks.filter((b) => b.id !== blockId) }));
    setSelected(null);
    setEditing(null);
    toast("Удалено", { action: { label: "Вернуть", onClick: doUndo } });
  };

  const addBlock = (block: PageBlock) => {
    commit((p) => ({ ...p, blocks: [...p.blocks, block] }));
    setSelected(block.id);
  };

  // ——— Клавиатура: ⌘Z, Delete ———
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement)?.closest?.("input, textarea");
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !typing) {
        event.preventDefault();
        if (event.shiftKey) doRedo();
        else doUndo();
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selected && !typing) {
        event.preventDefault();
        removeBlock(selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ——— Вставка из буфера: ⌘V ———
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if ((event.target as HTMLElement)?.closest?.("input, textarea")) return;
      const data = event.clipboardData;
      if (!data) return;
      event.preventDefault();
      void imageFromTransfer(data)
        .then((ref) => {
          if (ref) void placePhoto(ref);
          else toast("В буфере нет картинки");
        })
        .catch(() => toast("Картинка не вставилась. Сохраните её на телефон и добавьте через «Фото»."));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  if (!page) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-center">
        <div>
          <p className="display-title text-3xl text-ink">Страница не найдена</p>
          <Button className="mt-4" onClick={() => nav.replace({ id: "book" })}>
            К книге
          </Button>
        </div>
      </div>
    );
  }

  const selectedBlock = page.blocks.find((b) => b.id === selected) ?? null;
  const editingBlock = (() => {
    const b = page.blocks.find((item) => item.id === editing);
    return b && b.type === "text" ? b : null;
  })();

  const toPct = (clientX: number, clientY: number) => {
    const rect = sheetRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    return { x: ((clientX - rect.left) / rect.width) * 100, y: ((clientY - rect.top) / rect.height) * 100 };
  };

  // ——— Охранное поле ———
  const side = pageSide(index, pages[0]?.kind === "cover");
  const safe = safeArea(print.size, side);
  const bleedPct = (print.bleed / (print.size * 10)) * 100;

  /** Текст и стикеры остаются внутри охранного поля. Фото — либо внутри, либо «на вылет» за край листа. */
  const fitSafe = (b: PageBlock): PageBlock => {
    const el = document.querySelector(`[data-block="${b.id}"]`) as HTMLElement | null;
    const sheetH = sheetRef.current?.offsetHeight || 1;
    const L = safe.left;
    const R = 100 - safe.right;
    const T = safe.top;
    const B = 100 - safe.bottom;
    const bleedable = (b.type === "photo" && !(b.frame === "sticker" && b.cut)) || b.type === "slot";
    if (!bleedable) {
      let w = "w" in b && typeof b.w === "number" ? b.w : 10;
      if (b.type === "text") w = Math.min(w, R - L);
      const h = b.type === "photo" ? b.h : b.type === "sticker" ? (b.w ?? 10) * stickerRatio(b.kind) : el ? (el.offsetHeight / sheetH) * 100 : 6;
      const x = clamp(b.x, L, Math.max(L, R - w));
      const y = clamp(b.y, T, Math.max(T, B - h));
      return { ...b, x: round(x), y: round(y), ...("w" in b ? { w: round(w) } : {}) } as PageBlock;
    }
    const [x, w] = snapAxis(b.x, b.w, L, R, bleedPct);
    const [y, h] = snapAxis(b.y, b.h, T, B, bleedPct);
    return { ...b, x: round(x), y: round(y), w: round(w), h: round(h) } as PageBlock;
  };

  // ——— Фото ———
  async function placePhoto(ref: string, at?: { x: number; y: number }, forced?: PhotoStyle) {
    const target = slotTarget ? page?.blocks.find((b) => b.id === slotTarget && b.type === "slot") : null;
    const chosen = forced ?? style;
    const ratio = await loadRatio(ref);
    const frame: PhotoFrame = target && target.type === "slot" ? target.frame : chosen === "cutout" ? "sticker" : chosen;
    let block: Extract<PageBlock, { type: "photo" }>;
    if (target && target.type === "slot") {
      block = { id: id(), type: "photo", x: target.x, y: target.y, w: target.w, h: target.h, rotate: target.rotate ?? 0, src: ref, caption: "", frame };
    } else {
      const w = chosen === "cutout" ? 52 : 56;
      const inner = frame === "polaroid" ? w * (1 - (2 * POLAROID.side) / 100) : frame === "sticker" ? w - 2.8 : w;
      const extra = frame === "polaroid" ? (w * (POLAROID.top + POLAROID.bottom)) / 100 : frame === "sticker" ? 2.8 : 0;
      const h = clamp((inner * ratio + extra) / PAGE_RATIO, 8, 80);
      const cx = at?.x ?? 50;
      const cy = at?.y ?? 42;
      const tilt = frame === "none" ? 0 : Math.round((Math.random() * 6 - 3) * 10) / 10;
      block = { id: id(), type: "photo", x: clamp(cx - w / 2, -10, 90), y: clamp(cy - h / 2, -5, 92), w, h, rotate: tilt, src: ref, caption: "", frame };
    }
    if (!target) block = fitSafe(block) as typeof block;
    stickSound();
    commit((p) => ({
      ...p,
      blocks: target ? p.blocks.map((b) => (b.id === target.id ? block : b)) : [...p.blocks, block],
    }));
    setSelected(block.id);
    setSlotTarget(null);
    setPanel(null);
    if (chosen === "cutout" && !target) void cutOut(block.id, ref);
  }

  async function cutOut(blockId: string, src: string) {
    setBusy((value) => ({ ...value, [blockId]: "Отделяю фон…" }));
    try {
      const data = await mediaDataUrl(src);
      const cut = data ? await liftSubject(data, (label) => setBusy((value) => ({ ...value, [blockId]: label }))) : null;
      if (!cut) {
        toast("Фон не отделился — фото легло с белой каймой. Лучше всего вырезаются люди и предметы на спокойном фоне.");
        patchBlock(blockId, { frame: "sticker" } as Partial<PageBlock>);
        return;
      }
      const ref = await saveMedia(cut);
      const ratio = await loadRatio(ref);
      const block = current()?.blocks.find((b) => b.id === blockId);
      if (!block || block.type !== "photo") return;
      const h = clamp((block.w * ratio) / PAGE_RATIO, 5, 90);
      stickSound();
      if (typeof navigator.vibrate === "function") navigator.vibrate(12);
      patchBlock(blockId, { cut: ref, frame: "sticker", h, y: block.y + (block.h - h) / 2 } as Partial<PageBlock>);
    } catch {
      toast("Вырезка не получилась. Проверьте интернет: в первый раз она скачивается (~40 МБ).");
    } finally {
      setBusy((value) => {
        const next = { ...value };
        delete next[blockId];
        return next;
      });
    }
  }

  const onFiles = (files: FileList | null) => {
    const list = [...(files ?? [])].filter((file) => file.type.startsWith("image/") || /\.(heic|jpe?g|png|webp)$/i.test(file.name));
    if (!list.length) return;
    setPanel(null);
    void (async () => {
      for (const [i, file] of list.slice(0, 8).entries()) {
        try {
          const ref = await importImage(file);
          await placePhoto(ref, list.length > 1 ? { x: 30 + (i % 2) * 40, y: 25 + Math.floor(i / 2) * 25 } : undefined);
        } catch {
          toast("Этот снимок не открылся. Выберите JPG или PNG.");
        }
      }
    })();
  };

  const pasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && "read" in navigator.clipboard) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const type = item.types.find((t) => t.startsWith("image/"));
          if (type) {
            const ref = await importImage(await item.getType(type));
            await placePhoto(ref);
            return;
          }
        }
      }
      const text = await navigator.clipboard.readText();
      const link = text.split(/\s+/).find((part) => /^https?:\/\//.test(part));
      if (link) {
        const ref = await importImageUrl(link);
        await placePhoto(ref);
        return;
      }
      toast("В буфере нет картинки. В Pinterest нажмите на фото → «Копировать» (или сохраните его) и попробуйте ещё раз.");
    } catch {
      toast("Не получилось взять картинку из буфера. Сохраните её в фото телефона и добавьте через «Фото».");
    }
  };

  // ——— Жесты на листе ———
  const startDraw = (event: React.PointerEvent) => {
    const pen = event.pointerType === "pen";
    if (tool === "hand" && !pen) return false;
    event.stopPropagation();
    event.preventDefault();
    setEditing(null);
    setSelected(null);
    sheetRef.current?.setPointerCapture(event.pointerId);
    const p = toPct(event.clientX, event.clientY);
    const erase = tool === "erase";
    drawing.current = { pointerId: event.pointerId, points: [round(p.x), round(p.y)], erase };
    if (erase) {
      scratch("erase");
      eraseAt(p, true);
    } else {
      scratch(tool === "marker" ? "brush" : "pen");
      setLive(makeStroke([round(p.x), round(p.y)]));
    }
    return true;
  };

  const makeStroke = (points: number[]): InkStroke => {
    const marker = tool === "marker";
    return { id: "live", color: ink, width: marker ? 2.6 : thin ? 0.32 : 0.6, alpha: marker ? 0.38 : 1, points };
  };

  const eraseAt = (p: { x: number; y: number }, first: boolean) => {
    const near = (stroke: InkStroke) => {
      const r = Math.max(2.2, stroke.width);
      for (let i = 0; i + 1 < stroke.points.length; i += 2) {
        const dx = stroke.points[i] - p.x;
        const dy = ((stroke.points[i + 1] - p.y) * PAGE_H) / 100;
        if (dx * dx + dy * dy < r * r) return true;
      }
      return false;
    };
    const hit = current()?.strokes.some(near);
    if (!hit) return;
    commit((page) => ({ ...page, strokes: page.strokes.filter((s) => !near(s)) }), first ? undefined : "erase");
    lastGroup.current = { key: "erase", at: Date.now() };
  };

  const onSheetMove = (event: React.PointerEvent) => {
    const draw = drawing.current;
    if (draw && draw.pointerId === event.pointerId) {
      const events = typeof event.nativeEvent.getCoalescedEvents === "function" ? event.nativeEvent.getCoalescedEvents() : [event.nativeEvent];
      for (const e of events.length ? events : [event.nativeEvent]) {
        const p = toPct(e.clientX, e.clientY);
        if (draw.erase) eraseAt(p, false);
        else draw.points.push(round(p.x), round(p.y));
      }
      if (!draw.erase) setLive(makeStroke(draw.points.slice()));
      return;
    }
    moveGesture(event);
  };

  const onSheetUp = (event: React.PointerEvent) => {
    const draw = drawing.current;
    if (draw && draw.pointerId === event.pointerId) {
      drawing.current = null;
      setLive(null);
      if (!draw.erase && draw.points.length >= 2) {
        const points = draw.points.length === 2 ? [...draw.points, draw.points[0] + 0.01, draw.points[1] + 0.01] : draw.points;
        const stroke = { ...makeStroke(points), id: id() };
        commit((p) => ({ ...p, strokes: [...p.strokes, stroke] }));
      }
      lastGroup.current = null;
      return;
    }
    endGesture(event);
  };

  const onSheetDown = (event: React.PointerEvent) => {
    if (startDraw(event)) return;
    if (event.target === event.currentTarget || (event.target as HTMLElement).dataset.bg) {
      setSelected(null);
      setEditing(null);
    }
  };

  const beginGesture = (event: React.PointerEvent, block: PageBlock, mode: Gesture["mode"]) => {
    if (tool !== "hand" || event.pointerType === "pen") return;
    if (editing === block.id && mode === "move") return;
    event.stopPropagation();
    event.preventDefault();
    if (editing && editing !== block.id) setEditing(null);
    const wrapper = (event.currentTarget as HTMLElement).closest("[data-block]") as HTMLElement | null;
    const rect = wrapper?.getBoundingClientRect();
    const center = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined;
    const box = boxOf(block);
    const ratio = block.type === "photo" && block.cut && block.frame === "sticker" ? block.h / block.w : null;
    gesture.current = {
      id: block.id,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      box,
      moved: false,
      wasSelected: selected === block.id,
      center,
      angle0: center ? Math.atan2(event.clientY - center.y, event.clientX - center.x) : 0,
      ratio,
    };
    sheetRef.current?.setPointerCapture(event.pointerId);
    setSelected(block.id);
  };

  const moveGesture = (event: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    const rect = sheetRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dxPx = event.clientX - g.startX;
    const dyPx = event.clientY - g.startY;
    if (!g.moved && dxPx * dxPx + dyPx * dyPx < 25) return;
    g.moved = true;
    const dx = (dxPx / rect.width) * 100;
    const dy = (dyPx / rect.height) * 100;
    let box = g.box;
    if (g.mode === "move") box = { ...g.box, x: clamp(g.box.x + dx, -g.box.w + 6, 94), y: clamp(g.box.y + dy, -6, 96) };
    if (g.mode === "size") {
      const w = clamp(g.box.w + dx, 6, 120);
      const h = g.box.h === null ? null : g.ratio ? clamp(g.ratio * w, 4, 120) : clamp(g.box.h + dy, 4, 120);
      box = { ...g.box, w, h };
    }
    if (g.mode === "turn" && g.center) {
      const angle = Math.atan2(event.clientY - g.center.y, event.clientX - g.center.x);
      let deg = Math.round(g.box.rotate + ((angle - (g.angle0 ?? 0)) * 180) / Math.PI);
      deg = ((deg + 540) % 360) - 180;
      if (Math.abs(deg) < 3) deg = 0;
      box = { ...g.box, rotate: deg };
    }
    g.last = box;
    setGhost({ id: g.id, box });
  };

  const endGesture = (event: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    gesture.current = null;
    const final = g.last ?? null;
    setGhost(null);
    const block = current()?.blocks.find((b) => b.id === g.id);
    if (!block) return;
    if (g.moved && final) {
      commit((p) => ({
        ...p,
        blocks: p.blocks.map((b) => {
          if (b.id !== g.id) return b;
          const next = { ...b, x: round(final.x), y: round(final.y), rotate: final.rotate } as PageBlock;
          if ("w" in next) (next as { w?: number }).w = round(final.w);
          if ((next.type === "photo" || next.type === "slot") && final.h !== null) next.h = round(final.h);
          return fitSafe(next);
        }),
      }));
      return;
    }
    if (g.mode !== "move") return;
    if (block.type === "slot") {
      setSlotTarget(block.id);
      setPanel("photo");
      return;
    }
    if (block.type === "text" && g.wasSelected) startEditing(block.id);
  };

  const startEditing = (blockId: string) => {
    flushSync(() => {
      setSelected(blockId);
      setEditing(blockId);
    });
    const area = document.getElementById(`edit-${blockId}`) as HTMLTextAreaElement | null;
    if (area) {
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
    }
  };

  const addText = (partial?: Partial<Extract<PageBlock, { type: "text" }>>) => {
    const block: PageBlock = { id: id(), type: "text", x: 12, y: 40, w: 76, text: "", font: "script", size: "md", ...partial };
    stickSound();
    flushSync(() => addBlock(block));
    startEditing(block.id);
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDropping(false);
    const at = toPct(event.clientX, event.clientY);
    void imageFromTransfer(event.dataTransfer)
      .then((ref) => {
        if (ref) void placePhoto(ref, at);
        else toast("Сюда можно перетащить картинку");
      })
      .catch(() => toast("Картинка не скачалась. Сохраните её на устройство и перетащите файл."));
  };

  const go = (dir: -1 | 1) => {
    const next = pages[index + dir];
    if (!next) return;
    turnPage();
    nav.replace({ id: "editor", pageId: next.id });
  };

  const toBin = () => {
    const deleted = page.id;
    const neighbour = pages[index + 1] ?? pages[index - 1];
    removePage(deleted);
    toast("Страница в корзине", { action: { label: "Вернуть", onClick: () => restorePage(deleted) } });
    if (neighbour) nav.replace({ id: "editor", pageId: neighbour.id });
    else nav.replace({ id: "book" });
  };

  const prompt = findPrompt(page.promptId);
  const cursor = tool === "hand" ? "default" : tool === "erase" ? "cell" : "crosshair";

  return (
    <div className="editor-root fixed inset-0 z-40 flex flex-col">
      {/* Верх */}
      <header className="flex items-center gap-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" className="glass-strong grid size-11 shrink-0 place-items-center rounded-full" aria-label="К книге" onClick={() => nav.back()}>
          <ChevronLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-ink">{page.kind === "cover" ? "Обложка" : page.title}</p>
          <div className="flex items-center justify-center gap-1 text-xs text-muted">
            <button type="button" className="grid size-7 place-items-center rounded-full disabled:opacity-30" disabled={index <= 0} onClick={() => go(-1)} aria-label="Предыдущая">
              <ChevronLeft className="size-4" />
            </button>
            <span className="tabular-nums">
              {index + 1} / {pages.length}
            </span>
            <button type="button" className="grid size-7 place-items-center rounded-full disabled:opacity-30" disabled={index >= pages.length - 1} onClick={() => go(1)} aria-label="Следующая">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
        <div className="glass-strong flex shrink-0 items-center rounded-full p-1">
          <IconBtn label="Отменить" disabled={!undo.current.length} onClick={doUndo}>
            <Undo2 className="size-[18px]" />
          </IconBtn>
          <IconBtn label="Повторить" disabled={!redo.current.length} onClick={doRedo}>
            <Redo2 className="size-[18px]" />
          </IconBtn>
          <IconBtn label="Ещё" onClick={() => setPanel("menu")}>
            <MoreHorizontal className="size-[18px]" />
          </IconBtn>
        </div>
      </header>

      {/* Лист */}
      <div className="relative min-h-0 flex-1">
      <div ref={stageRef} className="no-scrollbar absolute inset-0 overflow-auto">
      <div className="flex min-h-full items-center justify-center p-3" style={{ width: zoom > 1 ? size.w * zoom + 24 : "100%" }}>
        <div
          ref={sheetRef}
          className={cn("book-page-shadow relative select-none rounded-[2px]", dropping && "ring-4 ring-rose/60")}
          style={{ width: size.w * zoom, cursor, touchAction: tool === "hand" && zoom > 1 ? "pan-x pan-y" : "none" }}
          onPointerDown={onSheetDown}
          onPointerMove={onSheetMove}
          onPointerUp={onSheetUp}
          onPointerCancel={onSheetUp}
          onDragOver={(event) => {
            event.preventDefault();
            setDropping(true);
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={onDrop}
          onContextMenu={(event) => event.preventDefault()}
        >
          {/* Вылет под обрез: сюда можно тянуть фото, всё остальное отрежется */}
          <div className="pointer-events-none absolute rounded-[2px] border border-dashed border-rose/40" style={{ inset: `-${bleedPct}%` }} />
          <PageSheet page={page} meta={meta} hideStrokes clip={false} className="rounded-[2px]">
            <div data-bg="1" className="absolute inset-0" />
            {page.blocks.map((block) => {
              const box = ghost?.id === block.id ? ghost.box : null;
              const shown = box ? ({ ...block, x: box.x, y: box.y, rotate: box.rotate, ...("w" in block ? { w: box.w } : {}), ...((block.type === "photo" || block.type === "slot") && box.h !== null ? { h: box.h } : {}) } as PageBlock) : block;
              const isSel = selected === block.id;
              return (
                <PlacedBlock
                  key={block.id}
                  block={shown}
                  data-block={block.id}
                  className={cn("touch-none", isSel && "z-20")}
                  onPointerDown={(event) => beginGesture(event, block, "move")}
                >
                  <BlockArt block={shown} editing />
                  {editing === block.id ? <span className="pointer-events-none absolute -inset-[4px] rounded-[4px] border-2 border-rose" /> : null}
                  {busy[block.id] ? (
                    <div className="pointer-events-none absolute inset-0 grid place-items-center">
                      <span className="cut-shimmer absolute inset-0 rounded-[1.4cqw]" />
                      <span className="relative rounded-full bg-night/85 px-3 py-1 text-xs text-paper">{busy[block.id]}</span>
                    </div>
                  ) : null}
                  {isSel && editing !== block.id && tool === "hand" ? (
                    <Handles
                      onTurn={(event) => beginGesture(event, block, "turn")}
                      onSize={(event) => beginGesture(event, block, "size")}
                    />
                  ) : null}
                </PlacedBlock>
              );
            })}
          </PageSheet>
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2px]" style={{ containerType: "inline-size" }}>
            <InkLayer strokes={page.strokes} live={live} />
          </div>
          {/* Охранное поле и зона корешка */}
          <div
            className={cn("pointer-events-none absolute z-30 border border-dashed transition-colors", ghost ? "border-rose" : "border-rose/35")}
            style={{ left: `${safe.left}%`, right: `${safe.right}%`, top: `${safe.top}%`, bottom: `${safe.bottom}%` }}
          />
          {side !== "single" ? (
            <div
              className="pointer-events-none absolute inset-y-0 z-30"
              style={{
                [side === "right" ? "left" : "right"]: 0,
                width: `${safe[side === "right" ? "left" : "right"]}%`,
                background: `linear-gradient(${side === "right" ? "90deg" : "270deg"}, rgba(142,61,82,.10), rgba(142,61,82,0))`,
              }}
            />
          ) : null}
          {page.blocks.length === 0 && page.strokes.length === 0 && page.kind !== "cover" ? (
            <div className="pointer-events-none absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-sm text-muted">
              Пустой лист. Добавьте текст, фото или стикер снизу — или перетащите картинку прямо сюда.
            </div>
          ) : null}
        </div>
      </div>
      </div>
        <div className="glass-strong absolute bottom-2 right-3 z-10 flex items-center rounded-full p-1">
          <IconBtn label="Мельче" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
            <ZoomOut className="size-4" />
          </IconBtn>
          <span className="w-10 text-center text-xs tabular-nums text-ink">{Math.round(zoom * 100)}%</span>
          <IconBtn label="Крупнее" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))}>
            <ZoomIn className="size-4" />
          </IconBtn>
        </div>
      </div>

      {editingBlock ? (
        <TextPanel
          key={editingBlock.id}
          block={editingBlock}
          onChange={(text) => patchBlock(editingBlock.id, { text } as Partial<PageBlock>, `text:${editingBlock.id}`)}
          onPatch={(partial) => patchBlock(editingBlock.id, partial)}
          onDone={() => setEditing(null)}
        />
      ) : null}

      {/* Контекстная панель выделенного */}
      <div className="px-3 pt-2">
        {tool !== "hand" ? (
          <PenBar tool={tool} setTool={setTool} ink={ink} setInk={setInk} thin={thin} setThin={setThin} />
        ) : selectedBlock && !editing ? (
          <BlockBar
            block={selectedBlock}
            busy={Boolean(busy[selectedBlock.id])}
            onPatch={(partial) => patchBlock(selectedBlock.id, partial)}
            onDelete={() => removeBlock(selectedBlock.id)}
            onEdit={() => startEditing(selectedBlock.id)}
            onDuplicate={() => {
              const copy = { ...selectedBlock, id: id(), x: selectedBlock.x + 4, y: selectedBlock.y + 3 } as PageBlock;
              addBlock(copy);
            }}
            onLayer={(dir) =>
              commit((p) => {
                const rest = p.blocks.filter((b) => b.id !== selectedBlock.id);
                return { ...p, blocks: dir > 0 ? [...rest, selectedBlock] : [selectedBlock, ...rest] };
              })
            }
            onCut={() => selectedBlock.type === "photo" && void cutOut(selectedBlock.id, selectedBlock.src)}
            onFill={() => {
              setSlotTarget(selectedBlock.id);
              setPanel("photo");
            }}
          />
        ) : (
          page.kind === "cover" ? (
            <div className="flex h-11 items-center justify-center gap-2">
              <Button variant="soft" className="min-h-10 shrink-0 whitespace-nowrap" onClick={() => setPanel("covers")}>
                <Sparkles className="size-4" /> Дизайн обложки
              </Button>
              <span className="truncate text-xs text-muted">Всё двигается и удаляется</span>
            </div>
          ) : (
            <p className="h-11 truncate pt-3 text-center text-xs text-muted">
              Пунктир — охранное поле: текст внутри. Фото можно тянуть за край листа — «на вылет».
            </p>
          )
        )}
      </div>

      {/* Инструменты */}
      <nav className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <div className="toolbar-dark mx-auto flex max-w-xl items-stretch justify-between gap-1 rounded-[1.6rem] p-1.5">
          <ToolBtn label="Текст" onClick={() => { setTool("hand"); addText(); }}>
            <Type className="size-5" />
          </ToolBtn>
          <ToolBtn label="Фото" onClick={() => { setTool("hand"); setSlotTarget(null); setPanel("photo"); }}>
            <ImagePlus className="size-5" />
          </ToolBtn>
          <ToolBtn label="Pinterest" onClick={() => { setTool("hand"); setPanel("pinterest"); }}>
            <PinIcon />
          </ToolBtn>
          <ToolBtn label="Стикеры" onClick={() => { setTool("hand"); setPanel("stickers"); }}>
            <Smile className="size-5" />
          </ToolBtn>
          <ToolBtn label="Перо" active={tool !== "hand"} onClick={() => { setSelected(null); setTool(tool === "hand" ? "pen" : "hand"); }}>
            <PenLine className="size-5" />
          </ToolBtn>
          <ToolBtn label="Помочь" onClick={() => setPanel("help")}>
            <Sparkles className="size-5" />
          </ToolBtn>
        </div>
      </nav>

      <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(event) => { onFiles(event.target.files); event.target.value = ""; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => { onFiles(event.target.files); event.target.value = ""; }} />

      {panel === "photo" ? (
        <Sheet title={slotTarget ? "Фото в рамку" : "Добавить фото"} onClose={() => { setPanel(null); setSlotTarget(null); }}>
          {!slotTarget ? (
            <>
              <p className="mb-2 text-sm text-muted">Как положить</p>
              <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
                {STYLES.map((item) => (
                  <button key={item.id} type="button" onClick={() => setStyle(item.id)} className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-medium", style === item.id ? "bg-night text-paper" : "bg-white/70 text-ink")}>
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <BigChoice icon={<Images className="size-5" />} title="Из галереи" text="Можно несколько" onClick={() => fileRef.current?.click()} />
            <BigChoice icon={<Camera className="size-5" />} title="Камера" text="Снять старое фото" onClick={() => cameraRef.current?.click()} />
            <BigChoice icon={<ClipboardPaste className="size-5" />} title="Вставить" text="Скопированную картинку" onClick={() => void pasteFromClipboard()} />
            <BigChoice icon={<PinIcon />} title="Pinterest" text="Найти и перетащить" onClick={() => setPanel("pinterest")} />
          </div>
          {archive.length > 0 ? (
            <>
              <p className="mb-2 mt-4 text-sm text-muted">Из архива семьи</p>
              <ul className="grid grid-cols-4 gap-2">
                {archive.map((photo) => (
                  <li key={photo.id}>
                    <ArchiveThumb src={photo.dataUrl} alt={photo.who} onClick={() => void placePhoto(photo.dataUrl)} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {style === "cutout" && !slotTarget ? <p className="mt-4 text-xs text-muted">Фон уберётся сам, фото ляжет стикером с белой обводкой. В первый раз вырезка скачивается около минуты.</p> : null}
        </Sheet>
      ) : null}

      {panel === "pinterest" ? <PinterestPanel onClose={() => setPanel(null)} onPaste={() => void pasteFromClipboard()} onLink={(link) => { setPanel(null); void importImageUrl(link).then((ref) => placePhoto(ref)).catch(() => toast("По этой ссылке картинка не скачалась. Нужна ссылка на саму картинку, а не на пин.")); }} /> : null}

      {panel === "stickers" ? (
        <Sheet title="Стикеры" onClose={() => setPanel(null)}>
          <ul className="grid grid-cols-4 gap-3">
            {STICKER_ORDER.map((kind) => (
              <li key={kind}>
                <button
                  type="button"
                  className="grid aspect-square w-full place-items-center rounded-2xl bg-white/70 p-3"
                  onClick={() => {
                    stickSound();
                    const w = defaultStickerWidth(kind);
                    addBlock({ id: id(), type: "sticker", kind, x: 50 - w / 2, y: 40, w, rotate: Math.round(Math.random() * 16 - 8) });
                    setPanel(null);
                  }}
                >
                  <img src={stickerUrl(kind)} alt={STICKERS[kind].label} className="max-h-full w-full object-contain" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mb-2 mt-5 text-sm text-muted">Надписи</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="soft" onClick={() => { setPanel(null); addText({ look: "card", font: "sans", size: "sm", w: 56, x: 22 }); }}>
              Чёрная карточка
            </Button>
            <Button variant="soft" onClick={() => { setPanel(null); addText({ look: "pill", font: "sans", size: "sm", w: 40, x: 30 }); }}>
              Плашка
            </Button>
            <Button variant="soft" onClick={() => { setPanel(null); addText({ font: "serif", size: "lg", w: 84, x: 8, y: 8 }); }}>
              Заголовок
            </Button>
          </div>
        </Sheet>
      ) : null}

      {panel === "help" ? (
        <HelpSheet
          title={page.title}
          questions={prompt?.questions ?? GENERIC_QUESTIONS}
          onClose={() => setPanel(null)}
          onInsert={(text) => {
            const empty = page.blocks.find((b) => b.type === "text" && !b.text.trim() && b.look !== "pill" && b.look !== "card");
            if (empty) patchBlock(empty.id, { text } as Partial<PageBlock>);
            else addBlock({ id: id(), type: "text", x: 8, y: 55, w: 84, text, font: "serif", size: "sm" });
            setPanel(null);
          }}
        />
      ) : null}

      {panel === "covers" ? (
        <Sheet title="Дизайн обложки" onClose={() => setPanel(null)} className="max-w-2xl">
          <p className="mb-3 text-sm text-muted">Выберите основу — потом всё на ней можно двигать, менять шрифт, цвет бумаги, добавлять фото и стикеры. Отменить — стрелкой ↶.</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {coverDesigns(meta).map((design) => (
              <li key={design.id}>
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => {
                    const own = page.blocks.filter((b) => b.type === "photo" || (b.type === "sticker" && !design.page.blocks.some((d) => d.type === "sticker" && d.kind === b.kind)));
                    commit((p) => ({ ...p, designed: true, paper: design.page.paper, blocks: [...design.page.blocks.map((b) => ({ ...b, id: id() })), ...own.filter((b) => b.type === "photo")] }));
                    setSelected(null);
                    setPanel(null);
                  }}
                >
                  <div className="thumb-shadow overflow-hidden rounded-[4px]">
                    <PageSheet page={{ id: design.id, ...design.page }} meta={meta} editing />
                  </div>
                  <span className="mt-1 block text-xs font-medium text-ink">{design.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      ) : null}

      {panel === "menu" ? (
        <Sheet title="Страница" onClose={() => setPanel(null)}>
          {page.kind === "cover" ? (
            <Button className="mb-4 w-full" onClick={() => setPanel("covers")}>
              <Sparkles className="size-4" /> Другой дизайн обложки
            </Button>
          ) : null}
          {page.kind !== "cover" ? (
            <label className="mb-4 block">
              <span className="mb-1 block text-sm text-muted">Название в оглавлении</span>
              <input className="field" value={page.title} onChange={(event) => commit((p) => ({ ...p, title: event.target.value }), "title")} />
            </label>
          ) : null}
          <p className="mb-2 text-sm text-muted">Бумага</p>
          <div className="mb-5 flex flex-wrap gap-2">
            {(Object.keys(PAPER) as PaperKind[]).map((paper) => (
              <button
                key={paper}
                type="button"
                onClick={() => commit((p) => ({ ...p, paper }))}
                className={cn("flex items-center gap-2 rounded-full bg-white/70 py-1.5 pl-1.5 pr-3 text-sm", page.paper === paper && "ring-2 ring-night")}
              >
                <span className="size-7 rounded-full border border-line" style={{ background: PAPER[paper].bg }} />
                {PAPER[paper].label}
              </button>
            ))}
          </div>
          <div className="grid gap-2">
            <MenuRow icon={<BookOpen className="size-4" />} label="Листать книгу" onClick={() => { setPanel(null); nav.go({ id: "flip", pageId: page.id }); }} />
            <MenuRow icon={<Copy className="size-4" />} label="Сделать копию страницы" onClick={() => { const copy = duplicatePage(page.id); setPanel(null); if (copy) nav.replace({ id: "editor", pageId: copy }); }} />
            <div className="grid grid-cols-2 gap-2">
              <MenuRow icon={<ChevronLeft className="size-4" />} label="Раньше в книге" disabled={index <= 0} onClick={() => movePage(page.id, -1)} />
              <MenuRow icon={<ChevronRight className="size-4" />} label="Позже в книге" disabled={index >= pages.length - 1} onClick={() => movePage(page.id, 1)} />
            </div>
            <MenuRow icon={<Eraser className="size-4" />} label="Стереть все чернила" disabled={page.strokes.length === 0} onClick={() => { commit((p) => ({ ...p, strokes: [] })); setPanel(null); }} />
            <MenuRow icon={<Trash2 className="size-4" />} label="Убрать страницу в корзину" danger onClick={toBin} />
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

/** Край по оси: внутри охранного поля или за краем листа на вылет. Возвращает [начало, длина]. */
function snapAxis(start: number, len: number, lo: number, hi: number, bleed: number): [number, number] {
  let s = start;
  let n = len;
  let startBleed = false;
  if (s < lo) {
    if (s < lo / 2) {
      s = -bleed;
      startBleed = true;
    } else s = lo;
  }
  const e = s + n;
  if (e > hi) {
    if (e > (hi + 100) / 2) {
      if (startBleed) n = 100 + bleed * 2;
      else {
        s = 100 + bleed - n;
        if (s < lo) {
          if (s < lo / 2) {
            s = -bleed;
            n = 100 + bleed * 2;
          } else {
            s = lo;
            n = 100 + bleed - lo;
          }
        }
      }
    } else {
      s = hi - n;
      if (s < lo && !startBleed) {
        s = lo;
        n = hi - lo;
      } else if (startBleed) {
        n = hi + bleed;
      }
    }
  }
  return [s, n];
}

function round(v: number) {
  return Math.round(v * 100) / 100;
}

function IconBtn({ label, children, onClick, disabled }: { label: string; children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid size-9 place-items-center rounded-full text-ink transition disabled:opacity-30 enabled:active:bg-white/70">
      {children}
    </button>
  );
}

function ToolBtn({ label, children, onClick, active }: { label: string; children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex min-h-[3.4rem] flex-1 flex-col items-center justify-center gap-1 rounded-[1.2rem] text-[11px] font-medium transition", active ? "bg-white text-ink" : "text-paper/90 active:bg-white/15")}
    >
      {children}
      {label}
    </button>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-3.64 19.31c-.09-.79-.17-2 .03-2.86l1.2-5.08s-.3-.61-.3-1.5c0-1.41.82-2.46 1.84-2.46.87 0 1.29.65 1.29 1.43 0 .87-.56 2.18-.84 3.39-.24 1.01.51 1.84 1.51 1.84 1.81 0 3.2-1.91 3.2-4.66 0-2.44-1.75-4.14-4.25-4.14-2.9 0-4.6 2.17-4.6 4.42 0 .87.34 1.81.76 2.32.08.1.09.19.07.29l-.28 1.15c-.05.19-.15.23-.34.14-1.27-.59-2.06-2.45-2.06-3.95 0-3.21 2.33-6.17 6.73-6.17 3.53 0 6.28 2.52 6.28 5.89 0 3.51-2.21 6.34-5.29 6.34-1.03 0-2-.54-2.33-1.17l-.64 2.42c-.23.89-.85 2-1.27 2.68A10 10 0 1 0 12 2z" />
    </svg>
  );
}

function Handles({ onTurn, onSize }: { onTurn: (event: React.PointerEvent) => void; onSize: (event: React.PointerEvent) => void }) {
  return (
    <>
      <span className="pointer-events-none absolute -inset-[5px] rounded-[6px] border-2 border-dashed border-rose" />
      <button type="button" aria-label="Повернуть" className="handle absolute -top-11 left-1/2 grid size-8 -translate-x-1/2 place-items-center rounded-full bg-white text-ink shadow-md" onPointerDown={onTurn}>
        <RotateCcw className="size-4" />
      </button>
      <span className="pointer-events-none absolute -top-3 left-1/2 h-3 w-px -translate-x-1/2 bg-rose" />
      <button type="button" aria-label="Размер" className="handle absolute -bottom-4 -right-4 size-8 rounded-full border-[3px] border-rose bg-white shadow-md" onPointerDown={onSize} />
    </>
  );
}

function TextPanel({
  block,
  onChange,
  onPatch,
  onDone,
}: {
  block: Extract<PageBlock, { type: "text" }>;
  onChange: (text: string) => void;
  onPatch: (partial: Partial<PageBlock>) => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState(block.text);
  return (
    <div className="glass-strong sheet-in absolute inset-x-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.6rem)] z-50 mx-auto max-w-xl rounded-[1.6rem] p-3">
      <textarea
        id={`edit-${block.id}`}
        value={value}
        rows={4}
        placeholder={block.placeholder || "Пишите здесь — текст сразу появится на странице"}
        onChange={(event) => {
          setValue(event.target.value);
          onChange(event.target.value);
        }}
        className="block w-full resize-none rounded-2xl bg-white/80 p-3 text-[17px] leading-snug text-ink outline-none"
        style={{ fontFamily: FONT_FAMILY[block.font] }}
      />
      <div className="no-scrollbar mt-2 flex items-center gap-1.5 overflow-x-auto">
        {(["script", "serif", "sans"] as FontKind[]).map((font) => (
          <BarBtn key={font} active={block.font === font} onClick={() => onPatch({ font } as Partial<PageBlock>)}>
            <span style={{ fontFamily: FONT_FAMILY[font] }}>{FONT_LABEL[font]}</span>
          </BarBtn>
        ))}
        {(["sm", "md", "lg", "xl"] as const).map((s) => (
          <BarBtn key={s} active={block.size === s} onClick={() => onPatch({ size: s } as Partial<PageBlock>)}>
            {s === "sm" ? "S" : s === "md" ? "M" : s === "lg" ? "L" : "XL"}
          </BarBtn>
        ))}
        <span className="flex-1" />
        <Button className="min-h-10 shrink-0 px-4" onClick={onDone}>
          Готово
        </Button>
      </div>
    </div>
  );
}

function BarBtn({ children, onClick, active, label, danger, disabled }: { children: React.ReactNode; onClick: () => void; active?: boolean; label?: string; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition disabled:opacity-40",
        active ? "bg-night text-paper" : danger ? "bg-white/80 text-rose-deep" : "bg-white/80 text-ink",
      )}
    >
      {children}
    </button>
  );
}

function BlockBar({
  block,
  busy,
  onPatch,
  onDelete,
  onEdit,
  onDuplicate,
  onLayer,
  onCut,
  onFill,
}: {
  block: PageBlock;
  busy: boolean;
  onPatch: (partial: Partial<PageBlock>) => void;
  onDelete: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onLayer: (dir: -1 | 1) => void;
  onCut: () => void;
  onFill: () => void;
}) {
  const [caption, setCaption] = useState(false);
  return (
    <div className="glass-strong no-scrollbar mx-auto flex max-w-xl gap-1.5 overflow-x-auto rounded-full p-1.5">
      {block.type === "text" ? (
        <>
          <BarBtn onClick={onEdit} active>
            <PenLine className="size-4" /> Писать
          </BarBtn>
          {(["script", "serif", "sans"] as FontKind[]).map((font) => (
            <BarBtn key={font} active={block.font === font} onClick={() => onPatch({ font } as Partial<PageBlock>)}>
              <span style={{ fontFamily: FONT_FAMILY[font] }}>{FONT_LABEL[font]}</span>
            </BarBtn>
          ))}
          {(["sm", "md", "lg", "xl"] as const).map((s) => (
            <BarBtn key={s} active={block.size === s} onClick={() => onPatch({ size: s } as Partial<PageBlock>)}>
              {s === "sm" ? "S" : s === "md" ? "M" : s === "lg" ? "L" : "XL"}
            </BarBtn>
          ))}
          {(["plain", "card", "pill"] as TextLook[]).map((look) => (
            <BarBtn key={look} active={(block.look ?? "plain") === look} onClick={() => onPatch({ look } as Partial<PageBlock>)}>
              {look === "plain" ? "Без фона" : look === "card" ? "Карточка" : "Плашка"}
            </BarBtn>
          ))}
          <BarBtn label="Выравнивание" onClick={() => onPatch({ align: block.align === "center" ? "left" : "center" } as Partial<PageBlock>)}>
            {block.align === "center" ? <AlignCenter className="size-4" /> : <AlignLeft className="size-4" />}
          </BarBtn>
        </>
      ) : null}
      {block.type === "photo" ? (
        <>
          {!(block.frame === "sticker" && block.cut) ? (
            <BarBtn onClick={onCut} disabled={busy} active>
              <Scissors className="size-4" /> Убрать фон
            </BarBtn>
          ) : (
            <BarBtn onClick={() => onPatch({ frame: "polaroid" } as Partial<PageBlock>)}>Вернуть фон</BarBtn>
          )}
          {(["polaroid", "sticker", "tape", "none"] as PhotoFrame[]).map((frame) => (
            <BarBtn key={frame} active={block.frame === frame && !(frame === "sticker" && block.cut)} onClick={() => onPatch({ frame, ...(block.cut && frame !== "sticker" ? {} : {}) } as Partial<PageBlock>)}>
              {frame === "polaroid" ? "Полароид" : frame === "sticker" ? "Кайма" : frame === "tape" ? "Скотч" : "Фото"}
            </BarBtn>
          ))}
          <BarBtn onClick={() => setCaption((v) => !v)} active={caption}>
            Подпись
          </BarBtn>
        </>
      ) : null}
      {block.type === "slot" ? (
        <BarBtn onClick={onFill} active>
          <ImagePlus className="size-4" /> Вставить фото
        </BarBtn>
      ) : null}
      <BarBtn label="Копия" onClick={onDuplicate}>
        <Copy className="size-4" />
      </BarBtn>
      <BarBtn label="На передний план" onClick={() => onLayer(1)}>
        <ArrowUpToLine className="size-4" />
      </BarBtn>
      <BarBtn label="Назад" onClick={() => onLayer(-1)}>
        <ArrowDownToLine className="size-4" />
      </BarBtn>
      {block.rotate ? (
        <BarBtn label="Ровно" onClick={() => onPatch({ rotate: 0 } as Partial<PageBlock>)}>
          Ровно
        </BarBtn>
      ) : null}
      <BarBtn label="Удалить" danger onClick={onDelete}>
        <Trash2 className="size-4" /> Удалить
      </BarBtn>
      {caption && block.type === "photo" ? (
        <Sheet title="Подпись под фото" onClose={() => setCaption(false)}>
          <input autoFocus className="field" defaultValue={block.caption} placeholder="Кто, где, какой год" onChange={(event) => onPatch({ caption: event.target.value } as Partial<PageBlock>)} />
          <p className="mt-2 text-xs text-muted">Видна на полароиде, а ещё помогает потом найти фото.</p>
          <Button className="mt-3" onClick={() => setCaption(false)}>
            Готово
          </Button>
        </Sheet>
      ) : null}
    </div>
  );
}

function PenBar({
  tool,
  setTool,
  ink,
  setInk,
  thin,
  setThin,
}: {
  tool: Tool;
  setTool: (tool: Tool) => void;
  ink: InkStroke["color"];
  setInk: (ink: InkStroke["color"]) => void;
  thin: boolean;
  setThin: (v: boolean) => void;
}) {
  return (
    <div className="glass-strong no-scrollbar mx-auto flex max-w-xl items-center gap-1.5 overflow-x-auto rounded-full p-1.5">
      <BarBtn active={tool === "pen"} onClick={() => setTool("pen")}>
        <PenLine className="size-4" /> Перо
      </BarBtn>
      <BarBtn active={tool === "marker"} onClick={() => setTool("marker")}>
        <Highlighter className="size-4" /> Маркер
      </BarBtn>
      <BarBtn active={tool === "erase"} onClick={() => setTool("erase")}>
        <Eraser className="size-4" /> Ластик
      </BarBtn>
      <span className="mx-1 h-6 w-px shrink-0 bg-ink/15" />
      {INK.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={color}
          onClick={() => {
            setInk(color);
            if (tool === "erase") setTool("pen");
          }}
          className={cn("size-8 shrink-0 rounded-full border-2 border-white shadow", ink === color && tool !== "erase" && "ring-2 ring-night ring-offset-1")}
          style={{ background: inkColor(color) }}
        />
      ))}
      <BarBtn active={thin} onClick={() => setThin(!thin)}>
        Тонко
      </BarBtn>
      <BarBtn onClick={() => setTool("hand")}>Готово</BarBtn>
    </div>
  );
}

function BigChoice({ icon, title, text, onClick }: { icon: React.ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-start gap-2 rounded-3xl bg-white/75 p-4 text-left active:scale-[0.98]">
      <span className="grid size-10 place-items-center rounded-full bg-night text-paper">{icon}</span>
      <span>
        <span className="block font-semibold text-ink">{title}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
    </button>
  );
}

function MenuRow({ icon, label, onClick, disabled, danger }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={cn("flex min-h-12 items-center gap-3 rounded-2xl bg-white/70 px-4 text-left text-sm font-medium disabled:opacity-40", danger ? "text-rose-deep" : "text-ink")}>
      {icon}
      {label}
    </button>
  );
}

function ArchiveThumb({ src, alt, onClick }: { src: string; alt: string; onClick: () => void }) {
  const url = useMedia(src);
  return (
    <button type="button" onClick={onClick} className="block aspect-square w-full overflow-hidden rounded-xl bg-line">
      {url ? <img src={url} alt={alt || "Фото"} className="h-full w-full object-cover" /> : null}
    </button>
  );
}

function PinterestPanel({ onClose, onPaste, onLink }: { onClose: () => void; onPaste: () => void; onLink: (link: string) => void }) {
  const [query, setQuery] = useState("");
  const [link, setLink] = useState("");
  const open = () => {
    const url = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query.trim() || "винтажные семейные фото")}`;
    const width = 460;
    const left = Math.max(0, window.screenX + window.outerWidth - width - 20);
    const win = window.open(url, "pinterest", `popup=yes,width=${width},height=${Math.min(900, window.outerHeight - 40)},left=${left},top=${window.screenY + 20}`);
    if (!win) window.location.assign(url);
  };
  return (
    <Sheet title="Pinterest" onClose={onClose}>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          open();
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input className="field !pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Что ищете? винтаж, рамки, цветы…" />
        </div>
        <Button type="submit">Найти</Button>
      </form>
      <div className="mt-4 grid gap-3 text-sm text-ink">
        <p>
          <b>Компьютер.</b> Pinterest откроется маленьким окном рядом. Тащите картинку мышкой прямо на лист.
        </p>
        <p>
          <b>iPad.</b> Откройте Pinterest рядом (Split View) и перетащите фото пальцем на страницу.
        </p>
        <p>
          <b>Телефон.</b> В Pinterest нажмите на фото → «Копировать изображение» или сохраните его. Вернитесь сюда и нажмите «Вставить».
        </p>
      </div>
      <Button variant="soft" className="mt-4 w-full" onClick={onPaste}>
        <ClipboardPaste className="size-4" /> Вставить скопированную картинку
      </Button>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (link.trim()) onLink(link.trim());
        }}
      >
        <input className="field" value={link} onChange={(event) => setLink(event.target.value)} placeholder="или ссылка на картинку" />
        <Button type="submit" variant="soft" disabled={!link.trim()}>
          Взять
        </Button>
      </form>
      <p className="mt-3 text-xs text-muted">Pinterest не разрешает открывать себя внутри других приложений, поэтому он открывается рядом.</p>
    </Sheet>
  );
}

const GENERIC_QUESTIONS = [
  "О ком или о чём эта страница?",
  "Где и когда это было?",
  "Какая деталь до сих пор перед глазами?",
  "Какую фразу стоит сохранить дословно?",
  "Что должен узнать тот, кто откроет книгу позже?",
];

function HelpSheet({ title, questions, onClose, onInsert }: { title: string; questions: string[]; onClose: () => void; onInsert: (text: string) => void }) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const [heard, setHeard] = useState<number | null>(null);
  const dictate = (index: number) => {
    const rec = recognition();
    if (!rec) {
      toast("Диктовка здесь не открылась. Можно нажать микрофон на клавиатуре телефона.");
      return;
    }
    rec.lang = "ru-RU";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (event) => {
      const said = event.results[0]?.[0]?.transcript ?? "";
      setAnswers((list) => list.map((item, i) => (i === index ? `${item} ${said}`.trim() : item)));
    };
    rec.onerror = () => setHeard(null);
    rec.onend = () => setHeard(null);
    setHeard(index);
    rec.start();
  };
  const filled = answers.filter((item) => item.trim());
  return (
    <Sheet title="Помочь заполнить" onClose={onClose}>
      <p className="text-sm text-muted">Ответьте коротко, как помните. Ответы лягут на страницу «{title}» — потом можно поправить.</p>
      <div className="mt-3 grid gap-3">
        {questions.map((question, index) => (
          <label key={question} className="block">
            <span className="mb-1 flex items-start justify-between gap-2 text-sm font-medium text-ink">
              {question}
              <button type="button" className="flex shrink-0 items-center gap-1 text-rose-deep" onClick={() => dictate(index)}>
                <Mic className="size-4" />
                {heard === index ? "Слушаю…" : "Голосом"}
              </button>
            </span>
            <textarea className="field min-h-14" value={answers[index] ?? ""} onChange={(event) => setAnswers((list) => list.map((item, i) => (i === index ? event.target.value : item)))} />
          </label>
        ))}
      </div>
      <Button className="mt-4 w-full" disabled={!filled.length} onClick={() => onInsert(filled.map((item) => item.trim().replace(/^./, (c) => c.toUpperCase())).join("\n\n"))}>
        Поставить на страницу
      </Button>
    </Sheet>
  );
}
