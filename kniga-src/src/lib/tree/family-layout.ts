// ПРОТОТИП (этап 1 ТЗ «пара рядом, от неё ветки»). Не подключён к экрану.
// Раскладка считается только из людей, связей и центральной пары. Человека, от которого смотрят древо, здесь нет вовсе:
// смена «от кого смотрим» не может сдвинуть ни одной карточки.
import { assignGenerations } from "./layout.ts";
import { yearNum } from "./kinship.ts";
import { H_GAP, PAD_X, PAD_Y, PLATE_GAP, PLATE_H, PLATE_W, PORTRAIT_R, ROW_H } from "./metrics.ts";
import type { ChildBus, Person, SpouseLink, TreeLayout, Union } from "./types.ts";

const GAP = PLATE_W + H_GAP;
type Contour = Map<number, [number, number]>;
type Sub = { rel: Map<string, number>; rows: Contour };

const emptySub = (): Sub => ({ rel: new Map(), rows: new Map() });
function put(sub: Sub, id: string, level: number, x: number) {
  sub.rel.set(id, x);
  const row = sub.rows.get(level);
  sub.rows.set(level, row ? [Math.min(row[0], x), Math.max(row[1], x)] : [x, x]);
}
function moved(sub: Sub, dx: number): Sub {
  return { rel: new Map([...sub.rel].map(([id, x]) => [id, x + dx])), rows: new Map([...sub.rows].map(([l, [a, b]]) => [l, [a + dx, b + dx]])) };
}
function join(into: Sub, other: Sub) {
  for (const [id, x] of other.rel) into.rel.set(id, x);
  for (const [l, [a, b]] of other.rows) {
    const row = into.rows.get(l);
    into.rows.set(l, row ? [Math.min(row[0], a), Math.max(row[1], b)] : [a, b]);
  }
}
/** Насколько правее надо поставить `right`, чтобы он не налез на `left` ни в одном ряду (need: нужная разница центров в ряду). */
function pushRight(left: Contour, right: Contour, need: (level: number) => number = () => GAP): number {
  let s = Number.NEGATIVE_INFINITY;
  for (const [l, [lo]] of right) {
    const have = left.get(l);
    if (have) s = Math.max(s, have[1] + need(l) - lo);
  }
  return s;
}
function pushLeft(right: Contour, left: Contour, need: (level: number) => number = () => GAP): number {
  let s = Number.POSITIVE_INFINITY;
  for (const [l, [, hi]] of left) {
    const have = right.get(l);
    if (have) s = Math.min(s, have[0] - need(l) - hi);
  }
  return s;
}

export type RefCard = { id: string; of: string; unionId: string; x: number; y: number; gen: number };
/** Шина семьи с геометрией входов: `dropXs[i]` это x вертикали к i-му ребёнку (по умолчанию центр карточки), `jogY[i]` высота обходного колена. */
export type FamilyBus = ChildBus & { dropXs: number[]; jogY: (number | null)[]; /** Кто родители и дети этой шины (дети в порядке `xs`): по ним раскладка под экран считает высоты линий. */ parentIds: string[]; childIds: string[]; /** Далёкая связь с родителями: рисуется бледным пунктиром. */ far?: true };
/** Брачная линия. `arcH`: если задано, линия рисуется дугой, вершина на arcH выше центра портретов (выше верхнего края), потому что между супругами стоят чужие карточки или супруги далеко. Всегда вверх: подпись карточки висит под портретом, снизу дуге места нет (и при `flow: up`). */
export type FamilySpouse = SpouseLink & { arcH?: number; /** Положение плашки на длинной дуге: доля пути от первого конца (0..1). Нет: плашка на вершине. */ pillT?: number; /** Куда идёт дуга от плашки (1 вправо, -1 влево). */ pillDir?: 1 | -1; arcTop?: boolean };
export type FamilyLayout = Omit<TreeLayout, "buses" | "spouses"> & {
  buses: FamilyBus[];
  spouses: FamilySpouse[];
  /** Люди, чьих родителей прототип поставил на край схемы (связь с ними длинная, линия не рисуется). */
  detached: string[];
  /** Карточки-ссылки: визуальное представление уже размещённого человека в другой ветке. Это не люди: в `nodes` их нет. */
  refs: RefCard[];
  /** Линии «ссылка → основная карточка» (рисуются пунктиром отдельного цвета). */
  refLinks: { refId: string; of: string; x1: number; y1: number; x2: number; y2: number }[];
  /** Сколько людей не получили места (не связаны с центральной парой никак). */
  unreached: string[];
  /** Люди основного дерева (центральная пара и всё, что к ней относится). */
  mainIds: string[];
  /** Отдельные группы родни, не связанные с центральной парой: раскладка каждой отдельным блоком ниже основного дерева. */
  blocks: string[][];
  /** Записи без единой связи: компактная сетка в самом низу. */
  singles: string[];
  /** Дети, чья связь с родителями далёкая (шина рисуется отдельно, пунктиром). */
  far: string[];
};

