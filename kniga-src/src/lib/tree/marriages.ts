import type { Person } from "../rod/types.ts";

/** Браки человека для карточки в «Людях». Связь супруга хранится у одного из двоих (spouse или moreSpouses), поэтому смотрим в обе стороны. */
export type MarriageStatus = "married" | "divorced" | "partners" | "widowed";
export type Marriage = { id: string; status: MarriageStatus; holder: string };
export type MarriageInput = { id: string; status?: MarriageStatus };
export type PersonPatches = Record<string, Partial<Person>>;

export function marriagesOf(people: Person[], id: string): Marriage[] {
  const me = people.find((p) => p.id === id);
  if (!me) return [];
  const out: Marriage[] = [];
  const seen = new Set<string>();
  const add = (m: Marriage) => {
    if (!m.id || m.id === id || seen.has(m.id) || !people.some((p) => p.id === m.id)) return;
    seen.add(m.id);
    out.push(m);
  };
  if (me.spouse) add({ id: me.spouse, status: me.spouseStatus ?? "married", holder: id });
  for (const m of me.moreSpouses ?? []) add({ id: m.id, status: m.status ?? "married", holder: id });
  for (const o of people) {
    if (o.id === id) continue;
    if (o.spouse === id) add({ id: o.id, status: o.spouseStatus ?? "married", holder: o.id });
    for (const m of o.moreSpouses ?? []) if (m.id === id) add({ id: o.id, status: m.status ?? "married", holder: o.id });
  }
  return out;
}

/** Человек так, как его браки видит карточка: все супруги, в том числе записанные у них самих. Сами данные не меняются. */
export function withMarriages(people: Person[], person: Person): Person {
  const list = marriagesOf(people, person.id);
  const blanks = (person.moreSpouses ?? []).filter((m) => !m.id);
  const first = list[0];
  return {
    ...person,
    spouse: first?.id,
    spouseStatus: first?.status ?? person.spouseStatus,
    moreSpouses: [...list.slice(1).map((m) => ({ id: m.id, status: m.status })), ...blanks],
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Что записать, чтобы браки человека стали такими, как выбрано в карточке.
 * Брак, записанный у другого, меняется у него (статус) или стирается у него (убрали), остальные записи не трогаются.
 * Новые браки записываются у самого человека. Пустые строки «+ ещё брак» сохраняются, пока их не выбрали.
 */
export function applyMarriages(people: Person[], id: string, next: MarriageInput[]): PersonPatches {
  const me = people.find((p) => p.id === id);
  if (!me) return {};
  const current = marriagesOf(people, id);
  const patches: PersonPatches = {};
  const edit = (pid: string, patch: Partial<Person>) => {
    patches[pid] = { ...(patches[pid] ?? {}), ...patch };
  };
  const wanted = new Map(next.filter((m) => m.id).map((m) => [m.id, m.status ?? "married"] as const));
  for (const c of current) {
    if (c.holder === id) continue;
    const holder = people.find((p) => p.id === c.holder)!;
    const status = wanted.get(c.id);
    if (status === undefined) {
      if (holder.spouse === id) edit(holder.id, { spouse: undefined, spouseStatus: undefined });
      const rest = (patches[holder.id]?.moreSpouses ?? holder.moreSpouses ?? []).filter((m) => m.id !== id);
      if (rest.length !== (holder.moreSpouses ?? []).length) edit(holder.id, { moreSpouses: rest.length ? rest : undefined });
    } else if (status !== c.status) {
      if (holder.spouse === id) edit(holder.id, { spouseStatus: status });
      else edit(holder.id, { moreSpouses: (holder.moreSpouses ?? []).map((m) => (m.id === id ? { ...m, status } : m)) });
    }
  }
  const heldElsewhere = new Set(current.filter((c) => c.holder !== id).map((c) => c.id));
  const mine = next.filter((m) => m.id && !heldElsewhere.has(m.id)).map((m) => ({ id: m.id, status: m.status ?? "married" }));
  const blanks = next.filter((m) => !m.id).map((m) => ({ id: "", status: m.status ?? ("married" as MarriageStatus) }));
  const spouse = mine[0]?.id;
  const spouseStatus = mine[0]?.status;
  const rest = [...mine.slice(1), ...blanks];
  const ownPatch: Partial<Person> = {};
  const norm = (list?: { id: string; status?: MarriageStatus }[]) => (list ?? []).map((m) => ({ id: m.id, status: m.status ?? "married" }));
  if (!same(me.spouse, spouse)) ownPatch.spouse = spouse;
  if (spouse ? (me.spouseStatus ?? "married") !== spouseStatus : me.spouseStatus !== undefined) ownPatch.spouseStatus = spouseStatus;
  if (!same(norm(me.moreSpouses), norm(rest))) ownPatch.moreSpouses = rest.length ? rest : undefined;
  if (Object.keys(ownPatch).length) edit(id, ownPatch);
  return patches;
}
