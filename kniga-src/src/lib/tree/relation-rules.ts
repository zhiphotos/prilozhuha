// Этап 2 «отношения»: правила определения родства и подписи с четырьмя самостоятельными основаниями.
//  1. кровное родство (биологические родители, как в книге сейчас);
//  2. усыновление (поле adoptedBy: юридическое родительство, биологические родители остаются);
//  3. семейная связь через партнёрство родителя: отчим, мачеха, сводные братья и сёстры (нужна запись партнёра, одного общего ребёнка для брака недостаточно);
//  4. опека и приёмная семья без усыновления (поле caredBy): забота, а не родство.
// Модуль только считает и называет. В раскладку, на экран, в печать и в существующие подписи книги (kinship.ts) он пока НЕ подключён: старые книги не меняются.
import type { Person as RodPerson } from "../rod/types.ts";
import { treeFromPeople } from "./from-people.ts";
import { ancestorTitle, buildKinIndex, collateralTitle, descendantTitle, kinshipIn, yearNum, type KinIndex } from "./kinship.ts";
import type { Gender } from "./types.ts";

export type RelLayer = "blood" | "adoption" | "family" | "care";
export type RelFact = {
  layer: RelLayer;
  /** Тип основания для тестов и будущих экранов. */
  kind: string;
  /** Кем `other` приходится `focus`. */
  title: string;
  /** Данных мало, точнее назвать нельзя (например, неизвестен второй родитель). */
  ambiguous?: boolean;
};
export type RelOptions = {
  /** Неполнородных называть «брат по матери» и «брат по отцу». Выключено: прежнее слово «сводный» (так остаётся в старых книгах). */
  splitHalf?: boolean;
};

const ghost = (id: string) => id.startsWith("__");
const MAX_UP = 6;

type Status = "married" | "divorced" | "widowed" | "partners";
type Partnership = { a: string; b: string; status: Status; from?: string; to?: string };

export type RelIndex = {
  kin: KinIndex;
  gender: Map<string, Gender>;
  birth: Map<string, number | null>;
  bio: Map<string, string[]>;
  adopt: Map<string, string[]>;
  care: Map<string, { id: string; role: "guardian" | "foster" }[]>;
  partnerships: Partnership[];
};

export function buildRelIndex(people: RodPerson[]): RelIndex {
  const tree = treeFromPeople(people);
  const real = new Set(people.map((p) => p.id));
  const gender = new Map(tree.people.map((p) => [p.id, p.gender] as const));
  const birth = new Map(tree.people.map((p) => [p.id, yearNum(p.birthYear) === 9999 ? null : yearNum(p.birthYear)] as const));
  const bio = new Map<string, string[]>();
  for (const u of tree.unions) for (const child of u.childIds) bio.set(child, [...new Set([...(bio.get(child) ?? []), ...u.partnerIds.filter((id) => real.has(id) && !ghost(id) && id !== child)])]);
  const adopt = new Map<string, string[]>();
  const care = new Map<string, { id: string; role: "guardian" | "foster" }[]>();
  for (const p of people) {
    const a = [...new Set((p.adoptedBy ?? []).map((x) => x.id).filter((id) => real.has(id) && id !== p.id))];
    if (a.length) adopt.set(p.id, a);
    const c = (p.caredBy ?? []).filter((x) => real.has(x.id) && x.id !== p.id).map((x) => ({ id: x.id, role: x.role }));
    if (c.length) care.set(p.id, c);
  }
  // Партнёрства только по записям «супруг»: общий ребёнок сам по себе брак не доказывает.
  const status = (s?: string): Status => (s === "divorced" ? "divorced" : s === "widowed" ? "widowed" : s === "partners" ? "partners" : "married");
  const partnerships: Partnership[] = [];
  for (const p of people) {
    if (p.spouse && real.has(p.spouse)) partnerships.push({ a: p.id, b: p.spouse, status: status(p.spouseStatus), from: p.unionFrom, to: p.unionTo });
    for (const m of p.moreSpouses ?? []) if (real.has(m.id)) partnerships.push({ a: p.id, b: m.id, status: status(m.status), from: m.from, to: m.to });
  }
  return { kin: buildKinIndex(tree.people, tree.unions), gender, birth, bio, adopt, care, partnerships };
}

