// Слой выбора раскладки (этап 4.1). Единственное место, где решается, каким движком строить древо.
//   classic: прежний `layoutTree`, результат не меняется ни на байт (плюс пустые поля ссылок).
//   family:  `layoutFamily` (пара в центре, ветки в стороны), приведённый к формату приложения.
// Важно: у `family` расстановка зависит только от людей, связей и ЦЕНТРАЛЬНОЙ ПАРЫ. Выбранный человек (`focusId`) в расчёте не участвует:
// его смена двигает только камеру, выделение и подписи родства. Центральная пара задаётся явно (`pair`) или выводится из владельца книги (`ownerId`).
// Формат `.tree` и синхронизация не затронуты: пара нигде не хранится.
import { layoutFamily, separateDrops, type FamilyBus, type FamilySpouse, type RefCard } from "./family-layout.ts";
import { busIsFar } from "./bus-look.ts";
import { H_GAP, PLATE_GAP, PLATE_H, PLATE_W, PORTRAIT_R } from "./metrics.ts";
import { pillPoint, pillSize } from "./scheme-paths.ts";
import { layoutTree } from "./layout.ts";
import type { GenLabel, Person, TreeLayout, Union } from "./types.ts";

export type LayoutEngine = "classic" | "family";
export type CentralPair = { leftId: string; rightId?: string };

/** Результат выбора пары. `ambiguous`: у владельца несколько браков, и без явного выбора супруга пара не назначается (в центре один владелец). */
export type GroupLabel = {
  kind: "branches" | "singles";
  text: string;
  /** Вторая строка мелким шрифтом: сколько веток и людей. */
  sub: string;
  x: number;
  y: number;
  /** Людей в группе (для «Записи без связей» это N). */
  count: number;
  /** Карточка, на которую встаёт камера при переходе к группе (верхняя левая). */
  anchorId: string;
};

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  return n + " " + (m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many);
}

/** Подписи над отдельными ветками и над сеткой одиночек. Считаются по готовым координатам (после зеркала), сама раскладка не меняется. */
export function groupLabels(L: Pick<AppLayout, "nodes"> & { blocks?: string[][]; singles?: string[] }): GroupLabel[] {
  const at = new Map(L.nodes.map((n) => [n.id, n]));
  const out: GroupLabel[] = [];
  const make = (kind: GroupLabel["kind"], ids: string[], text: string, sub: string) => {
    const ns = ids.map((id) => at.get(id)).filter((n): n is NonNullable<typeof n> => Boolean(n));
    if (!ns.length) return;
    const top = ns.reduce((a, b) => (b.y < a.y || (b.y === a.y && b.x < a.x) ? b : a));
    const minY = Math.min(...ns.map((n) => n.y));
    out.push({ kind, text, sub, x: Math.min(...ns.map((n) => n.x)) - PLATE_W / 2, y: minY - PORTRAIT_R - 34, count: ns.length, anchorId: top.id });
  };
  const blockIds = (L.blocks ?? []).flat();
  if (blockIds.length) make("branches", blockIds, "Отдельные ветки", `${plural(L.blocks!.length, "группа", "группы", "групп")}, ${plural(blockIds.length, "человек", "человека", "человек")}`);
  const singles = L.singles ?? [];
  if (singles.length) make("singles", singles, `Записи без связей: ${singles.length}`, "связей пока нет: добавьте родителей, супруга или детей");
  return out;
}

export type PairResolution = { pair: CentralPair; ambiguous: boolean; candidates: string[] };

export type AppLayout = Omit<TreeLayout, "buses" | "spouses"> & {
  spouses: (TreeLayout["spouses"][number] & Partial<Pick<FamilySpouse, "arcH" | "pillT" | "pillDir" | "arcTop">>)[];
  buses: (TreeLayout["buses"][number] & Partial<Pick<FamilyBus, "dropXs" | "jogY">>)[];
  /** Карточки-ссылки (только у `family`; у `classic` пусто). Это не люди. */
  refs: RefCard[];
  refLinks: { refId: string; of: string; x1: number; y1: number; x2: number; y2: number }[];
  engine: LayoutEngine;
  /** Подписи групп под основным деревом (только у `family`): «Отдельные ветки» и «Записи без связей: N». Пусто, если групп нет. */
  groups?: GroupLabel[];
  /** Центральная пара (только у `family`). */
  pair?: PairResolution;
};

export type BuildOptions = {
  engine?: LayoutEngine;
  /** Владелец книги: от него выводится центральная пара. Не равен `focusId`: тот меняется, владелец нет. */
  ownerId?: string;
  /** Явная центральная пара (например, «Схема из выбранного»): главнее `ownerId`. */
  pair?: CentralPair;
  /** Явный выбор супруга, когда у владельца несколько браков. */
  spouseId?: string | null;
};

