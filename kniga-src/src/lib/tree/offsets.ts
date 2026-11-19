// Ручной сдвиг карточек на схеме: человека можно перетащить туда, где ей нравится.
// Линии брака и линии к детям тянутся вслед за карточкой.
import { pillPoint } from "./scheme-paths.ts";
import type { TreeLayout, Union } from "./types.ts";

/** Необязательные поля раскладки `family` (карточки-ссылки, входы линий, дуги). У `classic` их нет, и тогда ничего из этого не используется. */
type RefLike = { id: string; of: string; unionId: string; x: number; y: number; gen: number };
type RefLinkLike = { refId: string; of: string; x1: number; y1: number; x2: number; y2: number };
type FamilyExtras = { refs?: RefLike[]; refLinks?: RefLinkLike[] };
type BusExtras = { dropXs?: number[]; jogY?: (number | null)[]; childIds?: string[] };

export type Shift = { dx: number; dy: number };

const GAP = 16;

/** Применяет сдвиги к готовой раскладке: сдвигает карточки и пересчитывает линии. Раскладка не меняется на месте, возвращается новая. */
export function applyShifts<L extends TreeLayout>(layout: L, unions: Union[], shifts: ReadonlyMap<string, Shift>): L {
  const active = new Map([...shifts].filter(([, s]) => s.dx !== 0 || s.dy !== 0));
  if (!active.size) return layout;
  const orig = new Map(layout.nodes.map((n) => [n.id, n]));
  const sh = (id: string): Shift => active.get(id) ?? { dx: 0, dy: 0 };
  const nodes = layout.nodes.map((n) => {
    const s = sh(n.id);
    return s.dx || s.dy ? { ...n, x: n.x + s.dx, y: n.y + s.dy } : n;
  });
  const moved = new Map(nodes.map((n) => [n.id, n]));
  const extras = layout as L & FamilyExtras;
  /** Карточка-ссылка стоит рядом с «домашним» супругом (тем, чей брак она показывает) и едет вместе с ним. */
  const refs = extras.refs?.map((r) => {
    const home = unions.find((u) => u.id === r.unionId)?.partnerIds.find((id) => id !== r.of && orig.has(id));
    const s = home ? sh(home) : { dx: 0, dy: 0 };
    return s.dx || s.dy ? { ...r, x: r.x + s.dx, y: r.y + s.dy } : r;
  });
  const refAt = new Map((refs ?? []).map((r) => [`${r.unionId}:${r.of}`, r]));
  const unionBy = new Map(unions.map((u) => [u.id, u]));

  const spouses = layout.spouses.map((link) => {
    const union = unionBy.get(link.unionId);
    const [aId, bId] = union?.partnerIds ?? [];
    const a = aId ? refAt.get(`${link.unionId}:${aId}`) ?? moved.get(aId) : undefined;
    const b = bId ? refAt.get(`${link.unionId}:${bId}`) ?? moved.get(bId) : undefined;
    const homeShifted = [aId, bId].some((id) => id && refAt.has(`${link.unionId}:${id}`) && [aId, bId].some((o) => o && o !== id && active.has(o)));
    if (!a || !b || (!active.has(aId!) && !active.has(bId!) && !homeShifted)) return link;
    const left = a.x <= b.x ? a : b;
    const right = a.x <= b.x ? b : a;
    const next = { ...link, x1: left.x, y1: left.y, x2: right.x, y2: right.y, curved: link.curved || Math.abs(left.y - right.y) > 8 };
    if (link.bracketY !== undefined) next.bracketY = link.bracketY + (sh(aId!).dy + sh(bId!).dy) / 2;
    return next;
  });

  const buses = layout.buses.map((bus) => {
    const union = unionBy.get(bus.unionId);
    if (!union) return bus;
    const parentIds = union.partnerIds.filter((id) => orig.has(id));
    const taken = new Set<string>();
    const kids = bus.xs.map((x) => {
      const id = union.childIds.find((c) => !taken.has(c) && orig.has(c) && Math.abs(orig.get(c)!.x - x) < 0.5);
      if (id) taken.add(id);
      return { x, id };
    });
    const anyMoved = parentIds.some((id) => active.has(id)) || kids.some((k) => k.id && active.has(k.id));
    if (!anyMoved) return bus;

    const extra = bus as typeof bus & BusExtras;
    const shifted = kids
      .map((k, i) => {
        const s = k.id ? sh(k.id) : { dx: 0, dy: 0 };
        return { x: k.x + s.dx, top: (bus.childTops?.[i] ?? bus.childTop) + s.dy, drop: extra.dropXs ? (extra.dropXs[i] ?? k.x) + s.dx : undefined, jog: extra.jogY ? (extra.jogY[i] == null ? null : extra.jogY[i]! + s.dy) : undefined, id: extra.childIds?.[i] };
      })
      .sort((p, q) => p.x - q.x);
    const xs = shifted.map((k) => k.x);
    const childTops = shifted.map((k) => k.top);

    const parentsOrig = parentIds.map((id) => orig.get(id)!);
    const parentsNow = parentIds.map((id) => moved.get(id)!);
    const deltaP = parentsOrig.length ? Math.max(...parentsNow.map((n) => n.y)) - Math.max(...parentsOrig.map((n) => n.y)) : 0;

    const next: typeof bus & BusExtras = { ...bus, xs, childTops, childTop: Math.min(...childTops) };
    if (extra.dropXs) next.dropXs = shifted.map((k) => k.drop!);
    if (extra.jogY) next.jogY = shifted.map((k) => k.jog ?? null);
    if (extra.childIds) next.childIds = shifted.map((k) => k.id!);
    if (bus.fromX != null && parentsNow.length) next.fromX = parentsNow.reduce((s, n) => s + n.x, 0) / parentsNow.length;
    if (bus.fromY != null) next.fromY = bus.fromY + deltaP;
    if (bus.partnerXs) {
      next.partnerXs = parentIds.map((id) => moved.get(id)!.x);
      if (bus.partnerTop != null) next.partnerTop = bus.partnerTop + deltaP;
      if (bus.bracketY !== undefined) next.bracketY = bus.bracketY + deltaP;
    }
    // Длинная дуга с плашкой у конца (family): линия детей по-прежнему выходит из-под плашки, а плашка поехала вместе с супругом.
    const pillLink = spouses.find((x) => x.unionId === bus.unionId) as ((typeof spouses)[number] & { pillT?: number }) | undefined;
    if (pillLink?.pillT !== undefined) {
      const p = pillPoint(pillLink);
      next.fromX = p.x;
      next.fromY = bus.childTop < bus.busY ? p.y - 13 : p.y + 13;
    }
    let busY = bus.busY + deltaP;
    const floor = (next.bracketY ?? next.fromY ?? -Infinity) + GAP;
    const ceil = Math.min(...childTops) - GAP;
    if (busY > ceil) busY = ceil;
    if (busY < floor && floor <= ceil) busY = floor;
    next.busY = busY;
    return next;
  });

  let width = layout.width;
  let height = layout.height;
  for (const n of nodes) {
    width = Math.max(width, n.x + 160);
    height = Math.max(height, n.y + 220);
  }
  const refLinks = extras.refLinks?.map((l) => {
    const r = refs?.find((q) => q.id === l.refId);
    const to = moved.get(l.of);
    return { ...l, ...(r ? { x1: r.x, y1: r.y } : {}), ...(to ? { x2: to.x, y2: to.y } : {}) };
  });
  return { ...layout, nodes, spouses, buses, width, height, ...(refs ? { refs } : {}), ...(refLinks ? { refLinks } : {}) };
}

/** Сдвиги людей из списка: поля treeDx и treeDy у человека. */
export function shiftsOf(people: { id: string; treeDx?: number; treeDy?: number }[]): Map<string, Shift> {
  const out = new Map<string, Shift>();
  for (const p of people) if (p.treeDx || p.treeDy) out.set(p.id, { dx: p.treeDx ?? 0, dy: p.treeDy ?? 0 });
  return out;
}
