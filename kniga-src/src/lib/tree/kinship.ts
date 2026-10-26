import type { Gender, Kinship, Person, Union } from "./types.ts";

type Index = {
  people: Map<string, Person>;
  parentOf: Map<string, Union>;
  birthOf: Map<string, Union>;
  unionsOf: Map<string, Union[]>;
};

function build(people: Person[], unions: Union[]): Index {
  const byId = new Map(people.map((p) => [p.id, p]));
  const parentOf = new Map<string, Union>();
  const birthOf = new Map<string, Union>();
  const unionsOf = new Map<string, Union[]>();
  for (const u of unions) {
    for (const c of u.childIds) if (!birthOf.has(c)) birthOf.set(c, u);
    if (u.partnerIds.length > 0) {
      for (const c of u.childIds) if (!parentOf.has(c)) parentOf.set(c, u);
    }
    for (const id of u.partnerIds) {
      const list = unionsOf.get(id) ?? [];
      list.push(u);
      unionsOf.set(id, list);
    }
  }
  return { people: byId, parentOf, birthOf, unionsOf };
}

function genderOf(index: Index, id: string): Gender {
  return index.people.get(id)?.gender ?? "u";
}

function parents(index: Index, id: string): string[] {
  return index.parentOf.get(id)?.partnerIds ?? [];
}

function ancestorDist(index: Index, from: string): Map<string, number> {
  const dist = new Map<string, number>();
  const q: string[] = [from];
  dist.set(from, 0);
  while (q.length) {
    const cur = q.shift()!;
    const d = dist.get(cur)!;
    for (const p of parents(index, cur)) {
      if (!dist.has(p)) {
        dist.set(p, d + 1);
        q.push(p);
      }
    }
  }
  return dist;
}