const isPlaceholder = (id: string) => id.startsWith("__");

/**
 * Центральная пара по владельцу. Настоящий супруг: человек из союза ровно двух партнёров, не пустая заготовка.
 * Один такой супруг: пара. Нет супругов: один владелец. Несколько: пара только при явном `spouseId`, иначе `ambiguous` и один владелец
 * (последнего супруга по году не выбираем: это была бы тихая догадка).
 */
export function resolveCentralPair(people: Person[], unions: Union[], ownerId: string, spouseId?: string | null): PairResolution {
  const known = new Set(people.map((p) => p.id));
  const candidates = [
    ...new Set(
      unions
        .filter((u) => u.partnerIds.length === 2 && u.partnerIds.includes(ownerId))
        .map((u) => u.partnerIds.find((id) => id !== ownerId)!)
        .filter((id) => id && id !== ownerId && known.has(id) && !isPlaceholder(id)),
    ),
  ].sort();
  if (candidates.length === 1) return { pair: { leftId: ownerId, rightId: candidates[0]! }, ambiguous: false, candidates };
  if (candidates.length > 1 && spouseId && candidates.includes(spouseId)) return { pair: { leftId: ownerId, rightId: spouseId }, ambiguous: false, candidates };
  return { pair: { leftId: ownerId }, ambiguous: candidates.length > 1, candidates };
}

/** Подписи рядов, как у `classic` (слова те же; считаются от поколения центральной пары). */
function rowLabel(delta: number): string {
  if (delta === 0) return "Вы и ваши";
  const n = Math.abs(delta);
  if (delta < 0) return n === 1 ? "Родители" : n === 2 ? "Деды" : n === 3 ? "Прадеды" : `${n + 1} колено вверх`;
  return n === 1 ? "Дети" : n === 2 ? "Внуки" : n === 3 ? "Правнуки" : `${n + 1} колено вниз`;
}

/** Вертикальное зеркало (`flow: up`): дети над родителями. Отражаются все y-координаты; карточка симметрична, поэтому входы линий остаются на своих краях. */
export function mirrorVertical<T extends Pick<AppLayout, "nodes" | "spouses" | "buses" | "labels" | "refs" | "refLinks">>(L: T): T {
  const ys = [...L.nodes.map((n) => n.y), ...L.refs.map((r) => r.y)];
  if (!ys.length) return L;
  const M = Math.min(...ys) + Math.max(...ys);
  const f = (y: number) => M - y;
  const fn = (y: number | null) => (y == null ? y : f(y));
  return {
    ...L,
    nodes: L.nodes.map((n) => ({ ...n, y: f(n.y) })),
    // дуга над чужой карточкой остаётся над портретами и при отражении: подпись карточки висит под портретом, поэтому снизу дуге места нет
    spouses: L.spouses.map((s) => ({ ...s, y1: f(s.y1), y2: f(s.y2), ...(s.bracketY !== undefined ? { bracketY: f(s.bracketY) } : {}) })),
    buses: L.buses.map((b) => ({
      ...b,
      fromY: fn(b.fromY),
      busY: f(b.busY),
      childTop: f(b.childTop),
      ...(b.jogY ? { jogY: b.jogY.map(fn) } : {}),
      ...(b.childTops ? { childTops: b.childTops.map(f) } : {}),
    })),
    labels: L.labels.map((l) => ({ ...l, y: f(l.y) })),
    refs: L.refs.map((r) => ({ ...r, y: f(r.y) })),
    refLinks: L.refLinks.map((l) => ({ ...l, y1: f(l.y1), y2: f(l.y2) })),
  };
}

/**
 * Плашка «БРАК» на длинных дугах (дальше трёх карточек): вместо вершины, где она повисает над чужим рядом, она стоит у начала дуги
 * рядом с «домашним» супругом (у ссылки это настоящая карточка, иначе левая): примерно в 60 px от его портрета.
 * Если там уже стоит другая плашка или портрет, берётся другой конец, затем плашка отодвигается по дуге. Короткие дуги и прямые линии не трогаются.
 * Линия детей такого брака выходит из-под плашки (см. routeBuses), поэтому видно, чьи это дети. Координаты карточек не меняются.
 */
/** Проба: длинные дуги этих союзов выходят с макушки портрета. Сейчас u73 и u117; `null` выключает, чтобы включить для всех длинных дуг, нужно отдельное решение. */
export const ARC_TOP_TRIAL: Set<string> | null = new Set(["u73", "u117"]);

