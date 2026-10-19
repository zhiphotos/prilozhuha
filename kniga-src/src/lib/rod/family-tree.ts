import type { Person } from "@/lib/rod/types";

/** Ряд схемы по слову «кем приходится»: пока родители не указаны, человек встаёт в свой ряд сам. */
function baseLevel(relation: string): number {
  const r = relation.toLowerCase();
  if (/^пра(бабуш|дед)/.test(r)) return 0;
  if (/^(бабуш|дед)/.test(r)) return 1;
  if (/^(мам|пап|тёт|тет|дяд|отец)/.test(r)) return 2;
  if (/^(ребён|ребен|сын|дочь|внук|внуч)/.test(r)) return 4;
  return 3;
}

/** Ряды людей сверху вниз (старшие выше). Если указаны родители, ребёнок всегда ниже родителя. */
export function familyLevels(people: Person[]): Person[][] {
  const byId = new Map(people.map((person) => [person.id, person]));
  const level = new Map<string, number>();
  const visiting = new Set<string>();
  const levelOf = (person: Person): number => {
    const known = level.get(person.id);
    if (known !== undefined) return known;
    if (visiting.has(person.id)) return baseLevel(person.relation);
    visiting.add(person.id);
    const parents = (person.parents ?? []).map((id) => byId.get(id)).filter((p): p is Person => Boolean(p));
    const value = parents.length ? Math.max(...parents.map(levelOf)) + 1 : baseLevel(person.relation);
    visiting.delete(person.id);
    level.set(person.id, value);
    return value;
  };
  const rows = new Map<number, Person[]>();
  for (const person of people) {
    const l = levelOf(person);
    rows.set(l, [...(rows.get(l) ?? []), person]);
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list);
}
