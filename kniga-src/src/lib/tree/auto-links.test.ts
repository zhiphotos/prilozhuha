import { applyPatch, onParentAdded, onSiblingSet, onSpouseAdded, parentsForChild, siblingLinks } from "./auto-links.ts";
import { treeFromPeople } from "./from-people.ts";
import { kinship } from "./kinship.ts";
import type { Person } from "../rod/types.ts";

const b = (id: string, name: string, relation: string, extra: Partial<Person> = {}): Person =>
  ({ id, name, firstName: name, patronymic: "", lastName: "Иванов", relation, birthYear: "", notes: "", maidenName: "", ...extra }) as Person;
const title = (people: Person[], id: string) => {
  const t = treeFromPeople(people);
  return kinship(t.people, t.unions, t.focusId, id).title;
};
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

// Второй ребёнок матери: у матери есть общий с первым ребёнком отец, значит это родная сестра.
{
  const people = [b("me", "Я", "я", { parents: ["m", "f"] }), b("m", "Мама", "мама", { gender: "f" }), b("f", "Папа", "папа", { gender: "m" })];
  const parents = parentsForChild(people, "m");
  assert(parents.length === 2 && parents.includes("f"), "co-parent from existing children");
  const all = [...people, b("a", "Аня", "дочь", { gender: "f", parents })];
  assert(title(all, "a") === "Сестра", `sister ${title(all, "a")}`);
}
// Сестра без родителей: появляются общие пустые родители.
{
  const people = [b("me", "Я", "я"), b("a", "Аня", "сестра", { gender: "f", ...siblingLinks(b("me", "Я", "я")) })];
  assert(title(people, "a") === "Сестра", `sister without parents ${title(people, "a")}`);
}
// Отец вписан раньше, мать потом как жена отца: мать, а не мачеха.
{
  let people = [b("me", "Я", "я", { parents: ["f"] }), b("f", "Папа", "папа", { gender: "m" })];
  people = [...people, b("m", "Мама", "мама", { gender: "f", spouse: "f" })];
  people = applyPatch(people, onSpouseAdded(people, "f", "m"));
  assert(title(people, "m") === "Мать", `mother ${title(people, "m")}`);
}
// Мать добавлена к человеку, у которого уже есть отец: пара, и родители у брата тоже.
{
  let people = [b("me", "Я", "я", { parents: ["f"] }), b("f", "Папа", "папа", { gender: "m" }), b("br", "Брат", "брат", { gender: "m", parents: ["f"] }), b("m", "Мама", "мама", { gender: "f" })];
  people = applyPatch(people, onParentAdded(people, "me", "m"));
  assert(people.find((p) => p.id === "br")?.parents?.includes("m"), "brother gets the new parent");
  assert(title(people, "br") === "Брат", `brother ${title(people, "br")}`);
}
// «Брат или сестра» выбрали вручную: родители общие.
{
  const people = [b("me", "Я", "я", { parents: ["m", "f"] }), b("m", "Мама", "мама"), b("f", "Папа", "папа"), b("a", "Аня", "сестра", { siblingOf: "me" })];
  const patched = applyPatch(people, onSiblingSet(people, "a", "me"));
  assert(patched.find((p) => p.id === "a")?.parents?.length === 2, "parents copied");
}
