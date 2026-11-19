// Этап 4.4: линии, метки, ссылки и подписи групп для тем «Камея», «Гжель», «Богема», «Тайга» по геометрии семейной раскладки.
// Люди стоят там же, где на «Схеме» (одним общим множителем, см. anchor.ts); эта функция лишь рисует связи так, как их рисует сама тема (своя кривая, своя рамка).
import type { AppLayout } from "./layout-engine.ts";
import type { FamilyBus } from "./family-layout.ts";
import { PLATE_GAP, PLATE_H, PORTRAIT_R } from "./metrics.ts";
import { childTrunk } from "./trunk.ts";

export type SheetMark = { x: number; y: number; text: string };
export type SheetRef = { id: string; of: string; x: number; y: number };
export type SheetGroup = { kind: "branches" | "singles"; text: string; sub: string; x: number; y: number };
export type FamilyExtras = { far: string[]; refs: SheetRef[]; groups: SheetGroup[] };

export type ThemeStyle = {
  /** Половина стороны рамки карточки и высота подписи под ней. */
  frame: number;
  caption: number;
  /** Зазор между рамкой и началом брачной линии. */
  edge: number;
  /** На сколько выше центра стоит слово «брак» на прямой линии. */
  markDy: number;
  /** Брачная линия между соседями (в стиле темы). */
  spouse: (x1: number, y1: number, x2: number, y2: number) => string;
  /** Линия от родителей к ребёнку, если тема рисует веером; `null`: перекладина-ствол (как у «Камеи»). */
  fan: ((x1: number, y1: number, x2: number, y2: number) => string) | null;
};

type Node = { id: string; x: number; y: number };

const WORD = { divorced: "развод", widowed: "вдов.", partner: "союз", married: "брак" } as Record<string, string>;
const wordOf = (status: string) => WORD[status] ?? "брак";

/** Лишнее место над верхним рядом для дуг (в пикселях темы): нужно, чтобы дуга не уходила за край листа. */
export function arcTopRoom(fam: Pick<AppLayout, "spouses">, st: ThemeStyle): number {
  return fam.spouses.some((s) => s.curved) ? Math.round(st.frame * 2 + 70) : 0;
}