const g = (ix: RelIndex, id: string): Gender => ix.gender.get(id) ?? "u";
const legalParents = (ix: RelIndex, id: string) => [...new Set([...(ix.bio.get(id) ?? []), ...(ix.adopt.get(id) ?? [])])];
const isAdoptiveEdge = (ix: RelIndex, child: string, parent: string) => (ix.adopt.get(child) ?? []).includes(parent);

/** Предки по любым родительским связям (родные и усыновление): для каждого предка набор «глубина, был ли шаг усыновления». */
function ancestry(ix: RelIndex, from: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (id: string, d: number, ad: boolean) => (out.get(id) ?? out.set(id, new Set()).get(id)!).add(`${d}:${ad ? 1 : 0}`);
  add(from, 0, false);
  let level: { id: string; ad: boolean }[] = [{ id: from, ad: false }];
  for (let d = 1; d <= MAX_UP && level.length; d += 1) {
    const next: { id: string; ad: boolean }[] = [];
    const seen = new Set<string>();
    for (const { id, ad } of level) {
      for (const p of legalParents(ix, id)) {
        const step = ad || isAdoptiveEdge(ix, id, p) && !(ix.bio.get(id) ?? []).includes(p);
        const key = `${p}:${step ? 1 : 0}`;
        if (seen.has(key)) continue;
        seen.add(key);
        add(p, d, step);
        next.push({ id: p, ad: step });
      }
    }
    level = next;
  }
  return out;
}

const parse = (s: string) => {
  const [d, a] = s.split(":");
  return { d: Number(d), ad: a === "1" };
};

function age(ix: RelIndex, focus: string, other: string): "older" | "younger" | "unknown" {
  const a = ix.birth.get(focus);
  const b = ix.birth.get(other);
  if (a == null || b == null || a === b) return "unknown";
  return b < a ? "older" : "younger";
}

function siblingWord(gender: Gender, ag: "older" | "younger" | "unknown", tail = ""): string {
  const base = gender === "m" ? (ag === "older" ? "Старший брат" : ag === "younger" ? "Младший брат" : "Брат") : gender === "f" ? (ag === "older" ? "Старшая сестра" : ag === "younger" ? "Младшая сестра" : "Сестра") : "Брат или сестра";
  return tail ? `${base} ${tail}` : base;
}

/** Бывший отчим и бывшая мачеха, сводные: союз закончился разводом. Если союз закончился ДО рождения ребёнка, ребёнку он никем не приходится. */
function endedBefore(ix: RelIndex, pr: Partnership, child: string): boolean {
  const end = yearNum(pr.to);
  const born = ix.birth.get(child);
  return pr.status === "divorced" && end !== 9999 && born != null && end < born;
}

