import type { Person, Union } from "./types.ts";

/** Схема из выбранных людей: берём только их и связи между ними. Остальные остаются в древе, здесь только вырезка для страницы. */
export function pickSubset(people: Person[], unions: Union[], ids: ReadonlySet<string>): { people: Person[]; unions: Union[] } {
  const keep = people.filter((p) => ids.has(p.id));
  const out: Union[] = [];
  for (const u of unions) {
    const partnerIds = u.partnerIds.filter((id) => ids.has(id));
    const childIds = u.childIds.filter((id) => ids.has(id));
    // Пара остаётся, если выбраны оба; один родитель остаётся, если выбран хотя бы один его ребёнок.
    if (partnerIds.length === 2 || (partnerIds.length === 1 && childIds.length > 0)) out.push({ ...u, partnerIds, childIds });
  }
  return { people: keep, unions: out };
}

export type Reach = "ancestors" | "descendants" | "spouses" | "siblings";

/** К выбранным добавляет родню одним нажатием: предков, потомков, супругов или братьев и сестёр. */
export function addRelatives(unions: Union[], ids: ReadonlySet<string>, reach: Reach): Set<string> {
  const next = new Set(ids);
  if (reach === "spouses") {
    for (const u of unions) if (u.partnerIds.some((id) => ids.has(id))) for (const id of u.partnerIds) next.add(id);
    return next;
  }
  if (reach === "siblings") {
    for (const u of unions) if (u.childIds.some((id) => ids.has(id))) for (const id of u.childIds) next.add(id);
    return next;
  }
  // Предки: родители каждого шага вверх; потомки: дети каждого шага вниз.
  const queue = [...ids];
  while (queue.length) {
    const id = queue.pop()!;
    for (const u of unions) {
      if (reach === "ancestors" && u.childIds.includes(id)) for (const p of u.partnerIds) if (!next.has(p)) (next.add(p), queue.push(p));
      if (reach === "descendants" && u.partnerIds.includes(id)) for (const c of u.childIds) if (!next.has(c)) (next.add(c), queue.push(c));
    }
  }
  return next;
}

/** Связные группы среди выбранных: если групп больше одной, схема распадётся на отдельные куски, и об этом надо сказать. */
export function groups(people: Person[], unions: Union[], ids: ReadonlySet<string>): string[][] {
  const sub = pickSubset(people, unions, ids);
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(a, r);
    return r;
  };
  for (const p of sub.people) parent.set(p.id, p.id);
  const join = (a: string, b: string) => {
    if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b));
  };
  for (const u of sub.unions) for (const x of [...u.partnerIds, ...u.childIds]) join(u.partnerIds[0] ?? x, x);
  const by = new Map<string, string[]>();
  for (const p of sub.people) by.set(find(p.id), [...(by.get(find(p.id)) ?? []), p.id]);
  return [...by.values()].sort((a, b) => b.length - a.length);
}