function cap(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function ancestorTitle(dist: number, gender: Gender): string {
  if (dist <= 0) return "Я";
  if (dist === 1) return gender === "m" ? "Отец" : gender === "f" ? "Мать" : "Родитель";
  if (dist === 2) return gender === "m" ? "Дедушка" : gender === "f" ? "Бабушка" : "Предок";
  const pra = "пра".repeat(dist - 2);
  if (gender === "m") return cap(pra + "дедушка");
  if (gender === "f") return cap(pra + "бабушка");
  return `Предок (${dist})`;
}

function descendantTitle(dist: number, gender: Gender): string {
  if (dist === 1) return gender === "m" ? "Сын" : gender === "f" ? "Дочь" : "Ребёнок";
  if (dist === 2) return gender === "m" ? "Внук" : gender === "f" ? "Внучка" : "Внук";
  const pra = "пра".repeat(Math.max(0, dist - 2));
  if (gender === "m") return cap(pra + "внук");
  if (gender === "f") return cap(pra + "внучка");
  return `Потомок (${dist})`;
}

export function yearNum(raw?: string): number {
  const match = String(raw ?? "").match(/\d{4}/);
  const year = match ? Number(match[0]) : NaN;
  return Number.isFinite(year) && year > 0 ? year : 9999;
}

function yearOf(index: Index, id: string): number | null {
  const year = yearNum(index.people.get(id)?.birthYear);
  return year === 9999 ? null : year;
}

function siblingWord(index: Index, focus: string, other: string, half: boolean): string {
  const g = genderOf(index, other);
  const yf = yearOf(index, focus);
  const yo = yearOf(index, other);
  let age: "older" | "younger" | "unknown" = "unknown";
  if (yf != null && yo != null && yf !== yo) age = yo < yf ? "older" : "younger";
  if (half) {
    if (g === "m") return age === "older" ? "Старший сводный брат" : age === "younger" ? "Младший сводный брат" : "Сводный брат";
    if (g === "f") return age === "older" ? "Старшая сводная сестра" : age === "younger" ? "Младшая сводная сестра" : "Сводная сестра";
    return "Сводный родственник";
  }
  if (g === "m") return age === "older" ? "Старший брат" : age === "younger" ? "Младший брат" : "Брат";
  if (g === "f") return age === "older" ? "Старшая сестра" : age === "younger" ? "Младшая сестра" : "Сестра";
  return "Брат или сестра";
}

function sharedParents(index: Index, a: string, b: string): { shared: string[]; half: boolean } | null {
  const same = index.birthOf.get(a);
  if (same && same === index.birthOf.get(b)) return { shared: same.partnerIds, half: false };
  const pa = parents(index, a);
  const pb = parents(index, b);
  if (!pa.length || !pb.length) return null;
  const other = new Set(pb);
  const shared = pa.filter((id) => other.has(id));
  if (!shared.length) return null;
  const half = shared.length !== pa.length || shared.length !== pb.length;
  return { shared, half };
}

function childToward(index: Index, ancestor: string, target: string): string | null {
  const kids = new Map<string, string[]>();
  for (const [child, union] of index.parentOf) {
    for (const partner of union.partnerIds) {
      const list = kids.get(partner) ?? [];
      list.push(child);
      kids.set(partner, list);
    }
  }
  const prev = new Map<string, string | null>();
  const q = [ancestor];
  prev.set(ancestor, null);
  while (q.length) {
    const cur = q.shift()!;
    if (cur === target) break;
    for (const child of kids.get(cur) ?? []) {
      if (!prev.has(child)) {
        prev.set(child, cur);
        q.push(child);
      }
    }
  }
  if (!prev.has(target)) return null;
  let cur = target;
  let parent = prev.get(cur) ?? null;
  while (parent && parent !== ancestor) {
    cur = parent;
    parent = prev.get(cur) ?? null;
  }
  return cur === ancestor ? null : cur;
}

const COUSIN = [
  "",
  "родной",
  "двоюродный",
  "троюродный",
  "четвероюродный",
  "пятиюродный",
  "шестиюродный",
  "семиюродный",
  "восьмиюродный",
];

function cousinWord(steps: number): string {
  return COUSIN[steps] ?? `${steps}-юродный`;
}

function collateralTitle(index: Index, dFocus: number, dOther: number, other: string, half: boolean): string {
  const g = genderOf(index, other);
  if (dOther === 1 && dFocus === 2) {
    if (half) return g === "f" ? "Сводная тётя" : "Сводный дядя";
    return g === "f" ? "Тётя" : g === "m" ? "Дядя" : "Дядя или тётя";
  }
  if (dOther === 1 && dFocus === 3) return g === "f" ? "Двоюродная бабушка" : "Двоюродный дедушка";
  if (dOther === 1 && dFocus > 3) return g === "f" ? `Тётя (${dFocus})` : `Дядя (${dFocus})`;
  if (dFocus === 1 && dOther === 2) return g === "f" ? "Племянница" : "Племянник";
  if (dFocus === 1 && dOther === 3) return g === "f" ? "Внучатая племянница" : "Внучатый племянник";
  if (dFocus === 1 && dOther > 3) return g === "f" ? `Племянница (${dOther})` : `Племянник (${dOther})`;
  const near = Math.min(dFocus, dOther);
  const word = cap(cousinWord(near));
  if (dFocus === dOther) return g === "f" ? `${word} сестра` : `${word} брат`;
  if (dOther < dFocus) return g === "f" ? `${word} тётя` : `${word} дядя`;
  return g === "f" ? `${word} племянница` : `${word} племянник`;
}

function genitiveAncestor(title: string): string {
  const t = title.toLowerCase();
  if (t.endsWith("а")) return t.slice(0, -1) + "и";
  if (t === "отец") return "отца";
  return t;
}

type Blood =
  | { kind: "ancestor"; degree: number; title: string }
  | { kind: "descendant"; degree: number; title: string }
  | { kind: "sibling"; degree: number; title: string; half: boolean }
  | { kind: "collateral"; degree: number; title: string };

function bloodRelation(index: Index, focus: string, other: string): Blood | null {
  if (focus === other) return null;
  const upFocus = ancestorDist(index, focus);
  const upOther = ancestorDist(index, other);
  if (upFocus.has(other) && other !== focus) {
    const degree = upFocus.get(other)!;
    return { kind: "ancestor", degree, title: ancestorTitle(degree, genderOf(index, other)) };
  }
  if (upOther.has(focus) && focus !== other) {
    const degree = upOther.get(focus)!;
    return { kind: "descendant", degree, title: descendantTitle(degree, genderOf(index, other)) };
  }
  const sib = sharedParents(index, focus, other);
  if (sib) {
    return { kind: "sibling", degree: 1, title: siblingWord(index, focus, other, sib.half), half: sib.half };
  }
  let best: { anc: string; dF: number; dO: number } | null = null;
  for (const [anc, dF] of upFocus) {
    if (anc === focus) continue;
    const dO = upOther.get(anc);
    if (dO == null || dO === 0) continue;
    const score = dF + dO;
    if (!best || score < best.dF + best.dO) best = { anc, dF, dO };
  }
  if (!best) return null;
  const sideF = childToward(index, best.anc, focus);
  const sideO = childToward(index, best.anc, other);
  const half = sideF && sideO ? (sharedParents(index, sideF, sideO)?.half ?? false) : false;
  const degree = best.dF + best.dO;
  return {
    kind: "collateral",
    degree,
    title: collateralTitle(index, best.dF, best.dO, other, half),
  };
}

function spouseTitle(index: Index, union: Union, other: string): string {
  const g = genderOf(index, other);
  if (union.status === "divorced") return g === "f" ? "Бывшая жена" : "Бывший муж";
  if (union.status === "widowed") return g === "f" ? "Покойная жена" : "Покойный муж";
  if (union.status === "partner") return g === "f" ? "Спутница" : "Спутник";
  return g === "f" ? "Жена" : "Муж";
}

function inLawViaBlood(index: Index, focus: string, other: string): Kinship | null {
  const unions = index.unionsOf.get(other) ?? [];
  for (const union of unions) {
    for (const partner of union.partnerIds) {
      if (partner === other) continue;
      const rel = bloodRelation(index, focus, partner);
      if (!rel) continue;
      const divorced = union.status === "divorced";
      const g = genderOf(index, other);
      let title = "";
      if (rel.kind === "ancestor" && rel.degree === 1) title = g === "m" ? "Отчим" : "Мачеха";
      else if (rel.kind === "sibling" || (rel.kind === "descendant" && rel.degree === 1)) {
        title = g === "m" ? (divorced ? "Бывший зять" : "Зять") : divorced ? "Бывшая невестка" : "Невестка";
      } else if (rel.kind === "ancestor") {
        const who = genitiveAncestor(rel.title);
        title = g === "m" ? `${divorced ? "Бывший муж" : "Муж"} ${who}` : `${divorced ? "Бывшая жена" : "Жена"} ${who}`;
      } else if (divorced) title = `Бывший супруг · ${rel.title}`;
      else title = `Супруг · ${rel.title}`;
      return { kind: "inlaw", title, degree: rel.degree, card: title };
    }
  }
  return null;
}

function inLawViaSpouse(index: Index, focus: string, other: string): Kinship | null {
  const mine = index.unionsOf.get(focus) ?? [];
  const ordered = [...mine].sort((a, b) => Number(a.status === "divorced") - Number(b.status === "divorced"));
  for (const union of ordered) {
    for (const partner of union.partnerIds) {
      if (partner === focus) continue;
      const rel = bloodRelation(index, partner, other);
      if (!rel) continue;
      const fg = genderOf(index, focus);
      const og = genderOf(index, other);
      const divorced = union.status === "divorced";
      let title = "";
      if (rel.kind === "ancestor" && rel.degree === 1) {
        if (fg === "f") title = og === "m" ? "Свёкор" : "Свекровь";
        else title = og === "m" ? "Тесть" : "Тёща";
      } else if (rel.kind === "sibling") {
        if (fg === "f") title = og === "m" ? "Деверь" : "Золовка";
        else title = og === "m" ? "Шурин" : "Свояченица";
      } else title = `${rel.title} супруга`;
      if (divorced) title = `Бывш. ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
      return { kind: "inlaw", title, degree: rel.degree, card: title };
    }
  }
  return null;
}

function withCard(kin: Kinship): Kinship {
  if (kin.kind === "ancestor" || kin.kind === "descendant") {
    if (kin.degree != null && kin.degree >= 3) return { ...kin, card: `${kin.title} (${kin.degree})` };
  }
  return { ...kin, card: kin.title };
}

export function kinship(people: Person[], unions: Union[], focusId: string, personId: string): Kinship {
  if (focusId === personId) return { kind: "self", title: "Я", degree: 0, card: "Я" };
  const index = build(people, unions);
  if (!index.people.has(focusId) || !index.people.has(personId)) {
    return { kind: "other", title: "Родственник", degree: null, card: "Родственник" };
  }
  const blood = bloodRelation(index, focusId, personId);
  if (blood) {
    return withCard({ kind: blood.kind, title: blood.title, degree: blood.degree, card: blood.title });
  }
  const direct = (index.unionsOf.get(focusId) ?? []).find((u) => u.partnerIds.includes(personId));
  if (direct) {
    const title = spouseTitle(index, direct, personId);
    return { kind: "spouse", title, degree: null, card: title };
  }
  return (
    inLawViaBlood(index, focusId, personId) ??
    inLawViaSpouse(index, focusId, personId) ?? { kind: "other", title: "Родственник", degree: null, card: "Родственник" }
  );
}

export function displayName(person: Person, style: "card" | "full" = "card"): string {
  if (style === "full") {
    return [person.firstName, person.patronymic, person.lastName].filter(Boolean).join(" ");
  }
  return [person.firstName, person.lastName].filter(Boolean).join(" ") || "Без имени";
}

export function yearsOf(person: Person): string {
  const b = person.birthYear.trim();
  const d = person.deathYear.trim();
  if (b && d) return `${b} – ${d}`;
  if (b) return `р. ${b}`;
  if (d) return `† ${d}`;
  return "даты не указаны";
}

export function isDeceased(person: Person): boolean {
  return person.deathYear.trim().length > 0;
}
