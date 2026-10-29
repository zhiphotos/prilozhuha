import type { Person as RodPerson } from "../rod/types.ts";
import { treeFromPeople } from "./from-people.ts";
import { kinship } from "./kinship.ts";

/** Автоматические связи: что логично следует из того, что внесла пользователь. Чистые функции, без хранилища. */
export type Patch = Record<string, Partial<RodPerson>>;

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

function childrenOf(people: RodPerson[], id: string): RodPerson[] {
  return people.filter((p) => p.parents?.includes(id));
}

/** Второй родитель для нового ребёнка человека: супруг, а если не указан, то общий другой родитель его детей. */
export function coParentOf(people: RodPerson[], parentId: string): string | undefined {
  const me = people.find((p) => p.id === parentId);
  if (me?.spouse && people.some((p) => p.id === me.spouse)) return me.spouse;
  const mate = people.find((p) => p.spouse === parentId);
  if (mate) return mate.id;
  const kids = childrenOf(people, parentId);
  if (!kids.length) return undefined;
  const others = kids.map((k) => (k.parents ?? []).find((x) => x !== parentId));
  const first = others[0];
  return first && others.every((o) => o === first) ? first : undefined;
}

export function parentsForChild(people: RodPerson[], parentId: string): string[] {
  const co = coParentOf(people, parentId);
  return co ? [parentId, co] : [parentId];
}

/** У ребёнка уже двое родителей: приложение хранит не больше двух, третьего принять нельзя. Возвращает текст для пользователя или null. */
export function parentLimitMessage(people: RodPerson[], childId: string): string | null {
  const child = people.find((p) => p.id === childId);
  const known = (child?.parents ?? []).filter((id) => people.some((p) => p.id === id));
  return known.length >= 2 ? "У этого человека уже указаны двое родителей, а больше двух приложение не хранит. Чтобы добавить другого, сначала уберите одного из них в карточке («Чей ребёнок»)." : null;
}

/** Родители для нового ребёнка из выбранного брака (состав пары на схеме): без выбора – как раньше, по супругу. Заглушки «Мама»/«Папа» (id с __) родителями не записываются. */
export function parentsForUnion(people: RodPerson[], parentId: string, partnerIds: string[] | undefined): string[] {
  if (!partnerIds || !partnerIds.includes(parentId)) return parentsForChild(people, parentId);
  const real = partnerIds.filter((id) => !id.startsWith("__") && people.some((p) => p.id === id));
  return [parentId, ...real.filter((id) => id !== parentId)].slice(0, 2);
}

/** Список без удалённого человека: ссылки на него убираются из родителей, супругов, «ещё браков» и «брата или сестры». Остальные поля не трогаем. */
export function withoutPerson(people: RodPerson[], id: string): RodPerson[] {
  return people
    .filter((p) => p.id !== id)
    .map((p) => {
      let next = p;
      if (next.parents?.includes(id)) next = { ...next, parents: next.parents.filter((x) => x !== id) };
      if (next.spouse === id) next = { ...next, spouse: undefined };
      if (next.moreSpouses?.some((m) => m.id === id)) next = { ...next, moreSpouses: next.moreSpouses.filter((m) => m.id !== id) };
      if (next.siblingOf === id) next = { ...next, siblingOf: undefined };
      return next;
    });
}

/** Новый брат или сестра: те же родители, что у того, кому приходится; без родителей – связь «брат или сестра». */
export function siblingLinks(base: RodPerson | undefined): Partial<RodPerson> {
  if (!base) return {};
  return base.parents?.length ? { parents: [...base.parents] } : { siblingOf: base.id };
}