export function placePills<T extends AppLayout>(L: T): T {
  const LONG = 3 * (PLATE_W + H_GAP);
  const isRef = (s: T["spouses"][number], x: number, y: number) => L.refs.some((r) => r.unionId === s.unionId && r.x === x && r.y === y);
  const rectHit = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 6 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 6;
  const circleHit = (c: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) => {
    const dx = Math.max(Math.abs(c.x - r.x) - r.w / 2, 0), dy = Math.max(Math.abs(c.y - r.y) - r.h / 2, 0);
    return dx * dx + dy * dy < PORTRAIT_R ** 2;
  };
  const spouses = L.spouses.map((s) => ({ ...s, ...(ARC_TOP_TRIAL?.has(s.unionId) && s.curved ? { arcTop: true } : {}) }));
  const placed = new Map<string, { x: number; y: number; w: number; h: number }>();
  const size = (s: T["spouses"][number]) => pillSize(s.status, longIds.has(s.unionId));
  // плашки всех остальных браков (короткие стоят посередине или на вершине)
  const longOnes = spouses.filter((s) => s.curved && Math.abs(s.x2 - s.x1) > LONG && s.arcH !== undefined).sort((a, b) => (a.unionId < b.unionId ? -1 : 1));
  const longIds = new Set(longOnes.map((s) => s.unionId));
  for (const s of spouses) if (!longIds.has(s.unionId)) placed.set(s.unionId, { ...pillPoint(s), ...size(s) });
  for (const s of longOnes) {
    const span = Math.abs(s.x2 - s.x1);
    const left = s.x1 <= s.x2 ? 1 : 2;
    const refEnd = isRef(s, s.x1, s.y1) ? 1 : isRef(s, s.x2, s.y2) ? 2 : 0;
    const home = refEnd ? 3 - refEnd : left;
    const { w, h } = size(s);
    const tryEnd = (end: 1 | 2, extra: number) => {
      const d = PORTRAIT_R + 2 + 8 + w / 2 + extra;
      const t0 = Math.min(0.45, d / span);
      const t = end === 1 ? t0 : 1 - t0; // t считается от первого конца (x1, y1) к второму
      const p = pillPoint({ ...s, pillT: t });
      const r = { x: p.x, y: p.y, w, h };
      const blocked = [...placed.entries()].some(([id, o]) => id !== s.unionId && rectHit(r, o)) || L.nodes.some((n) => circleHit(n, r)) || L.refs.some((n) => circleHit(n, r));
      return blocked ? null : { t, r };
    };
    let best: { t: number; r: { x: number; y: number; w: number; h: number } } | null = null;
    for (let extra = 0; extra <= 360 && !best; extra += 24) best = tryEnd(home as 1 | 2, extra) ?? tryEnd((3 - home) as 1 | 2, extra);
    if (best) { s.pillT = best.t; s.pillDir = (best.t < 0.5 ? s.x2 - s.x1 : s.x1 - s.x2) >= 0 ? 1 : -1; placed.set(s.unionId, best.r); } else placed.set(s.unionId, { ...pillPoint(s), w, h });
  }
  return { ...L, spouses };
}

/**
 * Высоты линий детей под рисунок экрана «Схема»: портрет круглый (радиус PORTRAIT_R), подпись висит под ним.
 * Тот же порядок, что у `classic`: у пары линия идёт от брака, у одного родителя от низа портрета; перекладина ниже подписей; в ребёнка линия входит сверху.
 * Для `flow: up` всё наоборот: линия выходит сверху родителя и входит в низ подписи ребёнка. Параллельные перекладины одного ряда разведены по высоте.
 * Координаты карточек не трогаются.
 */
