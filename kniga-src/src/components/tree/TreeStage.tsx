import { busHops, busColorIndex, foreignEntries, BUS_PALETTE } from "@/lib/tree/bus-look";
import { busIsFar, busLinkPath, busPath, pillLabel, pillPoint, pillSize, refLinkPath, spousePath, type SchemeBus } from "@/lib/tree/scheme-paths";
import { applyShifts } from "@/lib/tree/offsets";
import { useEffect, useMemo, useRef, useState } from "react";
import { branchColorOf, useBranchColors } from "@/lib/tree/branch-colors";
import { cardLine, useCardFields } from "@/lib/tree/card-fields";
import { LocateFixed, Minus, Plus, Users } from "lucide-react";
import { CameoView } from "@/components/tree/CameoView";
import { GzhelView } from "@/components/tree/GzhelView";
import { BohemeView } from "@/components/tree/BohemeView";
import { TaigaView } from "@/components/tree/TaigaView";
import { PosterView } from "@/components/tree/PosterView";
import { fitText, isDeceased, kinship, nameLines, yearsOf } from "@/lib/tree/kinship";
import { lineageUnionIds } from "@/lib/tree/lineage";
import { halfUnionIds } from "@/lib/tree/half-unions";
import { centerDecision } from "@/lib/tree/camera";
import { MAX_ZOOM, MIN_ZOOM, PLATE_GAP, PLATE_H, PLATE_W, PORTRAIT_R } from "@/lib/tree/metrics";
import type { CameoSheet } from "@/lib/tree/cameo";
import { FRAME } from "@/lib/tree/cameo";
import type { GzhelSheet } from "@/lib/tree/gzhel";
import { GZHEL_FRAME } from "@/lib/tree/gzhel";
import type { BohemeSheet } from "@/lib/tree/boheme";
import { BOHEME_FRAME } from "@/lib/tree/boheme";
import type { TaigaSheet } from "@/lib/tree/taiga";
import { TAIGA_FRAME } from "@/lib/tree/taiga";
import type { PosterSheet } from "@/lib/tree/poster";
import { relationCard, relationsFrom } from "@/lib/tree/recenter";
import { useTree, type TreeFlow } from "@/lib/tree/ui-store";
import { carvedBusPath, carvedPill, carvedSpousePath, CARVED_RX, CARVED_RY, motifs, type TreeStyle } from "@/lib/tree/styles";
import type { RefCard } from "@/lib/tree/family-layout";
import type { Person, TreeLayout, Union, UnionStatus } from "@/lib/tree/types";

/** Раскладка экрана: прежняя (`classic`, без дополнительных полей) или `family` (карточки-ссылки, дуги, входы линий). */
export type StageLayout = TreeLayout & { engine?: "classic" | "family"; groups?: { kind: "branches" | "singles"; text: string; sub: string; x: number; y: number; count: number; anchorId: string }[]; refs?: RefCard[]; refLinks?: { refId: string; of: string; x1: number; y1: number; x2: number; y2: number }[] };

/** Ниже этого масштаба карточки не читаются: тогда встаём на «Вас» в читаемом масштабе. */
const UNREADABLE_ZOOM = 0.28;
const READABLE_ZOOM = 0.6;

type Cam = { x: number; y: number; k: number };

type Props = {
  layout: StageLayout;
  people: Person[];
  unions: Union[];
  focusId: string;
  selectedId: string | null;
  /** Люди, отмеченные для схемы: на каждом кольцо. */
  marked?: ReadonlySet<string>;
  centerReq: { id: string; n: number } | null;
  fitReq: number;
  radius: number | null;
  onRadius: (radius: number | null) => void;
  onSelectPerson: (id: string) => void;
  onSelectUnion: (id: string) => void;
  onClear: () => void;
  /** Показать меня («Я») на схеме. */
  onLocate: () => void;
  /** Показать выбранного человека на схеме. */
  onJump: (id: string) => void;
  style: TreeStyle;
  onStyle: (style: TreeStyle) => void;
  /** Платные стили закрыты: по нажатию открывается покупка. */
  stylesLocked?: boolean;
  poster: PosterSheet | null;
  cameo: CameoSheet | null;
  gzhel: GzhelSheet | null;
  boheme: BohemeSheet | null;
  taiga: TaigaSheet | null;
  flow: TreeFlow;
  onFlow: (flow: TreeFlow) => void;
  /** Человека перетащили: новый полный сдвиг карточки. */
  onMovePerson?: (id: string, dx: number, dy: number) => void;
  onResetMoves?: () => void;
};

function lineColor(status: UnionStatus): string {
  if (status === "divorced") return "var(--color-divorce)";
  if (status === "widowed") return "var(--color-widow)";
  if (status === "partner") return "var(--color-gold)";
  return "var(--color-rose)";
}

function pillText(status: UnionStatus): string {
  if (status === "divorced") return "РАЗВОД";
  if (status === "widowed") return "ВДОВСТВО";
  if (status === "partner") return "СОЮЗ";
  return "БРАК";
}

