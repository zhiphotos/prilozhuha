// Вид линий детей на экране «Схема» для раскладки `family`: разные цвета у соседних семей и «мостики» на пересечениях.
// Только отрисовка: координаты карточек и линий не меняются. Для `classic` не используется (там один цвет и прежний вид).
import type { ChildBus } from "./types.ts";

export type LookBus = ChildBus & { dropXs?: number[]; jogY?: (number | null)[]; far?: boolean };

/** Родители далеко от детей (семья супруга стоит отдельной веткой): такая связь рисуется отдельным пунктиром, без общей перекладины. */
export const FAR_LINK = 520;
export function busIsFar(bus: LookBus): boolean {
  if (bus.far) return true;
  const min = bus.xs[0];
  const max = bus.xs[bus.xs.length - 1];
  return bus.fromX != null && bus.fromY != null && min != null && max != null && (bus.fromX < min - FAR_LINK || bus.fromX > max + FAR_LINK);
}

/** Цвета линий семей: различимы между собой и на светлой, и на тёмной теме. */
export const BUS_PALETTE = ["#c0392b", "#2980b9", "#27ae60", "#d68910", "#8e44ad", "#16a085"] as const;

const MARGIN = 24;
const extent = (b: LookBus) => {
  const xs = [...(b.dropXs ?? b.xs), ...b.xs, ...(b.fromX != null ? [b.fromX] : [])];
  return [Math.min(...xs), Math.max(...xs)] as const;
};
/** Ряд семьи (по высоте, с которой идёт линия к детям), чтобы сравнивать только соседей. */
const rowKey = (b: LookBus) => Math.round((b.fromY ?? b.busY) / 100);

/**
 * Номер цвета для каждой линии (по индексу в списке). Две линии, чьи размахи по горизонтали пересекаются или почти касаются
 * и которые лежат в одной или соседних полосах, получают разные цвета. Порядок устойчивый: зависит только от геометрии.
 * Линии одного союза (обычная и далёкие) красятся одинаково: это одна семья.
 */
export function busColorIndex(buses: LookBus[]): number[] {
  const order = buses.map((b, i) => ({ i, b, ext: extent(b) })).sort((a, c) => a.ext[0] - c.ext[0] || a.ext[1] - c.ext[1] || (a.b.unionId < c.b.unionId ? -1 : a.b.unionId > c.b.unionId ? 1 : 0) || a.i - c.i);
  const colorOfUnion = new Map<string, number>();
  const out = new Array<number>(buses.length).fill(0);
  const done: { b: LookBus; ext: readonly [number, number]; c: number }[] = [];
  for (const item of order) {
    const known = colorOfUnion.get(item.b.unionId);
    if (known !== undefined) { out[item.i] = known; done.push({ b: item.b, ext: item.ext, c: known }); continue; }
    const used = new Set<number>();
    for (const d of done) {
      if (d.b.unionId === item.b.unionId) continue;
      if (Math.abs(rowKey(d.b) - rowKey(item.b)) > 3) continue;
      if (d.ext[1] + MARGIN >= item.ext[0] && item.ext[1] + MARGIN >= d.ext[0]) used.add(d.c);
    }
    let c = 0;
    while (used.has(c) && c < BUS_PALETTE.length - 1) c++;
    colorOfUnion.set(item.b.unionId, c);
    out[item.i] = c;
    done.push({ b: item.b, ext: item.ext, c });
  }
  return out;
}

/** Вертикальные отрезки линии: от брака вниз к перекладине и от перекладины к каждому ребёнку. */
function verticals(b: LookBus) {
  const out: { x: number; y1: number; y2: number }[] = [];
  // у далёкой связи нет общей вертикали от брака: от родителей идёт только пунктир, вертикали остаются лишь у входов в детей
  if (b.fromX != null && b.fromY != null && !busIsFar(b)) out.push({ x: b.fromX, y1: Math.min(b.fromY, b.busY), y2: Math.max(b.fromY, b.busY) });
  b.xs.forEach((x, i) => {
    const top = b.childTops?.[i] ?? b.childTop;
    const dx = b.dropXs?.[i] ?? x;
    out.push({ x: dx, y1: Math.min(b.busY, top), y2: Math.max(b.busY, top) });
  });
  return out;
}

