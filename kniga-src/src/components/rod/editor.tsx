import { remindBackup } from "@/lib/rod/backup";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { installScrollHelp } from "@/lib/rod/scroll-help";
import { flushSync } from "react-dom";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eraser,
  FilePlus,
  ListChecks,
  ImagePlus,
  Layers,
  Lightbulb,
  Lock,
  MoreHorizontal,
  PenLine,
  Pipette,
  Redo2,
  ArrowLeftRight,
  Square,
  RotateCcw,
  Smile,
  Sparkles,
  ClipboardPaste,
  SquareMousePointer,
  Trash2,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { flowChunks, flowToNextPages } from "@/lib/rod/text-flow";
import { Button, Sheet, useNav } from "@/components/rod/chrome";
import { fillInside } from "@/lib/rod/fill";
import { BlockBar, Inspector, PenBar, TextPanel, spillsOut, type BlockOps, type Tool } from "@/components/rod/editor-bars";
import { FontsSheet, GENERIC_QUESTIONS, HelpSheet, LayersSheet, PasteSheet, PhotoSheet, PinterestPanel, StickersSheet, type PhotoStyle } from "@/components/rod/editor-sheets";
import { BarBtn, IconBtn, MenuRow, ToolBtn } from "@/components/rod/editor-ui";
import { ColorRow, ColorSheet } from "@/components/rod/color-sheet";
import { MoodBoard } from "@/components/rod/moodboard";
import { PinnedRefs } from "@/components/rod/pinned-refs";
import { BlockArt, PageSheet, PlacedBlock, boxOf } from "@/components/rod/page-view";
import { Scanner } from "@/components/rod/scanner";
import { ContentsSheet } from "@/components/rod/contents-sheet";
import { cropGeom, innerBox } from "@/lib/rod/crop";
import { imageFromTransfer, imageInfo, importFromLink, importImage, importSticker } from "@/lib/rod/image";
import { BRUSH_ALPHA, BRUSH_DEFAULT_PX, PAGE_H, eraseFromStrokes, lineOf, makeInkBlock, mergeInk, px2w, geomToSvg, recognizeShape, strokeGeom } from "@/lib/rod/ink";
import { coverDesigns, blankPage } from "@/lib/rod/layouts";
import { liftSubject } from "@/lib/rod/lift";
import { mediaDataUrl, saveMedia } from "@/lib/rod/media";
import { PAPER, POLAROID, blockW, heightCm, defaultStickerWidth, pageSide, safeArea, stickerRatio } from "@/lib/rod/page-style";
import { findPrompt } from "@/lib/rod/pages";
import { paintPage } from "@/lib/rod/print-book";
import { defaultShapeBox } from "@/lib/rod/shapes";
import { scratch, stickSound, turnPage } from "@/lib/rod/sounds";
import { partnerIndex, spreadGhosts } from "@/lib/rod/spread";
import { backPage, flushBook, useRod } from "@/lib/rod/store";
import { BACK_ID, type BookPage, type BrushKind, type InkStroke, type PageBlock, type PaperKind, type PhotoFrame, type ShapeKind, type StickerKind } from "@/lib/rod/types";
import type { Recognized } from "@/lib/rod/ink";
import { cn } from "@/lib/cn";

type Panel = "contents" | "photo" | "pinterest" | "paste" | "stickers" | "help" | "menu" | "covers" | "layers" | "fonts" | "inspector" | "scan" | null;
type Box = { x: number; y: number; w: number; h: number | null; rotate: number };
type Gesture = {
  id: string;
  mode: "move" | "size" | "turn" | "crop";
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
  crop0?: { cx: number; cy: number; z: number };
  /** Несколько выделенных блоков двигаются вместе: исходные рамки и новые. */
  members?: { id: string; box: Box }[];
  lastMembers?: Record<string, Box>;
};
type Draw = {
  pointerId: number;
  pointerType: string;
  points: number[];
  pressure: number[];
  hasPressure: boolean;
  erase: boolean;
  target: string | null;
  group: string;
  maskAt: number | null;
  still?: number;
  lx: number;
  ly: number;
  snapped: Recognized;
  startedAt: number;
};

const STYLE_KEY = "kniga-photo-style-v2";
const SHADOW_KEY = "kniga-photo-shadow";
const PEN_KEY = "kniga-pen-v2";

const id = () => crypto.randomUUID();

/** Скопированные блоки: живут, пока открыто приложение, и переходят с одной страницы на другую (в том числе на соседнюю в развороте). */
let blockClip: { pageId: string; blocks: PageBlock[]; pasted: number } | null = null;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number) => Math.round(v * 100) / 100;

function savedStyle(): PhotoStyle {
  try {
    const value = localStorage.getItem(STYLE_KEY) as PhotoStyle | null;
    return value && ["cutout", "polaroid", "none", "tape", "sticker", "full"].includes(value) ? value : "polaroid";
  } catch {
    return "polaroid";
  }
}

/** Фигуры от руки (распознавание по зажатию и «авто») отключены: фигуры только из списка «Фигуры». Код оставлен за флагом. */
const ENABLE_SHAPE_SNAP = false;

type PenPrefs = { brush: BrushKind; color: string; sizes: Record<BrushKind, number>; eraser: number; auto: boolean; hold: boolean };

function savedPen(): PenPrefs {
  const fallback: PenPrefs = { brush: "pen", color: "#2a2420", sizes: { ...BRUSH_DEFAULT_PX }, eraser: 14, auto: false, hold: true };
  try {
    const raw = JSON.parse(localStorage.getItem(PEN_KEY) ?? "null") as Partial<PenPrefs> | null;
    // Маркера в кистях больше нет (остался выделитель): сохранённый выбор «маркер» заменяем на выделитель. Старые штрихи на страницах рисуются как раньше.
    const merged = raw ? { ...fallback, ...raw, sizes: { ...fallback.sizes, ...(raw.sizes ?? {}) } } : fallback;
    return merged.brush === "marker" ? { ...merged, brush: "highlighter" } : merged;
  } catch {
    return fallback;
  }
}

/** Новое фото ложится над другими фото, но под текстом. */
function photoInsertIndex(blocks: PageBlock[]): number {
  let last = -1;
  blocks.forEach((b, i) => {
    if (b.type === "photo" || b.type === "slot") last = i;
  });
  if (last >= 0) return last + 1;
  const firstText = blocks.findIndex((b) => b.type === "text");
  return firstText >= 0 ? firstText : blocks.length;
}