function Flower({ motif }: { motif: { x: number; y: number; r: number; rot: number } }) {
  return (
    <g transform={`translate(${motif.x} ${motif.y}) rotate(${motif.rot})`} fill="#f4ecd8" opacity={0.55}>
      <circle cx={motif.r} cy={0} r={motif.r * 0.55} />
      <circle cx={-motif.r} cy={0} r={motif.r * 0.55} />
      <circle cx={0} cy={motif.r} r={motif.r * 0.55} />
      <circle cx={0} cy={-motif.r} r={motif.r * 0.55} />
      <circle r={motif.r * 0.35} />
    </g>
  );
}

function Leaf({ motif }: { motif: { x: number; y: number; r: number; rot: number } }) {
  return (
    <g transform={`translate(${motif.x} ${motif.y}) rotate(${motif.rot})`} fill="#f4ecd8" opacity={0.4}>
      <ellipse cx={0} cy={0} rx={motif.r} ry={motif.r * 0.38} />
    </g>
  );
}

export function TreeStage(props: Props) {
  // Сводные братья и сёстры: у родителя несколько союзов с детьми, детей от следующих союзов ведём пунктиром.
  const halfUnions = useMemo(() => halfUnionIds(props.unions, props.people), [props.unions, props.people]);
  const { layout: baseLayout, people, unions, focusId, selectedId, marked, centerReq, fitReq, radius, onRadius, onSelectPerson, onSelectUnion, onClear, onLocate, onJump, style, onStyle, stylesLocked, poster, cameo, gzhel, boheme, taiga, flow, onFlow, onMovePerson, onResetMoves } = props;
  // Перетаскивание карточки: пока палец на экране, линии пересчитываются на лету; сдвиг запоминается, когда палец отпущен.
  const [moveMode, setMoveMode] = useState(false);
  const [live, setLive] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const personDrag = useRef<{ id: string; sx: number; sy: number; moved: boolean } | null>(null);
  const layout = useMemo(() => (live ? applyShifts(baseLayout, unions, new Map([[live.id, { dx: live.dx, dy: live.dy }]])) : baseLayout), [baseLayout, unions, live]);
  // Только раскладка `family`: цвета соседних семей и прыжки на пересечениях. Прежняя раскладка рисуется как раньше (один цвет, без прыжков).
  const family = layout.engine === "family";
  const busLook = useMemo(() => (family ? { hops: busHops(layout.buses as SchemeBus[]), colors: busColorIndex(layout.buses as SchemeBus[]), foreign: foreignEntries(layout.buses as SchemeBus[], layout.nodes) } : null), [family, layout.buses, layout.nodes]);
  const anyMoved = people.some((person) => person.treeDx || person.treeDy);
  // Подсветка линии остаётся после закрытия карточки (карточка закрывает почти весь экран телефона) и гаснет по нажатию на пустое место схемы.
  const [litId, setLitId] = useState<string | null>(null);
  useEffect(() => {
    if (selectedId) setLitId(selectedId);
  }, [selectedId]);
  const lit = useMemo(() => (litId && people.some((person) => person.id === litId) ? lineageUnionIds(unions, litId) : null), [unions, litId, people]);
  const wrap = useRef<HTMLDivElement>(null);
  const cardFields = useCardFields();
  const branchMap = useBranchColors();
  const [cam, setCam] = useState<Cam>({ x: 40, y: 40, k: 0.45 });
  const [gesturing, setGesturing] = useState(false);
  const [hint, setHint] = useState(true);
  // Фото, которое не открылось, помечается по своему адресу, а не по человеку: когда у человека появляется другое (исправное) фото, оно показывается, а не остаются инициалы.
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const pinch = useRef<{ dist: number; k: number } | null>(null);
  const byId = new Map(people.map((p) => [p.id, p]));
  const homeId = useTree((s) => s.homeId);
  const rels = useMemo(() => relationsFrom(people, unions, focusId, homeId), [people, unions, focusId, homeId]);
  const [kinOpen, setKinOpen] = useState(false);
  // Родители, бабушки и дедушки: быстрый переход, когда в большом древе они далеко от «Я».
  const nearAncestors = (() => {
    const out: { id: string; title: string }[] = [];
    const seen = new Set<string>();
    let level = [focusId];
    for (let depth = 1; depth <= 2; depth++) {
      const next: string[] = [];
      for (const id of level) {
        const u = unions.find((x) => x.childIds.includes(id) && x.partnerIds.length > 0);
        for (const parent of u?.partnerIds ?? []) {
          if (seen.has(parent) || !byId.has(parent)) continue;
          seen.add(parent);
          next.push(parent);
          const person = byId.get(parent)!;
          out.push({ id: parent, title: `${kinship(people, unions, focusId, parent).card}: ${[person.firstName, person.lastName].filter(Boolean).join(" ")}` });
        }
      }
      level = next;
    }
    return out;
  })();

  const sheet = (() => {
    if (style === "taiga" && taiga) return { w: taiga.width, h: taiga.height };
    if (style === "boheme" && boheme) return { w: boheme.width, h: boheme.height };
    if (style === "gzhel" && gzhel) return { w: gzhel.width, h: gzhel.height };
    if (style === "cameo" && cameo) return { w: cameo.width, h: cameo.height };
    if (style === "carved" && poster) return { w: poster.width, h: poster.height };
    return { w: layout.width, h: layout.height };
  })();

  /** Нижняя граница отдаления: большое древо должно помещаться на экране целиком, а не упираться в общий минимум. */
  const minZoomNow = () => {
    const el = wrap.current;
    if (!el || sheet.w < 1 || sheet.h < 1) return MIN_ZOOM;
    const whole = Math.min((el.clientWidth - 24) / sheet.w, (el.clientHeight - 24) / sheet.h);
    return Math.min(MIN_ZOOM, Math.max(0.002, whole * 0.9));
  };

  const fit = (w = sheet.w, h = sheet.h) => {
    const el = wrap.current;
    if (!el || w < 1 || h < 1) return;
    const pad = 72;
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((el.clientWidth - pad) / w, (el.clientHeight - pad) / h)));
    // Большое древо целиком не читается (карточки мельче точки): встаём на «Вас» в читаемом масштабе, а всё древо остаётся под щипком и кнопкой «−».
    const focusNode = layout.nodes.find((n) => n.id === focusId);
    if (k < UNREADABLE_ZOOM && focusNode && style === "work") {
      const kr = READABLE_ZOOM;
      const next = { k: kr, x: el.clientWidth / 2 - focusNode.x * kr, y: el.clientHeight / 2 - focusNode.y * kr };
      autoCam.current = next;
      setCam(next);
      return;
    }
    const next = { k, x: (el.clientWidth - w * k) / 2, y: (el.clientHeight - h * k) / 2 };
    autoCam.current = next;
    setCam(next);
  };

  // Камера, которую выставила сама подгонка. Если человек потом двигал или приближал древо, размер листа (например, после правки карточки) её уже не сбрасывает: иначе после закрытия карточки вид прыгает.
  const autoCam = useRef<Cam | null>(null);
  const camNow = useRef(cam);
  camNow.current = cam;
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitReq, style]);
  useEffect(() => {
    const auto = autoCam.current;
    const c = camNow.current;
    if (auto && (Math.abs(auto.x - c.x) > 0.5 || Math.abs(auto.y - c.y) > 0.5 || Math.abs(auto.k - c.k) > 0.001)) return;
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.w, sheet.h]);

  const centerDone = useRef(0);
  useEffect(() => {
    if (!centerReq) return;
    const el = wrap.current;
    if (!el) return;
    const spot =
      (style === "carved" ? poster?.nodes : style === "cameo" ? cameo?.nodes : style === "gzhel" ? gzhel?.nodes : style === "boheme" ? boheme?.nodes : style === "taiga" ? taiga?.nodes : layout.nodes)?.find((n) => n.id === centerReq.id) ??
      layout.nodes.find((n) => n.id === centerReq.id);
    const decision = centerDecision(centerReq, centerDone.current, Boolean(spot));
    if (!decision.apply || !spot) return;
    centerDone.current = decision.lastDone;
    setCam((c) => {
      const k = Math.max(c.k, 0.5);
      return { k, x: el.clientWidth / 2 - spot.x * k, y: el.clientHeight / 2 - spot.y * k };
    });
  }, [centerReq, style, poster, cameo, gzhel, boheme, taiga, layout.nodes]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setHint(false);
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setCam((c) => {
        const next = Math.min(MAX_ZOOM, Math.max(minZoomNow(), c.k * (e.deltaY < 0 ? 1.08 : 0.92)));
        const wx = (px - c.x) / c.k;
        const wy = (py - c.y) / c.k;
        return { k: next, x: px - wx * next, y: py - wy * next };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const world = (clientX: number, clientY: number) => {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - cam.x) / cam.k, y: (clientY - rect.top - cam.y) / cam.k };
  };

  // Стили растягивают «Схему» одним общим множителем: при перетаскивании сдвиг переводим обратно в масштаб схемы.
  const styled = style === "cameo" && cameo ? { k: cameo.scale, ky: cameo.scaleY ?? cameo.scale, nodes: cameo.nodes, r: FRAME }
    : style === "gzhel" && gzhel ? { k: gzhel.scale, ky: gzhel.scaleY ?? gzhel.scale, nodes: gzhel.nodes, r: GZHEL_FRAME }
    : style === "boheme" && boheme ? { k: boheme.scale, ky: boheme.scaleY ?? boheme.scale, nodes: boheme.nodes, r: BOHEME_FRAME }
    : style === "taiga" && taiga ? { k: taiga.scale, ky: taiga.scaleY ?? taiga.scale, nodes: taiga.nodes, r: TAIGA_FRAME }
    : null;

  const hit = (x: number, y: number): { kind: "person" | "union" | "ref"; id: string } | null => {
    const nodes =
      style === "carved" && poster
        ? poster.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, r: Math.max(36, n.w / 2) }))
        : style === "cameo" && cameo
          ? cameo.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, r: FRAME }))
          : style === "gzhel" && gzhel
            ? gzhel.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, r: GZHEL_FRAME }))
            : style === "boheme" && boheme
              ? boheme.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, r: BOHEME_FRAME }))
              : style === "taiga" && taiga
                ? taiga.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, r: TAIGA_FRAME }))
                : layout.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, r: PORTRAIT_R + 8 }));
    for (const node of nodes) {
      const dx = x - node.x;
      const dy = y - node.y;
      if (dx * dx + dy * dy <= node.r * node.r) return { kind: "person", id: node.id };
      if (style === "work" && x >= node.x - PLATE_W / 2 && x <= node.x + PLATE_W / 2 && y >= node.y + PORTRAIT_R && y <= node.y + PORTRAIT_R + PLATE_GAP + PLATE_H) return { kind: "person", id: node.id };
    }
    const themeRefs = style === "cameo" ? cameo?.refs : style === "gzhel" ? gzhel?.refs : style === "boheme" ? boheme?.refs : style === "taiga" ? taiga?.refs : undefined;
    const themeR = style === "cameo" ? FRAME : style === "gzhel" ? GZHEL_FRAME : style === "boheme" ? BOHEME_FRAME : TAIGA_FRAME;
    for (const r of themeRefs ?? []) if ((x - r.x) ** 2 + (y - r.y) ** 2 <= (themeR * 0.62 + 6) ** 2) return { kind: "ref", id: r.of };
    if (style === "work") {
      for (const r of layout.refs ?? []) {
        const inCircle = (x - r.x) ** 2 + (y - r.y) ** 2 <= (PORTRAIT_R + 8) ** 2;
        const inPlate = x >= r.x - PLATE_W / 2 && x <= r.x + PLATE_W / 2 && y >= r.y + PORTRAIT_R && y <= r.y + PORTRAIT_R + PLATE_GAP + PLATE_H;
        if (inCircle || inPlate) return { kind: "ref", id: r.of };
      }
    }
    if (style === "work" || style === "carved") {
      for (const link of layout.spouses) {
        const p = style === "carved" ? carvedPill(link) : pillPoint(link);
        const dx = x - p.x;
        const dy = y - p.y;
        if (dx * dx + dy * dy < 28 * 28) return { kind: "union", id: link.unionId };
      }
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest?.("[data-ui], button, a, input, textarea")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setGesturing(true);
    setHint(false);
    if (moveMode && (style === "work" || styled) && onMovePerson && pointers.current.size === 1) {
      const w = world(e.clientX, e.clientY);
      const found = hit(w.x, w.y);
      if (found?.kind === "person") {
        personDrag.current = { id: found.id, sx: w.x, sy: w.y, moved: false };
        drag.current = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
        return;
      }
    }
    if (pointers.current.size === 1) drag.current = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
    // Второй палец: это щипок, а не нажатие. Иначе после щипка последний поднятый палец открывал карточку случайного человека.
    else if (drag.current) drag.current.moved = true;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      if (drag.current) drag.current.moved = true;
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      if (!pinch.current || pinch.current.dist < 8) pinch.current = { dist, k: cam.k };
      // Пальцы почти в одной точке или счёт сбился: ничего не делаем, иначе масштаб станет NaN и экран пустым.
      if (pinch.current.dist < 8) return;
      const ratio = dist / pinch.current.dist;
      const next = Math.min(MAX_ZOOM, Math.max(minZoomNow(), pinch.current.k * ratio));
      if (!Number.isFinite(next)) return;
      const mid = { x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2 };
      const rect = wrap.current?.getBoundingClientRect();
      if (!rect) return;
      const px = mid.x - rect.left;
      const py = mid.y - rect.top;
      setCam((c) => {
        const wx = (px - c.x) / c.k;
        const wy = (py - c.y) / c.k;
        const out = { k: next, x: px - wx * next, y: py - wy * next };
        return Number.isFinite(out.x) && Number.isFinite(out.y) ? out : c;
      });
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.moved = true;
    const pd = personDrag.current;
    if (pd) {
      if (!d.moved) return;
      pd.moved = true;
      const w = world(e.clientX, e.clientY);
      const at = baseLayout.nodes.find((n) => n.id === pd.id);
      const k = styled ? Math.max(0.2, styled.k) : 1;
      const ky = styled ? Math.max(0.2, styled.ky) : 1;
      const dx = at ? Math.max((w.x - pd.sx) / k, 50 - at.x) : (w.x - pd.sx) / k;
      const dy = at ? Math.max((w.y - pd.sy) / ky, 50 - at.y) : (w.y - pd.sy) / ky;
      setLive({ id: pd.id, dx, dy });
      return;
    }
    setCam((c) => ({ ...c, x: d.cx + (e.clientX - d.x), y: d.cy + (e.clientY - d.y) }));
  };

  const onPointerUp = (e: React.PointerEvent, cancelled = false) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    // Остался один палец после щипка: тянуть дальше от его нынешней точки, а не от начала первого касания, иначе вид прыгает на пол-экрана.
    if (pointers.current.size === 1) {
      const rest = [...pointers.current.values()][0]!;
      const c = camNow.current;
      drag.current = { x: rest.x, y: rest.y, cx: c.x, cy: c.y, moved: true };
    }
    if (pointers.current.size === 0) {
      setGesturing(false);
      const pd = personDrag.current;
      personDrag.current = null;
      if (pd?.moved && !cancelled) {
        const l = live;
        const person = people.find((x) => x.id === pd.id);
        if (l && l.id === pd.id && person && onMovePerson) onMovePerson(pd.id, (person.treeDx ?? 0) + l.dx, (person.treeDy ?? 0) + l.dy);
      }
      setLive(null);
      const d = drag.current;
      drag.current = null;
      if (pd?.moved) return;
      // Прерванное касание (система забрала жест) выбором человека не считается.
      if (d && !d.moved && !cancelled) {
        const p = world(e.clientX, e.clientY);
        const found = hit(p.x, p.y);
        if (found?.kind === "person") onSelectPerson(found.id);
        else if (found?.kind === "ref") onJump(found.id);
        else if (found?.kind === "union") onSelectUnion(found.id);
        else {
          setLitId(null);
          onClear();
        }
      }
    }
  };

  const zoomBy = (factor: number) => {
    const el = wrap.current;
    if (!el) return;
    const px = el.clientWidth / 2;
    const py = el.clientHeight / 2;
    setCam((c) => {
      const next = Math.min(MAX_ZOOM, Math.max(minZoomNow(), c.k * factor));
      const wx = (px - c.x) / c.k;
      const wy = (py - c.y) / c.k;
      return { k: next, x: px - wx * next, y: py - wy * next };
    });
  };

  return (
    <>
      <div
        ref={wrap}
        className={`tree-viewport absolute inset-0 overflow-hidden${style === "carved" ? " is-carved" : ""}${style === "cameo" ? " is-cameo" : ""}${style === "gzhel" ? " is-gzhel" : ""}${style === "boheme" ? " is-boheme" : ""}${style === "taiga" ? " is-taiga" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => onPointerUp(e, true)}
      >
        <div className={`cam absolute left-0 top-0${gesturing ? " is-gesturing" : ""}`} style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }}>
          {style === "taiga" && taiga ? (
            <TaigaView sheet={taiga} people={people} unions={unions} focusId={focusId} homeId={homeId} selectedId={selectedId} marked={marked} />
          ) : style === "boheme" && boheme ? (
            <BohemeView sheet={boheme} people={people} unions={unions} focusId={focusId} homeId={homeId} selectedId={selectedId} marked={marked} />
          ) : style === "gzhel" && gzhel ? (
            <GzhelView sheet={gzhel} people={people} unions={unions} focusId={focusId} homeId={homeId} selectedId={selectedId} marked={marked} />
          ) : style === "cameo" && cameo ? (
            <CameoView sheet={cameo} people={people} unions={unions} focusId={focusId} homeId={homeId} selectedId={selectedId} marked={marked} />
          ) : style === "carved" && poster ? (
            <PosterView poster={poster} people={people} unions={unions} focusId={focusId} selectedId={selectedId} marked={marked} />
          ) : (
            <svg width={layout.width} height={layout.height} role="img" aria-label="Родословное древо">
              <g fill="none" stroke="var(--color-blood)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                {layout.buses.map((bus, i) => (
                  <path key={`${bus.unionId}:${i}`} d={style === "carved" ? carvedBusPath(bus) : busPath(bus, busLook?.hops.get(i))} stroke={busLook ? BUS_PALETTE[busLook.colors[i] ?? 0] : undefined} strokeDasharray={halfUnions.has(bus.unionId) ? "7 6" : undefined} />
                ))}
              </g>
              <g fill="none" stroke="var(--color-blood)" strokeWidth={1.6} strokeOpacity={0.4} strokeDasharray="2 9" strokeLinecap="round">
                {style === "carved" ? null : layout.buses.map((bus, i) => (busIsFar(bus) ? <path key={`far-${bus.unionId}:${i}`} d={busLinkPath(bus)} stroke={busLook ? BUS_PALETTE[busLook.colors[i] ?? 0] : undefined} {...(busLook ? { strokeWidth: 2.2, strokeOpacity: 0.85, strokeDasharray: "4 7" } : {})} /> : null))}
              </g>
              {layout.spouses.map((link) => (
                <path key={link.unionId} d={style === "carved" ? carvedSpousePath(link) : spousePath(link)} fill="none" stroke={lineColor(link.status)} strokeWidth={2.4} strokeLinecap="round" strokeDasharray={link.status === "divorced" ? "6 7" : undefined} />
              ))}
              {layout.refLinks?.length ? (
                // Карточка-ссылка: тот же человек, показанный рядом с супругом. Пунктир ведёт к его основной карточке.
                <g fill="none" stroke="var(--color-gold)" strokeWidth={2.2} strokeDasharray="9 7" strokeLinecap="round" opacity={0.9}>
                  {layout.refLinks.map((l) => (
                    <path key={l.refId} d={refLinkPath(l)} />
                  ))}
                </g>
              ) : null}
              {lit && lit.size > 0 ? (
                // Выбранный человек: подсвечены его линия родства вверх (родители, братья и сёстры, предки), его браки и потомки.
                <g fill="none" stroke="var(--color-gold)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} pointerEvents="none">
                  {layout.buses.filter((bus) => lit.has(bus.unionId)).map((bus) => (
                    <path key={`lit-${bus.unionId}`} d={style === "carved" ? carvedBusPath(bus) : busPath(bus)} />
                  ))}
                  {layout.spouses.filter((link) => lit.has(link.unionId)).map((link) => (
                    <path key={`lit-s-${link.unionId}`} d={style === "carved" ? carvedSpousePath(link) : spousePath(link)} />
                  ))}
                </g>
              ) : null}
              {layout.labels.map((label) => (
                <text key={label.gen} x={18} y={label.y} fill="var(--color-label)" fontFamily="var(--font-sans)" fontSize={13} fontWeight={600} dominantBaseline="middle">
                  {label.gen === layout.focusGen && focusId !== homeId ? "Поколение центра" : label.text}
                </text>
              ))}
              {layout.groups?.map((g) => (
                <g key={g.kind} pointerEvents="none">
                  <text x={g.x} y={g.y - 16} fill="var(--color-label)" fontFamily="var(--font-sans)" fontSize={28} fontWeight={700} dominantBaseline="middle">{g.text}</text>
                  <text x={g.x} y={g.y + 14} fill="var(--color-label)" fontFamily="var(--font-sans)" fontSize={17} opacity={0.85} dominantBaseline="middle">{g.sub}</text>
                </g>
              ))}
              {layout.nodes.map((node) => {
                const person = byId.get(node.id);
                if (!person) return null;
                const branch = cardFields.branches ? branchColorOf(people, unions, person.id, branchMap) : undefined;
                const role = cardFields.role && rels.get(person.id) ? relationCard(rels.get(person.id)!) : "";
                const top = node.y + PORTRAIT_R + PLATE_GAP;
                const initials = `${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`.toUpperCase();
                const roleSize = role.length > 26 ? 8.5 : role.length > 18 ? 9.5 : 11;
                return (
                  <g key={node.id}>
                    {(selectedId === person.id || focusId === person.id || marked?.has(person.id)) && <circle cx={node.x} cy={node.y} r={PORTRAIT_R + 6} fill="none" stroke="var(--color-gold)" strokeWidth={marked?.has(person.id) ? 4 : selectedId === person.id ? 2.5 : 1.6} />}
                    {marked?.has(person.id) && (
                      <g>
                        <circle cx={node.x + PORTRAIT_R * 0.75} cy={node.y - PORTRAIT_R * 0.75} r={13} fill="var(--color-gold)" />
                        <path d={`M${node.x + PORTRAIT_R * 0.75 - 6} ${node.y - PORTRAIT_R * 0.75} l4 4.5 l8 -9`} fill="none" stroke="#1a1612" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
                      </g>
                    )}
                    {busLook?.foreign.has(node.id) ? (
                      // Вход издалека рядом с детьми другой пары: портрет обведён цветом своей семьи, на входе точка того же цвета.
                      <g>
                        <title>Родители этого человека из другой семьи: линия цвета обводки идёт к ним издалека, соседи не его братья и сёстры.</title>
                        <circle cx={node.x} cy={node.y} r={PORTRAIT_R + 8} fill="none" stroke={BUS_PALETTE[busLook.colors[busLook.foreign.get(node.id)!] ?? 0]} strokeWidth={4.5} />
                        <circle cx={node.x} cy={node.y - PORTRAIT_R - 8} r={5.5} fill={BUS_PALETTE[busLook.colors[busLook.foreign.get(node.id)!] ?? 0]} />
                      </g>
                    ) : null}
                    <circle cx={node.x} cy={node.y} r={PORTRAIT_R} fill="#d7c3a4" />
                    {!person.photo || broken[person.photo] ? (
                      <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="middle" fill="var(--color-ink)" fontFamily="var(--font-serif)" fontSize={26}>
                        {initials}
                      </text>
                    ) : null}
                    <circle cx={node.x} cy={node.y} r={PORTRAIT_R} fill="none" stroke={branch ?? "var(--color-ring)"} strokeWidth={branch ? 5 : 3} opacity={isDeceased(person) ? 0.8 : 1} />
                    {homeId === person.id && (
                      <g transform={`translate(${node.x + 30} ${node.y - 32})`}>
                        <circle r={12} fill="var(--color-gold)" />
                        <text textAnchor="middle" dominantBaseline="middle" fill="var(--color-ink)" fontFamily="var(--font-sans)" fontSize={11} fontWeight={700}>
                          я
                        </text>
                      </g>
                    )}
                    {layout.detached?.includes(person.id) && (
                      <g transform={`translate(${node.x - 32} ${node.y - 32})`}>
                        <title>Родители этого человека стоят в другом месте схемы. Нажмите на человека: в карточке есть переход к родителям.</title>
                        <circle r={12} fill="var(--color-chip)" stroke="var(--color-gold)" strokeWidth={1.5} />
                        <text textAnchor="middle" dominantBaseline="middle" fill="var(--color-gold)" fontFamily="var(--font-sans)" fontSize={14} fontWeight={700}>
                          ↑
                        </text>
                      </g>
                    )}
                    <rect x={node.x - PLATE_W / 2} y={top} width={PLATE_W} height={PLATE_H} rx={14} fill="#f6f1e7" stroke={branch} strokeWidth={branch ? 3 : undefined} />
                    {(() => {
                      const lines = nameLines(person);
                      const a = fitText(lines.top, PLATE_W - 14, 15);
                      const b = lines.bottom ? fitText(lines.bottom, PLATE_W - 14, 12.5, 8.5) : null;
                      return (
                        <>
                          <text x={node.x} y={top + 18} textAnchor="middle" fill="var(--color-ink)" fontFamily="var(--font-serif)" fontSize={a.size} fontWeight={700} textLength={a.textLength} lengthAdjust="spacingAndGlyphs">
                            {a.text}
                          </text>
                          {b ? (
                            <text x={node.x} y={top + 33} textAnchor="middle" fill="var(--color-ink)" fontFamily="var(--font-serif)" fontSize={b.size} textLength={b.textLength} lengthAdjust="spacingAndGlyphs">
                              {b.text}
                            </text>
                          ) : null}
                        </>
                      );
                    })()}
                    <text x={node.x} y={top + 49} textAnchor="middle" fill="var(--color-role)" fontFamily="var(--font-sans)" fontSize={roleSize - 0.5} fontWeight={700}>
                      {role}
                    </text>
                    <text x={node.x} y={top + 64} textAnchor="middle" fill="var(--color-muted)" fontFamily="var(--font-sans)" fontSize={10}>
                      {cardLine(person, yearsOf(person), cardFields)}
                    </text>
                  </g>
                );
              })}
              {layout.refs?.map((r) => {
                const person = byId.get(r.of);
                if (!person) return null;
                const lines = nameLines(person);
                const top = r.y + PORTRAIT_R + PLATE_GAP;
                const a = fitText(lines.top, PLATE_W - 14, 15);
                return (
                  <g key={r.id} opacity={0.85}>
                    <title>Это ссылка на человека, чья основная карточка стоит в другом месте схемы. Нажмите, чтобы перейти к ней.</title>
                    <circle cx={r.x} cy={r.y} r={PORTRAIT_R} fill="var(--color-chip)" stroke="var(--color-gold)" strokeWidth={3} strokeDasharray="8 6" />
                    <text x={r.x} y={r.y} textAnchor="middle" dominantBaseline="middle" fill="var(--color-gold)" fontFamily="var(--font-sans)" fontSize={30} fontWeight={700}>
                      ↗
                    </text>
                    <rect x={r.x - PLATE_W / 2} y={top} width={PLATE_W} height={PLATE_H} rx={14} fill="#f6f1e7" stroke="var(--color-gold)" strokeWidth={2.5} strokeDasharray="8 6" />
                    <text x={r.x} y={top + 22} textAnchor="middle" fill="var(--color-ink)" fontFamily="var(--font-serif)" fontSize={a.size} fontWeight={700} textLength={a.textLength} lengthAdjust="spacingAndGlyphs">
                      {a.text}
                    </text>
                    <text x={r.x} y={top + 44} textAnchor="middle" fill="var(--color-muted)" fontFamily="var(--font-sans)" fontSize={11}>
                      ссылка на карточку
                    </text>
                  </g>
                );
              })}
              {layout.spouses.map((link) => {
                const p = pillPoint(link);
                const word = pillText(link.status);
                const text = pillLabel(word, link);
                const w = pillSize(link.status, text !== word).w;
                return (
                  <g key={`pill-${link.unionId}`} transform={`translate(${p.x} ${p.y})`}>
                    <rect x={-w / 2} y={-12} width={w} height={24} rx={12} fill="var(--color-chip)" stroke={lineColor(link.status)} />
                    <text y={1} textAnchor="middle" dominantBaseline="middle" fill={lineColor(link.status)} fontFamily="var(--font-sans)" fontSize={10} fontWeight={700}>
                      {text}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
          {style === "work" &&
            layout.nodes.map((node) => {
              const person = byId.get(node.id);
              if (!person?.photo || broken[person.photo]) return null;
              return (
                <img
                  key={person.id}
                  src={person.photo}
                  alt=""
                  className="pointer-events-none absolute rounded-full object-cover"
                  style={{ left: node.x - PORTRAIT_R, top: node.y - PORTRAIT_R, width: PORTRAIT_R * 2, height: PORTRAIT_R * 2 }}
                  onError={() => setBroken((s) => ({ ...s, [person.photo]: true }))}
                />
              );
            })}
          {styled && live ? (() => {
            const at = styled.nodes.find((n) => n.id === live.id);
            if (!at) return null;
            const r = styled.r;
            return (
              <div
                className="pointer-events-none absolute rounded-full border-[3px] border-[var(--color-gold)] bg-[var(--color-gold)]/20"
                style={{ left: at.x + live.dx * styled.k - r, top: at.y + live.dy * styled.ky - r, width: r * 2, height: r * 2 }}
              />
            );
          })() : null}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-20 flex flex-col items-center gap-2 px-2 sm:px-3">
        {hint && (
          <p className="pointer-events-none max-w-full rounded-full bg-chip px-4 py-1.5 text-center text-xs text-chip-fg">Двигайте пальцем. Двумя пальцами: крупнее или мельче</p>
        )}
        <div className="flex max-w-full flex-wrap items-center justify-center gap-1 rounded-full border border-chip-line bg-chip p-1 backdrop-blur-md" role="group" aria-label="Направление древа">
          <button type="button" aria-pressed={flow === "down"} className={`min-h-11 rounded-full px-3 text-sm font-semibold ${flow === "down" ? "bg-gold text-ink" : "text-chip-fg"}`} onClick={() => onFlow("down")}>
            Сверху вниз
          </button>
          <button type="button" aria-pressed={flow === "up"} className={`min-h-11 rounded-full px-3 text-sm font-semibold ${flow === "up" ? "bg-gold text-ink" : "text-chip-fg"}`} onClick={() => onFlow("up")}>
            Снизу вверх
          </button>
          {onMovePerson ? (
            <button type="button" aria-pressed={moveMode} className={`min-h-11 rounded-full px-3 text-sm font-semibold ${moveMode ? "bg-gold text-ink" : "text-chip-fg"}`} onClick={() => setMoveMode((v) => !v)}>
              {moveMode ? "Готово" : "Переместить"}
            </button>
          ) : null}
        </div>
        {moveMode ? (
          <p className="max-w-full rounded-full bg-chip px-4 py-1.5 text-center text-xs text-chip-fg">
            Тяните карточку пальцем, линии потянутся за ней.{anyMoved && onResetMoves ? " " : ""}
            {anyMoved && onResetMoves ? (
              <button type="button" className="font-semibold underline" onClick={onResetMoves}>
                Вернуть всех на места
              </button>
            ) : null}
          </p>
        ) : null}
        <div className="flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-full border border-chip-line bg-chip p-1 backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(["work", "cameo", "gzhel", "boheme", "taiga"] as const).map((id) => (
            <button key={id} type="button" aria-pressed={style === id} className={`min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold ${style === id ? "bg-gold text-ink" : "text-chip-fg"} ${stylesLocked && id !== "work" ? "opacity-80" : ""}`} onClick={() => onStyle(id)}>
              {stylesLocked && id !== "work" ? "🔒 " : ""}{id === "work" ? "Схема" : id === "cameo" ? "Камея" : id === "gzhel" ? "Гжель" : id === "boheme" ? "Богема" : "Тайга"}
            </button>
          ))}
          <span className="mx-1 inline h-6 w-px shrink-0 bg-chip-line" />
          {([2, 3, 4, null] as const).map((value) => {
            const on = radius === value;
            return (
              <button key={value ?? "all"} type="button" aria-pressed={on} className={`min-h-11 min-w-11 shrink-0 rounded-full px-3 text-sm font-semibold ${on ? "bg-gold text-ink" : "text-chip-fg"}`} onClick={() => onRadius(value)}>
                {value == null ? "Все" : value}
              </button>
            );
          })}
        </div>
      </div>
      {kinOpen && nearAncestors.length > 0 && (
        <div className="absolute right-16 bottom-48 z-30 grid max-h-[50vh] w-[min(18rem,calc(100vw-5rem))] gap-1 overflow-y-auto rounded-2xl border border-chip-line bg-chip p-1 shadow-lg backdrop-blur-md">
          {nearAncestors.map((item) => (
            <button
              key={item.id}
              type="button"
              className="rounded-xl px-3 py-2 text-left text-sm text-chip-fg hover:bg-gold hover:text-ink"
              onClick={() => {
                setKinOpen(false);
                onJump(item.id);
              }}
            >
              {item.title}
            </button>
          ))}
        </div>
      )}
      <div className="absolute right-2 bottom-36 z-20 flex flex-col gap-2">
        {nearAncestors.length > 0 && (
          <button type="button" className="grid size-11 place-items-center rounded-full border border-chip-line bg-chip text-chip-fg shadow-md backdrop-blur-md" aria-label="Мои родители, бабушки и дедушки" title="Родители, бабушки и дедушки" aria-expanded={kinOpen} onClick={() => setKinOpen((v) => !v)}>
            <Users className="size-5" aria-hidden />
          </button>
        )}
        <button type="button" className="grid size-11 place-items-center rounded-full border border-gold bg-gold text-ink shadow-md" aria-label="Ко мне: показать меня на схеме" title="Ко мне" onClick={onLocate}>
          <LocateFixed className="size-5" aria-hidden />
        </button>
        <button type="button" className="grid size-11 place-items-center rounded-full border border-chip-line bg-chip text-chip-fg backdrop-blur-md" aria-label="Приблизить" onClick={() => zoomBy(1.18)}>
          <Plus className="size-4" />
        </button>
        <button type="button" className="grid size-11 place-items-center rounded-full border border-chip-line bg-chip text-chip-fg backdrop-blur-md" aria-label="Отдалить" onClick={() => zoomBy(0.85)}>
          <Minus className="size-4" />
        </button>
      </div>
    </>
  );
}