/**
 * Пересечения: где вертикаль одной семьи пересекает перекладину другой, перекладина перепрыгивает её дугой.
 * Возвращает для каждой линии (по индексу) x-координаты прыжков на её перекладине. Одной семье (один союз) прыгать через себя не надо.
 */
export function busHops(buses: LookBus[]): Map<number, number[]> {
  const hops = new Map<number, number[]>();
  buses.forEach((B, bi) => {
    if (busIsFar(B)) return;
    const [lo, hi] = [Math.min(...B.xs, ...(B.dropXs ?? []), ...(B.fromX != null ? [B.fromX] : [])), Math.max(...B.xs, ...(B.dropXs ?? []), ...(B.fromX != null ? [B.fromX] : []))];
    buses.forEach((A, ai) => {
      if (ai === bi || A.unionId === B.unionId) return;
      for (const v of verticals(A)) {
        if (v.x > lo + 10 && v.x < hi - 10 && B.busY > v.y1 + 6 && B.busY < v.y2 - 6) {
          const list = hops.get(bi) ?? hops.set(bi, []).get(bi)!;
          if (!list.some((x) => Math.abs(x - v.x) < 14)) list.push(v.x);
        }
      }
    });
  });
  for (const list of hops.values()) list.sort((a, b) => a - b);
  return hops;
}

/** Горизонтальный отрезок с дугами-прыжками в заданных x (радиус r). */
export function hoppedH(x1: number, x2: number, y: number, hops: number[], r = 7): string {
  const dir = x2 >= x1 ? 1 : -1;
  const pts = hops.filter((h) => (h - x1) * dir > r + 1 && (x2 - h) * dir > r + 1).sort((a, b) => (a - b) * dir);
  let d = `M ${x1} ${y}`;
  for (const h of pts) d += ` H ${h - dir * r} a ${r} ${r} 0 0 ${dir > 0 ? 1 : 0} ${dir * 2 * r} 0`;
  return d + ` H ${x2}`;
}

/**
 * Дети, чей вход приходит издалека и при этом стоят рядом с детьми другой пары (чаще всего супруг, чьи родители живут в другой ветке, посреди братьев и сестёр мужа или жены).
 * Без подсказки такая карточка читается как ещё один брат или сестра соседей. Возвращает id ребёнка и номер линии, из которой он вышел:
 * экран обводит портрет цветом этой семьи и ставит точку на входе. Только отрисовка, координаты не меняются.
 */
export function foreignEntries(buses: (LookBus & { childIds?: string[] })[], nodes: { id: string; x: number; y: number }[], step = 210, longRun = 400): Map<string, number> {
  const at = new Map(nodes.map((n) => [n.id, n]));
  const parentBus = new Map<string, number>();
  buses.forEach((b, i) => b.childIds?.forEach((id) => { if (!parentBus.has(id) || busIsFar(buses[parentBus.get(id)!]!)) parentBus.set(id, i); }));
  const out = new Map<string, number>();
  buses.forEach((b, i) => {
    b.childIds?.forEach((id, k) => {
      const n = at.get(id);
      if (!n) return;
      const run = Math.abs((b.fromX ?? b.xs[k]!) - b.xs[k]!);
      if (run < longRun) return;
      const neighbours = nodes.filter((o) => o.id !== id && o.y === n.y && Math.abs(o.x - n.x) <= step);
      const other = neighbours.some((o) => { const j = parentBus.get(o.id); return j !== undefined && buses[j]!.unionId !== b.unionId; });
      if (other) out.set(id, i);
    });
  });
  return out;
}