export function relationFacts(ix: RelIndex, focus: string, other: string, opts: RelOptions = {}): RelFact[] {
  if (focus === other || !ix.gender.has(focus) || !ix.gender.has(other)) return [];
  const facts: RelFact[] = [];
  const push = (f: RelFact) => {
    if (!facts.some((x) => x.layer === f.layer && x.title === f.title)) facts.push(f);
  };
  const go = g(ix, other);

  // 1. Кровное родство и брак: прежние названия книги без изменений (kinship.ts), кроме неполнородных при включённом splitHalf.
  const kin = kinshipIn(ix.kin, focus, other);
  const bioSib = blood(ix, focus, other);
  if (kin.kind === "ancestor" || kin.kind === "descendant" || kin.kind === "collateral") push({ layer: "blood", kind: kin.kind, title: kin.title });
  else if (kin.kind === "sibling") {
    if (opts.splitHalf && bioSib) push({ layer: "blood", kind: bioSib.kind, title: bioSib.title, ambiguous: bioSib.ambiguous });
    else push({ layer: "blood", kind: "sibling", title: kin.title });
  } else if (kin.kind === "spouse" || kin.kind === "inlaw") {
    // «Отчим», «Мачеха», «Сын супруга», «Дочь супруга» здесь определяет только слой партнёрства ниже (по записи партнёра, а не по общему ребёнку).
    if (!/^(Отчим|Мачеха|(Бывш\S*\s+)?(Сын|Дочь|Ребёнок) супруг)/i.test(kin.title)) push({ layer: "family", kind: kin.kind, title: kin.title });
  }

  // 2. Усыновление: пути, где есть хотя бы один шаг усыновления.
  const A = ancestry(ix, focus);
  const Bm = ancestry(ix, other);
  // Общие предки, через которых есть путь с шагом усыновления. Если ниже по линии есть другой такой общий предок, дальний повторяет то же родство длинным путём и отбрасывается
  // (двоюродные дети дяди и усыновлённого им племянника: ближайшая общая точка усыновитель, а не дедушка).
  type Combo = { x: { d: number; ad: boolean }; y: { d: number; ad: boolean } };
  const flagged = new Map<string, Combo[]>();
  for (const [c, la] of A) {
    const lb = Bm.get(c);
    if (!lb) continue;
    for (const sa of la) for (const sb of lb) {
      const x = parse(sa);
      const y = parse(sb);
      if ((!x.ad && !y.ad) || (x.d === 0 && y.d === 0)) continue;
      flagged.set(c, [...(flagged.get(c) ?? []), { x, y }]);
    }
  }
  const below = (c: string) => [...flagged.keys()].some((c2) => c2 !== c && ancestry(ix, c2).has(c));
  const seenShape = new Set<string>();
  for (const [c, combos] of flagged) {
    if (below(c)) continue;
    for (const { x, y } of combos) {
      const shape = `${x.d}:${y.d}`;
      if (seenShape.has(shape)) continue;
      seenShape.add(shape);
      let title: string;
      let kind: string;
      if (y.d === 0) {
        kind = "adoptive-ancestor";
        title = x.d === 1 ? (go === "f" ? "Усыновительница" : "Усыновитель") : `${ancestorTitle(x.d, go)} (по усыновлению)`;
      } else if (x.d === 0) {
        kind = "adopted-descendant";
        title = y.d === 1 ? (go === "m" ? "Усыновлённый сын" : go === "f" ? "Усыновлённая дочь" : "Усыновлённый ребёнок") : `${descendantTitle(y.d, go)} (по усыновлению)`;
      } else if (x.d === 1 && y.d === 1) {
        kind = "adoption-sibling";
        title = siblingWord(go, age(ix, focus, other), "по усыновлению");
      } else {
        kind = "adoption-collateral";
        title = `${collateralTitle(ix.kin, x.d, y.d, other, false)} (по усыновлению)`;
      }
      push({ layer: "adoption", kind, title });
    }
  }

  // 3. Семейная связь через партнёрство родителя.
  stepFacts(ix, focus, other, go, push);

  // 4. Опека и приёмная семья без усыновления.
  for (const c of ix.care.get(focus) ?? []) {
    if (c.id !== other) continue;
    if (c.role === "guardian") push({ layer: "care", kind: "guardian", title: "Опекун" });
    else push({ layer: "care", kind: "foster-parent", title: go === "m" ? "Приёмный отец без усыновления" : go === "f" ? "Приёмная мать без усыновления" : "Приёмный родитель без усыновления" });
  }
  for (const c of ix.care.get(other) ?? []) {
    if (c.id !== focus) continue;
    if (c.role === "guardian") push({ layer: "care", kind: "ward", title: go === "f" ? "Подопечная" : "Подопечный" });
    else push({ layer: "care", kind: "foster-child", title: go === "f" ? "Воспитанница приёмной семьи" : "Воспитанник приёмной семьи" });
  }
  const mine = new Set((ix.care.get(focus) ?? []).map((c) => c.id));
  if ((ix.care.get(other) ?? []).some((c) => mine.has(c.id) && c.id !== focus && c.id !== other)) push({ layer: "care", kind: "raised-together", title: "Воспитывались вместе под опекой" });

  const order: RelLayer[] = ["blood", "adoption", "family", "care"];
  return facts.sort((a, b) => order.indexOf(a.layer) - order.indexOf(b.layer));
}