export function familyThemeLines(fam: AppLayout, nodes: Node[], scale: number, scaleY: number, st: ThemeStyle, flow: "down" | "up") {
  const out: { vines: string[]; marks: SheetMark[] } & FamilyExtras = { vines: [], marks: [], far: [], refs: [], groups: [] };
  const base = nodes[0];
  const a0 = base && fam.nodes.find((n) => n.id === base.id);
  if (!base || !a0) return out;
  const fx = (x: number) => base.x + (x - a0.x) * scale;
  const fy = (y: number) => base.y + (y - a0.y) * scaleY;
  const up = flow === "up";
  const at = new Map(nodes.map((n) => [n.id, n]));
  const below = PORTRAIT_R + PLATE_GAP + PLATE_H;
  const pills = new Map<string, { x: number; y: number }>();

  // Брачные линии: прямые у соседей, дуга над рядом у далёких. Плашка-слово стоит на дуге рядом с «домашним» супругом, как на «Схеме».
  for (const s of fam.spouses) {
    const x1 = fx(s.x1), x2 = fx(s.x2), y1 = fy(s.y1), y2 = fy(s.y2);
    const word = wordOf(s.status);
    if (!s.curved) {
      const a = x1 <= x2 ? { x: x1, y: y1 } : { x: x2, y: y2 };
      const b = x1 <= x2 ? { x: x2, y: y2 } : { x: x1, y: y1 };
      const ex1 = a.x + st.frame + st.edge, ex2 = b.x - st.frame - st.edge;
      if (ex2 > ex1 + 8) {
        out.vines.push(st.spouse(ex1, a.y, ex2, b.y));
        out.marks.push({ x: (a.x + b.x) / 2, y: a.y - st.markDy, text: word });
      }
      continue;
    }
    const y0 = Math.min(y1, y2) - st.frame - 2;
    const rise = Math.max(2 * (s.arcH ?? 0) * scaleY * 0.8, 2 * (st.frame + 36));
    const cy = y0 - rise;
    out.vines.push(`M ${x1} ${y0} Q ${(x1 + x2) / 2} ${cy} ${x2} ${y0}`);
    const t = s.pillT ?? 0.5;
    const p = { x: x1 + t * (x2 - x1), y: (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y0 };
    pills.set(s.unionId, p);
    out.marks.push({ x: p.x, y: p.y, text: s.pillT === undefined || !s.pillDir ? word : s.pillDir > 0 ? `${word} ›` : `‹ ${word}` });
  }

  // Линии детей.
  for (const raw of fam.buses) {
    const b = raw as FamilyBus;
    const parents = (b.parentIds ?? []).map((id) => at.get(id)).filter((n): n is Node => Boolean(n));
    const kidIds = b.childIds ?? [];
    const kids = kidIds.map((id) => at.get(id));
    if (!parents.length || !kids.length || kids.some((k) => !k)) continue;
    const pill = pills.get(b.unionId);
    const fromX = pill ? pill.x : b.fromX != null ? fx(b.fromX) : parents.reduce((s, n) => s + n.x, 0) / parents.length;
    const fromY = pill ? pill.y + 14 : up ? Math.min(...parents.map((n) => n.y)) - st.frame : Math.max(...parents.map((n) => n.y)) + st.frame + st.caption;
    const target = (k: Node) => (up ? k.y + st.frame + st.caption : k.y - st.frame);
    const tops = (kids as Node[]).map(target);
    const farBus = Boolean(b.far);
    const fan = st.fan ?? ((x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} C ${x1 + (x2 - x1) * 0.15} ${y1 + (y2 - y1) * 0.45}, ${x2 - (x2 - x1) * 0.15} ${y1 + (y2 - y1) * 0.55}, ${x2} ${y2}`);
    if (farBus || st.fan) {
      (kids as Node[]).forEach((k, i) => (farBus ? out.far : out.vines).push(fan(fromX, fromY, (b.dropXs?.[i] != null ? fx(b.dropXs[i]!) : k.x), tops[i]!)));
      continue;
    }
    // Ствол с перекладиной («Камея»). Высота перекладины как на «Схеме»: стандартная и сдвиг по полосе, пересчитанные в масштаб темы.
    const childEdge = up ? Math.max(...tops) : Math.min(...tops);
    const gap = Math.abs(childEdge - fromY);
    const nominalBase = up ? b.childTop + ((b.fromY ?? b.childTop) - b.childTop) * 0.45 : Math.max(...(b.parentIds ?? []).map((id) => fam.nodes.find((n) => n.id === id)?.y ?? 0)) + below + 34;
    const lane = Math.max(-0.4 * gap, Math.min(0.4 * gap, (b.busY - nominalBase) * scaleY));
    const std = Math.max(10, gap * 0.45);
    const busY = up ? fromY - std + lane : fromY + std + lane;
    const xs = (kids as Node[]).map((k, i) => (b.dropXs?.[i] != null ? fx(b.dropXs[i]!) : k.x));
    out.vines.push(...childTrunk(fromX, fromY, busY, xs));
    (kids as Node[]).forEach((k, i) => {
      const jog = b.jogY?.[i];
      if (jog != null && Math.abs(xs[i]! - k.x) > 1) {
        const jy = up ? tops[i]! + Math.min(14, gap * 0.15) : tops[i]! - Math.min(14, gap * 0.15);
        out.vines.push(`M ${xs[i]} ${busY} V ${jy} H ${k.x} V ${tops[i]}`);
      } else out.vines.push(`M ${k.x} ${busY} V ${tops[i]}`);
    });
  }

  // Карточки-ссылки и пунктир к настоящей карточке.
  for (const r of fam.refs ?? []) out.refs.push({ id: r.id, of: r.of, x: fx(r.x), y: fy(r.y) });
  for (const l of fam.refLinks ?? []) {
    const x1 = fx(l.x1), x2 = fx(l.x2);
    const y1 = fy(l.y1) - st.frame, y2 = fy(l.y2) - st.frame;
    const my = Math.min(y1, y2) - 90;
    out.far.push(`M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`);
  }

  // Подписи групп под основным деревом.
  for (const g of fam.groups ?? []) out.groups.push({ kind: g.kind, text: g.text, sub: g.sub, x: fx(g.x), y: fy(g.y) });
  return out;
}
