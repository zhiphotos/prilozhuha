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

/** Братья и сёстры, поставленные после ядра (родителей и предков): `p` это тот, чьи родители `partners`, `out` сторона. */
type Deferred = { u: Union; p: string; out: -1 | 1; partners: string[] };

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

/**
 * Крыло человека относительно центральной пары: -1 родня левого из пары, 1 родня правого, 0 нейтрален или спорен.
 * Считается только по родословным связям (супруги, родители, дети), а не по тому, где человек оказался на листе:
 * одновременный обход от обоих половин пары, человек относится к тому, до кого ближе; при равной близости (родня обеих сторон,
 * браки двоюродных, повторяющиеся предки) крыла нет, такой человек ставится как раньше. Дети самой пары и их потомки нейтральны.
 * Нужна, чтобы родня одной стороны не оказывалась в блоке другой из-за нехватки места или второго брака предка.
 */
export function wingsOf(unions: Union[], known: ReadonlySet<string>, pair: { leftId: string; rightId?: string }): Map<string, -1 | 0 | 1> {
  const wing = new Map<string, -1 | 0 | 1>();
  const right = pair.rightId;
  if (!right || !known.has(right) || !known.has(pair.leftId)) return wing;
  const neutral = new Set<string>();
  const kidsOf = new Map<string, string[]>();
  for (const u of unions) for (const p of u.partnerIds) for (const c of u.childIds) (kidsOf.get(p) ?? kidsOf.set(p, []).get(p)!).push(c);
  const stack = unions.filter((u) => u.partnerIds.includes(pair.leftId) && u.partnerIds.includes(right)).flatMap((u) => u.childIds);
  while (stack.length) {
    const c = stack.pop()!;
    if (neutral.has(c)) continue;
    neutral.add(c);
    for (const k of kidsOf.get(c) ?? []) stack.push(k);
  }
  const adj = new Map<string, Set<string>>();
  for (const u of unions) {
    const members = [...u.partnerIds, ...u.childIds].filter((id) => known.has(id) && !neutral.has(id));
    for (const a of members) for (const b of members) if (a !== b) (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
  }
  const dist = new Map<string, [number, number]>();
  const walk = (start: string, k: 0 | 1, block: string) => {
    const d = new Map<string, number>([[start, 0]]);
    for (const queue = [start]; queue.length; ) {
      const cur = queue.shift()!;
      for (const o of adj.get(cur) ?? []) if (o !== block && !d.has(o)) { d.set(o, d.get(cur)! + 1); queue.push(o); }
    }
    for (const [id, v] of d) { const cur = dist.get(id) ?? [Infinity, Infinity]; cur[k] = v; dist.set(id, cur); }
  };
  walk(pair.leftId, 0, right);
  walk(right, 1, pair.leftId);
  for (const [id, [a, b]] of dist) wing.set(id, a < b ? -1 : b < a ? 1 : 0);
  return wing;
}

/** Запись «здесь родителям или новому супругу не хватило места»: сколько места они занимают в рядах относительно якоря (того, у кого родители или кто женат). */
type PhEntry = { key: string; anchor: string; /** Семья родителей, у которых стоит якорь: резерв берётся для всех её блоков сразу. */ group?: string; /** Кто размещается: по нему видно, что место уже использовано. */ owner: string; /** [ряд, левый край, правый край] относительно x якоря. */ rows: [number, number, number][]; blocked: boolean };
type Phantoms = Map<string, PhEntry[]>;
/** Размещения, которые раскладка «видела» в этом проходе (ключ: `id^` родители человека, `id>q` новый супруг). */
type Journal = Map<string, PhEntry>;
/** Сколько карточек можно отодвинуть новый супруг предка от своей пары, прежде чем его блок уйдёт на общий шаг. */
const OTHER_MARRIAGE_MAX = 6;

function layoutPass(people: Person[], unionsIn: Union[], pair: { leftId: string; rightId?: string }, ph: Phantoms | null, rec: Journal | null) {
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
  const pgroup = new Map<string, string>();
  const detached = new Set<string>();
  /** Крыло каждого человека (см. wingsOf): по нему, а не по координате, определяется «своя» сторона. */
  const wing = wingsOf(unions, new Set(byId.keys()), pair);
  const wingOf = (id: string): -1 | 0 | 1 => wing.get(id) ?? 0;
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

  /** Резерв места (второй проход): якорь занимает в верхних рядах и рядом с собой ещё и то место, которое в прошлый раз пришлось искать далеко. Только в контуре рядов, людей он не добавляет. */
  const addPhantom = (sub: Sub, id: string, x: number) => {
    for (const e of ph?.get(id) ?? []) {
      if (placed.has(e.owner) || sub.rel.has(e.owner)) continue;
      for (const [l, lo, hi] of e.rows) {
        const row = sub.rows.get(l);
        sub.rows.set(l, row ? [Math.min(row[0], x + lo), Math.max(row[1], x + hi)] : [x + lo, x + hi]);
      }
    }
  };
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
    if (ph) members.forEach((m, i) => addPhantom(sub, m, start + i * GAP));
    return moved(sub, -sub.rel.get(id)!);
  };

  /**
   * Семья, из которой вышел человек p: его родители рядом друг с другом, над каждым его собственные родители (ветви расходятся влево и вправо),
   * братья и сёстры p с потомством стоят с внешней стороны `out`. Сам p и его супруг сюда не входят: их ставит вызывающий.
   */
  const famUp = (p: string, out: -1 | 1, defer: Deferred[] | null = null): Sub | null => {
    const u = parentUnion.get(p);
    if (!u) return null;
    const partners = order(u.partnerIds.filter((q) => !placed.has(q) && byId.has(q))).sort((a, b) => wish(a) - wish(b) || Number(byId.get(a)?.gender !== "m") - Number(byId.get(b)?.gender !== "m"));
    if (!partners.length) return null;
    for (const q of partners) { placed.add(q); pgroup.set(q, u.id); }
    const lv = level(partners[0]!);
    const ups = partners.map((q, i) => famUp(q, partners.length > 1 ? (i === 0 ? -1 : 1) : out, defer));
    const sub = emptySub();
    let x0 = 0;
    const [aL, aR] = ups;
    /** Резерв места у партнёра (второй проход): сколько ему оставлено по рядам слева и справа (относительно его карточки). Использованные записи не считаются. */
    const reserve = (q: string, add: number, into: Map<number, [number, number]>) => {
      for (const e of ph?.get(q) ?? []) {
        if (placed.has(e.owner)) continue;
        for (const [l, lo, hi] of e.rows) {
          const cur = into.get(l);
          into.set(l, cur ? [Math.min(cur[0], add + lo), Math.max(cur[1], add + hi)] : [add + lo, add + hi]);
        }
      }
    };
    if (partners.length === 2) {
      let right = aR ?? emptySub();
      const left = aL ?? emptySub();
      const row = (c: Contour) => c.get(lv);
      const need = (l: number) => (l === lv ? 3 * GAP : GAP);
      let s = pushRight(left.rows, right.rows, need);
      // Блок пары вместе с зарезервированным местом: слева от него чужие карточки не ближе карточки, справа тоже (границы x0 по всем рядам).
      const pairRows = new Map<number, [number, number]>([[lv, [0, GAP]]]);
      if (ph) { reserve(partners[0]!, 0, pairRows); reserve(partners[1]!, GAP, pairRows); }
      let loX = -Infinity;
      for (const [l, [a]] of pairRows) { const lh = left.rows.get(l); if (lh) loX = Math.max(loX, lh[1] + GAP - a); }
      if (ph && Number.isFinite(s)) {
        let hiBase = Infinity;
        for (const [l, [, b]] of pairRows) { const rl = right.rows.get(l); if (rl) hiBase = Math.min(hiBase, rl[0] - GAP - b); }
        if (Number.isFinite(loX) && Number.isFinite(hiBase)) s = Math.max(s, loX - hiBase);
      }
      const sFin = Number.isFinite(s) ? Math.max(s, 0) : GAP;
      right = moved(right, sFin);
      join(sub, left);
      join(sub, right);
      const cL = aL ? centreOf(aL, partners[0]!, u) : 0;
      const cR = aR ? centreOf(moved(aR, sFin), partners[1]!, u) : cL + 2 * GAP;
      const want = (cL + cR) / 2 - GAP / 2;
      const lo = ph ? loX : (row(sub.rows) && row(left.rows) ? row(left.rows)![1] + GAP : -Infinity);
      let hi = row(right.rows) ? row(right.rows)![0] - 2 * GAP : Infinity;
      if (ph) { hi = Infinity; for (const [l, [, b]] of pairRows) { const rl = right.rows.get(l); if (rl) hi = Math.min(hi, rl[0] - GAP - b); } }
      x0 = Math.min(Math.max(want, lo), Math.max(lo, hi));
      put(sub, partners[0]!, lv, x0);
      put(sub, partners[1]!, lv, x0 + GAP);
    } else {
      const only = aL ?? emptySub();
      join(sub, only);
      const cL = aL ? centreOf(aL, partners[0]!, u) : 0;
      const hi = only.rows.get(lv)?.[1];
      x0 = hi !== undefined ? Math.max(cL, hi + GAP) : cL;
      if (ph) {
        const own = new Map<number, [number, number]>();
        reserve(partners[0]!, 0, own);
        for (const [l, [a]] of own) { const oh = only.rows.get(l); if (oh) x0 = Math.max(x0, oh[1] + GAP - a); }
      }
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
          if (ph) for (const id of part.rel.keys()) addPhantom(ex, id, ex.rel.get(id)!);
          void rel;
          // q в нулевой точке: ставим его в слот рядом с pt, затем отодвигаем наружу, пока не перестанет налезать на уже стоящих.
          const ideal = ptX + dir * GAP - qx;
          let shift = ideal;
          // Второй проход: место, оставленное другим партнёру этой пары, здесь уже занято (своё не считается).
          let ctx = sub.rows;
          if (ph && partners.length === 2) {
            const tmp: Sub = { rel: sub.rel, rows: new Map(sub.rows) };
            for (const o of partners) if (o !== pt) addPhantom(tmp, o, sub.rel.get(o)!);
            ctx = tmp.rows;
          }
          const clash = dir < 0 ? pushLeft(ctx, ex.rows) : pushRight(ctx, ex.rows);
          const placedEx = moved(ex, shift);
          const c2 = dir < 0 ? pushLeft(ctx, placedEx.rows) : pushRight(ctx, placedEx.rows);
          void clash;
          if (Number.isFinite(c2) && (dir < 0 ? c2 < 0 : c2 > 0)) shift += c2;
          // Во втором проходе допустимо отодвинуть блок дальше, если он широкий: дети под серединой пары не должны налезать на соседний блок.
          const blockCards = Math.max(...[...ex.rows.values()].map(([a, b]) => (b - a) / GAP));
          if (Math.abs(shift - ideal) > (ph ? Math.max(OTHER_MARRIAGE_MAX, blockCards + 2) : 3) * GAP) {
            // слишком далеко: оставляем решение общему шагу 3 (ближайшее свободное место), здесь не рвём раскладку
            for (const id of part.rel.keys()) placed.delete(id);
            continue;
          }
          join(sub, moved(ex, shift));
          if (rec) rec.set(`${pt}>${q}`, { key: `${pt}>${q}`, anchor: pt, owner: q, group: u.id, rows: [...ex.rows].map(([l, [lo, hi]]) => [l, lo + shift - ptX, hi + shift - ptX] as [number, number, number]), blocked: Math.abs(shift - ideal) > GAP });
        }
      }
    });
    // Братья и сёстры p: рядом по внешнюю сторону, ниже родителей.
    // Резерв рядом с родителями (второй проход): ставится до братьев и сестёр, чтобы они не заняли место, которое в прошлый раз пришлось искать далеко.
    if (ph) for (const q of partners) addPhantom(sub, q, sub.rel.get(q)!);
    if (defer) {
      // Второй проход, этап «ядро»: сначала родители и предки над ребёнком, братья и сёстры с потомством потом, своим поиском места.
      defer.push({ u, p, out, partners: partners.slice() });
      return sub;
    }
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
  // Занятые места по рядам (отсортированы) и границы крыльев: пополняются по мере того, как люди попадают в total, чтобы не пересчитывать всё при каждом поиске.
  const occ = new Map<number, number[]>();
  const minR = new Map<number, number>(), maxL = new Map<number, number>();
  const pending: string[] = [];
  const addT = (sub: Sub) => {
    join(total, sub);
    for (const id of sub.rel.keys()) pending.push(id);
  };
  const flush = () => {
    for (const id of pending) {
      const x = total.rel.get(id)!, l = level(id);
      const arr = occ.get(l) ?? occ.set(l, []).get(l)!;
      let lo = 0, hi = arr.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m]! < x) lo = m + 1; else hi = m; }
      arr.splice(lo, 0, x);
      const w = wingOf(id);
      if (w === 1) minR.set(l, Math.min(minR.get(l) ?? Infinity, x));
      if (w === -1) maxL.set(l, Math.max(maxL.get(l) ?? -Infinity, x));
    }
    pending.length = 0;
  };
  for (const id of total.rel.keys()) pending.push(id);
  /** Есть ли в ряду занятое место ближе одной карточки к `p`. */
  const taken = (arr: number[], p: number) => {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m]! < p - GAP) lo = m + 1; else hi = m; }
    for (let i = Math.max(0, lo - 1); i < arr.length && arr[i]! < p + GAP; i++) if (Math.abs(arr[i]! - p) < GAP - 0.5) return true;
    return false;
  };
  /** Ближайший к желаемому свободный сдвиг: подвеска не должна стоять ближе одной карточки ни к кому в своём ряду (дырки между семьями используются). */
  const nearFree = (sub: Sub, desired: number): number => {
    flush();
    // Крыло главнее места: человек левого крыла не встаёт правее человека правого крыла в том же ряду, и наоборот.
    // Свободный слот ищется дальше, на своей стороне; у кого крыла нет (спорные, нейтральные), ограничений нет, как раньше.
    const wingOk = (shift: number) => {
      for (const [id, x] of sub.rel) {
        const w = wingOf(id), l = level(id);
        if (w === -1 && (minR.get(l) ?? Infinity) - GAP < x + shift) return false;
        if (w === 1 && (maxL.get(l) ?? -Infinity) + GAP > x + shift) return false;
      }
      return true;
    };
    // Места, оставленные про запас во втором проходе: у якоря в total они заняты тем, кого туда уже ставили в прошлый раз.
    const hold = new Map<number, [number, number][]>();
    if (ph) for (const [anchor, list] of ph) {
      const ax = total.rel.get(anchor);
      if (ax === undefined) continue;
      for (const e of list) {
        if (sub.rel.has(e.owner) || total.rel.has(e.owner)) continue;
        for (const [l, lo, hi] of e.rows) (hold.get(l) ?? hold.set(l, []).get(l)!).push([ax + lo, ax + hi]);
      }
    }
    const fits = (shift: number) => {
      if (!wingOk(shift)) return false;
      for (const [id, x] of sub.rel) {
        const l = level(id), p = x + shift;
        const row = occ.get(l);
        if (row && taken(row, p)) return false;
        const h = hold.get(l);
        if (h) for (const [a, b] of h) if (p > a - GAP + 0.5 && p < b + GAP - 0.5) return false;
      }
      return true;
    };
    if (fits(desired)) return desired;
    for (let k = 1; k < 4000; k++) for (const shift of [desired + k * 40, desired - k * 40]) if (fits(shift)) return shift;
    return desired;
  };
  /** Братья и сёстры, отложенные при постановке ядра (родители и предки): каждая группа ищет себе место рядом с родителями отдельно. */
  const placeDeferred = (list: Deferred[]) => {
    for (const d of list) {
      const sibs = order(d.u.childIds.filter((c) => c !== d.p && !placed.has(c)));
      const group = emptySub();
      for (const c of sibs) {
        if (placed.has(c)) continue;
        const part = descend(c);
        const s = group.rel.size ? pushRight(group.rows, part.rows) : 0;
        join(group, moved(part, Number.isFinite(s) ? s : 0));
      }
      if (!group.rel.size) continue;
      const px = d.partners.map((q) => total.rel.get(q)).filter((v): v is number => v !== undefined);
      if (!px.length) continue;
      const centre = (Math.min(...px) + Math.max(...px)) / 2;
      const gx = [...group.rel.values()];
      const want = d.out < 0 ? centre - GAP - Math.max(...gx) : centre + GAP - Math.min(...gx);
      const shift = nearFree(group, want);
      addT(moved(group, shift));
      if (Math.abs(shift - want) > 6 * GAP) for (const c of sibs) flagFar(c);
    }
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
      addT(moved(group, shift));
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
      const side: -1 | 1 = wingOf(id) !== 0 ? (wingOf(id) as -1 | 1) : total.rel.get(id)! < centreX ? -1 : 1;
      if (parentUnion.get(id) && parentUnion.get(id)!.partnerIds.some((q) => !placed.has(q))) {
        // Второй проход: если в прошлый раз родителям этого человека не хватило места, сначала ставится ядро, братья и сёстры потом.
        const key = `${id}^`;
        const defer: Deferred[] | null = ph?.get(id)?.some((e) => e.key === key) ? [] : null;
        const sub = famUp(id, side, defer);
        if (sub && sub.rel.size) {
          // Родители встают над своим ребёнком, а если над ним занято, в ближайшее свободное место (не на край листа).
          const c = ctr(sub, id, 0);
          const own = total.rel.get(id)!;
          const want = own - (c ?? 0);
          const shift = nearFree(sub, want);
          addT(moved(sub, shift));
          if (c === null || Math.abs(c + shift - own) > 6 * GAP) flagFar(id);
          if (rec && c !== null) {
            const rows: [number, number, number][] = [];
            for (const [l, [lo, hi]] of sub.rows) if (l < level(id)) rows.push([l, lo - c, hi - c]);
            rec.set(key, { key, anchor: id, owner: parentUnion.get(id)!.partnerIds.find((q) => sub.rel.has(q)) ?? id, rows, blocked: Math.abs(shift - want) > GAP / 2 });
          }
          if (defer) placeDeferred(defer);
          changed = true;
        }
      }
    }
    // Супруги, которых никто не поставил (второй брак предка и т. п.).
    for (const id of [...total.rel.keys()].sort()) {
      for (const u of unionsOf.get(id) ?? []) {
        for (const q of u.partnerIds) {
          if (placed.has(q) || !byId.has(q)) continue;
          const own = total.rel.get(id)!;
          let side: -1 | 1 = wingOf(id) !== 0 ? (wingOf(id) as -1 | 1) : own < centreX ? -1 : 1;
          // Рядом с человеком со стороны крыла уже стоит его партнёр: новый супруг встаёт с другой стороны, если там свободно.
          flush();
          const rowAt = occ.get(level(id)) ?? [];
          const spouseAt = (sd: number) => (unionsOf.get(id) ?? []).some((u2) => u2.partnerIds.some((r) => r !== id && Math.abs((total.rel.get(r) ?? Infinity) - (own + sd * GAP)) < GAP / 2));
          const baseSide = side;
          if (spouseAt(side) && !spouseAt(-side)) side = side === 1 ? -1 : 1;
          else if (taken(rowAt, own + side * GAP) && !taken(rowAt, own - side * GAP)) side = side === 1 ? -1 : 1;
          const flipped = side;
          // Первый проход ставит как раньше (на сторону крыла); для резерва записывается сторона, где место на самом деле свободно.
          if (!ph) side = baseSide;
          const sub = descend(q);
          const want = own + side * GAP;
          const shift = nearFree(sub, want);
          addT(moved(sub, shift));
          if (Math.abs(shift - own) > 3 * GAP) flagFar(q);
          if (rec) rec.set(`${id}>${q}`, { key: `${id}>${q}`, anchor: id, owner: q, group: pgroup.get(id), rows: [...sub.rows].map(([l, [lo, hi]]) => [l, lo + flipped * GAP, hi + flipped * GAP] as [number, number, number]), blocked: Math.abs(shift - want) > 2 * GAP });
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
  const finish = (mainRel: Map<string, number>): FamilyLayout => {
    const minGen = Math.min(...[...mainIds].map(level));
    const maxGen = Math.max(...[...mainIds].map(level));
    const mx = [...mainRel.values()];
    const minX = Math.min(...mx);
    const mainW = Math.max(...mx) - minX;
    const rowY = (r: number) => PAD_Y + PORTRAIT_R + r * ROW_H;
    const raw: { id: string; x: number; y: number; gen: number }[] = [];
    for (const [id, x] of mainRel) raw.push({ id, x: x - minX + PAD_X, y: rowY(level(id) - minGen), gen: level(id) });
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
  };
  return { finish, rel: main.rel, unions, detached, level, W, H };
}

/**
 * Общее выравнивание: все цепочки (супруги вплотную) разом тянутся к желаемым местам, порядок в ряду и зазор в карточку сохраняются
 * (ближайшая упорядоченная расстановка, метод объединения соседей). Тянут только семьи, где родители вышли за размах детей.
 * Само по себе может испортить семьи, которые были в порядке; поэтому после него идёт подтяжка по шагам и выбор по штрафу.
 */
function relaxParents(rel: Map<string, number>, unions: Union[], detached: Set<string>, level: (id: string) => number, W: string, H: string | undefined, iters = 40): void {
  type Chain = { members: string[]; x: number };
  const married = new Set<string>();
  const key2 = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const u of unions) if (u.partnerIds.length === 2) married.add(key2(u.partnerIds[0]!, u.partnerIds[1]!));
  const byLevel = new Map<number, string[]>();
  for (const id of rel.keys()) (byLevel.get(level(id)) ?? byLevel.set(level(id), []).get(level(id))!).push(id);
  const chainOf = new Map<string, Chain>();
  const rows: Chain[][] = [];
  for (const [, ids] of [...byLevel].sort((a, b) => a[0] - b[0])) {
    ids.sort((a, b) => rel.get(a)! - rel.get(b)! || (a < b ? -1 : 1));
    const chains: Chain[] = [];
    for (const id of ids) {
      const last = chains[chains.length - 1];
      const prev = last?.members[last.members.length - 1];
      const x = rel.get(id)!;
      if (last && prev !== undefined && Math.abs(x - rel.get(prev)! - GAP) < 1 && married.has(key2(prev, id))) last.members.push(id);
      else chains.push({ members: [id], x });
    }
    for (const c of chains) for (const m of c.members) chainOf.set(m, c);
    rows.push(chains);
  }
  const anchored = new Set<Chain>([chainOf.get(W), H ? chainOf.get(H) : undefined].filter((c): c is Chain => !!c));
  const off = new Map<string, number>();
  for (const c of chainOf.values()) c.members.forEach((m, i) => off.set(m, i * GAP));
  const pos = (id: string) => chainOf.get(id)!.x + off.get(id)!;
  // Порядок семей не должен зависеть от номеров союзов (они выдаются по порядку людей в файле): сортируем по людям.
  const fams = unions
    .filter((u) => u.partnerIds.length >= 2 && !u.childIds.some((c) => c === W || c === H))
    .map((u) => ({ ps: u.partnerIds.filter((q) => rel.has(q)), ks: u.childIds.filter((c) => rel.has(c)) }))
    .filter((f) => f.ps.length && f.ks.length)
    .sort((a, b) => { const ka = `${[...a.ps].sort().join("|")}#${[...a.ks].sort().join("|")}`, kb = `${[...b.ps].sort().join("|")}#${[...b.ks].sort().join("|")}`; return ka < kb ? -1 : ka > kb ? 1 : 0; });
  const TOL = 0.3 * GAP;
  for (let it = 0; it < iters; it++) {
    const acc = new Map<Chain, { s: number; w: number }>();
    const push = (c: Chain, d: number, w: number) => { const a = acc.get(c) ?? acc.set(c, { s: 0, w: 0 }).get(c)!; a.s += d * w; a.w += w; };
    let any = false;
    for (const f of fams) {
      const pm = f.ps.reduce((t, p) => t + pos(p), 0) / f.ps.length;
      const xs = f.ks.map(pos);
      const lo = Math.min(...xs), hi = Math.max(...xs);
      const d = pm < lo - TOL ? lo - pm : pm > hi + TOL ? hi - pm : 0;
      if (d === 0) continue;
      any = true;
      for (const p of f.ps) push(chainOf.get(p)!, d, 1 / f.ps.length);
      for (const k of f.ks) push(chainOf.get(k)!, -d, 1 / f.ks.length);
    }
    if (!any) break;
    for (const chains of rows) {
      const n = chains.length;
      const t: number[] = [], w: number[] = [], O: number[] = [];
      let o = 0;
      for (let i = 0; i < n; i++) {
        const c = chains[i]!;
        const a = acc.get(c);
        if (i > 0) o += (chains[i - 1]!.members.length - 1) * GAP + GAP;
        t.push((anchored.has(c) ? c.x : c.x + (a ? (a.s / a.w) * 0.7 : 0)) - o);
        w.push(anchored.has(c) ? 1000 : 1 + (a?.w ?? 0));
        O.push(o);
      }
      const blocks: { sum: number; w: number; cnt: number; val: number }[] = [];
      for (let i = 0; i < n; i++) {
        blocks.push({ sum: t[i]! * w[i]!, w: w[i]!, cnt: 1, val: t[i]! });
        while (blocks.length > 1 && blocks[blocks.length - 2]!.val > blocks[blocks.length - 1]!.val) {
          const b = blocks.pop()!, a = blocks.pop()!;
          const m = { sum: a.sum + b.sum, w: a.w + b.w, cnt: a.cnt + b.cnt, val: 0 };
          m.val = m.sum / m.w;
          blocks.push(m);
        }
      }
      let i = 0;
      for (const b of blocks) for (let k = 0; k < b.cnt; k++, i++) chains[i]!.x = b.val + O[i]!;
    }
  }
  for (const id of rel.keys()) rel.set(id, pos(id));
}

/**
 * Подтяжка родителей к детям на готовой раскладке: поиск по шагам, каждый шаг только улучшает общий штраф.
 * Двигаются цепочки (супруги, стоящие вплотную, едут вместе). Порядок карточек в ряду и зазор в карточку между соседями сохраняются:
 * сосед, которому стало тесно, сдвигается следом, а если упёрлись в центральную пару или в границы листа, шаг отменяется.
 * Штраф семьи: 0, пока середина родителей в размахе детей (допуск 0,6 карточки), иначе постоянная часть плюс расстояние
 * (до 16 карточек); отдельно штрафуются супруги дальше двух и трёх карточек друг от друга. Поэтому семьи в размахе не выходят из него
 * ради чужих, лист не становится шире, а пары не разъезжаются.
 */
function settleParents(rel: Map<string, number>, unions: Union[], detached: Set<string>, level: (id: string) => number, W: string, H: string | undefined): void {
  type Chain = { members: string[]; x: number; row: number; i: number; fams: number[]; pairs: number[] };
  const married = new Set<string>();
  const key2 = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const u of unions) if (u.partnerIds.length === 2) married.add(key2(u.partnerIds[0]!, u.partnerIds[1]!));
  const byLevel = new Map<number, string[]>();
  for (const id of rel.keys()) (byLevel.get(level(id)) ?? byLevel.set(level(id), []).get(level(id))!).push(id);
  const chainOf = new Map<string, Chain>();
  const rows: Chain[][] = [];
  let minB = Infinity, maxB = -Infinity;
  for (const x of rel.values()) { minB = Math.min(minB, x); maxB = Math.max(maxB, x); }
  for (const [l, ids] of [...byLevel].sort((a, b) => a[0] - b[0])) {
    ids.sort((a, b) => rel.get(a)! - rel.get(b)! || (a < b ? -1 : 1));
    const chains: Chain[] = [];
    for (const id of ids) {
      const last = chains[chains.length - 1];
      const prev = last?.members[last.members.length - 1];
      const x = rel.get(id)!;
      if (last && prev !== undefined && Math.abs(x - rel.get(prev)! - GAP) < 1 && married.has(key2(prev, id))) last.members.push(id);
      else chains.push({ members: [id], x, row: rows.length, i: chains.length, fams: [], pairs: [] });
    }
    void l;
    for (const c of chains) for (const m of c.members) chainOf.set(m, c);
    rows.push(chains);
  }
  const anchored = new Set<Chain>([chainOf.get(W), H ? chainOf.get(H) : undefined].filter((c): c is Chain => !!c));
  const off = new Map<string, number>();
  for (const c of chainOf.values()) c.members.forEach((m, i) => off.set(m, i * GAP));
  const pos = (id: string) => chainOf.get(id)!.x + off.get(id)!;
  // Порядок семей не должен зависеть от номеров союзов (они выдаются по порядку людей в файле): сортируем по людям.
  const fams = unions
    .filter((u) => u.partnerIds.length >= 2 && !u.childIds.some((c) => c === W || c === H))
    .map((u) => ({ ps: u.partnerIds.filter((q) => rel.has(q)), ks: u.childIds.filter((c) => rel.has(c)) }))
    .filter((f) => f.ps.length && f.ks.length)
    .sort((a, b) => { const ka = `${[...a.ps].sort().join("|")}#${[...a.ks].sort().join("|")}`, kb = `${[...b.ps].sort().join("|")}#${[...b.ks].sort().join("|")}`; return ka < kb ? -1 : ka > kb ? 1 : 0; });
  const pairs = unions.filter((u) => u.partnerIds.length === 2 && u.partnerIds.every((q) => rel.has(q))).map((u) => (u.partnerIds[0]! < u.partnerIds[1]! ? [u.partnerIds[0]!, u.partnerIds[1]!] : [u.partnerIds[1]!, u.partnerIds[0]!]) as readonly [string, string]).sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : a[0] + a[1] > b[0] + b[1] ? 1 : 0));
  fams.forEach((f, k) => { for (const id of [...f.ps, ...f.ks]) { const c = chainOf.get(id)!; if (!c.fams.includes(k)) c.fams.push(k); } });
  pairs.forEach(([a, b], k) => { for (const id of [a, b]) { const c = chainOf.get(id)!; if (!c.pairs.includes(k)) c.pairs.push(k); } });
  const famD = (f: (typeof fams)[number]) => {
    const pm = f.ps.reduce((t, p) => t + pos(p), 0) / f.ps.length;
    let lo = Infinity, hi = -Infinity;
    for (const k of f.ks) { const x = pos(k); if (x < lo) lo = x; if (x > hi) hi = x; }
    return pm < lo ? (lo - pm) / GAP : pm > hi ? (pm - hi) / GAP : 0;
  };
  const famCost = (k: number) => famCostOf(famD(fams[k]!));
  const pairCost = (k: number) => { const [a, b] = pairs[k]!; return pairCostOf(Math.abs(pos(a) - pos(b)) / GAP); };
  const costOf = (cs: Chain[]) => {
    const fs = new Set<number>(), ps = new Set<number>();
    for (const c of cs) { for (const k of c.fams) fs.add(k); for (const k of c.pairs) ps.add(k); }
    let t = 0;
    for (const k of fs) t += famCost(k);
    for (const k of ps) t += pairCost(k);
    return t;
  };
  /** Сдвиг цепочки на δ с цепочкой сдвигов у соседей; null, если упёрлись. */
  const cascade = (c: Chain, delta: number): [Chain, number][] | null => {
    const row = rows[c.row]!;
    const out: [Chain, number][] = [];
    const len = (q: Chain) => (q.members.length - 1) * GAP;
    let nx = c.x + delta;
    if (anchored.has(c)) return null;
    if (nx < minB - 1e-6 || nx + len(c) > maxB + 1e-6) return null;
    out.push([c, nx]);
    if (delta > 0) {
      for (let j = c.i + 1; j < row.length; j++) {
        const q = row[j]!;
        const need = nx + len(row[j - 1]!) + GAP;
        if (q.x >= need - 1e-6) break;
        if (anchored.has(q) || need + len(q) > maxB + 1e-6) return null;
        out.push([q, need]);
        nx = need;
      }
    } else {
      for (let j = c.i - 1; j >= 0; j--) {
        const q = row[j]!;
        const need = nx - GAP - len(q);
        if (q.x <= need + 1e-6) break;
        if (anchored.has(q) || need < minB - 1e-6) return null;
        out.push([q, need]);
        nx = need;
      }
    }
    return out;
  };
  /** Проба шага: выигрыш по штрафу и список новых положений; положения при этом не меняются. */
  const probe = (c: Chain, delta: number): { gain: number; mv: [Chain, number][] } | null => {
    if (Math.abs(delta) < 1) return null;
    const mv = cascade(c, delta);
    if (!mv) return null;
    const chs = mv.map(([q]) => q);
    const before = costOf(chs);
    const old = mv.map(([q]) => q.x);
    mv.forEach(([q, x]) => { q.x = x; });
    const gain = before - costOf(chs);
    mv.forEach(([q], k) => { q.x = old[k]!; });
    return gain > 1e-6 ? { gain, mv } : null;
  };
  const candidates = (c: Chain): number[] => {
    const out: number[] = [];
    for (const k of c.fams) {
      const f = fams[k]!;
      if (famD(f) <= 0.6) continue;
      const pm = f.ps.reduce((t, p) => t + pos(p), 0) / f.ps.length;
      const inC = f.ps.filter((p) => chainOf.get(p) === c).length;
      const ks = f.ks.map(pos);
      const lo = Math.min(...ks), hi = Math.max(...ks);
      if (inC) {
        const want = Math.min(Math.max(pm, lo), hi) - pm;
        const mid = (lo + hi) / 2 - pm;
        for (const w of [want, mid, want / 2]) out.push((w * f.ps.length) / inC);
      }
      for (const q of f.ks) if (chainOf.get(q) === c) { out.push(pm - pos(q)); out.push((pm - pos(q)) / 2); }
    }
    return out;
  };
  const all = rows.flat();
  const worst = (c: Chain) => Math.max(0, ...c.fams.map((k) => famD(fams[k]!)));
  for (let sweep = 0; sweep < 14; sweep++) {
    let improved = 0;
    const work = all.filter((c) => worst(c) > 0.6).sort((a, b) => worst(b) - worst(a) || a.row - b.row || a.i - b.i);
    for (const c of work) {
      if (worst(c) <= 0.6) continue;
      let best: { gain: number; mv: [Chain, number][] } | null = null;
      for (const d of candidates(c)) {
        const r = probe(c, d);
        if (r && (!best || r.gain > best.gain + 1e-9)) best = r;
      }
      if (best) { for (const [q, x] of best.mv) q.x = x; improved++; }
    }
    if (!improved) break;
  }
  for (const id of rel.keys()) rel.set(id, pos(id));
}