/** У человека появился родитель: он же родитель его братьев и сестёр, а с другим известным родителем они пара. */
export function onParentAdded(people: RodPerson[], childId: string, newParentId: string): Patch {
  const child = people.find((p) => p.id === childId);
  if (!child) return {};
  const existing = (child.parents ?? []).filter((id) => id !== newParentId);
  const next = [...existing, newParentId].slice(0, 2);
  const patch: Patch = { [childId]: { parents: next } };
  for (const p of people) {
    if (p.id === childId || p.id === newParentId) continue;
    const brother = p.siblingOf === childId || (existing.length > 0 && sameSet(p.parents ?? [], existing));
    if (brother && (p.parents ?? []).length < 2) patch[p.id] = { parents: next };
  }
  if (existing.length === 1) {
    const other = people.find((p) => p.id === existing[0]);
    const fresh = people.find((p) => p.id === newParentId);
    if (other && fresh && !other.spouse && !fresh.spouse && !people.some((p) => p.spouse === other.id || p.spouse === fresh.id)) {
      patch[newParentId] = { ...(patch[newParentId] ?? {}), spouse: other.id };
    }
  }
  return patch;
}

/** Первый супруг человека, у которого дети записаны только на него: он становится вторым родителем этих детей. */
export function onSpouseAdded(people: RodPerson[], personId: string, spouseId: string): Patch {
  const person = people.find((p) => p.id === personId);
  const spouse = people.find((p) => p.id === spouseId);
  if (!person || !spouse) return {};
  const earlier = (person.spouse && person.spouse !== spouseId) || (person.moreSpouses ?? []).length > 0 || people.some((p) => p.id !== spouseId && p.spouse === personId);
  if (earlier || childrenOf(people, spouseId).length) return {};
  const patch: Patch = {};
  for (const kid of childrenOf(people, personId)) {
    if ((kid.parents ?? []).length === 1) patch[kid.id] = { parents: [personId, spouseId] };
  }
  return patch;
}

/** Выбрали «брат или сестра»: родители общие, как бы ни вносили. */
export function onSiblingSet(people: RodPerson[], personId: string, otherId: string): Patch {
  const a = people.find((p) => p.id === personId);
  const b = people.find((p) => p.id === otherId);
  if (!a || !b) return {};
  // Предок или потомок не может быть братом или сестрой: родителей не копируем.
  const reach = (from: string, step: (id: string) => string[]) => {
    const seen = new Set<string>([from]);
    const q = [from];
    for (let i = 0; i < q.length; i++) for (const n of step(q[i]!)) if (!seen.has(n)) { seen.add(n); q.push(n); }
    return seen;
  };
  const up = (id: string) => (people.find((p) => p.id === id)?.parents ?? []);
  const down = (id: string) => people.filter((p) => (p.parents ?? []).includes(id)).map((p) => p.id);
  if (reach(personId, up).has(otherId) || reach(personId, down).has(otherId)) return {};
  if (!(a.parents ?? []).length && (b.parents ?? []).length) return { [personId]: { parents: [...b.parents!] } };
  if ((a.parents ?? []).length && !(b.parents ?? []).length) return { [otherId]: { parents: [...a.parents!] } };
  return {};
}

export function applyPatch(people: RodPerson[], patch: Patch): RodPerson[] {
  return people.map((p) => (patch[p.id] ? { ...p, ...patch[p.id] } : p));
}

/**
 * «Кем приходится» считается по связям: у тех, у кого связи указаны, подпись пересчитывается от «Я».
 * Без связей (только слово) подпись не трогаем.
 */
export function syncRelations(people: RodPerson[]): RodPerson[] {
  if (people.length < 2) return people;
  const linked = new Set<string>();
  for (const p of people) {
    if ((p.parents ?? []).length || p.spouse || p.siblingOf || (p.moreSpouses ?? []).length) linked.add(p.id);
    for (const id of p.parents ?? []) linked.add(id);
    if (p.spouse) linked.add(p.spouse);
    if (p.siblingOf) linked.add(p.siblingOf);
  }
  const tree = treeFromPeople(people);
  const titles = new Map<string, string>();
  for (const person of tree.people) {
    if (person.id === tree.focusId || person.id.startsWith("__")) continue;
    const title = kinship(tree.people, tree.unions, tree.focusId, person.id).title;
    if (title && title !== "Родственник") titles.set(person.id, title);
  }
  let changed = false;
  const next = people.map((p) => {
    const title = titles.get(p.id);
    if (!title || p.fromFile || !linked.has(p.id) || /^(я|мне)$/i.test(p.relation.trim()) || p.relation.trim().toLowerCase() === title.toLowerCase()) return p;
    changed = true;
    return { ...p, relation: title };
  });
  return changed ? next : people;
}
