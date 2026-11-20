import type { Person } from "./types.ts";

// Хранение «усыновителей» (adoptedBy) и «опекунов, приёмных семей» (caredBy). Это отдельные от `parents` (биологические родители) списки.
// Правила: нет поля, значит такой связи нет; пустой список не храним; ссылки на удалённого человека не оставляем.

type Linked = Pick<Person, "id" | "adoptedBy" | "caredBy">;

/** Человек без ссылок на `id` в усыновителях и опекунах. Если ссылок не было, возвращается тот же объект (ничего не копируется). */
export function withoutRelationRefs<T extends Linked>(person: T, id: string): T {
  let next = person;
  if (next.adoptedBy?.some((a) => a.id === id)) {
    const rest = next.adoptedBy.filter((a) => a.id !== id);
    next = { ...next, adoptedBy: rest.length ? rest : undefined };
  }
  if (next.caredBy?.some((c) => c.id === id)) {
    const rest = next.caredBy.filter((c) => c.id !== id);
    next = { ...next, caredBy: rest.length ? rest : undefined };
  }
  return next;
}

/** Ссылки на другой id (например, когда место «Я» заняла настоящая запись). */
export function renameRelationRefs<T extends Linked>(person: T, from: string, to: string): T {
  let next = person;
  if (next.adoptedBy?.some((a) => a.id === from)) next = { ...next, adoptedBy: next.adoptedBy.map((a) => (a.id === from ? { ...a, id: to } : a)) };
  if (next.caredBy?.some((c) => c.id === from)) next = { ...next, caredBy: next.caredBy.map((c) => (c.id === from ? { ...c, id: to } : c)) };
  return next;
}

/** Битые ссылки в данных: на несуществующего человека, на самого себя, повтор одного человека. Данные не меняет. */
export function relationRefProblems(people: (Linked & { name?: string })[]): { personId: string; kind: "unknown" | "self" | "duplicate"; refId: string; list: "adoptedBy" | "caredBy" }[] {
  const ids = new Set(people.map((p) => p.id));
  const out: ReturnType<typeof relationRefProblems> = [];
  for (const p of people) {
    for (const list of ["adoptedBy", "caredBy"] as const) {
      const seen = new Set<string>();
      for (const link of p[list] ?? []) {
        if (link.id === p.id) out.push({ personId: p.id, kind: "self", refId: link.id, list });
        else if (!ids.has(link.id)) out.push({ personId: p.id, kind: "unknown", refId: link.id, list });
        if (seen.has(link.id)) out.push({ personId: p.id, kind: "duplicate", refId: link.id, list });
        seen.add(link.id);
      }
    }
  }
  return out;
}