/** Штраф семьи по тому, насколько середина родителей вышла за размах детей (в карточках): в размахе 0, иначе постоянная часть и расстояние до 16 карточек. */
const famCostOf = (d: number) => (d <= 0.6 ? 0 : 2.5 + 0.6 * Math.min(d, 16));
/** Штраф пары супругов: дальше двух карточек появляется ссылка, дальше трёх линия идёт дугой. */
const pairCostOf = (gaps: number) => (gaps > 2.05 ? 0.5 : 0) + (gaps > 3.05 ? 1 : 0);
/** Общий штраф раскладки для выбора лучшей из версий (меньше лучше): семьи, пары супругов и немного ширины листа. */
function parentsPenalty(L: FamilyLayout, unions: Union[], pair: { leftId: string; rightId?: string }): number {
  const at = new Map(L.nodes.map((n) => [n.id, n]));
  const main = new Set(L.mainIds);
  let sum = 0;
  for (const u of unions) {
    const ps = u.partnerIds.map((q) => at.get(q)).filter((n): n is NonNullable<typeof n> => !!n && main.has(n.id));
    if (u.partnerIds.length === 2 && ps.length === 2) sum += pairCostOf(Math.abs(ps[0]!.x - ps[1]!.x) / GAP);
    if (u.partnerIds.length < 2 || u.childIds.some((c) => c === pair.leftId || c === pair.rightId)) continue;
    const ks = u.childIds.map((q) => at.get(q)).filter((n): n is NonNullable<typeof n> => !!n && main.has(n.id));
    if (!ps.length || !ks.length) continue;
    const pm = ps.reduce((t, n) => t + n.x, 0) / ps.length;
    const lo = Math.min(...ks.map((k) => k.x)), hi = Math.max(...ks.map((k) => k.x));
    sum += famCostOf(pm < lo ? (lo - pm) / GAP : pm > hi ? (pm - hi) / GAP : 0);
  }
  return sum + (L.width / GAP) * 0.03;
}
/** Супруги, стоящие дальше трёх карточек друг от друга. */
function splitPairs(L: FamilyLayout, unions: Union[]): number {
  const at = new Map(L.nodes.map((n) => [n.id, n]));
  let n = 0;
  for (const u of unions) {
    const ps = u.partnerIds.map((q) => at.get(q)).filter((x): x is NonNullable<typeof x> => !!x);
    if (u.partnerIds.length === 2 && ps.length === 2 && Math.abs(ps[0]!.x - ps[1]!.x) > 3 * GAP) n++;
  }
  return n;
}
/** Перекрытия карточек в одном ряду (на близости меньше карточки). */
function rowOverlaps(L: FamilyLayout): number {
  const rows = new Map<number, number[]>();
  for (const n of L.nodes) (rows.get(n.y) ?? rows.set(n.y, []).get(n.y)!).push(n.x);
  let n = 0;
  for (const xs of rows.values()) { xs.sort((a, b) => a - b); for (let i = 1; i < xs.length; i++) if (xs[i]! - xs[i - 1]! < GAP - 1) n++; }
  return n;
}
/** Сколько раз повторять раскладку с резервом места и насколько широкий резерв допустим (в карточках в одном ряду). */
const PHANTOM_REPEATS = 3;
/** Во сколько раз ширина листа после выравнивания может превысить ширину первого прохода (в среднем по деревьям выходит около +12%). */
const WIDTH_LIMIT = 1.3;
const PHANTOM_MAX_ROW = 30;