/** Биологические братья и сёстры: полнородные, по матери (единоутробные), по отцу (единокровные); если второй родитель неизвестен, честно «брат или сестра». */
function blood(ix: RelIndex, focus: string, other: string): { kind: string; title: string; ambiguous?: boolean } | null {
  const pa = ix.bio.get(focus) ?? [];
  const pb = ix.bio.get(other) ?? [];
  const shared = pa.filter((id) => pb.includes(id));
  if (!shared.length) return null;
  const ag = age(ix, focus, other);
  const go = g(ix, other);
  const restA = pa.filter((id) => !shared.includes(id));
  const restB = pb.filter((id) => !shared.includes(id));
  if (shared.length >= 2 || (!restA.length && !restB.length && shared.length && pa.length === 2 && pb.length === 2)) return { kind: "full-sibling", title: siblingWord(go, ag) };
  if (restA.length && restB.length) {
    const gp = g(ix, shared[0]!);
    if (gp === "f") return { kind: "uterine-sibling", title: siblingWord(go, ag, "по матери") };
    if (gp === "m") return { kind: "consanguine-sibling", title: siblingWord(go, ag, "по отцу") };
    return { kind: "half-sibling", title: siblingWord(go, ag, "(неполнородные)") };
  }
  // Один общий родитель известен, у кого-то второй неизвестен: полнородные они или нет, по данным не сказать.
  return { kind: "sibling-unknown-fullness", title: siblingWord(go, ag), ambiguous: true };
}

function stepFacts(ix: RelIndex, focus: string, other: string, go: Gender, push: (f: RelFact) => void) {
  const parentsOf = (id: string) => legalParents(ix, id);
  const partnersOf = (id: string) => ix.partnerships.filter((p) => p.a === id || p.b === id).map((p) => ({ pr: p, mate: p.a === id ? p.b : p.a }));
  const word = (kind: "parent" | "child" | "sibling", gender: Gender, divorced: boolean) => {
    if (kind === "parent") return divorced ? (gender === "f" ? "Бывшая мачеха" : "Бывший отчим") : gender === "f" ? "Мачеха" : "Отчим";
    if (kind === "child") return divorced ? (gender === "f" ? "Бывшая падчерица" : "Бывший пасынок") : gender === "f" ? "Падчерица" : "Пасынок";
    return divorced ? (gender === "f" ? "Бывшая сводная сестра" : "Бывший сводный брат") : gender === "f" ? "Сводная сестра" : "Сводный брат";
  };
  // other: отчим или мачеха focus (партнёр родителя, сам не родитель).
  const fp = parentsOf(focus);
  for (const parent of fp) for (const { pr, mate } of partnersOf(parent)) {
    if (mate !== other || fp.includes(other) || endedBefore(ix, pr, focus)) continue;
    push({ layer: "family", kind: "step-parent", title: word("parent", go, pr.status === "divorced") });
  }
  // other: пасынок или падчерица focus.
  for (const parent of parentsOf(other)) for (const { pr, mate } of partnersOf(parent)) {
    if (mate !== focus || parentsOf(other).includes(focus) || endedBefore(ix, pr, other)) continue;
    push({ layer: "family", kind: "step-child", title: word("child", go, pr.status === "divorced") });
  }
  // сводные братья и сёстры: общих родителей (родных и по усыновлению) нет, но родители в паре.
  const op = parentsOf(other);
  if (fp.some((x) => op.includes(x))) return;
  for (const a of fp) for (const { pr, mate } of partnersOf(a)) {
    if (!op.includes(mate) || endedBefore(ix, pr, focus) || endedBefore(ix, pr, other)) continue;
    push({ layer: "family", kind: "step-sibling", title: word("sibling", go, pr.status === "divorced") });
  }
}

/** Все названия одной строкой: основное первым, остальные через « · ». */
export function relationLabel(ix: RelIndex, focus: string, other: string, opts: RelOptions = {}): string {
  return relationFacts(ix, focus, other, opts).map((f) => f.title).join(" · ");
}
