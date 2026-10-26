import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { CameoView } from "@/components/tree/CameoView";
import { GzhelView } from "@/components/tree/GzhelView";
import { BohemeView } from "@/components/tree/BohemeView";
import { TaigaView } from "@/components/tree/TaigaView";
import { PosterView } from "@/components/tree/PosterView";
import { displayName, isDeceased, kinship, yearsOf } from "@/lib/tree/kinship";
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
import type { TreeFlow } from "@/lib/tree/ui-store";
import { carvedBusPath, carvedPill, carvedSpousePath, CARVED_RX, CARVED_RY, motifs, type TreeStyle } from "@/lib/tree/styles";
import type { Person, TreeLayout, Union, UnionStatus } from "@/lib/tree/types";

type Cam = { x: number; y: number; k: number };

type Props = {
  layout: TreeLayout;
  people: Person[];
  unions: Union[];
  focusId: string;
  selectedId: string | null;
  centerReq: { id: string; n: number } | null;
  fitReq: number;
  radius: number | null;
  onRadius: (radius: number | null) => void;
  onSelectPerson: (id: string) => void;
  onSelectUnion: (id: string) => void;
  onClear: () => void;
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

function busPath(bus: TreeLayout["buses"][number]): string {
  const parts: string[] = [];
  const min = bus.xs[0];
  const max = bus.xs[bus.xs.length - 1];
  if (bus.fromX != null && bus.fromY != null && min != null && max != null) {
    parts.push(`M ${bus.fromX} ${bus.fromY} V ${bus.busY}`);
    if (bus.fromX < min - 1) parts.push(`M ${bus.fromX} ${bus.busY} H ${min}`);
    else if (bus.fromX > max + 1) parts.push(`M ${bus.fromX} ${bus.busY} H ${max}`);
  }
  if (min != null && max != null && bus.xs.length > 1) parts.push(`M ${min} ${bus.busY} H ${max}`);
  for (const x of bus.xs) parts.push(`M ${x} ${bus.busY} V ${bus.childTop}`);
  return parts.join(" ");
}

function spousePath(link: TreeLayout["spouses"][number]): string {
  const dir = Math.sign(link.x2 - link.x1) || 1;
  const x1 = link.x1 + dir * (PORTRAIT_R + 2);
  const x2 = link.x2 - dir * (PORTRAIT_R + 2);
  if (!link.curved) return `M ${x1} ${link.y1} H ${x2}`;
  const mx = (link.x1 + link.x2) / 2;
  const my = Math.min(link.y1, link.y2) - 58;
  return `M ${x1} ${link.y1} Q ${mx} ${my} ${x2} ${link.y2}`;
}

function pillPoint(link: TreeLayout["spouses"][number]): { x: number; y: number } {
  if (!link.curved) return { x: (link.x1 + link.x2) / 2, y: link.y1 };
  const mx = (link.x1 + link.x2) / 2;
  const my = Math.min(link.y1, link.y2) - 58;
  return { x: mx, y: 0.25 * link.y1 + 0.5 * my + 0.25 * link.y2 };
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
  const { layout, people, unions, focusId, selectedId, centerReq, fitReq, radius, onRadius, onSelectPerson, onSelectUnion, onClear, style, onStyle, stylesLocked, poster, cameo, gzhel, boheme, taiga, flow, onFlow } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState<Cam>({ x: 40, y: 40, k: 0.45 });
  const [gesturing, setGesturing] = useState(false);
  const [hint, setHint] = useState(true);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const pinch = useRef<{ dist: number; k: number } | null>(null);
  const byId = new Map(people.map((p) => [p.id, p]));

  const sheet = (() => {
    if (style === "taiga" && taiga) return { w: taiga.width, h: taiga.height };
    if (style === "boheme" && boheme) return { w: boheme.width, h: boheme.height };
    if (style === "gzhel" && gzhel) return { w: gzhel.width, h: gzhel.height };
    if (style === "cameo" && cameo) return { w: cameo.width, h: cameo.height };
    if (style === "carved" && poster) return { w: poster.width, h: poster.height };
    return { w: layout.width, h: layout.height };
  })();

  const fit = (w = sheet.w, h = sheet.h) => {
    const el = wrap.current;
    if (!el || w < 1 || h < 1) return;
    const pad = 72;
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((el.clientWidth - pad) / w, (el.clientHeight - pad) / h)));
    setCam({ k, x: (el.clientWidth - w * k) / 2, y: (el.clientHeight - h * k) / 2 });
  };

  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitReq, style, sheet.w, sheet.h]);

  useEffect(() => {
    if (!centerReq) return;
    const el = wrap.current;
    if (!el) return;
    const spot =
      (style === "carved" ? poster?.nodes : style === "cameo" ? cameo?.nodes : style === "gzhel" ? gzhel?.nodes : style === "boheme" ? boheme?.nodes : style === "taiga" ? taiga?.nodes : layout.nodes)?.find((n) => n.id === centerReq.id) ??
      layout.nodes.find((n) => n.id === centerReq.id);
    if (!spot) return;
    setCam((c) => ({ ...c, x: el.clientWidth / 2 - spot.x * c.k, y: el.clientHeight / 2 - spot.y * c.k }));
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
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.k * (e.deltaY < 0 ? 1.08 : 0.92)));
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

  const hit = (x: number, y: number): { kind: "person" | "union"; id: string } | null => {
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
    if (pointers.current.size === 1) drag.current = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      if (!pinch.current) pinch.current = { dist, k: cam.k };
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinch.current.k * (dist / pinch.current.dist)));
      const mid = { x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2 };
      const rect = wrap.current?.getBoundingClientRect();
      if (!rect) return;
      const px = mid.x - rect.left;
      const py = mid.y - rect.top;
      setCam((c) => {
        const wx = (px - c.x) / c.k;
        const wy = (py - c.y) / c.k;
        return { k: next, x: px - wx * next, y: py - wy * next };
      });
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.moved = true;
    setCam((c) => ({ ...c, x: d.cx + (e.clientX - d.x), y: d.cy + (e.clientY - d.y) }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      setGesturing(false);
      const d = drag.current;
      drag.current = null;
      if (d && !d.moved) {
        const p = world(e.clientX, e.clientY);
        const found = hit(p.x, p.y);
        if (found?.kind === "person") onSelectPerson(found.id);
        else if (found?.kind === "union") onSelectUnion(found.id);
        else onClear();
      }
    }
  };

  const zoomBy = (factor: number) => {
    const el = wrap.current;
    if (!el) return;
    const px = el.clientWidth / 2;
    const py = el.clientHeight / 2;
    setCam((c) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.k * factor));
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
        onPointerCancel={onPointerUp}
      >
        <div className={`cam absolute left-0 top-0${gesturing ? " is-gesturing" : ""}`} style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }}>
          {style === "taiga" && taiga ? (
            <TaigaView sheet={taiga} people={people} unions={unions} focusId={focusId} selectedId={selectedId} />
          ) : style === "boheme" && boheme ? (
            <BohemeView sheet={boheme} people={people} unions={unions} focusId={focusId} selectedId={selectedId} />
          ) : style === "gzhel" && gzhel ? (
            <GzhelView sheet={gzhel} people={people} unions={unions} focusId={focusId} selectedId={selectedId} />
          ) : style === "cameo" && cameo ? (
            <CameoView sheet={cameo} people={people} unions={unions} focusId={focusId} selectedId={selectedId} />
          ) : style === "carved" && poster ? (
            <PosterView poster={poster} people={people} unions={unions} focusId={focusId} selectedId={selectedId} />
          ) : (
            <svg width={layout.width} height={layout.height} role="img" aria-label="Родословное древо">
              <g fill="none" stroke="var(--color-blood)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                {layout.buses.map((bus) => (
                  <path key={bus.unionId} d={style === "carved" ? carvedBusPath(bus) : busPath(bus)} />
                ))}
              </g>
              {layout.spouses.map((link) => (
                <path key={link.unionId} d={style === "carved" ? carvedSpousePath(link) : spousePath(link)} fill="none" stroke={lineColor(link.status)} strokeWidth={2.4} strokeLinecap="round" strokeDasharray={link.status === "divorced" ? "6 7" : undefined} />
              ))}
              {layout.labels.map((label) => (
                <text key={label.gen} x={18} y={label.y} fill="var(--color-label)" fontFamily="var(--font-sans)" fontSize={13} fontWeight={600} dominantBaseline="middle">
                  {label.text}
                </text>
              ))}
              {layout.nodes.map((node) => {
                const person = byId.get(node.id);
                if (!person) return null;
                const role = kinship(people, unions, focusId, person.id).card;
                const top = node.y + PORTRAIT_R + PLATE_GAP;
                const initials = `${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`.toUpperCase();
                const roleSize = role.length > 26 ? 8.5 : role.length > 18 ? 9.5 : 11;
                return (
                  <g key={node.id}>
                    {(selectedId === person.id || focusId === person.id) && <circle cx={node.x} cy={node.y} r={PORTRAIT_R + 6} fill="none" stroke="var(--color-gold)" strokeWidth={selectedId === person.id ? 2.5 : 1.6} />}
                    <circle cx={node.x} cy={node.y} r={PORTRAIT_R} fill="#d7c3a4" />
                    {!person.photo || broken[person.id] ? (
                      <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="middle" fill="var(--color-ink)" fontFamily="var(--font-serif)" fontSize={26}>
                        {initials}
                      </text>
                    ) : null}
                    <circle cx={node.x} cy={node.y} r={PORTRAIT_R} fill="none" stroke="var(--color-ring)" strokeWidth={3} opacity={isDeceased(person) ? 0.8 : 1} />
                    {focusId === person.id && (
                      <g transform={`translate(${node.x + 30} ${node.y - 32})`}>
                        <circle r={12} fill="var(--color-gold)" />
                        <text textAnchor="middle" dominantBaseline="middle" fill="var(--color-ink)" fontFamily="var(--font-sans)" fontSize={11} fontWeight={700}>
                          я
                        </text>
                      </g>
                    )}
                    <rect x={node.x - PLATE_W / 2} y={top} width={PLATE_W} height={PLATE_H} rx={14} fill="#f6f1e7" />
                    <text x={node.x} y={top + 22} textAnchor="middle" fill="var(--color-ink)" fontFamily="var(--font-serif)" fontSize={16} fontWeight={600}>
                      {displayName(person)}
                    </text>
                    <text x={node.x} y={top + 40} textAnchor="middle" fill="var(--color-role)" fontFamily="var(--font-sans)" fontSize={roleSize} fontWeight={700}>
                      {role}
                    </text>
                    <text x={node.x} y={top + 58} textAnchor="middle" fill="var(--color-muted)" fontFamily="var(--font-sans)" fontSize={11}>
                      {yearsOf(person)}
                    </text>
                  </g>
                );
              })}
              {layout.spouses.map((link) => {
                const p = pillPoint(link);
                const text = pillText(link.status);
                const w = text.length > 7 ? 112 : text.length > 4 ? 88 : 72;
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
              if (!person?.photo || broken[person.id]) return null;
              return (
                <img
                  key={person.id}
                  src={person.photo}
                  alt=""
                  className="pointer-events-none absolute rounded-full object-cover"
                  style={{ left: node.x - PORTRAIT_R, top: node.y - PORTRAIT_R, width: PORTRAIT_R * 2, height: PORTRAIT_R * 2 }}
                  onError={() => setBroken((s) => ({ ...s, [person.id]: true }))}
                />
              );
            })}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-20 flex flex-col items-center gap-2 px-2 sm:px-3">
        {hint && (
          <p className="pointer-events-none max-w-full rounded-full bg-chip px-4 py-1.5 text-center text-xs text-chip-fg">Тяните карту · щипок отдаляет и приближает</p>
        )}
        <div className="flex max-w-full flex-wrap items-center justify-center gap-1 rounded-full border border-chip-line bg-chip p-1 backdrop-blur-md" role="group" aria-label="Направление древа">
          <button type="button" aria-pressed={flow === "down"} className={`min-h-11 rounded-full px-3 text-sm font-semibold ${flow === "down" ? "bg-gold text-ink" : "text-chip-fg"}`} onClick={() => onFlow("down")}>
            Сверху вниз
          </button>
          <button type="button" aria-pressed={flow === "up"} className={`min-h-11 rounded-full px-3 text-sm font-semibold ${flow === "up" ? "bg-gold text-ink" : "text-chip-fg"}`} onClick={() => onFlow("up")}>
            Снизу вверх
          </button>
        </div>
        <div className="flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-full border border-chip-line bg-chip p-1 backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(["work", "carved", "cameo", "gzhel", "boheme", "taiga"] as const).map((id) => (
            <button key={id} type="button" aria-pressed={style === id} className={`min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold ${style === id ? "bg-gold text-ink" : "text-chip-fg"} ${stylesLocked && id !== "work" ? "opacity-80" : ""}`} onClick={() => onStyle(id)}>
              {stylesLocked && id !== "work" ? "🔒 " : ""}{id === "work" ? "Схема" : id === "carved" ? "Древо" : id === "cameo" ? "Камея" : id === "gzhel" ? "Гжель" : id === "boheme" ? "Богема" : "Тайга"}
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
      <div className="absolute right-2 bottom-36 z-20 flex flex-col gap-2">
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