/**
 * Раскладка в несколько этапов, чтобы родители стояли над своими детьми.
 * 1. Первый проход как был: родители ребёнка и новые супруги предков ставятся на оставшиеся места и, если там тесно, уезжают далеко от детей.
 *    Заодно ведётся журнал: кому места не хватило и сколько оно занимало.
 * 2. Второй проход (до 3 повторов): те, кому не хватило, оставляют резерв в рядах у своего якоря (ребёнка или партнёра), соседи расходятся
 *    заранее; родители ставятся сначала ядром (они и предки), братья и сёстры потом. Берётся проход с лучшим штрафом.
 * 3. Подтяжка на готовой раскладке (порядок в рядах не меняется): шаги, каждый из которых улучшает штраф, в том числе после общего выравнивания.
 * Версия принимается, только если никто не потерян, карточки не налезают, пар, разорванных дальше трёх карточек, не больше, чем в первом проходе,
 * а лист не шире первого прохода больше чем в `WIDTH_LIMIT` раз. Первый проход всегда в числе кандидатов: если улучшить нечего, раскладка прежняя.
 * Центральная пара, крылья и ручные сдвиги (раскладка их не читает) не затрагиваются.
 */
export function layoutFamily(people: Person[], unionsIn: Union[], pair: { leftId: string; rightId?: string }): FamilyLayout {
  const unions = [...unionsIn].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let rec: Journal = new Map();
  let cur = layoutPass(people, unionsIn, pair, null, rec);
  let best = cur.finish(cur.rel);
  const flagged = new Map<string, PhEntry>();
  let bestScore = parentsPenalty(best, unions, pair);
  const baseWidth = best.width;
  const baseSplit = splitPairs(best, unions);
  const baseOverlaps = rowOverlaps(best);
  const baseNodes = best.nodes.length;
  /** Версия годится, если никого не потеряла, не наложила карточки, не разорвала больше пар и не раздула лист. */
  const okCand = (c: FamilyLayout) => c.nodes.length === baseNodes && rowOverlaps(c) <= baseOverlaps && splitPairs(c, unions) <= baseSplit && c.width <= baseWidth * WIDTH_LIMIT;
  let bestRun = cur;
  for (let rep = 0; rep < PHANTOM_REPEATS; rep++) {
    let added = false;
    for (const [k, e] of [...rec].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (flagged.has(k) && !e.rows.length) continue;
      const wide = Math.max(0, ...e.rows.map(([, lo, hi]) => (hi - lo) / GAP));
      if (e.blocked && !flagged.has(k) && wide <= PHANTOM_MAX_ROW) { flagged.set(k, e); added = true; }
      else if (flagged.has(k)) flagged.set(k, e);
    }
    // Если у родителей одной семьи место понадобилось одному блоку, оставляем его и остальным: иначе они займут друг у друга.
    const groups = new Set([...flagged.values()].map((e) => e.group).filter((g): g is string => !!g));
    for (const [k, e] of [...rec].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (flagged.has(k) || !e.group || !groups.has(e.group) || !e.rows.length) continue;
      if (Math.max(0, ...e.rows.map(([, lo, hi]) => (hi - lo) / GAP)) <= PHANTOM_MAX_ROW) { flagged.set(k, e); added = true; }
    }
    if (!added) break;
    const ph: Phantoms = new Map();
    for (const e of [...flagged.values()].sort((a, b) => (a.key < b.key ? -1 : 1))) (ph.get(e.anchor) ?? ph.set(e.anchor, []).get(e.anchor)!).push(e);
    rec = new Map();
    cur = layoutPass(people, unionsIn, pair, ph, rec);
    const next = cur.finish(cur.rel);
    const sc = parentsPenalty(next, unions, pair);
    if (sc < bestScore - 1e-9 && okCand(next)) { best = next; bestScore = sc; bestRun = cur; }
    else if (rep > 0) break; // повтор ничего не дал: дальше резерв не растёт
  }
  // Подтяжка на готовой раскладке. Версии: только подтяжка по шагам; общее выравнивание, потом подтяжка. Берётся версия с лучшим штрафом.
  const tune = (shape: boolean) => {
    const rel = new Map(bestRun.rel);
    if (shape) relaxParents(rel, bestRun.unions, bestRun.detached, bestRun.level, bestRun.W, bestRun.H);
    settleParents(rel, bestRun.unions, bestRun.detached, bestRun.level, bestRun.W, bestRun.H);
    compactCuts(rel, bestRun.unions, bestRun.detached, bestRun.level);
    return bestRun.finish(rel);
  };
  for (const cand of [tune(false), tune(true)]) {
    const sc = parentsPenalty(cand, unions, pair);
    if (sc < bestScore - 1e-9 && okCand(cand)) { best = cand; bestScore = sc; }
  }
  return best;
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
