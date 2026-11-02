import type { Person } from "@/lib/rod/types";
import { SELF_ID, treeFromPeople } from "./from-people.ts";

/**
 * Родители, которые схема выводит по слову «кем приходится» (у человека нет явных ссылок), записываем в сами данные.
 * Вызывается перед правкой подписи: после неё вывод по слову мог бы исчезнуть, а связь родитель–ребёнок должна остаться.
 * Схема от этого не меняется. Люди, у которых вывод опирается на пустую заготовку («Мама», «Папа»), не трогаются.
 */
export function freezeDerivedParents(people: Person[]): Person[] {
  const tree = treeFromPeople(people);
  const known = new Set(people.map((p) => p.id));
  let changed = false;
  const next = people.map((p) => {
    if ((p.parents ?? []).length || p.siblingOf || p.fromFile) return p;
    const union = tree.unions.find((u) => u.childIds.includes(p.id));
    if (!union) return p;
    if (union.partnerIds.some((id) => id.startsWith("__") || id === SELF_ID || !known.has(id) || id === p.id)) return p;
    changed = true;
    return { ...p, parents: union.partnerIds.slice(0, 2) };
  });
  return changed ? next : people;
}

/**
 * Перед добавлением нового родителя человеку: настоящие родители, которые схема выводит ему по слову «кем приходится»
 * (даже если второе место занимает пустая заготовка «Дедушка»), записываем в его данные. Новый родитель встанет на место
 * заготовки, а не вытеснит выведенных. Остальных людей и схему это не меняет.
 */
export function freezeParentsOf(people: Person[], childId: string): Person[] {
  const child = people.find((p) => p.id === childId);
  if (!child || (child.parents ?? []).length || child.siblingOf || child.fromFile) return people;
  const union = treeFromPeople(people).unions.find((u) => u.childIds.includes(childId));
  if (!union) return people;
  const known = new Set(people.map((p) => p.id));
  const real = union.partnerIds.filter((id) => !id.startsWith("__") && id !== SELF_ID && id !== childId && known.has(id));
  if (!real.length) return people;
  return people.map((p) => (p.id === childId ? { ...p, parents: real.slice(0, 2) } : p));
}