export function routeBuses<T extends AppLayout>(L: T, flow: "down" | "up"): T {
  const yOf = new Map(L.nodes.map((n) => [n.id, n.y]));
  const below = PORTRAIT_R + PLATE_GAP + PLATE_H;
  const up = flow === "up";
  const buses = L.buses.map((raw) => {
    const b = raw as FamilyBus;
    const py = b.parentIds.map((id) => yOf.get(id)).filter((v): v is number => v !== undefined);
    const ky = b.childIds.map((id) => yOf.get(id)).filter((v): v is number => v !== undefined);
    if (!py.length || ky.length !== b.xs.length) return b;
    const edge = (y: number) => (up ? y + below : y - PORTRAIT_R);
    const tops = ky.map(edge);
    const parentY = up ? Math.min(...py) : Math.max(...py);
    const fromY = up ? parentY - PORTRAIT_R : py.length > 1 ? parentY : parentY + PORTRAIT_R;
    const childTop = up ? Math.max(...tops) : Math.min(...tops);
    const busY = up ? childTop + (fromY - childTop) * 0.45 : parentY + below + 34;
    const mixed = tops.some((t) => Math.abs(t - childTop) > 0.5);
    const out: FamilyBus = { ...b, fromY, busY, childTop, dropXs: b.xs.slice(), jogY: b.xs.map(() => null) };
    if (mixed) out.childTops = tops;
    else delete out.childTops;
    return out;
  });
  // Перекладины одного ряда с пересекающимся размахом идут на разной высоте; дальние связи (тонкий пунктир) после обычных, чтобы не сдвигать их.
  const rows = new Map<string, FamilyBus[]>();
  for (const b of buses as FamilyBus[]) (rows.get(`${Math.round(b.fromY ?? 0)}`) ?? rows.set(`${Math.round(b.fromY ?? 0)}`, []).get(`${Math.round(b.fromY ?? 0)}`)!).push(b);
  for (const list of rows.values()) {
    const ext = (b: FamilyBus) => [Math.min(b.fromX ?? Infinity, ...b.xs), Math.max(b.fromX ?? -Infinity, ...b.xs)] as const;
    const ordered = [...list].sort((a, c) => Number(busIsFar(a)) - Number(busIsFar(c)) || ext(a)[0] - ext(c)[0] || ext(a)[1] - ext(c)[1] || (a.unionId < c.unionId ? -1 : 1));
    const ends: number[] = [];
    const lane = new Map<FamilyBus, number>();
    for (const b of ordered) {
      const [lo, hi] = ext(b);
      let k = ends.findIndex((e) => e + 24 < lo);
      if (k < 0) { k = ends.length; ends.push(hi); } else ends[k] = hi;
      lane.set(b, k);
    }
    const step = ends.length > 1 ? Math.min(22, 100 / (ends.length - 1)) : 0;
    for (const b of list) b.busY += lane.get(b)! * step * (up ? -1 : 1);
  }
  // Длинная дуга с плашкой у конца: линия детей выходит из-под плашки, а не из пустого места посередине дуги.
  const pillOf = new Map(L.spouses.filter((s) => s.pillT !== undefined).map((s) => [s.unionId, pillPoint(s)]));
  for (const b of buses as FamilyBus[]) {
    const p = pillOf.get(b.unionId);
    if (!p) continue;
    b.fromX = p.x;
    b.fromY = up ? p.y - 13 : p.y + 13;
  }
  separateDrops(buses as FamilyBus[]);
  return { ...L, buses };
}

export function buildLayout(people: Person[], unions: Union[], focusId: string, flow: "down" | "up" = "down", opts: BuildOptions = {}): AppLayout {
  const engine = opts.engine ?? "classic";
  if (engine === "classic") {
    return { ...layoutTree(people, unions, focusId, flow), refs: [], refLinks: [], engine };
  }
  let resolution: PairResolution;
  if (opts.pair) resolution = { pair: opts.pair, ambiguous: false, candidates: [] };
  else if (opts.ownerId) resolution = resolveCentralPair(people, unions, opts.ownerId, opts.spouseId);
  else throw new Error("layout-engine: для движка family нужна центральная пара (pair) или владелец книги (ownerId); focusId для этого не годится, он меняется");
  const F = layoutFamily(people, unions, resolution.pair);
  // Подписи рядов только по основному дереву: блоки отдельных групп и сетка одиночек стоят ниже и ряды не продолжают.
  const mainSet = new Set(F.mainIds);
  const mainNodes = F.nodes.filter((n) => mainSet.has(n.id));
  const levels = [...new Set(mainNodes.map((n) => n.gen))].sort((a, b) => a - b);
  const labels: GenLabel[] = levels.map((level) => ({ gen: level, y: mainNodes.find((n) => n.gen === level)!.y, text: rowLabel(level - F.focusGen) }));
  const base: AppLayout = { ...F, labels, engine, pair: resolution };
  const done = routeBuses(placePills(flow === "up" ? mirrorVertical(base) : base), flow);
  return { ...done, groups: groupLabels({ nodes: done.nodes, blocks: F.blocks, singles: F.singles }) };
}

/** Сравнение движков на одних данных: время, число людей и ссылок, размер. Для замеров и проверки потери узлов. */
export function compareEngines(people: Person[], unions: Union[], focusId: string, ownerId: string, flow: "down" | "up" = "down") {
  const run = (engine: LayoutEngine) => {
    const t = performance.now();
    const L = buildLayout(people, unions, focusId, flow, { engine, ownerId });
    return { engine, ms: Math.round((performance.now() - t) * 10) / 10, nodes: L.nodes.length, refs: L.refs.length, width: Math.round(L.width), height: Math.round(L.height) };
  };
  return { classic: run("classic"), family: run("family") };
}