export function EditorScreen({ pageId }: { pageId: string }) {
  const nav = useNav();
  const isBack = pageId === BACK_ID;
  const pages = useRod((state) => state.pages);
  const backStored = useRod((state) => state.back);
  const updatePage = useRod((state) => state.updatePage);
  const removePage = useRod((state) => state.removePage);
  const restorePage = useRod((state) => state.restorePage);
  const duplicatePage = useRod((state) => state.duplicatePage);
  const movePage = useRod((state) => state.movePage);
  const insertPage = useRod((state) => state.insertPage);

  // Колёсико мыши листает ряды вбок, а новый ряд с продолжением слегка качается: подсказка для компьютера.
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".editor-root");
    return root ? installScrollHelp(root) : undefined;
  }, []);
  const addUserSticker = useRod((state) => state.addUserSticker);
  const dedicatee = useRod((state) => state.dedicatee);
  const collector = useRod((state) => state.collector);
  const archive = useRod((state) => state.photos);
  const print = useRod((state) => state.print);
  const page: BookPage | null = isBack ? (backStored ?? backPage(pages[0]?.kind === "cover" ? pages[0] : null)) : (pages.find((item) => item.id === pageId) ?? null);
  const index = isBack ? -1 : pages.findIndex((item) => item.id === pageId);
  const hasCover = pages[0]?.kind === "cover";
  const partnerAt = isBack ? -1 : partnerIndex(pages, index);
  const partner = partnerAt >= 0 ? (pages[partnerAt] ?? null) : null;
  const [spread, setSpreadState] = useState(() => {
    try {
      const saved = localStorage.getItem("kniga-spread");
      return saved ? saved === "1" : window.innerWidth >= 700;
    } catch {
      return true;
    }
  });
  const setSpread = (next: boolean) => {
    setSpreadState(next);
    try {
      localStorage.setItem("kniga-spread", next ? "1" : "0");
    } catch {
      /* без запоминания */
    }
  };
  const twoUp = spread && Boolean(partner);
  const meta = useMemo(() => ({ dedicatee, collector }), [dedicatee, collector]);

  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("hand");
  const [pen, setPen] = useState<PenPrefs>(savedPen);
  const [straight, setStraight] = useState(false);
  const [penColors, setPenColors] = useState(false);
  const [bins, setBins] = useState(() => {
    try {
      return localStorage.getItem("kniga-bins") === "1";
    } catch {
      return false;
    }
  });
  const toggleBins = () =>
    setBins((v) => {
      try {
        localStorage.setItem("kniga-bins", v ? "0" : "1");
      } catch {
        /* без запоминания */
      }
      return !v;
    });
  const [pipette, setPipette] = useState<((color: string) => void) | null>(null);
  const [cropping, setCropping] = useState(false);
  const penSeen = useRef(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [slotTarget, setSlotTarget] = useState<string | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [style, setStyleState] = useState<PhotoStyle>(() => savedStyle());
  const [shadowPref, setShadowPref] = useState(() => {
    try {
      return localStorage.getItem(SHADOW_KEY) === "1";
    } catch {
      return false;
    }
  });
  /** Стирание идёт на черновике блока и записывается в книгу один раз, когда перо отпустили: так не тормозит и не мигает. */
  const [eraseDraft, setEraseDraft] = useState<PageBlock | null>(null);
  const draftRef = useRef<PageBlock | null>(null);
  const draftFrame = useRef<number | undefined>(undefined);
  const [ghost, setGhost] = useState<{ id: string; box: Box } | null>(null);
  /** Несколько выделенных блоков (Shift/Ctrl + нажатие или рамка выделения мышью). */
  const [group, setGroup] = useState<string[]>([]);
  /** Режим «выбрать несколько»: нажатия на блоки добавляют их к выделению (для пальца, где нет Shift). */
  const [pickMode, setPickMode] = useState(false);
  const [groupColors, setGroupColors] = useState(false);
  const [, setClipTick] = useState(0);
  const [ghostGroup, setGhostGroup] = useState<Record<string, Box> | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const marqueeRef = useRef<{ pointerId: number; x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [dropping, setDropping] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [mood, setMood] = useState(false);
  const [pinned, setPinned] = useState<string[]>(() => {
    try {
      const list = JSON.parse(localStorage.getItem("kniga-pinned") ?? "[]") as string[];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  });
  const togglePin = (ref: string) =>
    setPinned((list) => {
      const next = list.includes(ref) ? list.filter((item) => item !== ref) : [...list, ref].slice(-6);
      try {
        localStorage.setItem("kniga-pinned", JSON.stringify(next));
      } catch {
        /* без запоминания */
      }
      return next;
    });
  const [, setTick] = useState(0);

  const sheetRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const livePath = useRef<SVGGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const diskRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const stickerFileRef = useRef<HTMLInputElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const drawing = useRef<Draw | null>(null);
  const lastInk = useRef<{ id: string; at: number; key: string } | null>(null);
  const eraseCount = useRef(0);
  const cropAr = useRef(0.75);
  const undo = useRef<BookPage[]>([]);
  const redo = useRef<BookPage[]>([]);
  const lastGroup = useRef<{ key: string; at: number } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const twoTap = useRef<{ t0: number; moved: boolean; fired: boolean } | null>(null);
  const [size, setSize] = useState({ w: 320, h: 320 });

  const setStyle = (next: PhotoStyle) => {
    setStyleState(next);
    try {
      localStorage.setItem(STYLE_KEY, next);
    } catch {
      /* без запоминания */
    }
  };

  const setShadow = (next: boolean) => {
    setShadowPref(next);
    try {
      localStorage.setItem(SHADOW_KEY, next ? "1" : "0");
    } catch {
      /* без запоминания */
    }
  };

  const updatePen = (patch: Partial<PenPrefs>) =>
    setPen((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(PEN_KEY, JSON.stringify(next));
      } catch {
        /* без запоминания */
      }
      return next;
    });

  const sizePx = pen.sizes[pen.brush];

  // Страница вписывается в экран целиком: лист всегда виден, без прокрутки.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => {
      const rect = stage.getBoundingClientRect();
      const w = Math.max(140, Math.min(twoUp ? (rect.width - 48) / 2 : rect.width - 48, (rect.height - 88) / (PAGE_H / 100), 720));
      setSize({ w, h: w * (PAGE_H / 100) });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [page?.id, twoUp]);

  useEffect(() => {
    try {
      if (!localStorage.getItem("kniga-hint-2f")) {
        localStorage.setItem("kniga-hint-2f", "1");
        toast("Подсказка: коснитесь экрана двумя пальцами, чтобы сделать шаг назад. Ещё раз: ещё шаг назад.", { duration: 7000 });
      }
    } catch {
      /* без подсказки */
    }
  }, []);

  // Если касание потерялось (свернули приложение), жесты не должны залипнуть.
  useEffect(() => {
    const reset = () => {
      touches.current.clear();
      twoTap.current = null;
    };
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset);
    return () => {
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, []);

  useEffect(() => {
    undo.current = [];
    redo.current = [];
    setSelected(null);
    setEditing(null);
    setTick((value) => value + 1);
  }, [pageId]);

  const current = useCallback((): BookPage | null => {
    const state = useRod.getState();
    if (pageId === BACK_ID) return state.back ?? backPage(state.pages[0]?.kind === "cover" ? state.pages[0] : null);
    return state.pages.find((item) => item.id === pageId) ?? null;
  }, [pageId]);

  /** Любое изменение страницы идёт через commit: так работает «Отменить». */
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

  // Двумя пальцами тап по экрану – шаг назад; два тапа подряд – шаг вперёд.
  const actions = useRef({ undo: doUndo, redo: doRedo });
  actions.current = { undo: doUndo, redo: doRedo };

  const patchBlock = (blockId: string, partial: Partial<PageBlock>, group?: string) =>
    commit((p) => ({ ...p, blocks: p.blocks.map((b) => (b.id === blockId ? ({ ...b, ...partial } as PageBlock) : b)) }), group);

  /** Один цвет для всех выделенных текстов за один шаг: у плашек и карточек меняется фон, у остальных цвет букв. */
  const colorGroupTexts = (ids: string[], c: string, groupKey?: string) =>
    commit(
      (p) => ({
        ...p,
        blocks: p.blocks.map((b) => (b.type === "text" && ids.includes(b.id) ? ({ ...b, ...(b.look === "card" || b.look === "pill" ? { bg: c } : { color: c }) } as PageBlock) : b)),
      }),
      groupKey,
    );

  const removeBlock = (blockId: string, quiet = false) => {
    commit((p) => ({ ...p, blocks: p.blocks.filter((b) => b.id !== blockId) }));
    setSelected((value) => (value === blockId ? null : value));
    setEditing((value) => (value === blockId ? null : value));
    if (!quiet) toast("Удалено", { action: { label: "Вернуть", onClick: doUndo } });
  };

  /** Удаляет все выделенные блоки одним шагом (один «Вернуть» возвращает всё). */
  /** Добавляет к списку всех, кто сгруппирован с ними (общий groupId). */
  const withGroupMates = (ids: string[]): string[] => {
    const blocks = current()?.blocks ?? [];
    const gids = new Set(blocks.filter((b) => ids.includes(b.id) && b.groupId).map((b) => b.groupId));
    return gids.size ? blocks.filter((b) => ids.includes(b.id) || (b.groupId && gids.has(b.groupId))).map((b) => b.id) : ids;
  };
  /** Поворот выбранной группы вокруг её центра: каждый блок поворачивается сам и сдвигается по дуге. */
  const rotateGroup = (deg: number) => {
    const ids = new Set(group);
    const blocks = (current()?.blocks ?? []).filter((b) => ids.has(b.id) && !b.locked);
    if (blocks.length < 2) return;
    const k = PAGE_H / 100;
    const boxes = new Map(blocks.map((b) => [b.id, { w: blockW(b as { type: string; w?: number }), h: heightOf(b) }]));
    const x0 = Math.min(...blocks.map((b) => b.x));
    const x1 = Math.max(...blocks.map((b) => b.x + boxes.get(b.id)!.w));
    const y0 = Math.min(...blocks.map((b) => b.y * k));
    const y1 = Math.max(...blocks.map((b) => (b.y + boxes.get(b.id)!.h) * k));
    const gx = (x0 + x1) / 2;
    const gy = (y0 + y1) / 2;
    const c = Math.cos((deg * Math.PI) / 180);
    const sn = Math.sin((deg * Math.PI) / 180);
    commit(
      (p) => ({
        ...p,
        blocks: p.blocks.map((b) => {
          const f = boxes.get(b.id);
          if (!f) return b;
          const dx = b.x + f.w / 2 - gx;
          const dy = (b.y + f.h / 2) * k - gy;
          const nx = gx + dx * c - dy * sn;
          const ny = gy + dx * sn + dy * c;
          return { ...b, x: round(nx - f.w / 2), y: round(ny / k - f.h / 2), rotate: round((b.rotate ?? 0) + deg) } as PageBlock;
        }),
      }),
      `rotate-group:${[...ids].join(",")}`,
    );
  };
  const groupSelected = () => {
    const ids = new Set(group);
    if (ids.size < 2) return;
    const gid = id();
    commit((p) => ({ ...p, blocks: p.blocks.map((b) => (ids.has(b.id) ? ({ ...b, groupId: gid } as PageBlock) : b)) }));
    toast("Сгруппировано: теперь они двигаются вместе", { duration: 2500 });
  };
  const ungroupSelected = () => {
    const ids = new Set(group);
    commit((p) => ({ ...p, blocks: p.blocks.map((b) => (ids.has(b.id) && b.groupId ? ({ ...b, groupId: undefined } as PageBlock) : b)) }));
    toast("Группа разделена", { duration: 2000 });
  };
  const removeGroup = () => {
    const ids = new Set(group);
    commit((p) => ({ ...p, blocks: p.blocks.filter((b) => !ids.has(b.id) || b.locked) }));
    setGroup([]);
    setSelected(null);
    toast("Удалено", { action: { label: "Вернуть", onClick: doUndo } });
  };

  const addBlock = (block: PageBlock) => {
    commit((p) => ({ ...p, blocks: [...p.blocks, block] }));
    setSelected(block.id);
  };

  const moveLayer = (blockId: string, where: "up" | "down" | "top" | "bottom") =>
    commit((p) => {
      const i = p.blocks.findIndex((b) => b.id === blockId);
      if (i < 0) return p;
      const blocks = p.blocks.slice();
      const [b] = blocks.splice(i, 1);
      const to = where === "up" ? Math.min(blocks.length, i + 1) : where === "down" ? Math.max(0, i - 1) : where === "top" ? blocks.length : 0;
      blocks.splice(to, 0, b);
      return { ...p, blocks };
    });

  // Пустой текст, который сама добавила, при выходе из набора убираем: «плашки» не копятся.
  const wasEditing = useRef<string | null>(null);
  useEffect(() => {
    const prev = wasEditing.current;
    wasEditing.current = editing;
    if (prev && prev !== editing) {
      const block = current()?.blocks.find((b) => b.id === prev);
      if (block && block.type === "text" && !block.text.trim() && !block.placeholder) removeBlock(prev, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // Колесо мыши листает горизонтальные полосы инструментов.
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      const bar = (event.target as HTMLElement)?.closest?.<HTMLElement>(".no-scrollbar");
      if (!bar || bar.scrollWidth <= bar.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (bar.scrollHeight > bar.clientHeight + 1) return;
      bar.scrollLeft += event.deltaY;
      event.preventDefault();
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  // ——— Клавиатура ———
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]");
      if ((event.metaKey || event.ctrlKey) && (event.code === "KeyZ" || event.code === "KeyY") && !typing) {
        event.preventDefault();
        if (event.shiftKey || event.code === "KeyY") doRedo();
        else doUndo();
      }
      if (event.key === "Escape" && !typing) {
        if (pipette) setPipette(null);
        else if (editing) setEditing(null);
        else if (cropping) setCropping(false);
        else if (group.length) setGroup([]);
        else if (pickMode) setPickMode(false);
        else if (selected) setSelected(null);
        else if (tool !== "hand") setTool("hand");
      }
      if ((event.metaKey || event.ctrlKey) && (event.code === "KeyC" || event.code === "KeyX") && !typing && !panel && (selected || group.length > 1)) {
        event.preventDefault();
        copyBlocks(event.code === "KeyX");
        return;
      }
      // Стрелки клавиатуры двигают выбранное: чуть-чуть, а с Shift крупнее. Для точной подгонки на компьютере.
      if (event.key.startsWith("Arrow") && !typing && !panel && !editing && !pipette && !cropping && tool === "hand" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const ids = group.length > 1 ? group : selected ? [selected] : [];
        if (ids.length) {
          event.preventDefault();
          const step = event.shiftKey ? 2 : 0.25;
          const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
          const dy = (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0) / (PAGE_H / 100);
          if (dx || dy) {
            commit(
              (p) => ({ ...p, blocks: p.blocks.map((b) => (ids.includes(b.id) && !b.locked ? ({ ...b, x: round(b.x + dx), y: round(b.y + dy) } as PageBlock) : b)) }),
              `nudge:${ids.join(",")}`,
            );
          }
          return;
        }
      }
      if ((event.key === "Delete" || event.key === "Backspace") && group.length > 1 && !typing && !panel) {
        event.preventDefault();
        removeGroup();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selected && !typing && !panel) {
        const block = current()?.blocks.find((b) => b.id === selected);
        if (block?.locked) return;
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
      if ((event.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]")) return;
      const data = event.clipboardData;
      if (!data) return;
      event.preventDefault();
      // Скопировали блоки внутри книги (и в буфере нет картинки): вставляем их на эту страницу.
      const hasPicture = data.files.length > 0 || [...data.items].some((item) => item.kind === "file");
      if (blockClip && !hasPicture) {
        pasteBlocks();
        return;
      }
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
  /** Текст, который не влезает на страницу: подсказываем перенести лишнее на следующую (как в Word). */
  const overflowBlock = page.blocks.find((b) => b.type === "text" && !b.wrap && b.text.length > 150 && flowChunks(b, 0).length > 1) ?? null;
  const editingBlock = (() => {
    const b = page.blocks.find((item) => item.id === editing);
    return b && b.type === "text" ? b : null;
  })();

  const toPct = (clientX: number, clientY: number) => {
    const rect = sheetRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    return { x: ((clientX - rect.left) / rect.width) * 100, y: ((clientY - rect.top) / rect.height) * 100 };
  };

  // ——— Копирование блоков: Ctrl+C / Ctrl+V и кнопки (для устройств без клавиатуры) ———
  const selectedIds = (): string[] => (group.length > 1 ? group : selected ? [selected] : []);
  const copyBlocks = (cut = false) => {
    const ids = selectedIds();
    const blocks = (current()?.blocks ?? []).filter((b) => ids.includes(b.id)).map((b) => structuredClone(b) as PageBlock);
    if (!blocks.length) return;
    blockClip = { pageId: page.id, blocks, pasted: 0 };
    // Чтобы старая картинка из системного буфера не перебила скопированное: кладём туда метку.
    try {
      void navigator.clipboard?.writeText("книга-рода: блоки").catch(() => undefined);
    } catch {
      /* буфер недоступен: вставка кнопкой всё равно работает */
    }
    setClipTick((value) => value + 1);
    if (cut) {
      const drop = new Set(ids);
      commit((p) => ({ ...p, blocks: p.blocks.filter((b) => !drop.has(b.id) || b.locked) }));
      setSelected(null);
      setGroup([]);
    }
    toast(cut ? "Вырезано. Откройте другую страницу и нажмите «Вставить»." : blocks.length > 1 ? `Скопировано: ${blocks.length}` : "Скопировано. Откройте другую страницу и нажмите «Вставить».", { duration: 3500 });
  };
  const pasteBlocks = () => {
    const clip = blockClip;
    if (!clip || !clip.blocks.length) {
      toast("Сначала скопируйте блок");
      return;
    }
    // На другой странице блоки встают на то же место; на этой же странице каждая вставка чуть сдвигается.
    const shift = clip.pageId === page.id ? 4 * (clip.pasted + 1) : 0;
    const groupMap = new Map<string, string>();
    const copies = clip.blocks.map((b) => ({ ...structuredClone(b), id: id(), x: b.x + shift, y: b.y + shift * 0.75, locked: false, groupId: b.groupId ? (groupMap.get(b.groupId) ?? groupMap.set(b.groupId, id()).get(b.groupId)) : undefined }) as PageBlock);
    commit((p) => ({ ...p, blocks: [...p.blocks, ...copies] }));
    clip.pasted += 1;
    if (copies.length > 1) {
      setGroup(copies.map((c) => c.id));
      setSelected(null);
    } else setSelected(copies[0]!.id);
    stickSound();
    toast(copies.length > 1 ? `Вставлено: ${copies.length}` : "Вставлено", { duration: 2000 });
  };
  const moveToPartner = () => {
    if (!partner) return;
    const ids = selectedIds();
    const blocks = (current()?.blocks ?? []).filter((b) => ids.includes(b.id) && !b.locked);
    if (!blocks.length) return;
    const copies = blocks.map((b) => ({ ...structuredClone(b), id: id(), locked: false }) as PageBlock);
    const partnerId = partner.id;
    useRod.getState().updatePage(partnerId, (p) => ({ ...p, blocks: [...p.blocks, ...copies], editedAt: Date.now() }));
    const gone = new Set(blocks.map((b) => b.id));
    commit((p) => ({ ...p, blocks: p.blocks.filter((b) => !gone.has(b.id)) }));
    setSelected(null);
    setGroup([]);
    toast("Перенесено на соседнюю страницу", { action: { label: "Открыть", onClick: () => nav.replace({ id: "editor", pageId: partnerId }) }, duration: 5000 });
  };

  // ——— Охранное поле ———
  const side = isBack ? "single" : pageSide(index, hasCover);
  const safe = safeArea(print.size, heightCm(print), side);
  const bleedPct = (print.bleed / (print.size * 10)) * 100;
  const bleedPctY = (print.bleed / (heightCm(print) * 10)) * 100;

  const heightOf = (b: PageBlock): number => {
    if ("h" in b && typeof b.h === "number") return b.h;
    if (b.type === "sticker") return (b.w ?? 15) * stickerRatio(b.kind);
    const el = document.querySelector(`[data-block="${b.id}"]`) as HTMLElement | null;
    const sheetH = sheetRef.current?.offsetHeight || 1;
    return el ? (el.offsetHeight / sheetH) * 100 : 6;
  };

  /** Фото на весь лист вместе с вылетами, под обрез. */
  const fullPage = () => ({ x: round(-bleedPct), y: round(-bleedPctY), w: round(100 + bleedPct * 2), h: round(100 + bleedPctY * 2), rotate: 0, frame: "none" as PhotoFrame });

  const warnFull = (ratio: number) => {
    const crop = Math.abs(ratio - 1) > 0.05 ? (ratio > 1 ? " Фото вытянуто вверх, сверху и снизу его подрежет до квадрата." : " Фото широкое, по бокам его подрежет до квадрата.") : "";
    toast(`Фото на всю страницу. При печати по краям срежется ~${print.bleed} мм.${crop} Какую часть оставить, выберите кнопкой «Кадр». Лица и надписи держите внутри пунктира.`, { duration: 9000 });
  };

  /** Текст и стикеры остаются внутри охранного поля. Фото: либо внутри, либо «на вылет» за край листа. Рисунки, фигуры и фото «через разворот» не двигаем. */
  const fitSafe = (b: PageBlock): PageBlock => {
    // Рисунки, фигуры, стикеры, фото-вырезки и всё «через разворот» можно ставить где угодно, в том числе за охранное поле и за край листа.
    if (b.type === "ink" || b.type === "shape" || b.type === "sticker" || ("spread" in b && b.spread) || (b.type === "photo" && b.frame === "sticker" && b.cut)) return b;
    const L = safe.left;
    const R = 100 - safe.right;
    const T = safe.top;
    const B = 100 - safe.bottom;
    const bleedable = (b.type === "photo" && !(b.frame === "sticker" && b.cut)) || b.type === "slot";
    if (!bleedable) {
      let w = blockW(b as { type: string; w?: number });
      if (b.type === "text") w = Math.min(w, R - L);
      const h = heightOf(b);
      const x = clamp(b.x, L, Math.max(L, R - w));
      const y = clamp(b.y, T, Math.max(T, B - h));
      return { ...b, x: round(x), y: round(y), ...("w" in b ? { w: round(w) } : {}) } as PageBlock;
    }
    // Прилипание только у самого края (до 2,5 %) и без смены размера; остальное остаётся там, где поставили.
    const soft = (start: number, len: number, bleedBy: number): [number, number] => {
      let s2 = start;
      let n = len;
      if (Math.abs(s2) < 2.5) {
        n += s2 + bleedBy;
        s2 = -bleedBy;
      }
      if (Math.abs(100 - (s2 + n)) < 2.5) n = 100 + bleedBy - s2;
      return [s2, n];
    };
    const [x, w] = soft(b.x, b.w, bleedPct);
    const [y, h] = soft(b.y, b.h, bleedPctY);
    void L;
    void R;
    void T;
    void B;
    return { ...b, x: round(x), y: round(y), w: round(w), h: round(h) } as PageBlock;
  };

  // ——— Фото ———
  async function placePhoto(ref: string, at?: { x: number; y: number }, forced?: PhotoStyle, intoSlot = true) {
    const live = current();
    const target = intoSlot && slotTarget ? live?.blocks.find((b) => b.id === slotTarget && b.type === "slot") : null;
    const swap = intoSlot && replaceTarget ? live?.blocks.find((b) => b.id === replaceTarget && b.type === "photo") : null;
    const info = await imageInfo(ref);
    const ratio = info.ratio;
    if (swap && swap.type === "photo") {
      // Замена: тот же размер, место, рамка, поворот, подпись.
      const keepsCut = info.alpha;
      commit((p) => ({
        ...p,
        blocks: p.blocks.map((b) =>
          b.id === swap.id && b.type === "photo" ? { ...b, src: ref, cut: keepsCut ? ref : undefined, frame: keepsCut ? ("sticker" as PhotoFrame) : b.frame, crop: undefined } : b,
        ),
      }));
      stickSound();
      setReplaceTarget(null);
      setPanel(null);
      setSelected(swap.id);
      flushBook();
      return;
    }
    // Вырезанный PNG уже без фона: кладём его стикером, белой подложки нет.
    const chosen: PhotoStyle = forced ?? (info.alpha && !target ? "cutout" : style);
    const frame: PhotoFrame = target && target.type === "slot" ? target.frame : chosen === "cutout" ? "sticker" : chosen === "full" ? "none" : chosen;
    let block: Extract<PageBlock, { type: "photo" }>;
    if (target && target.type === "slot") {
      block = { id: id(), type: "photo", x: target.x, y: target.y, w: target.w, h: target.h, rotate: target.rotate ?? 0, src: ref, caption: "", frame, shadow: shadowPref };
    } else {
      // Очень длинное или очень высокое фото: подбираем ширину так, чтобы оно легло целиком, а не обрезалось рамкой.
      const heightFor = (width: number) => {
        const inside = frame === "polaroid" ? width * (1 - (2 * POLAROID.side) / 100) : frame === "sticker" ? width - 2.8 : width;
        const more = frame === "polaroid" ? (width * (POLAROID.top + POLAROID.bottom)) / 100 : frame === "sticker" ? 2.8 : 0;
        return (inside * ratio + more) / (PAGE_H / 100);
      };
      let w = chosen === "cutout" ? 52 : 56;
      for (let i = 0; i < 4; i++) {
        const raw = heightFor(w);
        if (raw > 80) w = Math.max(14, (w * 80) / raw);
        else if (raw < 8 && w < 92) w = Math.min(92, (w * 8) / Math.max(raw, 0.5));
      }
      const h = clamp(heightFor(w), 4, 82);
      const cx = at?.x ?? 50;
      const cy = at?.y ?? 42;
      const tilt = frame === "none" || info.alpha ? 0 : Math.round((Math.random() * 6 - 3) * 10) / 10;
      block = { id: id(), type: "photo", x: clamp(cx - w / 2, -10, 90), y: clamp(cy - h / 2, -5, 92), w, h, rotate: tilt, src: ref, caption: "", frame, shadow: shadowPref, whole: true };
      if (info.alpha) block = { ...block, cut: ref, frame: "sticker" };
    }
    const full = chosen === "full" && !target;
    if (full) block = { ...block, ...fullPage() };
    else if (!target) block = fitSafe(block) as typeof block;
    stickSound();
    commit((p) => {
      if (target) return { ...p, blocks: p.blocks.map((b) => (b.id === target.id ? block : b)) };
      if (full) return { ...p, blocks: [block, ...p.blocks] };
      const at2 = photoInsertIndex(p.blocks);
      const blocks = p.blocks.slice();
      blocks.splice(at2, 0, block);
      return { ...p, blocks };
    });
    if (full) warnFull(ratio);
    setSelected(block.id);
    setSlotTarget(null);
    setPanel(null);
    flushBook();
    if (chosen === "cutout" && !target && !info.alpha) void cutOut(block.id, ref, "auto");
  }

  async function cutOut(blockId: string, src: string, mode: "auto" | "precise") {
    setBusy((value) => ({ ...value, [blockId]: "Отделяю фон…" }));
    try {
      const data = await mediaDataUrl(src);
      const cut = data ? await liftSubject(data, (label) => setBusy((value) => ({ ...value, [blockId]: label })), mode) : null;
      if (!cut) {
        toast("Фон не отделился: фото легло с белой каймой. Лучше всего вырезаются люди и предметы на спокойном фоне. Остатки фона убирает ластик.");
        patchBlock(blockId, { frame: "sticker" } as Partial<PageBlock>);
        return;
      }
      const ref = await saveMedia(cut);
      const info = await imageInfo(ref);
      const block = current()?.blocks.find((b) => b.id === blockId);
      if (!block || block.type !== "photo") return;
      const h = clamp((block.w * info.ratio) / (PAGE_H / 100), 5, 90);
      stickSound();
      if (typeof navigator.vibrate === "function") navigator.vibrate(12);
      patchBlock(blockId, { cut: ref, frame: "sticker", h, y: block.y + (block.h - h) / 2, crop: undefined } as Partial<PageBlock>);
      if (mode === "auto") toast("Фон убран. Остался хвостик? Выберите фото, нажмите «Ещё» → «Убрать фон точнее» или сотрите ластиком.", { duration: 7000 });
    } catch {
      toast("Вырезка не получилась. Проверьте интернет: в первый раз она скачивается.");
    } finally {
      setBusy((value) => {
        const next = { ...value };
        delete next[blockId];
        return next;
      });
    }
  }

  const onFiles = (files: FileList | null) => {
    const list = [...(files ?? [])].filter((file) => file.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name));
    if (!list.length) return;
    setPanel(null);
    const wait = toast.loading(list.length > 1 ? `Загружаю ${list.length} фото…` : "Загружаю фото…");
    void (async () => {
      let ok = 0;
      for (const [i, file] of list.slice(0, 8).entries()) {
        try {
          const ref = await importImage(file);
          await placePhoto(ref, list.length > 1 ? { x: 30 + (i % 2) * 40, y: 25 + Math.floor(i / 2) * 25 } : undefined, undefined, i === 0);
          ok += 1;
        } catch (error) {
          toast(`«${file.name}» не открылся: ${error instanceof Error ? error.message : "неизвестная ошибка"}. Пришлите Claude этот текст.`, { duration: 9000 });
        }
      }
      toast.dismiss(wait);
      if (ok && list.length > 1) toast(`Добавлено фото: ${ok}`);
    })();
  };

  const fromLink = (link: string) => {
    const wait = toast.loading("Скачиваю картинку…");
    void importFromLink(link)
      .then((ref) => placePhoto(ref))
      .catch((error: unknown) => toast(`Картинка по ссылке не скачалась (${error instanceof Error ? error.message : "ошибка"}). Сохраните фото в Pinterest и добавьте через «Из галереи», либо скопируйте картинку и нажмите «Вставить».`, { duration: 9000 }))
      .finally(() => toast.dismiss(wait));
  };

  const fromTransfer = (data: DataTransfer) => {
    const text = data.getData("text/plain").trim();
    const wait = toast.loading("Загружаю картинку…");
    void imageFromTransfer(data)
      .then((ref) => {
        if (ref) void placePhoto(ref);
        else toast(text ? "Во вставленном нет картинки или ссылки на неё." : "В буфере нет картинки.");
      })
      .catch((error: unknown) => toast(`Картинка не вставилась (${error instanceof Error ? error.message : "ошибка"}).`, { duration: 9000 }))
      .finally(() => toast.dismiss(wait));
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
          if (item.types.includes("text/html")) {
            const html = await (await item.getType("text/html")).text();
            const src = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
            if (src && /^https?:/.test(src)) {
              fromLink(src);
              return;
            }
          }
        }
      }
      const text = await navigator.clipboard.readText();
      const link = text.split(/\s+/).find((part) => /^https?:\/\//.test(part));
      if (link) {
        fromLink(link);
        return;
      }
      toast("В буфере нет картинки. Скопируйте фото в «Фото» (нажать → «Скопировать») и попробуйте ещё раз.");
      setPanel("paste");
    } catch {
      // Телефон не дал прочитать буфер напрямую: открываем поле, в которое картинку вставляют долгим нажатием.
      setPanel("paste");
    }
  };

  // ——— Пипетка ———
  const sampleColor = async (clientX: number, clientY: number): Promise<string | null> => {
    const rect = sheetRef.current?.getBoundingClientRect();
    const live = current();
    if (!rect || !live) return null;
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
    const ghosts = isBack ? [] : spreadGhosts(useRod.getState().pages, live.id);
    const canvas = await paintPage({ ...live, blocks: live.blocks.filter((b) => !b.mask?.strokes.length || true) }, meta, undefined, ghosts);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const data = ctx.getImageData(Math.min(canvas.width - 1, Math.floor(fx * canvas.width)), Math.min(canvas.height - 1, Math.floor(fy * canvas.height)), 1, 1).data;
    return `#${[data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  };

  const startPipette = (done: (color: string) => void) => {
    setEditing(null);
    setPanel(null);
    setPenColors(false);
    setPipette(() => done);
    toast("Коснитесь любого места страницы, и цвет возьмётся оттуда", { duration: 4000 });
  };

  // ——— Рисование и ластик ———
  /** Элемент под пальцем. С preferInk: рисунок важнее фото под ним, чтобы ластик не стирал и то и другое. */
  const blockAt = (clientX: number, clientY: number, preferInk = false): string | null => {
    let first: string | null = null;
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      const wrapper = (el as HTMLElement).closest?.("[data-block]") as HTMLElement | null;
      const key = wrapper?.dataset.block;
      if (!key || key.startsWith("ghost:")) continue;
      if (!preferInk) return key;
      first ??= key;
      if (current()?.blocks.find((b) => b.id === key)?.type === "ink") return key;
    }
    return first;
  };

  const updateCursor = (event: { clientX: number; clientY: number }, show: boolean) => {
    const el = cursorRef.current;
    const rect = sheetRef.current?.getBoundingClientRect();
    if (!el || !rect) return;
    if (!show || tool === "hand") {
      el.style.display = "none";
      return;
    }
    const px = tool === "erase" ? pen.eraser : sizePx;
    const d = Math.max(6, (px / 1000) * rect.width);
    el.style.display = "block";
    el.style.width = `${d}px`;
    el.style.height = `${d}px`;
    el.style.transform = `translate(${event.clientX - d / 2}px, ${event.clientY - d / 2}px)`;
  };

  const liveUpdate = (points: number[], pressure: number[], hasPressure: boolean) => {
    // Живой штрих рисуется поверх листа отдельным SVG и не перерисовывает всю страницу.
    const target = livePath.current;
    if (!target) return;
    target.innerHTML = geomToSvg(strokeGeom(makeStroke(points, hasPressure ? pressure : undefined)));
  };

  const clearLive = () => {
    if (livePath.current) livePath.current.innerHTML = "";
  };

  const makeStroke = (points: number[], pressure?: number[]): InkStroke => ({
    id: "live",
    color: pen.color,
    width: px2w(sizePx),
    alpha: BRUSH_ALPHA[pen.brush],
    brush: pen.brush,
    points,
    pressure,
  });

  const cancelDraw = () => {
    const draw = drawing.current;
    if (!draw) return;
    window.clearTimeout(draw.still);
    drawing.current = null;
    clearLive();
    if (draw.erase) flushDraft();
    updateCursor({ clientX: 0, clientY: 0 }, false);
  };

  const startDraw = (event: React.PointerEvent) => {
    // Рисуем только в режиме рисунка или ластика. В обычном режиме палец и стилус двигают фото и текст.
    if (tool === "hand") return false;
    if (event.pointerType === "mouse" && event.button !== 0) return false;
    if (event.pointerType === "pen") penSeen.current = performance.now();
    event.stopPropagation();
    event.preventDefault();
    // Ладонь на экране, пока рисуют стилусом, не оставляет следов: касания пальцем и большое пятно игнорируются.
    const blob = Math.max(event.width || 0, event.height || 0);
    if (event.pointerType === "touch" && (performance.now() - penSeen.current < 1500 || blob > 56)) return true;
    // Второй палец – это жест (шаг назад), а не рисование.
    if (touches.current.size >= 2) return true;
    setEditing(null);
    if (tool === "fill") {
      const at = toPct(event.clientX, event.clientY);
      const live = current();
      if (live) {
        void fillInside(live, at.x, at.y, pen.color).then((result) => {
          if (result.ok) {
            commit(result.page);
            toast("Закрашено", { duration: 1200 });
          } else if (result.reason === "open") {
            toast("Контур не замкнут: цвет вытекает за край. Закройте щель линией и нажмите снова.", { duration: 5000 });
          } else if (result.reason === "wall") {
            toast("Вы нажали на саму линию. Нажмите внутри контура.", { duration: 3500 });
          } else {
            toast("Не получилось закрасить", { duration: 3000 });
          }
        });
      }
      return true;
    }
    try {
      sheetRef.current?.setPointerCapture(event.pointerId);
    } catch {
      /* указатель уже отпущен */
    }
    const p = toPct(event.clientX, event.clientY);
    const erase = tool === "erase";
    eraseCount.current += 1;
    drawing.current = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      points: [round(p.x), round(p.y)],
      pressure: [event.pointerType === "pen" && event.pressure > 0 ? event.pressure : 0.5],
      hasPressure: event.pointerType === "pen" && event.pressure > 0,
      erase,
      target: erase ? (selected ?? blockAt(event.clientX, event.clientY, true)) : null,
      group: `erase:${eraseCount.current}`,
      maskAt: null,
      lx: p.x,
      ly: p.y,
      snapped: null,
      startedAt: performance.now(),
    };
    updateCursor(event, true);
    if (erase) {
      scratch("erase");
      eraseAt(p, drawing.current, { x: event.clientX, y: event.clientY });
    } else {
      scratch(pen.brush === "pen" ? "pen" : "brush");
      armStraighten();
      liveUpdate(drawing.current.points, drawing.current.pressure, drawing.current.hasPressure);
    }
    return true;
  };

  /** Задержали перо на месте ~0,55 с: линия или фигура выравниваются. */
  const armStraighten = () => {
    const draw = drawing.current;
    if (!draw || draw.erase) return;
    window.clearTimeout(draw.still);
    draw.still = window.setTimeout(() => {
      const d = drawing.current;
      if (!d || d.erase || d.snapped || d.points.length < 6) return;
      // Буквы и слова (мелкие штрихи) никогда не превращаются в фигуры: только крупный штрих, больше ~12 % страницы.
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let i = 0; i + 1 < d.points.length; i += 2) {
        x0 = Math.min(x0, d.points[i]);
        x1 = Math.max(x1, d.points[i]);
        y0 = Math.min(y0, d.points[i + 1]);
        y1 = Math.max(y1, d.points[i + 1]);
      }
      if (!ENABLE_SHAPE_SNAP || Math.hypot(x1 - x0, y1 - y0) < 12 || !pen.hold) return;
      const rec = recognizeShape(d.points);
      if (!rec) return;
      d.snapped = rec;
      d.points = rec.points;
      liveUpdate(d.points, [], false);
      if (typeof navigator.vibrate === "function") navigator.vibrate(8);
    }, 850);
  };

  const flushDraft = () => {
    const d = draftRef.current;
    if (!d) return;
    window.cancelAnimationFrame(draftFrame.current ?? 0);
    draftRef.current = null;
    setEraseDraft(null);
    commit((pg) => ({ ...pg, blocks: pg.blocks.flatMap((b) => (b.id !== d.id ? [b] : d.type === "ink" && !d.strokes.length ? [] : [d])) }), `erase-end:${Date.now()}`);
    lastGroup.current = null;
  };

  const showDraft = (next: PageBlock) => {
    draftRef.current = next;
    if (draftFrame.current) return;
    draftFrame.current = window.requestAnimationFrame(() => {
      draftFrame.current = undefined;
      setEraseDraft(draftRef.current);
    });
  };

  /** Стирает круг: у рисунка вырезает кусочки линий, у текста, фото и стикеров прячет участок маской. */
  const eraseAt = (p: { x: number; y: number }, draw: Draw, _at?: { x: number; y: number }) => {
    if (!draw.target) return;
    const base = draftRef.current && draftRef.current.id === draw.target ? draftRef.current : current()?.blocks.find((b) => b.id === draw.target);
    if (!base || base.locked) return;
    const block = base;
    const r = px2w(pen.eraser) / 2;
    const w = blockW(block as { type: string; w?: number });
    const h = heightOf(block);
    // Точка в системе координат блока с учётом поворота.
    const cx = block.x + w / 2;
    const cy = block.y + h / 2;
    const a = (-(block.rotate ?? 0) * Math.PI) / 180;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const u = dx * Math.cos(a) - dy * Math.sin(a) + w / 2;
    const v = dx * Math.sin(a) + dy * Math.cos(a) + h / 2;
    if (block.type === "ink") {
      const kx = block.ow / Math.max(0.01, block.w);
      const ky = block.oh / Math.max(0.01, block.h);
      const strokes = eraseFromStrokes(block.strokes, u * kx, v * ky, r * kx, id);
      if (!strokes) return;
      showDraft({ ...block, strokes });
      return;
    }
    if (u < -r || v < -r || u > w + r || v > h + r) return;
    const lx = round((u / w) * 100);
    const ly = round((v / w) * 100);
    const rr = round((r / w) * 100);
    const mask = block.mask ?? { h: round((h / w) * 100), strokes: [] };
    const strokes = mask.strokes.slice();
    if (draw.maskAt === null || !strokes[draw.maskAt]) {
      strokes.push({ r: rr, pts: [lx, ly] });
      draw.maskAt = strokes.length - 1;
    } else {
      const s2 = strokes[draw.maskAt];
      const n = s2.pts.length;
      if (Math.hypot(s2.pts[n - 2] - lx, s2.pts[n - 1] - ly) < 0.05) return;
      strokes[draw.maskAt] = { ...s2, pts: [...s2.pts, lx, ly] };
    }
    showDraft({ ...block, mask: { ...mask, strokes } } as PageBlock);
  };

  const onSheetMove = (event: React.PointerEvent) => {
    const m = marqueeRef.current;
    if (m && m.pointerId === event.pointerId) {
      const at = toPct(event.clientX, event.clientY);
      m.x1 = at.x;
      m.y1 = at.y;
      if (Math.hypot(m.x1 - m.x0, m.y1 - m.y0) > 0.8) setMarquee({ x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1 });
      return;
    }
    if (tool !== "hand") updateCursor(event, event.pointerType !== "touch" || Boolean(drawing.current));
    const draw = drawing.current;
    if (draw && draw.pointerId === event.pointerId) {
      const events = typeof event.nativeEvent.getCoalescedEvents === "function" ? event.nativeEvent.getCoalescedEvents() : [event.nativeEvent];
      for (const e of events.length ? events : [event.nativeEvent]) {
        const p = toPct(e.clientX, e.clientY);
        if (draw.erase) {
          eraseAt(p, draw, { x: e.clientX, y: e.clientY });
          continue;
        }
        if (draw.snapped?.kind === "line") {
          draw.points = lineOf(draw.points[0], draw.points[1], p.x, p.y);
        } else if (!draw.snapped) {
          if (Math.hypot(p.x - draw.lx, p.y - draw.ly) >= 0.08) {
            draw.points.push(round(p.x), round(p.y));
            if (draw.hasPressure) draw.pressure.push(e.pressure > 0 ? e.pressure : 0.5);
            else draw.pressure.push(0.5);
          }
          if (Math.hypot(p.x - draw.lx, p.y - draw.ly) > 0.5) {
            draw.lx = p.x;
            draw.ly = p.y;
            armStraighten();
          }
        }
      }
      if (!draw.erase) liveUpdate(draw.points, draw.pressure, draw.hasPressure && !draw.snapped);
      return;
    }
    moveGesture(event);
  };

  /** Рисунок вышел за край листа: предлагаем оставить его только на этом листе, всё лишнее скроется. */
  const offerClip = (blockId: string) => {
    toast("Рисунок вышел за край листа", {
      id: "clip-offer",
      duration: 7000,
      action: {
        label: "🪄 Только этот лист",
        onClick: () => commit((p) => ({ ...p, blocks: p.blocks.map((b) => (b.id === blockId ? ({ ...b, clip: true, spread: false } as PageBlock) : b)) })),
      },
    });
  };

  const finishStroke = (draw: Draw) => {
    let points = draw.points;
    let pressure = draw.hasPressure && !draw.snapped ? draw.pressure : undefined;
    if (!draw.snapped) {
      if (straight && points.length >= 4) {
        points = lineOf(points[0], points[1], points[points.length - 2], points[points.length - 1]);
        pressure = undefined;
      } else if (ENABLE_SHAPE_SNAP && pen.auto && Math.hypot(Math.max(...points.filter((_, i) => i % 2 === 0)) - Math.min(...points.filter((_, i) => i % 2 === 0)), Math.max(...points.filter((_, i) => i % 2 === 1)) - Math.min(...points.filter((_, i) => i % 2 === 1))) >= 12) {
        const rec = recognizeShape(points);
        if (rec) {
          points = rec.points;
          pressure = undefined;
        }
      }
    }
    if (points.length === 2) points = [...points, points[0] + 0.01, points[1] + 0.01];
    const stroke: InkStroke = { ...makeStroke(points, pressure), id: id() };
    const live = current();
    if (!live) return;
    const top = live.blocks[live.blocks.length - 1];
    const key = `${pen.brush}|${pen.color}|${sizePx}`;
    const last = lastInk.current;
    const next = top && top.type === "ink" && last && last.id === top.id && last.key === key && Date.now() - last.at < 1400 && !top.locked ? mergeInk(top, stroke) : null;
    if (next && top && next.id === top.id) {
      lastInk.current = { id: next.id, at: Date.now(), key };
      commit((p) => ({ ...p, blocks: [...p.blocks.slice(0, -1), next] }));
      if (spillsOut(next) && !next.clip) offerClip(next.id);
    } else {
      let block = makeInkBlock([stroke], id);
      // Рисунок зашёл за край страницы: он ляжет через разворот и продолжится на соседней.
      if (partner && !isBack && (block.x < -0.5 || block.x + block.w > 100.5)) block = { ...block, spread: true };
      lastInk.current = { id: block.id, at: Date.now(), key };
      commit((p) => ({ ...p, blocks: [...p.blocks, block] }));
      if (spillsOut(block)) offerClip(block.id);
    }
  };

  const onSheetUp = (event: React.PointerEvent) => {
    const m = marqueeRef.current;
    if (m && m.pointerId === event.pointerId) {
      marqueeRef.current = null;
      setMarquee(null);
      const left = Math.min(m.x0, m.x1);
      const right = Math.max(m.x0, m.x1);
      const top = Math.min(m.y0, m.y1);
      const bottom = Math.max(m.y0, m.y1);
      if (right - left < 0.8 && bottom - top < 0.8) return;
      const hits = (current()?.blocks ?? [])
        .filter((b) => !b.locked && !(b.type === "ink" && !b.strokes.length))
        .filter((b) => {
          const w = blockW(b as { type: string; w?: number });
          const h = heightOf(b);
          return b.x < right && b.x + w > left && b.y < bottom && b.y + h > top;
        })
        .map((b) => b.id);
      const picked = withGroupMates(hits);
      if (picked.length > 1) {
        setGroup(picked);
        setSelected(null);
      } else if (hits.length === 1) {
        setSelected(hits[0]!);
      }
      return;
    }
    const draw = drawing.current;
    if (draw && draw.pointerId === event.pointerId) {
      window.clearTimeout(draw.still);
      drawing.current = null;
      clearLive();
      if (event.pointerType !== "mouse") updateCursor(event, false);
      if (draw.erase) flushDraft();
      else if (draw.points.length >= 2) finishStroke(draw);
      lastGroup.current = null;
      return;
    }
    endGesture(event);
  };

  const onSheetDown = (event: React.PointerEvent) => {
    if (pipette) {
      event.preventDefault();
      event.stopPropagation();
      const done = pipette;
      void sampleColor(event.clientX, event.clientY).then((color) => {
        setPipette(null);
        if (color) {
          done(color);
          toast(`Цвет ${color}`, { duration: 1800 });
        }
      });
      return;
    }
    if (startDraw(event)) return;
    if (event.target === event.currentTarget || (event.target as HTMLElement).dataset.bg) {
      setSelected(null);
      setEditing(null);
      setCropping(false);
      setGroup([]);
      // Мышью: тянем рамку по пустому месту, все блоки внутри выделяются разом.
      if (tool === "hand" && ((event.pointerType === "mouse" && event.button === 0) || pickMode)) {
        const at = toPct(event.clientX, event.clientY);
        marqueeRef.current = { pointerId: event.pointerId, x0: at.x, y0: at.y, x1: at.x, y1: at.y };
        try {
          sheetRef.current?.setPointerCapture(event.pointerId);
        } catch {
          /* указатель уже отпущен */
        }
      }
    }
  };

  const beginGesture = (event: React.PointerEvent, block: PageBlock, mode: Gesture["mode"]) => {
    if (tool !== "hand" || pipette) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (block.locked) return;
    if (editing === block.id && mode === "move") return;
    event.stopPropagation();
    event.preventDefault();
    // Shift / Ctrl / ⌘ + нажатие: добавить блок к выделению или убрать из него.
    if (mode === "move" && (pickMode || (event.pointerType === "mouse" && (event.shiftKey || event.metaKey || event.ctrlKey)))) {
      const base = group.length ? group : selected ? [selected] : [];
      const next = base.includes(block.id) ? base.filter((x) => x !== block.id) : [...base, block.id];
      setGroup(next.length > 1 ? next : []);
      setSelected(next.length === 1 ? next[0]! : null);
      setEditing(null);
      return;
    }
    if (touches.current.size >= 2) return;
    if (editing && editing !== block.id) setEditing(null);
    const wrapper = (event.currentTarget as HTMLElement).closest("[data-block]") as HTMLElement | null;
    const rect = wrapper?.getBoundingClientRect();
    const center = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined;
    const box = boxOf(block);
    // Рисунок и вырезанное фото растягиваются пропорционально; обычное фото свободно (так меняют рамку, в которой видна картинка), с Shift тоже пропорционально.
    const proportional = block.type === "photo" && (block.cut && block.frame === "sticker" ? true : block.whole ? !event.shiftKey : event.shiftKey);
    const ratio = proportional || block.type === "ink" ? (block as { h: number; w: number }).h / (block as { h: number; w: number }).w : null;
    const cropGesture = cropping && block.type === "photo" && selected === block.id && mode === "move";
    // Сгруппированные блоки двигаются вместе: нажатие на любой из них берёт всю группу.
    let activeGroup = group;
    if (mode === "move" && block.groupId && !group.includes(block.id)) {
      const mates = (current()?.blocks ?? []).filter((b) => b.groupId === block.groupId).map((b) => b.id);
      if (mates.length > 1) {
        activeGroup = mates;
        setGroup(mates);
        setSelected(null);
      }
    }
    const inGroup = mode === "move" && activeGroup.length > 1 && activeGroup.includes(block.id);
    const members = inGroup
      ? (current()?.blocks ?? []).filter((b) => activeGroup.includes(b.id) && !b.locked).map((b) => ({ id: b.id, box: boxOf(b) }))
      : undefined;
    if (!inGroup && activeGroup.length) setGroup([]);
    gesture.current = {
      members,
      id: block.id,
      mode: cropGesture ? "crop" : mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      box,
      moved: false,
      wasSelected: selected === block.id,
      center,
      angle0: center ? Math.atan2(event.clientY - center.y, event.clientX - center.x) : 0,
      ratio,
      crop0: block.type === "photo" ? (block.crop ?? { cx: 0.5, cy: 0.5, z: 1 }) : undefined,
    };
    try {
      sheetRef.current?.setPointerCapture(event.pointerId);
    } catch {
      /* указатель уже отпущен */
    }
    if (!inGroup) setSelected(block.id);
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
    if (g.members && g.mode === "move") {
      const next: Record<string, Box> = {};
      // Сдвиг ограничиваем для всей группы сразу: расстояния между блоками не меняются, даже когда один дошёл до края.
      const loX = Math.max(...g.members.map((m) => -m.box.w + 6 - m.box.x));
      const hiX = Math.min(...g.members.map((m) => 94 - m.box.x));
      const loY = Math.max(...g.members.map((m) => -6 - m.box.y));
      const hiY = Math.min(...g.members.map((m) => 96 - m.box.y));
      const gx = clamp(dx, Math.min(loX, hiX), hiX);
      const gy = clamp(dy, Math.min(loY, hiY), hiY);
      for (const m of g.members) next[m.id] = { ...m.box, x: m.box.x + gx, y: m.box.y + gy };
      g.lastMembers = next;
      setGhostGroup(next);
      return;
    }
    if (g.mode === "crop") {
      const block = current()?.blocks.find((b) => b.id === g.id);
      if (!block || block.type !== "photo" || !g.crop0) return;
      const inner = innerBox(block.frame, false, block.w, block.h);
      const geom = cropGeom(inner, cropAr.current, g.crop0);
      patchBlock(g.id, { crop: { cx: round(g.crop0.cx - dx / geom.dw), cy: round(g.crop0.cy - (dy * (PAGE_H / 100)) / geom.dh), z: g.crop0.z } } as Partial<PageBlock>, `crop:${g.id}`);
      return;
    }
    let box = g.box;
    if (g.mode === "move") box = { ...g.box, x: clamp(g.box.x + dx, -g.box.w + 6, 94), y: clamp(g.box.y + dy, -6, 96) };
    if (g.mode === "size") {
      const w = clamp(g.box.w + dx, 3, 160);
      const h = g.box.h === null ? null : g.ratio ? clamp(g.ratio * w, 2, 160) : clamp(g.box.h + dy, 2, 160);
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
    if (g.members) {
      const moved = g.lastMembers;
      setGhostGroup(null);
      if (g.moved && moved) {
        commit((p) => {
          // Охранное поле подвигает группу целиком: берём самую большую поправку и применяем её ко всем, чтобы блоки не слиплись у края.
          let cdx = 0;
          let cdy = 0;
          for (const b of p.blocks) {
            const box = moved[b.id];
            if (!box) continue;
            const fit = fitSafe({ ...b, x: round(box.x), y: round(box.y) } as PageBlock);
            if (Math.abs(fit.x - box.x) > Math.abs(cdx)) cdx = fit.x - box.x;
            if (Math.abs(fit.y - box.y) > Math.abs(cdy)) cdy = fit.y - box.y;
          }
          return {
            ...p,
            blocks: p.blocks.map((b) => {
              const box = moved[b.id];
              return box ? ({ ...b, x: round(box.x + cdx), y: round(box.y + cdy) } as PageBlock) : b;
            }),
          };
        });
      } else {
        // Просто нажали на блок из выделения: выделение сжимается до него одного, как в папках на компьютере. Сгруппированные остаются выбранными вместе.
        const grouped = Boolean(current()?.blocks.find((b) => b.id === g.id)?.groupId);
        if (!grouped) {
          setGroup([]);
          setSelected(g.id);
        }
      }
      return;
    }
    const block = current()?.blocks.find((b) => b.id === g.id);
    if (!block) return;
    if (g.mode === "crop") return;
    if (g.moved && final) {
      commit((p) => ({
        ...p,
        blocks: p.blocks.map((b) => {
          if (b.id !== g.id) return b;
          const next = { ...b, x: round(final.x), y: round(final.y), rotate: final.rotate } as PageBlock;
          if ("w" in next) (next as { w?: number }).w = round(final.w);
          if ((next.type === "photo" || next.type === "slot" || next.type === "shape" || next.type === "ink") && final.h !== null) next.h = round(final.h);
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

  /** Кнопка «Текст»: если выбран текст, пишем в него; если есть пустой, берём его; новую плашку добавляем, только когда иначе нельзя. */
  const onTextTool = () => {
    setTool("hand");
    setCropping(false);
    // Выделено несколько блоков с текстом: «Текст» меняет настройки выделенных (цвет), а не добавляет новый текст.
    if (group.length > 1 && (current()?.blocks ?? []).some((b) => group.includes(b.id) && b.type === "text")) {
      setGroupColors(true);
      return;
    }
    if (selectedBlock && selectedBlock.type === "text" && !selectedBlock.locked) {
      startEditing(selectedBlock.id);
      return;
    }
    const empty = page.blocks.find((b) => b.type === "text" && !b.text.trim() && !b.placeholder && !b.locked);
    if (empty) {
      startEditing(empty.id);
      return;
    }
    addText();
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDropping(false);
    const raw = toPct(event.clientX, event.clientY);
    const at = raw.x >= 0 && raw.x <= 100 && raw.y >= 0 && raw.y <= 100 ? raw : undefined;
    const wait = toast.loading("Загружаю картинку…");
    void imageFromTransfer(event.dataTransfer)
      .finally(() => toast.dismiss(wait))
      .then((ref) => {
        if (ref) void placePhoto(ref, at);
        else toast("Сюда можно перетащить картинку");
      })
      .catch(() => toast("Картинка не скачалась. Сохраните её на устройство и перетащите файл."));
  };

  // ——— Два пальца: тап – шаг назад, двойной тап – шаг вперёд ———
  const inStage = (target: EventTarget | null) => Boolean(target instanceof Node && stageRef.current?.contains(target));

  const onRootDown = (event: React.PointerEvent) => {
    if (event.pointerType !== "touch" || !inStage(event.target)) return;
    touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.current.size === 2) {
      twoTap.current = { t0: performance.now(), moved: false, fired: false };
      // Если один из пальцев уже начал рисовать, штрих отменяется: это не рисунок, а жест.
      if (drawing.current && drawing.current.pointerType === "touch") cancelDraw();
      if (gesture.current && !gesture.current.moved) gesture.current = null;
    } else if (touches.current.size > 2) twoTap.current = null;
  };

  const onRootMove = (event: React.PointerEvent) => {
    if (event.pointerType !== "touch") return;
    const start = touches.current.get(event.pointerId);
    if (start && twoTap.current && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 16) twoTap.current.moved = true;
  };

  const onRootUp = (event: React.PointerEvent) => {
    if (event.pointerType !== "touch") return;
    const tap = twoTap.current;
    if (tap && !tap.fired && !tap.moved && touches.current.size === 2 && performance.now() - tap.t0 < 380) {
      tap.fired = true;
      // Каждый тап двумя пальцами (и двойной тоже) сразу делает шаг назад.
      actions.current.undo();
      if (typeof navigator.vibrate === "function") navigator.vibrate(10);
    }
    touches.current.delete(event.pointerId);
    if (touches.current.size === 0) twoTap.current = null;
  };

  const go = (dir: -1 | 1) => {
    const next = pages[index + dir];
    if (!next) return;
    turnPage();
    nav.replace({ id: "editor", pageId: next.id });
  };

  const addNextPage = () => {
    const at = isBack ? pages.length : index + 1;
    const created = insertPage({ ...blankPage(), paper: page.paper, chapterId: page.chapterId }, at);
    turnPage();
    nav.replace({ id: "editor", pageId: created });
    toast("Новая страница добавлена следом");
  };

  const toBin = () => {
    const deleted = page.id;
    const neighbour = pages[index + 1] ?? pages[index - 1];
    removePage(deleted);
    toast("Страница в корзине", { action: { label: "Вернуть", onClick: () => restorePage(deleted) } });
    if (neighbour) nav.replace({ id: "editor", pageId: neighbour.id });
    else nav.replace({ id: "book" });
  };

  const centerOnPage = (axis: "x" | "y") => {
    if (!selectedBlock) return;
    if (axis === "x") {
      const w = blockW(selectedBlock as { type: string; w?: number });
      patchBlock(selectedBlock.id, { x: round((100 - w) / 2) } as Partial<PageBlock>);
    } else {
      patchBlock(selectedBlock.id, { y: round((100 - heightOf(selectedBlock)) / 2) } as Partial<PageBlock>);
    }
  };

  const ops: BlockOps | null = selectedBlock
    ? {
        patch: (partial, group) => patchBlock(selectedBlock.id, partial, group),
        remove: () => removeBlock(selectedBlock.id),
        copy: () => copyBlocks(),
        paste: pasteBlocks,
        canPaste: Boolean(blockClip?.blocks.length),
        toPartner: partner ? moveToPartner : undefined,
        duplicate: () => {
          const copy = { ...selectedBlock, id: id(), x: selectedBlock.x + 4, y: selectedBlock.y + 3, locked: false } as PageBlock;
          commit((p) => {
            const at = p.blocks.findIndex((b) => b.id === selectedBlock.id);
            const blocks = p.blocks.slice();
            blocks.splice(at + 1, 0, copy);
            return { ...p, blocks };
          });
          setSelected(copy.id);
        },
        layer: (where) => moveLayer(selectedBlock.id, where),
        toggleLock: () => {
          patchBlock(selectedBlock.id, { locked: !selectedBlock.locked } as Partial<PageBlock>);
          if (!selectedBlock.locked) toast("Заблокировано: не двигается и не мешает соседям. Снять замок можно в «Слоях».", { duration: 5000 });
        },
        edit: () => startEditing(selectedBlock.id),
        cut: (mode) => selectedBlock.type === "photo" && void cutOut(selectedBlock.id, selectedBlock.src, mode),
        cropMode: () => {
          if (selectedBlock.type !== "photo") return;
          void imageInfo(selectedBlock.src).then((info) => {
            cropAr.current = info.ratio;
          });
          setCropping((value) => !value);
          setPanel(null);
        },
        cropping,
        // Рамка по размеру самой картинки: вся фотография видна целиком, без обрезки.
        fitWhole: () => {
          const photo = selectedBlock;
          if (photo.type !== "photo") return;
          void imageInfo(photo.src).then((info) => {
            const inner = innerBox(photo.frame, false, photo.w, 1000);
            const extraH = 1000 - inner.h;
            const hUnits = inner.w * info.ratio + extraH;
            patchBlock(photo.id, { h: round(clamp(hUnits / (PAGE_H / 100), 4, 160)), crop: undefined, whole: true } as Partial<PageBlock>);
          });
        },
        replace: () => {
          setReplaceTarget(selectedBlock.id);
          setSlotTarget(null);
          setPanel("photo");
        },
        fill: () => {
          setSlotTarget(selectedBlock.id);
          setPanel("photo");
        },
        write: () => {
          if (selectedBlock.type !== "photo") return;
          const b = selectedBlock;
          const polaroid = b.frame === "polaroid";
          const text: PageBlock = {
            id: id(),
            type: "text",
            x: round(b.x + b.w * 0.07),
            y: round(polaroid ? b.y + b.h - (b.w * POLAROID.bottom) / 100 + 0.6 : b.y + b.h * 0.72),
            w: round(b.w * 0.86),
            text: "",
            font: "script",
            size: "md",
            align: "center",
            rotate: b.rotate ?? 0,
            color: polaroid ? undefined : "#ffffff",
            placeholder: "Надпись на фото",
          };
          stickSound();
          flushSync(() => addBlock(text));
          startEditing(text.id);
        },
        full: () => {
          if (selectedBlock.type !== "photo") return;
          const full = { ...selectedBlock, ...fullPage(), cut: selectedBlock.cut, spread: false } as PageBlock;
          commit((p) => ({ ...p, blocks: [full, ...p.blocks.filter((b) => b.id !== selectedBlock.id)] }));
          void imageInfo(selectedBlock.src).then((info) => {
            cropAr.current = info.ratio;
            setCropping(true);
            toast("Двигайте фото пальцем: выберите, что останется. Лица держите внутри пунктира.", { duration: 6000 });
          });
        },
        toggleSpread: () => {
          if (selectedBlock.type !== "photo" && selectedBlock.type !== "ink" && selectedBlock.type !== "sticker" && selectedBlock.type !== "shape") return;
          if (selectedBlock.spread) {
            commit((p) => ({ ...p, blocks: p.blocks.map((b) => (b.id === selectedBlock.id ? fitSafe({ ...b, spread: false } as PageBlock) : b)) }));
          } else {
            const bw = blockW(selectedBlock as { type: string; w?: number });
            const x = side === "right" ? -bw / 2 : 100 - bw / 2;
            patchBlock(selectedBlock.id, { spread: true, x: round(x) } as Partial<PageBlock>);
            toast("Фото лежит на двух страницах. Двигайте его так, чтобы нужная часть оказалась по обе стороны корешка.", { duration: 6000 });
          }
        },
        clipToPage: () => {
          if (selectedBlock.type !== "ink") return;
          const on = !selectedBlock.clip;
          commit((p) => ({ ...p, blocks: p.blocks.map((b) => (b.id === selectedBlock.id ? ({ ...b, clip: on || undefined, spread: on ? false : b.spread } as PageBlock) : b)) }));
          toast(on ? "Всё, что вышло за край листа, скрыто. Нажмите ещё раз, чтобы вернуть." : "Рисунок снова целиком", { duration: 3000 });
        },
        canSpread: Boolean(partner) && !isBack,
        pickPipette: startPipette,
        centerH: () => centerOnPage("x"),
        centerV: () => centerOnPage("y"),
        resetMask: () => patchBlock(selectedBlock.id, { mask: undefined } as Partial<PageBlock>),
        inkColor: (color) => {
          if (selectedBlock.type !== "ink") return;
          commit((p) => ({ ...p, blocks: p.blocks.map((b) => (b.id === selectedBlock.id && b.type === "ink" ? { ...b, strokes: b.strokes.map((s) => ({ ...s, color })) } : b)) }), `color:${selectedBlock.id}`);
        },
        inkScale: (factor) => {
          if (selectedBlock.type !== "ink") return;
          commit((p) => ({ ...p, blocks: p.blocks.map((b) => (b.id === selectedBlock.id && b.type === "ink" ? { ...b, strokes: b.strokes.map((s) => ({ ...s, width: round(Math.max(0.1, s.width * factor)) })) } : b)) }));
        },
        openFonts: () => setPanel("fonts"),
        erase: () => {
          setCropping(false);
          setTool("erase");
        },
      }
    : null;

  const prompt = findPrompt(page.promptId);
  const cursor = tool === "hand" ? "default" : "none";
  const drawingTool = tool !== "hand";

  return (
    <div
      className="editor-root fixed inset-x-0 top-0 z-40 flex h-dvh flex-col"
      onPointerDownCapture={onRootDown}
      onPointerMoveCapture={onRootMove}
      onPointerUpCapture={onRootUp}
      onPointerCancelCapture={onRootUp}
      onDragOver={(event) => {
        event.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (event.target === event.currentTarget) setDropping(false);
      }}
      onDrop={onDrop}
    >
      {/* Верх */}
      <header className="relative z-[46] flex items-center gap-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] max-sm:flex-wrap">
        <button type="button" className="glass-strong grid size-11 shrink-0 place-items-center rounded-full" aria-label="К книге" onClick={() => { remindBackup(); nav.back(); }}>
          <ChevronLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1 text-center max-sm:order-last max-sm:basis-full">
          <p className="truncate text-sm font-semibold text-ink">{isBack ? "Задняя сторона обложки" : page.kind === "cover" ? "Обложка" : page.title}</p>
          {isBack ? (
            <button type="button" className="text-xs text-rose-deep underline" onClick={() => nav.replace({ id: "editor", pageId: pages[0]?.id ?? "" })} disabled={!pages[0]}>
              К лицевой стороне
            </button>
          ) : (
            <div className="flex items-center justify-center gap-1 text-xs text-muted">
              <button type="button" className="grid size-11 place-items-center rounded-full disabled:opacity-30 max-md:hidden" disabled={index <= 0} onClick={() => go(-1)} aria-label="Предыдущая">
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" className="whitespace-nowrap rounded-full px-3 py-1 tabular-nums md:pointer-events-none" aria-label="Все страницы: перейти к главе" onClick={() => setPanel("contents")}>
                {index + 1} / {pages.length} <span className="text-moss underline md:hidden">все</span>
              </button>
              {index >= pages.length - 1 ? (
                // Последняя страница: вместо тусклой стрелки понятная кнопка, как идти дальше.
                <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-full bg-moss px-3 text-xs font-semibold text-paper" onClick={addNextPage} aria-label="Добавить следующую страницу">
                  <FilePlus className="size-3.5" /> Новая страница
                </button>
              ) : (
                <button type="button" className="grid size-11 place-items-center rounded-full max-md:hidden" onClick={() => go(1)} aria-label="Следующая">
                  <ChevronRight className="size-4" />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="glass-strong flex shrink-0 items-center rounded-full p-1 max-sm:ml-auto">
          <IconBtn label="Отменить (или тап двумя пальцами)" disabled={!undo.current.length} onClick={doUndo}>
            <Undo2 className="size-[18px]" />
          </IconBtn>
          <IconBtn label="Вернуть отменённое" disabled={!redo.current.length} onClick={doRedo}>
            <Redo2 className="size-[18px]" />
          </IconBtn>
          {blockClip ? (
            <IconBtn label="Вставить скопированное на эту страницу" onClick={pasteBlocks}>
              <ClipboardPaste className="size-[18px]" />
            </IconBtn>
          ) : null}
          <IconBtn
            label="Выбрать несколько блоков"
            active={pickMode}
            onClick={() => {
              setTool("hand");
              setSelected(null);
              setEditing(null);
              setGroup([]);
              setPickMode((value) => !value);
            }}
          >
            <SquareMousePointer className="size-[18px]" />
          </IconBtn>
          <IconBtn className="max-sm:hidden" label="Содержание: перейти к главе" onClick={() => setPanel("contents")}>
            <ListChecks className="size-[18px]" />
          </IconBtn>
          <IconBtn className="max-md:hidden" label="Слои страницы" onClick={() => { setTool("hand"); setPanel("layers"); }}>
            <Layers className="size-[18px]" />
          </IconBtn>
          {!isBack ? (
            <IconBtn className="max-sm:hidden" label="Добавить страницу следом" onClick={addNextPage}>
              <FilePlus className="size-[18px]" />
            </IconBtn>
          ) : null}
          {partner ? (
            <IconBtn className="max-sm:hidden" label={spread ? "Одна страница" : "Разворот"} onClick={() => setSpread(!spread)}>
              {spread ? <Square className="size-[18px]" /> : <BookOpen className="size-[18px]" />}
            </IconBtn>
          ) : null}
          <IconBtn label="Ещё" onClick={() => setPanel("menu")}>
            <MoreHorizontal className="size-[18px]" />
          </IconBtn>
        </div>
      </header>

      {pipette ? (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.8rem)] z-[48] flex justify-center">
          <span className="pointer-events-auto flex items-center gap-2 rounded-full bg-night px-4 py-2 text-sm text-paper shadow-lg">
            <Pipette className="size-4" /> Коснитесь цвета на странице
            <button type="button" aria-label="Отмена" onClick={() => setPipette(null)} className="grid size-6 place-items-center rounded-full bg-white/20">
              <X className="size-3" />
            </button>
          </span>
        </div>
      ) : null}

      {/* Лист */}
      <div className="relative min-h-0 flex-1">
        {overflowBlock && !drawingTool && editing !== overflowBlock.id ? (
          <div className="glass-strong absolute inset-x-3 bottom-3 z-[46] mx-auto flex max-w-md flex-col gap-2 rounded-2xl p-3 text-sm shadow-xl">
            <p className="text-ink">Текст не поместился на странице. Продолжить на следующей?</p>
            <button
              type="button"
              className="min-h-11 rounded-full bg-night px-4 font-semibold text-paper"
              onClick={() => {
                const made = flowToNextPages(page.id, overflowBlock.id);
                toast(made ? `Лишнее перенесено на ${made} ${made === 1 ? "новую страницу" : "новые страницы"}` : "Весь текст помещается на странице");
              }}
            >
              Перенести лишнее на следующую страницу
            </button>
          </div>
        ) : null}
        {!isBack && !drawingTool ? (
          <>
            <button type="button" className="glass-strong absolute left-1.5 top-1/2 z-[44] grid size-12 -translate-y-1/2 place-items-center rounded-full disabled:opacity-0" disabled={index <= 0} onClick={() => go(-1)} aria-label="Предыдущая страница">
              <ChevronLeft className="size-6" />
            </button>
            <button type="button" className="glass-strong absolute right-1.5 top-1/2 z-[44] grid size-12 -translate-y-1/2 place-items-center rounded-full disabled:opacity-0" disabled={index >= pages.length - 1} onClick={() => go(1)} aria-label="Следующая страница">
              <ChevronRight className="size-6" />
            </button>
          </>
        ) : null}
        <div
          ref={stageRef}
          className="no-scrollbar absolute inset-0 overflow-auto"
          onPointerDown={(event) => {
            // Нажали на пустое место рядом со страницей: выходим из выделения, кисти, ластика и набора текста.
            const t = event.target as HTMLElement;
            if (t === event.currentTarget || t.dataset.stage) {
              setSelected(null);
              setEditing(null);
              setCropping(false);
              setTool("hand");
            }
          }}
        >
          <div data-stage="1" className="flex min-h-full items-center justify-center px-4 pb-4 pt-4 md:px-6 md:pb-8 md:pt-14" style={{ width: zoom > 1 ? size.w * zoom * (twoUp ? 2 : 1) + 48 : "100%" }}>
            {twoUp && partner && side === "right" ? <PartnerPage page={partner} meta={meta} width={size.w * zoom} side="left" onOpen={() => { turnPage(); nav.replace({ id: "editor", pageId: partner.id }); }} /> : null}
            <div
              ref={sheetRef}
              className={cn("book-page-shadow relative z-[5] select-none rounded-[2px]", dropping && "ring-4 ring-rose/60")}
              style={{ width: size.w * zoom, cursor: pipette ? "crosshair" : cursor, touchAction: tool === "hand" && zoom > 1 && !pickMode ? "pan-x pan-y" : "none" }}
              onPointerDown={onSheetDown}
              onPointerMove={onSheetMove}
              onPointerUp={onSheetUp}
              onPointerCancel={onSheetUp}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") updateCursor(event, false);
              }}
              onContextMenu={(event) => event.preventDefault()}
            >
              {/* Вылет под обрез: сюда можно тянуть фото, всё остальное отрежется */}
              <div className="pointer-events-none absolute rounded-[2px] border border-dashed border-rose/40" style={{ inset: `-${bleedPctY}% -${bleedPct}%` }} />
              <PageSheet page={page} meta={meta} hideStrokes clip={false} className="rounded-[2px]">
                <div data-bg="1" className="absolute inset-0" />
                {page.blocks.map((blockBase) => {
                  const block = eraseDraft && eraseDraft.id === blockBase.id ? eraseDraft : blockBase;
                  if (block.type === "ink" && !block.strokes.length) return null;
                  const box = ghost?.id === block.id ? ghost.box : (ghostGroup?.[block.id] ?? null);
                  const shown = box
                    ? ({
                        ...block,
                        x: box.x,
                        y: box.y,
                        rotate: box.rotate,
                        ...("w" in block ? { w: box.w } : {}),
                        ...((block.type === "photo" || block.type === "slot" || block.type === "shape" || block.type === "ink") && box.h !== null ? { h: box.h } : {}),
                      } as PageBlock)
                    : block;
                  const isSel = selected === block.id;
                  return (
                    <PlacedBlock
                      key={block.id}
                      block={shown}
                      data-block={block.id}
                      className={cn("touch-none", block.locked && "pointer-events-none", block.type === "ink" && "pointer-events-none")}
                      onPointerDown={(event) => beginGesture(event, block, "move")}
                    >
                      <BlockArt block={shown} editing />
                      {editing === block.id ? <span className="pointer-events-none absolute -inset-[4px] rounded-[4px] border-2 border-rose" /> : null}
                      {group.includes(block.id) ? <span className="pointer-events-none absolute -inset-[5px] rounded-[6px] border-2 border-dashed border-rose bg-rose/10" /> : null}
                      {block.locked ? <span className="pointer-events-none absolute -right-1 -top-1 z-20 grid size-[4.2cqw] min-h-4 min-w-4 place-items-center rounded-full bg-night/80 text-paper"><Lock className="size-[60%]" /></span> : null}
                      {cropping && isSel && block.type === "photo" ? <span className="pointer-events-none absolute inset-0 grid place-items-center bg-night/10 text-[2.6cqw] font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">Двигайте фото пальцем</span> : null}
                      {busy[block.id] ? (
                        <div className="pointer-events-none absolute inset-0 grid place-items-center">
                          <span className="cut-shimmer absolute inset-0 rounded-[1.4cqw]" />
                          <span className="relative rounded-full bg-night/85 px-3 py-1 text-xs text-paper">{busy[block.id]}</span>
                        </div>
                      ) : null}
                      {bins && !isSel && editing !== block.id && tool === "hand" && !block.locked && !cropping && !pipette && !(block.type === "text" && !block.text.trim() && !block.placeholder) ? (
                        <button
                          type="button"
                          aria-label="Удалить"
                          className="pointer-events-auto absolute -right-3 -top-3 z-20 grid size-11 place-items-center before:absolute before:inset-1.5 before:rounded-full before:bg-rose-deep/90 before:shadow"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={() => removeBlock(block.id)}
                        >
                          <Trash2 className="relative size-3.5 text-paper" />
                        </button>
                      ) : null}
                      {isSel && editing !== block.id && tool === "hand" && !block.locked && !cropping ? (
                        <Handles
                          onTurn={(event) => beginGesture(event, block, "turn")}
                          onSize={(event) => beginGesture(event, block, "size")}
                          onDelete={() => removeBlock(block.id)}
                          onLock={() => {
                            patchBlock(block.id, { locked: true } as Partial<PageBlock>);
                            toast("Элемент закреплён", { action: { label: "Снять", onClick: () => patchBlock(block.id, { locked: false } as Partial<PageBlock>) }, duration: 4000 });
                          }}
                        />
                      ) : null}
                    </PlacedBlock>
                  );
                })}
              </PageSheet>
              {/* Рисуемый сейчас штрих (после отпускания он станет объектом на странице) */}
              <svg viewBox={`0 0 100 ${PAGE_H}`} className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible">
                <g ref={livePath} />
              </svg>
              {marquee ? (
                <div
                  className="pointer-events-none absolute z-40 border border-rose bg-rose/10"
                  style={{ left: `${Math.min(marquee.x0, marquee.x1)}%`, top: `${Math.min(marquee.y0, marquee.y1)}%`, width: `${Math.abs(marquee.x1 - marquee.x0)}%`, height: `${Math.abs(marquee.y1 - marquee.y0)}%` }}
                />
              ) : null}
              {group.length > 1 || pickMode ? (
                <div className="absolute left-1/2 top-2 z-[45] flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-ink shadow-md" onPointerDown={(event) => event.stopPropagation()}>
                  {group.length > 1 ? (
                    <>
                      <span className="whitespace-nowrap">Выбрано: {group.length}</span>
                      {(current()?.blocks ?? []).filter((b) => group.includes(b.id)).every((b) => b.groupId && b.groupId === (current()?.blocks ?? []).find((x) => x.id === group[0])?.groupId) ? (
                        <button type="button" className="ml-1 grid min-h-9 place-items-center rounded-full px-3 text-ink" onClick={ungroupSelected}>
                          Разгруппировать
                        </button>
                      ) : (
                        <button type="button" className="ml-1 grid min-h-9 place-items-center rounded-full bg-night px-3 text-paper" onClick={groupSelected}>
                          Сгруппировать
                        </button>
                      )}
                      <button type="button" aria-label="Повернуть группу влево" className="grid min-h-9 place-items-center rounded-full px-3 text-ink" onClick={() => rotateGroup(-15)}>
                        ↺
                      </button>
                      <button type="button" aria-label="Повернуть группу вправо" className="grid min-h-9 place-items-center rounded-full px-3 text-ink" onClick={() => rotateGroup(15)}>
                        ↻
                      </button>
                      {(current()?.blocks ?? []).some((b) => group.includes(b.id) && b.type === "text") ? (
                        <button type="button" className="grid min-h-9 place-items-center rounded-full px-3 text-ink" onClick={() => setGroupColors(true)}>
                          Цвет
                        </button>
                      ) : null}
                      <button type="button" className="grid min-h-9 place-items-center rounded-full px-3 text-ink" onClick={() => copyBlocks()}>
                        Копировать
                      </button>
                      {partner ? (
                        <button type="button" className="grid min-h-9 place-items-center rounded-full px-3 text-ink" onClick={moveToPartner}>
                          На соседнюю
                        </button>
                      ) : null}
                      <button type="button" className="grid min-h-9 place-items-center rounded-full px-3 text-rose-deep" onClick={removeGroup}>
                        Удалить
                      </button>
                      <button type="button" className="grid min-h-9 place-items-center rounded-full px-3 text-muted" onClick={() => setGroup([])}>
                        Снять
                      </button>
                    </>
                  ) : (
                    <span className="whitespace-nowrap px-1">Нажимайте на блоки или обведите их</span>
                  )}
                  {pickMode ? (
                    <button
                      type="button"
                      className="grid min-h-9 place-items-center rounded-full bg-night px-3 text-paper"
                      onClick={() => {
                        setPickMode(false);
                        setGroup([]);
                      }}
                    >
                      Готово
                    </button>
                  ) : null}
                </div>
              ) : null}
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
              {page.blocks.length === 0 && page.kind !== "cover" ? (
                <div className="pointer-events-none absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-sm text-muted">
                  Пустой лист. Добавьте текст, фото или стикер снизу или перетащите картинку прямо сюда.
                </div>
              ) : null}
            </div>
            {twoUp && partner && side === "left" ? <PartnerPage page={partner} meta={meta} width={size.w * zoom} side="right" onOpen={() => { turnPage(); nav.replace({ id: "editor", pageId: partner.id }); }} /> : null}
          </div>
        </div>
        <div className="glass-strong absolute bottom-2 left-3 z-10 flex origin-bottom-left items-center rounded-full p-1 max-md:scale-90 md:left-auto md:right-3 md:origin-bottom-right">
          <IconBtn label="Мельче" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
            <ZoomOut className="size-4" />
          </IconBtn>
          <span className="w-10 text-center text-xs tabular-nums text-ink">{Math.round(zoom * 100)}%</span>
          <IconBtn label="Крупнее" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))}>
            <ZoomIn className="size-4" />
          </IconBtn>
        </div>
        {/* Кружок кисти или ластика: показывает настоящий размер */}
        <div ref={cursorRef} className="pointer-events-none fixed left-0 top-0 z-[55] hidden rounded-full border border-ink/70 bg-white/25 shadow-[0_0_0_1px_rgba(255,255,255,.8)]" />
      </div>

      {editingBlock && ops ? (
        <TextPanel
          key={editingBlock.id}
          block={editingBlock}
          ops={{ ...ops, patch: (partial, group) => patchBlock(editingBlock.id, partial, group), centerH: () => patchBlock(editingBlock.id, { x: round((100 - editingBlock.w) / 2) } as Partial<PageBlock>), centerV: () => patchBlock(editingBlock.id, { y: round((100 - heightOf(editingBlock)) / 2) } as Partial<PageBlock>) }}
          onChange={(text) => patchBlock(editingBlock.id, { text } as Partial<PageBlock>, `text:${editingBlock.id}`)}
          onDone={() => setEditing(null)}
        />
      ) : null}

      {/* Контекстная панель */}
      <div className="relative z-[46] px-3 pt-2">
        {drawingTool ? (
          <PenBar
            tool={tool}
            setTool={setTool}
            brush={pen.brush}
            setBrush={(brush) => updatePen({ brush })}
            color={pen.color}
            onColor={() => setPenColors(true)}
            sizePx={sizePx}
            setSizePx={(v) => updatePen({ sizes: { ...pen.sizes, [pen.brush]: v } })}
            eraserPx={pen.eraser}
            setEraserPx={(v) => updatePen({ eraser: v })}
            onAddShape={(shape) => {
              stickSound();
              const box = defaultShapeBox(shape);
              addBlock({ id: id(), type: "shape", shape, x: 50 - box.w / 2, y: 40 - box.h / 2, w: box.w, h: box.h });
              setTool("hand");
            }}
            straight={straight}
            setStraight={setStraight}
            eraseHint={selectedBlock ? "Стирает только выбранный элемент" : "Стирает то, что под пером"}
            onPipette={() => startPipette((color) => updatePen({ color }))}
            onDone={() => setTool("hand")}
          />
        ) : cropping && selectedBlock && selectedBlock.type === "photo" ? (
          <div className="glass-strong mx-auto flex max-w-xl items-center gap-2 rounded-full p-1.5">
            <span className="shrink-0 pl-3 text-xs text-ink">Приближение</span>
            <input
              type="range"
              min={1}
              max={6}
              step={0.05}
              value={selectedBlock.crop?.z ?? 1}
              onChange={(event) => patchBlock(selectedBlock.id, { crop: { cx: selectedBlock.crop?.cx ?? 0.5, cy: selectedBlock.crop?.cy ?? 0.5, z: Number(event.target.value) } } as Partial<PageBlock>, `crop:${selectedBlock.id}`)}
              className="rgb-range h-2 min-w-0 flex-1 appearance-none rounded-full bg-ink/15"
            />
            <BarBtn onClick={() => patchBlock(selectedBlock.id, { crop: undefined } as Partial<PageBlock>)}>Целиком</BarBtn>
            <BarBtn active onClick={() => setCropping(false)}>
              Готово
            </BarBtn>
          </div>
        ) : selectedBlock && ops && !editing ? (
          <BlockBar block={selectedBlock} busy={Boolean(busy[selectedBlock.id])} ops={ops} onInspector={() => setPanel("inspector")} />
        ) : page.kind === "cover" || isBack ? (
          <div className="flex h-11 items-center justify-center gap-2">
            {isBack ? null : (
              <Button variant="soft" className="min-h-10 shrink-0 whitespace-nowrap" onClick={() => setPanel("covers")}>
                <Sparkles className="size-4" /> Дизайн обложки
              </Button>
            )}
            <span className="truncate text-xs text-muted">Всё двигается и удаляется</span>
          </div>
        ) : (
          <p className="h-11 truncate pt-3 text-center text-xs text-muted max-md:hidden">Пунктир: безопасная зона, текст держите внутри. Фото можно тянуть до самого края.</p>
        )}
      </div>

      {/* Инструменты */}
      <nav className={cn("relative z-[46] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2", drawingTool && "hidden")}>
        <div className="toolbar-dark mx-auto flex max-w-xl items-stretch justify-between gap-0.5 rounded-[1.6rem] p-1.5">
          <ToolBtn label="Текст" onClick={onTextTool}>
            <Type className="size-5" />
          </ToolBtn>
          <ToolBtn
            label="Фото"
            onClick={() => {
              setTool("hand");
              setSlotTarget(null);
              setReplaceTarget(null);
              setPanel("photo");
            }}
          >
            <ImagePlus className="size-5" />
          </ToolBtn>
          <ToolBtn
            label="Рисунок"
            active={drawingTool}
            onClick={() => {
              setSelected(null);
              setEditing(null);
              setCropping(false);
              setTool(drawingTool ? "hand" : "draw");
            }}
          >
            <PenLine className="size-5" />
          </ToolBtn>
          <ToolBtn
            label="Стикеры"
            onClick={() => {
              setTool("hand");
              setPanel("stickers");
            }}
          >
            <Smile className="size-5" />
          </ToolBtn>
          <ToolBtn label="Слои" onClick={() => { setTool("hand"); setPanel("layers"); }}>
            <Layers className="size-5" />
          </ToolBtn>
        </div>
      </nav>

      <RotateHint />
      <PinnedRefs
        refs={pinned}
        onUnpin={togglePin}
        pipette={!!pipette}
        onPick={(color) => {
          const done = pipette;
          setPipette(null);
          if (done) {
            done(color);
            toast(`Цвет ${color} из подсказки`, { duration: 1800 });
          }
        }}
      />
      <MoodBoard pinned={pinned} onPin={togglePin} open={mood} onToggle={() => setMood((v) => !v)} onPlace={(ref) => void placePhoto(ref, undefined, undefined, false)} />

      <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(event) => { onFiles(event.target.files); event.target.value = ""; }} />
      <input ref={diskRef} type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.tif,.tiff,.bmp,.avif" multiple className="sr-only" onChange={(event) => { onFiles(event.target.files); event.target.value = ""; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => { onFiles(event.target.files); event.target.value = ""; }} />
      <input
        ref={stickerFileRef}
        type="file"
        accept="image/png,image/webp,image/gif,image/svg+xml,image/*"
        multiple
        className="sr-only"
        onChange={(event) => {
          const list = [...(event.target.files ?? [])];
          event.target.value = "";
          if (!list.length) return;
          const wait = toast.loading("Добавляю стикеры…");
          void (async () => {
            for (const file of list.slice(0, 10)) {
              try {
                const ref = await importSticker(file);
                addUserSticker(ref);
              } catch (error) {
                toast(`«${file.name}»: ${error instanceof Error ? error.message : "не открылся"}`, { duration: 7000 });
              }
            }
            toast.dismiss(wait);
            toast("Добавлено в «Мои». Нажмите на стикер, чтобы положить на страницу.");
          })();
        }}
      />

      {panel === "photo" ? (
        <PhotoSheet
          title={replaceTarget ? "Заменить фото" : slotTarget ? "Фото в рамку" : "Добавить фото"}
          style={style}
          setStyle={setStyle}
          shadow={shadowPref}
          setShadow={setShadow}
          lockStyle={Boolean(slotTarget || replaceTarget)}
          archive={archive}
          bleed={print.bleed}
          onGallery={() => fileRef.current?.click()}
          onFiles={() => diskRef.current?.click()}
          onCamera={() => cameraRef.current?.click()}
          onPaste={() => void pasteFromClipboard()}
          onPinterest={() => setPanel("pinterest")}
          onScan={() => setPanel("scan")}
          onArchive={(src) => void placePhoto(src)}
          onClose={() => {
            setPanel(null);
            setSlotTarget(null);
            setReplaceTarget(null);
          }}
        />
      ) : null}

      {panel === "scan" ? (
        <Scanner
          onClose={() => setPanel("photo")}
          onDone={(ref, mode) => {
            if (mode === "ink") void placePhoto(ref, undefined, "cutout");
            else void placePhoto(ref);
          }}
        />
      ) : null}

      {panel === "pinterest" ? <PinterestPanel onClose={() => setPanel(null)} onPaste={() => void pasteFromClipboard()} onLink={(link) => { setPanel(null); fromLink(link); }} onPasteData={(data) => { setPanel(null); fromTransfer(data); }} /> : null}
      {panel === "paste" ? <PasteSheet onClose={() => setPanel(null)} onPaste={() => void pasteFromClipboard()} onLink={(link) => { setPanel(null); fromLink(link); }} onPasteData={(data) => { setPanel(null); fromTransfer(data); }} /> : null}

      {panel === "stickers" ? (
        <StickersSheet
          onClose={() => setPanel(null)}
          onSticker={(kind: StickerKind) => {
            stickSound();
            const w = defaultStickerWidth(kind);
            addBlock({ id: id(), type: "sticker", kind, x: 50 - w / 2, y: 40, w, rotate: Math.round(Math.random() * 16 - 8) });
            setPanel(null);
          }}
          onShape={(shape: ShapeKind) => {
            stickSound();
            const box = defaultShapeBox(shape);
            addBlock({ id: id(), type: "shape", shape, x: 50 - box.w / 2, y: 40 - box.h / 2, w: box.w, h: box.h });
            setPanel(null);
          }}
          onUser={(ref) => {
            setPanel(null);
            void (async () => {
              const info = await imageInfo(ref);
              const w = 30;
              const h = clamp((w * info.ratio) / (PAGE_H / 100), 3, 90);
              stickSound();
              addBlock({ id: id(), type: "photo", x: 50 - w / 2, y: 40 - h / 2, w, h, src: ref, cut: info.alpha ? ref : undefined, caption: "", frame: info.alpha ? "sticker" : "none", shadow: false });
            })();
          }}
          onPack={(item) => {
            setPanel(null);
            if (item.kind === "background") {
              void placePhoto(item.file, undefined, "full", false);
              return;
            }
            void (async () => {
              const info = await imageInfo(item.file);
              const w = 36;
              const h = clamp((w * info.ratio) / (PAGE_H / 100), 3, 90);
              stickSound();
              addBlock({ id: id(), type: "photo", x: 50 - w / 2, y: 40 - h / 2, w, h, src: item.file, cut: item.file, caption: "", frame: "sticker", shadow: false });
            })();
          }}
          onUpload={() => stickerFileRef.current?.click()}
          onText={(look) => {
            setPanel(null);
            if (look === "card") addText({ look: "card", font: "sans", size: "sm", w: 56, x: 22 });
            else if (look === "pill") addText({ look: "pill", font: "sans", size: "sm", w: 40, x: 30 });
            else addText({ font: "script", size: "lg", w: 84, x: 8, y: 8 });
          }}
        />
      ) : null}

      {panel === "contents" ? (
        <ContentsSheet
          current={page.id}
          onClose={() => setPanel(null)}
          onOpen={(pid) => {
            setPanel(null);
            if (pid !== page.id) nav.replace({ id: "editor", pageId: pid });
          }}
        />
      ) : null}

      {panel === "layers" ? (
        <LayersSheet
          blocks={page.blocks}
          selected={selected}
          onSelect={(blockId) => {
            setTool("hand");
            setSelected(blockId);
            setEditing(null);
          }}
          onMove={(blockId, where) => moveLayer(blockId, where)}
          onLock={(blockId) => {
            const b = page.blocks.find((item) => item.id === blockId);
            if (b) patchBlock(blockId, { locked: !b.locked } as Partial<PageBlock>);
          }}
          onRemove={(blockId) => removeBlock(blockId)}
          onClose={() => setPanel(null)}
        />
      ) : null}

      {panel === "inspector" && selectedBlock && ops ? <Inspector block={selectedBlock} ops={ops} onClose={() => setPanel(null)} /> : null}

      {panel === "fonts" ? (
        <FontsSheet
          onClose={() => setPanel(null)}
          onUse={(font) => {
            const target = editingBlock ?? (selectedBlock?.type === "text" ? selectedBlock : null);
            if (target) patchBlock(target.id, { font } as Partial<PageBlock>);
            else addText({ font });
            setPanel(null);
          }}
        />
      ) : null}

      {groupColors && group.length > 1 ? (
        <ColorSheet
          title={`Цвет всех выбранных текстов (${(current()?.blocks ?? []).filter((b) => group.includes(b.id) && b.type === "text").length})`}
          onPick={(c) => colorGroupTexts(group, c, "color:group")}
          onClose={() => setGroupColors(false)}
          onPipette={() => startPipette((c) => colorGroupTexts(group, c))}
        />
      ) : null}

      {penColors ? (
        <ColorSheet
          title="Цвет кисти"
          value={pen.color}
          onPick={(color) => updatePen({ color })}
          onClose={() => setPenColors(false)}
          onPipette={() => startPipette((color) => updatePen({ color }))}
        />
      ) : null}

      {panel === "help" ? (
        <HelpSheet
          title={page.title}
          questions={prompt?.questions ?? GENERIC_QUESTIONS}
          onClose={() => setPanel(null)}
          onInsert={(text) => {
            const empty = page.blocks.find((b) => b.type === "text" && !b.text.trim() && b.look !== "pill" && b.look !== "card");
            if (empty) patchBlock(empty.id, { text } as Partial<PageBlock>);
            else addBlock({ id: id(), type: "text", x: 8, y: 55, w: 84, text, font: "sans", size: "sm" });
            setPanel(null);
          }}
        />
      ) : null}

      {panel === "covers" ? (
        <Sheet title="Дизайн обложки" onClose={() => setPanel(null)} className="max-w-2xl">
          <p className="mb-3 text-sm text-muted">Выберите основу, потом всё на ней можно двигать, менять шрифт, цвет бумаги, добавлять фото и стикеры. Отменить: стрелка ↶.</p>
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
                    <PageSheet page={{ id: design.id, ...design.page }} meta={meta} editing ghosts={false} />
                  </div>
                  <span className="mt-1 block text-xs font-medium text-ink">{design.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      ) : null}

      {panel === "menu" ? (
        <Sheet title={isBack ? "Задняя сторона" : "Страница"} onClose={() => setPanel(null)}>
          {page.kind === "cover" ? (
            <div className="mb-4 grid gap-2">
              <Button className="w-full" onClick={() => setPanel("covers")}>
                <Sparkles className="size-4" /> Другой дизайн обложки
              </Button>
              <Button variant="soft" className="w-full" onClick={() => nav.replace({ id: "editor", pageId: BACK_ID })}>
                Задняя сторона и цвет корешка
              </Button>
            </div>
          ) : null}
          {!isBack && page.kind !== "cover" ? (
            <label className="mb-4 block">
              <span className="mb-1 block text-sm text-muted">Название в оглавлении</span>
              <input className="field" value={page.title} onChange={(event) => commit((p) => ({ ...p, title: event.target.value }), "title")} />
            </label>
          ) : null}
          <p className="mb-2 text-sm text-muted">Цвет страницы (любой, можно взять пипеткой)</p>
          <div className="mb-4">
            <ColorRow value={page.bg} onPick={(bg) => commit((p) => ({ ...p, bg }), "page-bg")} onReset={page.bg ? () => commit((p) => ({ ...p, bg: undefined })) : undefined} onPipette={() => startPipette((bg) => commit((p) => ({ ...p, bg })))} title="Цвет страницы" />
          </div>
          <p className="mb-2 text-sm text-muted">Бумага</p>
          <div className="mb-5 flex flex-wrap gap-2">
            {(Object.keys(PAPER) as PaperKind[]).map((paper) => (
              <button
                key={paper}
                type="button"
                onClick={() => commit((p) => ({ ...p, paper, bg: undefined }))}
                className={cn("flex items-center gap-2 rounded-full bg-white/70 py-1.5 pl-1.5 pr-3 text-sm", page.paper === paper && "ring-2 ring-night")}
              >
                <span className="size-7 rounded-full border border-line" style={{ background: PAPER[paper].bg }} />
                {PAPER[paper].label}
              </button>
            ))}
          </div>
          <div className="grid gap-2">
            <MenuRow icon={<Trash2 className="size-4" />} label={bins ? "Убрать красные корзинки с элементов" : "Показывать корзинку на каждом элементе"} onClick={() => { toggleBins(); setPanel(null); }} />
            <MenuRow icon={<ListChecks className="size-4" />} label="Содержание: перейти к главе" onClick={() => setPanel("contents")} />
            {!isBack ? <MenuRow icon={<BookOpen className="size-4" />} label="Листать книгу" onClick={() => { setPanel(null); nav.go({ id: "flip", pageId: page.id }); }} /> : null}
            {!isBack ? <MenuRow icon={<FilePlus className="size-4" />} label="Добавить страницу следом" onClick={() => { setPanel(null); addNextPage(); }} /> : null}
            {partner ? (
              <MenuRow
                icon={<ArrowLeftRight className="size-4" />}
                label={`Поменять местами с соседней «${partner.title}»`}
                onClick={() => {
                  useRod.getState().placePage(page.id, partnerAt);
                  setPanel(null);
                  toast("Страницы разворота поменялись местами");
                }}
              />
            ) : null}
            {!isBack ? <MenuRow icon={<Copy className="size-4" />} label="Сделать копию страницы" onClick={() => { const copy = duplicatePage(page.id); setPanel(null); if (copy) nav.replace({ id: "editor", pageId: copy }); }} /> : null}
            {!isBack ? (
              <div className="grid grid-cols-2 gap-2">
                <MenuRow icon={<ChevronLeft className="size-4" />} label="Раньше в книге" disabled={index <= 0} onClick={() => movePage(page.id, -1)} />
                <MenuRow icon={<ChevronRight className="size-4" />} label="Позже в книге" disabled={index >= pages.length - 1} onClick={() => movePage(page.id, 1)} />
              </div>
            ) : null}
            <MenuRow icon={<Eraser className="size-4" />} label="Убрать все рисунки со страницы" disabled={!page.blocks.some((b) => b.type === "ink") && page.strokes.length === 0} onClick={() => { commit((p) => ({ ...p, strokes: [], blocks: p.blocks.filter((b) => b.type !== "ink") })); setPanel(null); }} />
            {!isBack ? <MenuRow icon={<Trash2 className="size-4" />} label="Убрать страницу в корзину" danger onClick={toBin} /> : null}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

function Handles({ onTurn, onSize, onDelete, onLock }: { onTurn: (event: React.PointerEvent) => void; onSize: (event: React.PointerEvent) => void; onDelete: () => void; onLock: () => void }) {
  return (
    <>
      <span className="pointer-events-none absolute -inset-[5px] rounded-[6px] border-2 border-dashed border-rose" />
      <button type="button" aria-label="Повернуть" className="handle pointer-events-auto absolute -top-14 left-1/2 grid size-11 -translate-x-1/2 place-items-center rounded-full bg-white text-ink shadow-md" onPointerDown={onTurn}>
        <RotateCcw className="size-4" />
      </button>
      <span className="pointer-events-none absolute -top-3 left-1/2 h-3 w-px -translate-x-1/2 bg-rose" />
      <button type="button" aria-label="Удалить" className="pointer-events-auto absolute -right-5 -top-5 grid size-11 place-items-center rounded-full bg-rose-deep text-paper shadow-md" onPointerDown={(event) => event.stopPropagation()} onClick={onDelete}>
        <Trash2 className="size-4" />
      </button>
      <button type="button" aria-label="Заблокировать" className="pointer-events-auto absolute -left-5 -top-5 grid size-11 place-items-center rounded-full bg-white text-ink shadow-md" onPointerDown={(event) => event.stopPropagation()} onClick={onLock}>
        <Lock className="size-4" />
      </button>
      <button type="button" aria-label="Размер" className="handle pointer-events-auto absolute -bottom-9 -right-9 size-11 rounded-full border-[3px] border-rose bg-white shadow-md" onPointerDown={onSize} />
    </>
  );
}

/** Соседняя страница разворота: видна рядом, нажали, и редактируете её. */
function PartnerPage({ page, meta, width, side, onOpen }: { page: BookPage; meta: { dedicatee: string; collector: string }; width: number; side: "left" | "right"; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group relative z-0 shrink-0 text-left" style={{ width }} aria-label={`Перейти к странице «${page.title}»`}>
      <div className="book-page-shadow overflow-hidden rounded-[2px] opacity-90 transition group-hover:opacity-100">
        <PageSheet page={page} meta={meta} editing />
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 w-[8%]"
        style={{ [side === "left" ? "right" : "left"]: 0, background: `linear-gradient(${side === "left" ? "270deg" : "90deg"}, rgba(42,36,32,.18), rgba(42,36,32,0))` }}
      />
      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-night/75 px-3 py-1 text-xs text-paper transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
        Нажмите, чтобы оформлять
      </span>
    </button>
  );
}

/** Телефон лёжа: на лист остаётся слишком мало места, просим повернуть. */
function RotateHint() {
  const query = "(orientation: landscape) and (max-height: 500px)";
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  const [skip, setSkip] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  if (!wide || skip) return null;
  return (
    <div role="alertdialog" aria-label="Поверните телефон" className="fixed inset-0 z-[70] grid place-items-center bg-night/95 p-6 text-center text-paper">
      <div className="max-w-xs">
        <p className="display-title text-2xl">Поверните телефон</p>
        <p className="mt-2 text-sm text-paper/80">Страницу удобнее редактировать, когда телефон стоит вертикально: лист получается крупнее.</p>
        <button type="button" className="mt-4 min-h-11 rounded-full bg-paper px-5 text-sm font-medium text-ink" onClick={() => setSkip(true)}>
          Всё равно продолжить
        </button>
      </div>
    </div>
  );
}
