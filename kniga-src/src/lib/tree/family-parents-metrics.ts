// Метрики «родители над ребёнком» для семейной раскладки. Только измерение: раскладку не меняет.
// Для каждой семьи (союз, у которого есть и родитель, и ребёнок на листе) считается, где середина родителей относительно размаха детей.
import type { Person, Union } from "./types.ts";
import { PLATE_W, H_GAP } from "./metrics.ts";
import { wingsOf } from "./family-layout.ts";

const GAP = PLATE_W + H_GAP;
type Lay = { nodes: { id: string; x: number; y: number; gen: number }[]; mainIds: string[]; refs: unknown[]; detached: string[]; width: number; buses: { childIds: string[] }[]; far: string[] };
export type LayoutFn = (people: Person[], unions: Union[], pair: { leftId: string; rightId?: string }) => Lay;

export type Agg = {
  layouts: number; fams: number; inSpan: number; mid: number; far3: number; far10: number; sumOut: number;
  single: number; singleOk: number;
  second: number; second6: number; // семьи вторых браков (у одного из родителей больше одного союза) и из них вне размаха детей больше чем на 6 карточек
  split: number; refs: number; detached: number; mixed: number; lost: number; overlaps: number; noLink: number; width: number; ms: number; maxMs: number;
};
export const emptyAgg = (): Agg => ({ layouts: 0, fams: 0, inSpan: 0, mid: 0, far3: 0, far10: 0, sumOut: 0, single: 0, singleOk: 0, second: 0, second6: 0, split: 0, refs: 0, detached: 0, mixed: 0, lost: 0, overlaps: 0, noLink: 0, width: 0, ms: 0, maxMs: 0 });

/** Измеряет одну раскладку и добавляет в `agg`. Семьи, где ребёнок это сама центральная пара, не считаются (принцип пары: родители жены слева, мужа справа). */
export function measureOne(agg: Agg, fn: LayoutFn, people: Person[], unions: Union[], pair: { leftId: string; rightId?: string }): Lay {
  const t0 = performance.now();
  const L = fn(people, unions, pair);
  const ms = performance.now() - t0;
  agg.layouts++; agg.ms += ms; agg.maxMs = Math.max(agg.maxMs, ms);
  const at = new Map(L.nodes.map((n) => [n.id, n]));
  const main = new Set(L.mainIds);
  agg.lost += people.length - L.nodes.length;
  agg.refs += L.refs.length; agg.detached += L.detached.length; agg.width += L.width;
  const w = wingsOf(unions, new Set(people.map((p) => p.id)), pair);
  const rows = new Map<number, number[]>();
  for (const n of L.nodes) (rows.get(n.y) ?? rows.set(n.y, []).get(n.y)!).push(n.x);
  for (const xs of rows.values()) { xs.sort((a, b) => a - b); for (let i = 1; i < xs.length; i++) if (xs[i]! - xs[i - 1]! < GAP - 1) agg.overlaps++; }
  for (const a of L.nodes) for (const b of L.nodes) if (a.gen === b.gen && w.get(a.id) === -1 && w.get(b.id) === 1 && a.x > b.x) agg.mixed++;
  const linked = new Set([...L.buses.flatMap((b) => b.childIds), ...L.far]);
  const unionCount = new Map<string, number>();
  for (const u of unions) for (const p of u.partnerIds) unionCount.set(p, (unionCount.get(p) ?? 0) + 1);
  for (const u of unions) {
    for (const c of u.childIds) if (at.has(c) && u.partnerIds.some((q) => at.has(q)) && !linked.has(c)) agg.noLink++;
    const ps = u.partnerIds.map((q) => at.get(q)).filter((n): n is NonNullable<typeof n> => !!n && main.has(n.id));
    const ks = u.childIds.map((q) => at.get(q)).filter((n): n is NonNullable<typeof n> => !!n && main.has(n.id));
    if (u.partnerIds.length === 2 && ps.length === 2 && Math.abs(ps[0]!.x - ps[1]!.x) > 3 * GAP) agg.split++;
    if (!ps.length || !ks.length || u.childIds.some((c) => c === pair.leftId || c === pair.rightId)) continue;
    const pm = ps.reduce((s, p) => s + p.x, 0) / ps.length;
    const lo = Math.min(...ks.map((k) => k.x)), hi = Math.max(...ks.map((k) => k.x));
    const d = pm < lo ? (lo - pm) / GAP : pm > hi ? (pm - hi) / GAP : 0;
    agg.fams++; if (d <= 0.6) agg.inSpan++;
    if (Math.abs(pm - (lo + hi) / 2) / GAP <= 0.6) agg.mid++;
    if (d > 3) agg.far3++; if (d > 10) agg.far10++; agg.sumOut += d;
    if (ks.length === 1) { agg.single++; if (d <= 0.6) agg.singleOk++; }
    if (u.partnerIds.some((q) => (unionCount.get(q) ?? 0) > 1)) { agg.second++; if (d > 6) agg.second6++; }
  }
  return L;
}

export const pct = (a: number, b: number) => (b ? (100 * a) / b : 100);
export const fmtAgg = (name: string, a: Agg) =>
  `${name}: раскладок ${a.layouts}, семей ${a.fams}, в размахе ${pct(a.inSpan, a.fams).toFixed(1)}%, по середине ${pct(a.mid, a.fams).toFixed(1)}%, один ребёнок и над ним ${pct(a.singleOk, a.single).toFixed(1)}% (${a.singleOk}/${a.single}), >3 карт ${a.far3}, >10 карт ${a.far10}, вторых браков ${a.second} из них >6 карт ${a.second6}, ср. вне размаха ${(a.sumOut / Math.max(1, a.fams)).toFixed(3)}, разорванных пар ${a.split}, ссылок ${a.refs}, пунктирных ${a.detached}, смешение ${a.mixed}, потеряно ${a.lost}, перекрытий ${a.overlaps}, без линии ${a.noLink}, ширина ср. ${Math.round(a.width / a.layouts)}, мс ср. ${(a.ms / a.layouts).toFixed(0)} (макс ${a.maxMs.toFixed(0)})`;