export function layoutFamily(people: Person[], unionsIn: Union[], pair: { leftId: string; rightId?: string }): FamilyLayout {
  /** Союзы в порядке id: порядок входных данных не должен влиять ни на один шаг. */
  const unions = [...unionsIn].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byId = new Map(people.map((p) => [p.id, p]));
  const gen = assignGenerations(people, unionsIn);
  const parentUnion = new Map<string, Union>();
  const unionsOf = new Map<string, Union[]>();
  for (const u of [...unions].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    for (const c of u.childIds) if (!parentUnion.has(c)) parentUnion.set(c, u);
    for (const p of u.partnerIds) unionsOf.set(p, [...(unionsOf.get(p) ?? []), u]);
  }
  const placed = new Set<string>();
  const detached = new Set<string>();
  /** Метка «связь с родителями далёкая» ставится только тому, у кого родители действительно есть в данных (иначе рисовать нечего). */
  const flagFar = (id: string) => {
    const u = parentUnion.get(id);
    if (u && u.partnerIds.some((q) => byId.has(q))) detached.add(id);
  };
  const birth = (id: string) => yearNum(byId.get(id)?.birthYear);
  /** Порядок братьев и сестёр: место, выбранное человеком (rank), потом год рождения. */
  const rank = (id: string) => byId.get(id)?.rank ?? Number.POSITIVE_INFINITY;
  const order = (ids: string[]) => ids.slice().sort((a, b) => (rank(a) === rank(b) ? 0 : rank(a) < rank(b) ? -1 : 1) || birth(a) - birth(b) || (a < b ? -1 : 1));
  /** Кто в паре слева: явный выбор (side) главнее пола. */
  const wish = (id: string) => (byId.get(id)?.side === "left" ? -1 : byId.get(id)?.side === "right" ? 1 : 0);
  /** Ряд человека: по связям; у тех, кто ни с кем не связан, поколения нет, их ставим в ряд центральной пары. */
  const forced = new Map<string, number>();
  const level = (id: string) => forced.get(id) ?? gen.get(id) ?? 0;

  /** Человек со своими супругами и всем потомством: дети под серединой родителей, каждая семья своим участком. */
  const descend = (id: string): Sub => {
    placed.add(id);
    const members = [id];
    const kids: string[] = [];
    for (const u of unionsOf.get(id) ?? []) {
      for (const q of u.partnerIds) if (q !== id && !placed.has(q) && !members.includes(q)) {
        members.push(q);
        placed.add(q);
      }
      for (const c of u.childIds) if (!placed.has(c) && !kids.includes(c)) kids.push(c);
    }
    const sub = emptySub();
    const acc = emptySub();
    const mains: number[] = [];
    for (const kid of order(kids)) {
      if (placed.has(kid)) continue;
      const part = descend(kid);
      const s = acc.rel.size ? pushRight(acc.rows, part.rows) : 0;
      join(acc, moved(part, Number.isFinite(s) ? s : 0));
      mains.push((Number.isFinite(s) ? s : 0) + part.rel.get(kid)!);
    }
    const centre = mains.length ? (Math.min(...mains) + Math.max(...mains)) / 2 : 0;
    const start = centre - ((members.length - 1) * GAP) / 2;
    members.forEach((m, i) => put(sub, m, level(m), start + i * GAP));
    join(sub, acc);
    return moved(sub, -sub.rel.get(id)!);
  };

  /**
   * Семья, из которой вышел человек p: его родители рядом друг с другом, над каждым его собственные родители (ветви расходятся влево и вправо),
   * братья и сёстры p с потомством стоят с внешней стороны `out`. Сам p и его супруг сюда не входят: их ставит вызывающий.
   */
  const famUp = (p: string, out: -1 | 1): Sub | null => {
    const u = parentUnion.get(p);
    if (!u) return null;
    const partners = order(u.partnerIds.filter((q) => !placed.has(q) && byId.has(q))).sort((a, b) => wish(a) - wish(b) || Number(byId.get(a)?.gender !== "m") - Number(byId.get(b)?.gender !== "m"));
    if (!partners.length) return null;
    for (const q of partners) placed.add(q);
    const lv = level(partners[0]!);
    const ups = partners.map((q, i) => famUp(q, partners.length > 1 ? (i === 0 ? -1 : 1) : out));
    const sub = emptySub();
    let x0 = 0;
    const [aL, aR] = ups;
    if (partners.length === 2) {
      let right = aR ?? emptySub();
      const left = aL ?? emptySub();
      const row = (c: Contour) => c.get(lv);
      const need = (l: number) => (l === lv ? 3 * GAP : GAP);
      const s = pushRight(left.rows, right.rows, need);
      right = moved(right, Number.isFinite(s) ? Math.max(s, 0) : GAP);
      join(sub, left);
      join(sub, right);
      const cL = aL ? centreOf(aL, partners[0]!, u) : 0;
      const cR = aR ? centreOf(moved(aR, Number.isFinite(s) ? Math.max(s, 0) : GAP), partners[1]!, u) : cL + 2 * GAP;
      const want = (cL + cR) / 2 - GAP / 2;
      const lo = (row(sub.rows) && row(left.rows) ? row(left.rows)![1] + GAP : -Infinity);
      const hi = row(right.rows) ? row(right.rows)![0] - 2 * GAP : Infinity;
      x0 = Math.min(Math.max(want, lo), Math.max(lo, hi));
      put(sub, partners[0]!, lv, x0);
      put(sub, partners[1]!, lv, x0 + GAP);
    } else {
      const only = aL ?? emptySub();
      join(sub, only);
      const cL = aL ? centreOf(aL, partners[0]!, u) : 0;
      const hi = only.rows.get(lv)?.[1];
      x0 = hi !== undefined ? Math.max(cL, hi + GAP) : cL;
      put(sub, partners[0]!, lv, x0);
    }
    const centre = partners.length === 2 ? x0 + GAP / 2 : x0;
    // Другие браки родителей: новый супруг встаёт вплотную к своему партнёру с внешней стороны, его дети под серединой этой пары.
    partners.forEach((pt, i) => {
      const dir: -1 | 1 = partners.length === 2 ? (i === 0 ? -1 : 1) : out;
      for (const u2 of unionsOf.get(pt) ?? []) {
        if (u2 === u) continue;
        for (const q of u2.partnerIds) {
          if (q === pt || placed.has(q) || !byId.has(q)) continue;
          const part = descend(q);
          const ptX = sub.rel.get(pt)!;
          // дети под серединой между pt и q: сдвигаем всё, кроме самого q, на полкарточки к pt
          const qx = part.rel.get(q)!;
          const rel = new Map<string, number>();
          const ex = emptySub();
          // на полкарточки к pt сдвигается только потомство: другие супруги q стоят в одном ряду с ним и должны держать полную карточку зазора
          for (const [id, x] of part.rel) put(ex, id, level(id), level(id) === level(q) ? x : x - (dir * GAP) / 2);
          void rel;
          // q в нулевой точке: ставим его в слот рядом с pt, затем отодвигаем наружу, пока не перестанет налезать на уже стоящих.
          const ideal = ptX + dir * GAP - qx;
          let shift = ideal;
          const clash = dir < 0 ? pushLeft(sub.rows, ex.rows) : pushRight(sub.rows, ex.rows);
          const placedEx = moved(ex, shift);
          const c2 = dir < 0 ? pushLeft(sub.rows, placedEx.rows) : pushRight(sub.rows, placedEx.rows);
          void clash;
          if (Number.isFinite(c2) && (dir < 0 ? c2 < 0 : c2 > 0)) shift += c2;
          if (Math.abs(shift - ideal) > 3 * GAP) {
            // слишком далеко: оставляем решение общему шагу 3 (ближайшее свободное место), здесь не рвём раскладку
            for (const id of part.rel.keys()) placed.delete(id);
            continue;
          }
          join(sub, moved(ex, shift));
        }
      }
    });
    // Братья и сёстры p: рядом по внешнюю сторону, ниже родителей.
    const sibs = order(u.childIds.filter((c) => c !== p && !placed.has(c)));
    let group = emptySub();
    for (const c of sibs) {
      if (placed.has(c)) continue;
      const part = descend(c);
      const s = group.rel.size ? pushRight(group.rows, part.rows) : 0;
      join(group, moved(part, Number.isFinite(s) ? s : 0));
    }
    if (group.rel.size) {
      const lo = Math.min(...[...group.rel.values()]);
      const hi = Math.max(...[...group.rel.values()]);
      const width = hi - lo;
      let shift = out < 0 ? centre - GAP - hi : centre + GAP - lo;
      group = moved(group, shift);
      // Если налезли на то, что уже стоит, отодвигаем наружу.
      const clash = out < 0 ? pushLeft(sub.rows, group.rows) : pushRight(sub.rows, group.rows);
      if (Number.isFinite(clash) && (out < 0 ? clash < 0 : clash > 0)) {
        group = moved(group, clash);
        shift += clash;
      }
      void width;
      join(sub, group);
    }
    return sub;
  };
  /** Середина родителей `of` в подвеске (для линий вниз к ребёнку). */
  function centreOf(sub: Sub, parent: string, u: Union): number {
    void u;
    const ups = parentUnion.get(parent);
    if (!ups) return sub.rel.get(parent) ?? 0;
    const xs = ups.partnerIds.map((q) => sub.rel.get(q)).filter((v): v is number => v !== undefined);
    return xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  }

  // 1. Центральная пара и два крыла.
  const arrange = (W: string, H: string | undefined): Sub => {
  placed.add(W);
  if (H) placed.add(H);
  const SW = famUp(W, -1) ?? emptySub();
  const SH = H ? famUp(H, 1) ?? emptySub() : emptySub();
  const lvPair = level(W);
  const total = emptySub();
  join(total, SW);
  if (H) {
    const s = pushRight(SW.rows, SH.rows, (l) => (l === lvPair ? 3 * GAP : GAP));
    join(total, moved(SH, Number.isFinite(s) ? Math.max(s, 0) : 0));
  }
  // Пара стоит рядом посередине между центрами родителей: у каждого по своей стороне.
  const ctr = (sub: Sub, id: string, shift: number) => {
    const u = parentUnion.get(id);
    const xs = (u?.partnerIds ?? []).map((q) => sub.rel.get(q)).filter((v): v is number => v !== undefined).map((v) => v + shift);
    return xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : null;
  };
  const sH = H ? (Number.isFinite(pushRight(SW.rows, SH.rows, (l) => (l === lvPair ? 3 * GAP : GAP))) ? Math.max(pushRight(SW.rows, SH.rows, (l) => (l === lvPair ? 3 * GAP : GAP)), 0) : 0) : 0;
  const cw = ctr(total, W, 0);
  const ch = H ? ctr(total, H, 0) : null;
  const rowHi = total.rows.get(lvPair);
  let xW = cw !== null && ch !== null ? (cw + ch) / 2 - GAP / 2 : cw ?? 0;
  const loLimit = SW.rows.get(lvPair) ? SW.rows.get(lvPair)![1] + GAP : -Infinity;
  const hiLimit = H && SH.rows.get(lvPair) ? SH.rows.get(lvPair)![0] + sH - 2 * GAP : Infinity;
  xW = Math.min(Math.max(xW, loLimit), Math.max(loLimit, hiLimit));
  void rowHi;
  put(total, W, lvPair, xW);
  if (H) put(total, H, lvPair, xW + GAP);
  // 2. Дети пары под её серединой.
  const kids: string[] = [];
  for (const u of unions) if (u.partnerIds.includes(W) && (!H || u.partnerIds.includes(H) || u.partnerIds.length === 1)) for (const c of u.childIds) if (!placed.has(c)) kids.push(c);
  if (kids.length) {
    let group = emptySub();
    for (const c of order(kids)) {
      if (placed.has(c)) continue;
      const part = descend(c);
      const s = group.rel.size ? pushRight(group.rows, part.rows) : 0;
      join(group, moved(part, Number.isFinite(s) ? s : 0));
    }
    const xs = [...group.rel.values()];
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    group = moved(group, xW + (H ? GAP / 2 : 0) - mid);
    const s = pushRight(total.rows, group.rows);
    // Если под парой уже стоит чья-то родня, сдвигаем детей вправо до свободного места.
    const rowsBelow = [...group.rows.keys()].some((l) => total.rows.has(l));
    if (rowsBelow && Number.isFinite(s) && s > 0 && pushLeft(total.rows, group.rows) < 0) group = moved(group, Math.min(s, Math.abs(pushLeft(total.rows, group.rows)) < s ? pushLeft(total.rows, group.rows) : s));
    join(total, group);
  }
  // 3. Остальные: родители супругов (их ставим на край своей стороны), потом одиночные супруги и их родня.
  const centreX = xW + (H ? GAP / 2 : 0);
  /** Ближайший к желаемому свободный сдвиг: подвеска не должна стоять ближе одной карточки ни к кому в своём ряду (дырки между семьями используются). */
  const nearFree = (sub: Sub, desired: number): number => {
    const occ = new Map<number, number[]>();
    for (const [id, x] of total.rel) {
      const l = level(id);
      (occ.get(l) ?? occ.set(l, []).get(l)!).push(x);
    }
    const fits = (shift: number) => {
      for (const [id, x] of sub.rel) {
        const row = occ.get(level(id));
        if (!row) continue;
        for (const v of row) if (Math.abs(v - (x + shift)) < GAP - 0.5) return false;
      }
      return true;
    };
    if (fits(desired)) return desired;
    for (let k = 1; k < 4000; k++) for (const shift of [desired + k * 40, desired - k * 40]) if (fits(shift)) return shift;
    return desired;
  };
  /**
   * Дети, чьих родителей уже поставили (например, родитель встал как предок, а у него есть отдельный список детей от неизвестного второго родителя).
   * Выполняется после основного обхода, чтобы не занимать места, на которые претендуют родители и супруги.
   */
  const placeLeftKids = (): boolean => {
    let changed = false;
    for (const u of unions) {
      const px = u.partnerIds.map((q) => total.rel.get(q)).filter((v): v is number => v !== undefined);
      if (!px.length) continue;
      const kidsLeft = order(u.childIds.filter((c) => !placed.has(c) && byId.has(c)));
      if (!kidsLeft.length) continue;
      const group = emptySub();
      for (const c of kidsLeft) {
        if (placed.has(c)) continue;
        const part = descend(c);
        const s = group.rel.size ? pushRight(group.rows, part.rows) : 0;
        join(group, moved(part, Number.isFinite(s) ? s : 0));
      }
      const gx = [...group.rel.values()];
      const mid = (Math.min(...gx) + Math.max(...gx)) / 2;
      const want = (Math.min(...px) + Math.max(...px)) / 2;
      const shift = nearFree(group, want - mid);
      join(total, moved(group, shift));
      if (Math.abs(shift - (want - mid)) > 6 * GAP) for (const c of kidsLeft) flagFar(c);
      changed = true;
    }
    return changed;
  };
  const rounds = () => {
  for (let round = 0; round < 40; round++) {
    let changed = false;
    const ids = [...total.rel.keys()].sort((a, b) => total.rel.get(a)! - total.rel.get(b)! || (a < b ? -1 : 1));
    for (const id of ids) {
      const side: -1 | 1 = total.rel.get(id)! < centreX ? -1 : 1;
      if (parentUnion.get(id) && parentUnion.get(id)!.partnerIds.some((q) => !placed.has(q))) {
        const sub = famUp(id, side);
        if (sub && sub.rel.size) {
          // Родители встают над своим ребёнком, а если над ним занято, в ближайшее свободное место (не на край листа).
          const c = ctr(sub, id, 0);
          const own = total.rel.get(id)!;
          const shift = nearFree(sub, own - (c ?? 0));
          join(total, moved(sub, shift));
          if (c === null || Math.abs(c + shift - own) > 6 * GAP) flagFar(id);
          changed = true;
        }
      }
    }
    // Супруги, которых никто не поставил (второй брак предка и т. п.).
    for (const id of [...total.rel.keys()].sort()) {
      for (const u of unionsOf.get(id) ?? []) {
        for (const q of u.partnerIds) {
          if (placed.has(q) || !byId.has(q)) continue;
          const side: -1 | 1 = total.rel.get(id)! < centreX ? -1 : 1;
          const sub = descend(q);
          const own = total.rel.get(id)!;
          const shift = nearFree(sub, own + side * GAP);
          join(total, moved(sub, shift));
          if (Math.abs(shift - own) > 3 * GAP) flagFar(q);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  };
  rounds();
  for (let again = 0; again < 20 && placeLeftKids(); again++) rounds();
  return total;
  };

  const W = pair.leftId;
  const H = pair.rightId && byId.has(pair.rightId) ? pair.rightId : undefined;
  const main = arrange(W, H);
  compactCuts(main.rel, unions, detached, level);
  const mainIds = new Set(main.rel.keys());

  // 3в. Всё, до чего не дотянулась центральная пара: отдельные группы родни раскладываются теми же правилами каждая своим блоком,
  // записи без единой связи собираются в сетку. Блоки и сетка стоят ниже основного дерева и его координат не трогают.
  const adj = new Map<string, Set<string>>();
  for (const u of unions) {
    const ms = [...u.partnerIds, ...u.childIds].filter((id) => byId.has(id));
    for (const m of ms) {
      const set = adj.get(m) ?? adj.set(m, new Set()).get(m)!;
      for (const o of ms) if (o !== m) set.add(o);
    }
  }
  const blocks: { sub: Sub; ids: string[]; lo: number; hi: number; minLv: number; maxLv: number }[] = [];
  const singles: string[] = [];
  for (let guard = 0; guard < people.length + 5; guard++) {
    const rest = [...people].map((p) => p.id).filter((id) => !placed.has(id)).sort();
    if (!rest.length) break;
    const seed = rest[0]!;
    const comp: string[] = [];
    const seen = new Set([seed]);
    for (const queue = [seed]; queue.length; ) {
      const cur = queue.shift()!;
      comp.push(cur);
      for (const o of adj.get(cur) ?? []) if (!placed.has(o) && !seen.has(o)) { seen.add(o); queue.push(o); }
    }
    if (comp.length === 1) { placed.add(seed); singles.push(seed); continue; }
    // Корень блока: самая «старшая» пара (меньший ряд, больше детей), иначе самый старший человек.
    const inComp = new Set(comp);
    const couples = unions
      .filter((u) => u.partnerIds.length === 2 && u.partnerIds.every((q) => inComp.has(q)))
      .sort((a, b) => level(a.partnerIds[0]!) - level(b.partnerIds[0]!) || b.childIds.length - a.childIds.length || (a.id < b.id ? -1 : 1));
    const [lw, rw] = couples[0] ? [...couples[0].partnerIds].sort((a, b) => wish(a) - wish(b) || Number(byId.get(a)?.gender !== "m") - Number(byId.get(b)?.gender !== "m")) : [comp.slice().sort((a, b) => level(a) - level(b) || (a < b ? -1 : 1))[0]!, undefined];
    const sub = arrange(lw!, rw);
    compactCuts(sub.rel, unions, detached, level);
    const xs = [...sub.rel.values()];
    const lvs = [...sub.rel.keys()].map(level);
    blocks.push({ sub, ids: [...sub.rel.keys()], lo: Math.min(...xs), hi: Math.max(...xs), minLv: Math.min(...lvs), maxLv: Math.max(...lvs) });
  }

  // 4. Итог: координаты, линии.
  const minGen = Math.min(...[...mainIds].map(level));
  const maxGen = Math.max(...[...mainIds].map(level));
  const mx = [...main.rel.values()];
  const minX = Math.min(...mx);
  const mainW = Math.max(...mx) - minX;
  const rowY = (r: number) => PAD_Y + PORTRAIT_R + r * ROW_H;
  const raw: { id: string; x: number; y: number; gen: number }[] = [];
  for (const [id, x] of main.rel) raw.push({ id, x: x - minX + PAD_X, y: rowY(level(id) - minGen), gen: level(id) });
  let shelfRow = maxGen - minGen + 1.5;
  const target = Math.max(mainW, 12 * GAP);
  blocks.sort((a, b) => b.ids.length - a.ids.length || (a.ids[0]! < b.ids[0]! ? -1 : 1));
  let cursor = 0;
  let shelfH = 0;
  for (const bl of blocks) {
    const w = bl.hi - bl.lo;
    if (cursor > 0 && cursor + w > target) { shelfRow += shelfH + 0.5; cursor = 0; shelfH = 0; }
    for (const [id, x] of bl.sub.rel) raw.push({ id, x: x - bl.lo + cursor + PAD_X, y: rowY(shelfRow + level(id) - bl.minLv), gen: level(id) });
    cursor += w + 2 * GAP;
    shelfH = Math.max(shelfH, bl.maxLv - bl.minLv + 1);
  }
  if (blocks.length) shelfRow += shelfH + 0.5;
  const cols = Math.max(1, Math.min(Math.floor(target / GAP) + 1, Math.ceil(Math.sqrt(singles.length) * 1.5)));
  singles.forEach((id, i) => raw.push({ id, x: (i % cols) * GAP + PAD_X, y: rowY(shelfRow + Math.floor(i / cols)), gen: level(id) }));
  const nodes = raw;
  const at = new Map(nodes.map((n) => [n.id, n]));
  // 4а. Карточки-ссылки для пар, которые не удалось поставить рядом (дальше двух карточек): партнёр, чьи дети стоят в другом месте,
  // остаётся там, а второй супруг появляется возле него ссылкой. Основная карточка человека одна и остаётся на своём месте.
  const refs: RefCard[] = [];
  const refLinks: FamilyLayout["refLinks"] = [];
  const refOf = new Map<string, RefCard>();
  const occ = new Map<number, number[]>();
  for (const n of nodes) (occ.get(n.y) ?? occ.set(n.y, []).get(n.y)!).push(n.x);
  for (const u of [...unions].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const pn = u.partnerIds.map((q) => at.get(q));
    if (pn.length !== 2 || !pn[0] || !pn[1] || Math.abs(pn[0].x - pn[1].x) <= 2 * GAP + 1) continue;
    const ks = u.childIds.map((c) => at.get(c)).filter((n): n is NonNullable<typeof n> => n !== undefined && !detached.has(n.id));
    const kx = ks.length ? ks.reduce((t, n) => t + n.x, 0) / ks.length : null;
    // дом семьи: партнёр, ближайший к детям (без детей: тот, чьи родители не на краю листа, иначе первый по id)
    const dist = (n: { x: number }) => (kx === null ? 0 : Math.abs(n.x - kx));
    const homeIdx = kx !== null ? (dist(pn[0]) <= dist(pn[1]) ? 0 : 1) : detached.has(pn[0].id) ? 1 : 0;
    const home = pn[homeIdx]!, away = pn[1 - homeIdx]!;
    const row = occ.get(home.y) ?? [];
    const dir = away.x > home.x ? 1 : -1;
    let rx = NaN;
    for (let k = 1; k < 60 && Number.isNaN(rx); k++) for (const sgn of [dir, -dir]) {
      const x = home.x + sgn * k * GAP;
      if (x >= PAD_X && row.every((v) => Math.abs(v - x) >= GAP - 0.5)) { rx = x; break; }
    }
    if (Number.isNaN(rx)) continue;
    row.push(rx);
    occ.set(home.y, row);
    const rc: RefCard = { id: `ref:${u.id}:${away.id}`, of: away.id, unionId: u.id, x: rx, y: home.y, gen: home.gen };
    refs.push(rc);
    refOf.set(`${u.id}:${away.id}`, rc);
    refLinks.push({ refId: rc.id, of: away.id, x1: rx, y1: home.y, x2: away.x, y2: away.y });
  }
  /** Между концами брачной линии на той же высоте стоит чужая карточка: прямая линия прошла бы под ней и читалась бы как брак с ней, поэтому такая линия рисуется дугой (`curved`). */
  const rowCards = new Map<number, number[]>();
  for (const n of nodes) (rowCards.get(n.y) ?? rowCards.set(n.y, []).get(n.y)!).push(n.x);
  for (const r of refs) (rowCards.get(r.y) ?? rowCards.set(r.y, []).get(r.y)!).push(r.x);
  const cardsBetween = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
    return a.y === b.y ? (rowCards.get(a.y) ?? []).filter((x) => x > lo + 1 && x < hi - 1).length : 0;
  };
  const covers = (a: { x: number; y: number }, b: { x: number; y: number }) => cardsBetween(a, b) > 0;
  const spouses: FamilySpouse[] = [];
  const buses: FamilyBus[] = [];
  const far: string[] = [];
  const mk = (u: Union, ps: { x: number; y: number }[], cs: { id: string; x: number; y: number }[], isFar: boolean): FamilyBus => {
    const fromX = ps.reduce((s, n) => s + n.x, 0) / ps.length;
    return { unionId: u.id, fromX, fromY: ps[0]!.y, busY: ps[0]!.y + ROW_H / 2, xs: cs.map((n) => n.x), childTop: cs[0]!.y - PLATE_H / 2, dropXs: cs.map((n) => n.x), jogY: cs.map(() => null), parentIds: u.partnerIds.filter((q) => at.has(q)), childIds: cs.map((n) => n.id), ...(isFar ? { far: true } : {}) };
  };
  for (const u of unions) {
    const ps = u.partnerIds.map((q) => refOf.get(`${u.id}:${q}`) ?? at.get(q)).filter((n): n is NonNullable<typeof n> => Boolean(n));
    if (ps.length === 2) spouses.push({ unionId: u.id, x1: ps[0]!.x, y1: ps[0]!.y, x2: ps[1]!.x, y2: ps[1]!.y, status: u.status, curved: Math.abs(ps[0]!.x - ps[1]!.x) > 3 * GAP || covers(ps[0]!, ps[1]!), ...(Math.abs(ps[0]!.x - ps[1]!.x) > 3 * GAP || covers(ps[0]!, ps[1]!) ? { arcH: PLATE_H / 2 + 46 + Math.min(80, 6 * cardsBetween(ps[0]!, ps[1]!)) } : {}) });
    const kids = u.childIds.map((q) => at.get(q)).filter((n): n is NonNullable<typeof n> => n !== undefined);
    if (!ps.length || !kids.length) continue;
    const cs = kids.filter((n) => !detached.has(n.id));
    if (cs.length) buses.push(mk(u, ps, cs, false));
    // Далёкая связь с родителями: рисуется отдельной шиной на каждого такого ребёнка (бледный пунктир), карточки не двигаются.
    for (const n of kids.filter((k) => detached.has(k.id))) { buses.push(mk(u, ps, [n], true)); far.push(n.id); }
  }
  assignLanes(buses);
  separateDrops(buses);
  const maxX = Math.max(...nodes.map((n) => n.x), ...refs.map((r) => r.x));
  const maxY = Math.max(...nodes.map((n) => n.y));
  return {
    nodes,
    spouses,
    buses,
    labels: [],
    width: maxX + PAD_X,
    // как у classic: от центра нижнего ряда ещё портрет, зазор, подпись и поле (иначе нижние подписи обрезаются листом и подписью «Книга Рода»)
    height: maxY + PORTRAIT_R + PLATE_GAP + PLATE_H + PAD_Y,
    focusGen: level(W),
    detached: [...detached],
    refs,
    refLinks,
    unreached: people.filter((p) => !mainIds.has(p.id)).map((p) => p.id),
    mainIds: [...mainIds],
    blocks: blocks.map((b) => b.ids),
    singles,
    far,
  };
}

/** Сжатие по свободным разрезам (см. 3б). Возвращает, на сколько всего сжато. */
export function compactCuts(rel: Map<string, number>, unions: Union[], detached: Set<string>, level: (id: string) => number): number {
  const groups = unions
    .map((u) => [...u.partnerIds, ...u.childIds.filter((c) => !detached.has(c))].filter((id) => rel.has(id)))
    .filter((g) => g.length > 1);
  let total = 0;
  for (let guard = 0; guard < 400; guard++) {
    const ids = [...rel.keys()].sort((a, b) => rel.get(a)! - rel.get(b)! || (a < b ? -1 : 1));
    // Для каждой семьи: от какого до какого разреза (по номеру в отсортированном списке) она тянется.
    const pos = new Map(ids.map((id, i) => [id, i]));
    const spanEnd = new Array<number>(ids.length + 1).fill(0);
    for (const g of groups) {
      const idx = g.map((id) => pos.get(id)!);
      const lo = Math.min(...idx), hi = Math.max(...idx);
      if (hi > lo) { spanEnd[lo] = Math.max(spanEnd[lo]!, hi); }
    }
    // Разрез после позиции i свободен, если ни одна семья, начавшаяся не правее i, не заканчивается правее i.
    let reach = -1;
    let best: { cut: number; d: number } | null = null;
    for (let i = 0; i < ids.length - 1; i++) {
      reach = Math.max(reach, spanEnd[i]!);
      if (reach > i) continue;
      const cutX = rel.get(ids[i]!)!;
      if (rel.get(ids[i + 1]!)! - cutX < 1) continue;
      const leftMax = new Map<number, number>(), rightMin = new Map<number, number>();
      for (let j = 0; j <= i; j++) { const l = level(ids[j]!); leftMax.set(l, Math.max(leftMax.get(l) ?? -Infinity, rel.get(ids[j]!)!)); }
      for (let j = i + 1; j < ids.length; j++) { const l = level(ids[j]!); rightMin.set(l, Math.min(rightMin.get(l) ?? Infinity, rel.get(ids[j]!)!)); }
      let d = Infinity;
      for (const [l, lo] of rightMin) { const hi = leftMax.get(l); if (hi !== undefined) d = Math.min(d, lo - hi - GAP); }
      if (!Number.isFinite(d)) d = rel.get(ids[i + 1]!)! - cutX - GAP;
      if (d > 0.5 && (!best || d > best.d)) best = { cut: i, d };
    }
    if (!best) break;
    for (let j = best.cut + 1; j < ids.length; j++) rel.set(ids[j]!, rel.get(ids[j]!)! - best.d);
    total += best.d;
  }
  return total;
}

/** Каждой семье своя высота шины: шины с пересекающимися по горизонтали участками в одном ряду получают разные уровни. */
export function assignLanes(buses: ChildBus[]) {
  const byRow = new Map<number, ChildBus[]>();
  for (const b of buses) { const k = b.fromY ?? 0; (byRow.get(k) ?? byRow.set(k, []).get(k)!).push(b); }
  const MARGIN = 24;
  for (const [y, list] of byRow) {
    const ext = (b: ChildBus) => [Math.min(b.fromX ?? Number.POSITIVE_INFINITY, ...b.xs), Math.max(b.fromX ?? Number.NEGATIVE_INFINITY, ...b.xs)] as const;
    list.sort((a, b) => ext(a)[0] - ext(b)[0] || ext(a)[1] - ext(b)[1] || (a.unionId < b.unionId ? -1 : 1));
    const laneEnds: number[] = [];
    const lane = new Map<ChildBus, number>();
    for (const b of list) {
      const [lo, hi] = ext(b);
      let k = laneEnds.findIndex((end) => end + MARGIN < lo);
      if (k < 0) { k = laneEnds.length; laneEnds.push(hi); } else laneEnds[k] = hi;
      lane.set(b, k);
    }
    const n = laneEnds.length;
    const room = ROW_H - PLATE_H - 70; // свободная высота между рядами за вычетом полей
    const step = n > 1 ? Math.min(34, room / (n - 1)) : 0;
    for (const b of list) b.busY = y + ROW_H / 2 + (lane.get(b)! - (n - 1) / 2) * step;
  }
}

/**
 * Вертикаль спуска к ребёнку не должна ложиться на чужую вертикаль (родительский стебель или спуск другой семьи).
 * Двигается только точка входа линии в карточку (внутри ширины карточки); если не помогает, делается обходное колено.
 * Координаты карточек и высоты шин не меняются. Возвращает число сдвинутых входов.
 */
export function separateDrops(buses: FamilyBus[]): number {
  const TOL = 8;
  const NEAR = [PLATE_W / 4, -PLATE_W / 4, PLATE_W * 0.42, -PLATE_W * 0.42];
  type Seg = { x: number; y1: number; y2: number; bus: FamilyBus; drop: number };
  const order = [...buses].sort((a, b) => (a.unionId < b.unionId ? -1 : 1));
  const segsOf = (): Seg[] => {
    const out: Seg[] = [];
    for (const b of order) {
      if (b.fromX != null && b.fromY != null) out.push({ x: b.fromX, y1: b.fromY, y2: b.busY, bus: b, drop: -1 });
      b.dropXs.forEach((x, i) => {
        const jy = b.jogY[i];
        out.push({ x, y1: b.busY, y2: jy ?? b.childTop, bus: b, drop: i });
        if (jy != null) out.push({ x: b.xs[i]!, y1: jy, y2: b.childTop, bus: b, drop: i });
      });
    }
    return out;
  };
  const clash = (segs: Seg[], b: FamilyBus, i: number, x: number, y1: number, y2: number) =>
    segs.some((s) => !(s.bus === b && s.drop === i) && Math.abs(s.x - x) < TOL && Math.min(s.y2, y2) - Math.max(s.y1, y1) > 1);
  let moved = 0;
  for (const b of order) {
    for (let i = 0; i < b.xs.length; i++) {
      const cx = b.xs[i]!;
      let segs = segsOf();
      if (!clash(segs, b, i, b.dropXs[i]!, b.busY, b.childTop)) continue;
      let done = false;
      for (const d of NEAR) {
        if (!clash(segs, b, i, cx + d, b.busY, b.childTop)) { b.dropXs[i] = cx + d; done = true; break; }
      }
      if (!done) {
        const jy = b.childTop - 22;
        for (const d of [PLATE_W / 2 + 14, -(PLATE_W / 2 + 14)]) {
          if (!clash(segs, b, i, cx + d, b.busY, jy) && !clash(segs, b, i, cx, jy, b.childTop)) { b.dropXs[i] = cx + d; b.jogY[i] = jy; done = true; break; }
        }
      }
      if (done) moved++;
      segs = [];
    }
  }
  return moved;
}
