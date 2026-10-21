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

/** Пары супругов (обе стороны), только если оба человека есть в списке. */
export function spousePairs(people: Person[]): [Person, Person][] {
  const byId = new Map(people.map((person) => [person.id, person]));
  const seen = new Set<string>();
  const out: [Person, Person][] = [];
  for (const person of people) {
    const other = person.spouse ? byId.get(person.spouse) : undefined;
    if (!other || other.id === person.id) continue;
    const key = [person.id, other.id].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([person, other]);
  }
  for (const person of people) {
    const mate = people.find((item) => item.spouse === person.id);
    if (!mate || mate.id === person.id) continue;
    const key = [person.id, mate.id].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([mate, person]);
  }
  return out;
}

/**
 * Ряды людей сверху вниз (старшие выше). Если указаны родители, ребёнок всегда ниже родителя.
 * Супруги стоят в одном ряду и рядом друг с другом.
 */
export function familyLevels(people: Person[]): Person[][] {
  const byId = new Map(people.map((person) => [person.id, person]));
  const mate = new Map<string, string>();
  for (const [a, b] of spousePairs(people)) {
    mate.set(a.id, b.id);
    mate.set(b.id, a.id);
  }
  const limit = people.length + 2;
  const level = new Map<string, number>();
  for (const person of people) {
    const hasParents = (person.parents ?? []).some((id) => byId.has(id));
    level.set(person.id, hasParents ? 0 : baseLevel(person.relation));
  }
  for (let round = 0; round < 60; round++) {
    let changed = false;
    for (const person of people) {
      let value = level.get(person.id) ?? 0;
      const parents = (person.parents ?? []).map((id) => byId.get(id)).filter((p): p is Person => Boolean(p));
      if (parents.length) value = Math.max(value, Math.max(...parents.map((p) => level.get(p.id) ?? 0)) + 1);
      const partner = mate.get(person.id);
      if (partner) value = Math.max(value, level.get(partner) ?? 0);
      value = Math.min(value, limit);
      if (value > (level.get(person.id) ?? 0)) {
        level.set(person.id, value);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const rows = new Map<number, Person[]>();
  for (const person of people) {
    const l = level.get(person.id) ?? 0;
    rows.set(l, [...(rows.get(l) ?? []), person]);
  }
  return [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, list]) => {
      const seen = new Set<string>();
      const ordered: Person[] = [];
      for (const person of list) {
        if (seen.has(person.id)) continue;
        ordered.push(person);
        seen.add(person.id);
        const partner = mate.get(person.id);
        const other = partner ? list.find((item) => item.id === partner) : undefined;
        if (other && !seen.has(other.id)) {
          ordered.push(other);
          seen.add(other.id);
        }
      }
      return ordered;
    });
}
