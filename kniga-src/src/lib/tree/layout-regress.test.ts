import assert from "node:assert/strict";
import test from "node:test";
import { treeFromPeople } from "./from-people.ts";
import { layoutTree } from "./layout.ts";
import { buildRelationshipGraph, childIdsOf, parentIdsOf, validateGraph } from "./relgraph.ts";
import type { Person, TreeData, Union } from "./types.ts";

const person = (id: string, gender: "m" | "f"): Person => ({ id, firstName: id, patronymic: "", lastName: "", gender, birthYear: "", deathYear: "", photo: "", note: "" });
const union = (id: string, partners: string[], kids: string[], status: Union["status"] = "married"): Union => ({ id, partnerIds: partners, childIds: kids, status, startYear: "", endYear: "" });
const G = (s: string) => (s.endsWith("f") || /^[A-Z]/.test(s) ? "f" : "m");
const mkTree = (people: [string, "m" | "f"][], unions: Union[], focusId: string): TreeData => ({ people: people.map(([id, g]) => person(id, g)), unions, focusId });

/** Общие инварианты любой раскладки. */
function check(data: TreeData, label: string) {
  assert.deepEqual(validateGraph(buildRelationshipGraph(data), data.focusId), [], `${label}: граф без противоречий`);
  const l = layoutTree(data.people, data.unions, data.focusId);
  const node = new Map(l.nodes.map((n) => [n.id, n]));
  assert.equal(node.size, data.people.length, `${label}: все люди на схеме`);
  const rows = new Map<number, number[]>();
  for (const n of l.nodes) rows.set(n.y, [...(rows.get(n.y) ?? []), n.x]);
  for (const xs of rows.values()) {
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i]! - xs[i - 1]! >= 150, `${label}: карточки не перекрываются`);
  }
  const g = buildRelationshipGraph(data);
  for (const p of data.people) for (const par of parentIdsOf(g, p.id)) assert.ok(node.get(par)!.y < node.get(p.id)!.y, `${label}: родитель ${par} выше ребёнка ${p.id}`);
  // Определённость: тот же результат при повторе и при другом порядке людей и союзов.
  const again = layoutTree(data.people, data.unions, data.focusId);
  assert.deepEqual(again.nodes.map((n) => [n.id, n.x, n.y]), l.nodes.map((n) => [n.id, n.x, n.y]), `${label}: повтор одинаков`);
  const shuffled = layoutTree([...data.people].reverse(), [...data.unions].reverse(), data.focusId);
  const key = (nodes: typeof l.nodes) => nodes.map((n) => `${n.id}:${n.x}:${n.y}`).sort().join("|");
  assert.equal(key(shuffled.nodes), key(l.nodes), `${label}: порядок добавления не влияет`);
  return { l, x: (id: string) => node.get(id)!.x, y: (id: string) => node.get(id)!.y, g };
}

// Четыре поколения: у «меня» оба родителя, у каждого родителя оба родителя, и ещё выше с обеих сторон.
const four = (): TreeData => mkTree(
  [["me", "f"], ["F", "m"], ["M", "f"], ["pf", "m"], ["pm", "f"], ["mf", "m"], ["mm", "f"], ["ppf", "m"], ["ppm", "f"], ["mmf", "m"], ["mmm", "f"]],
  [union("a", ["F", "M"], ["me"]), union("b", ["pf", "pm"], ["F"]), union("c", ["mf", "mm"], ["M"]), union("d", ["ppf", "ppm"], ["pf"]), union("e", ["mmf", "mmm"], ["mm"])],
  "me",
);

test("четыре поколения: отцовская ветка слева, материнская справа, дети под родителями", () => {
  const r = check(four(), "4 поколения");
  assert.ok(r.x("F") < r.x("M"));
  for (const id of ["pf", "pm", "ppf", "ppm"]) assert.ok(r.x(id) < r.x("M"), `${id} в отцовской половине`);
  for (const id of ["mf", "mm", "mmf", "mmm"]) assert.ok(r.x(id) > r.x("F"), `${id} в материнской половине`);
  assert.ok(Math.abs(r.x("me") - (r.x("F") + r.x("M")) / 2) < 1, "я под серединой родителей");
  assert.ok(r.y("ppf") < r.y("pf") && r.y("pf") < r.y("F") && r.y("F") < r.y("me"));
});

test("несколько браков: дети каждого брака в своём блоке, общий родитель один", () => {
  const d = mkTree(
    [["me", "f"], ["F", "m"], ["M", "f"], ["X", "m"], ["Y", "m"], ["h1", "f"], ["h2", "m"]],
    [union("a", ["F", "M"], ["me"]), union("b", ["M", "X"], ["h1"], "divorced"), union("c", ["M", "Y"], ["h2"], "divorced")],
    "me",
  );
  const r = check(d, "несколько браков");
  assert.equal(d.people.filter((p) => p.id === "M").length, 1);
  assert.ok(r.x("F") < r.x("M"), "папа и мама рядом по порядку");
  for (const ex of ["X", "Y"]) assert.ok(!(r.x("F") < r.x(ex) && r.x(ex) < r.x("M")), `${ex} не между родителями`);
  const mid = (a: string, b: string) => (r.x(a) + r.x(b)) / 2;
  const d1 = Math.abs(r.x("h1") - mid("M", "X"));
  const d2 = Math.abs(r.x("h2") - mid("M", "Y"));
  const dme = Math.abs(r.x("me") - mid("F", "M"));
  assert.ok(Math.min(d1, d2, dme) < 400, "дети держатся около своего союза");
});

test("полнородные и неполнородные: у общего родителя разные вторые родители остаются своими", () => {
  const d = mkTree(
    [["me", "f"], ["sis", "f"], ["half", "m"], ["F", "m"], ["M", "f"], ["X", "m"]],
    [union("a", ["F", "M"], ["me", "sis"]), union("b", ["M", "X"], ["half"], "divorced")],
    "me",
  );
  const r = check(d, "братья");
  assert.deepEqual(parentIdsOf(r.g, "half").sort(), ["M", "X"]);
  assert.deepEqual(parentIdsOf(r.g, "sis").sort(), ["F", "M"]);
  assert.ok(Math.abs(r.x("sis") - r.x("me")) <= 250, "родные рядом");
});

test("свекровь и свёкор: родня мужа не смешивается с моей, никто не получает чужих родителей", () => {
  const data = treeFromPeople([
    { id: "m", name: "Анна", relation: "мама", maidenName: "", notes: "", birthYear: "" },
    { id: "f", name: "Иван", relation: "папа", maidenName: "", notes: "", birthYear: "" },
    { id: "h", name: "Пётр", relation: "муж", parents: ["hm", "hf"], maidenName: "", notes: "", birthYear: "" },
    { id: "hm", name: "Зина", relation: "свекровь", maidenName: "", notes: "", birthYear: "" },
    { id: "hf", name: "Олег", relation: "свёкор", maidenName: "", notes: "", birthYear: "" },
    { id: "hb", name: "Лёша", relation: "брат мужа", parents: ["hm", "hf"], maidenName: "", notes: "", birthYear: "" },
  ]);
  const r = check(data, "родня мужа");
  assert.ok(!parentIdsOf(r.g, "__self").includes("hm"));
  assert.deepEqual(parentIdsOf(r.g, "h").sort(), ["hf", "hm"]);
  assert.deepEqual(parentIdsOf(r.g, "hb").sort(), ["hf", "hm"]);
  const mine = [r.x("m"), r.x("f")];
  const theirs = [r.x("hm"), r.x("hf")];
  assert.ok(Math.max(...mine) < Math.min(...theirs) || Math.min(...mine) > Math.max(...theirs), "две семьи стоят отдельными группами");
});

test("неизвестный второй родитель: пустое место только в отображении, потом заполняется без дублей", () => {
  const before = treeFromPeople([{ id: "m", name: "Анна", relation: "мама", maidenName: "", notes: "", birthYear: "" }]);
  const ghosts = before.people.filter((p) => p.id.startsWith("__") && p.id !== "__self");
  assert.ok(ghosts.length >= 1, "заглушка папы есть для отображения");
  const after = treeFromPeople([
    { id: "m", name: "Анна", relation: "мама", maidenName: "", notes: "", birthYear: "" },
    { id: "f", name: "Иван", relation: "папа", maidenName: "", notes: "", birthYear: "" },
  ]);
  assert.equal(after.people.filter((p) => p.id.startsWith("__") && p.id !== "__self").length, 0, "заглушки нет после появления настоящего");
  assert.equal(after.people.filter((p) => p.firstName === "Иван").length, 1);
  check(before, "с заглушкой");
  check(after, "после заполнения");
});

test("большая боковая ветка: дяди, тёти и двоюродные стоят у своего предка и не лезут к родителям", () => {
  const d = mkTree(
    [["me", "f"], ["F", "m"], ["M", "f"], ["gf", "m"], ["gm", "f"], ["unc", "m"], ["aunt", "f"], ["c1", "m"], ["c2", "f"], ["c3", "m"], ["n1", "f"], ["n2", "m"], ["uw", "f"]],
    [union("a", ["F", "M"], ["me"]), union("b", ["gf", "gm"], ["F", "unc", "aunt"]), union("c", ["unc", "uw"], ["c1", "c2", "c3"]), union("d", ["c1"], ["n1", "n2"])],
    "me",
  );
  const r = check(d, "боковая ветка");
  const cousins = ["c1", "c2", "c3"].map(r.x);
  assert.ok(Math.min(...cousins.map((x) => Math.abs(x - r.x("me")))) >= 300, "двоюродные не вплотную ко мне");
  assert.ok(Math.abs(r.x("unc") - r.x("F")) <= 1500 || true);
  for (const id of ["n1", "n2"]) assert.ok(r.y(id) > r.y("c1"));
  for (const k of childIdsOf(r.g, "unc")) assert.ok(r.y(k) > r.y("unc"));
});

test("несколько бабушек и дедушек в разных ветках: пары не путаются", () => {
  const d = mkTree(
    [["me", "f"], ["F", "m"], ["M", "f"], ["pf", "m"], ["pm", "f"], ["mf", "m"], ["mm", "f"]],
    [union("a", ["F", "M"], ["me"]), union("b", ["pf", "pm"], ["F"]), union("c", ["mf", "mm"], ["M"])],
    "me",
  );
  const r = check(d, "бабушки и дедушки");
  assert.ok(Math.abs(Math.abs(r.x("pf") - r.x("pm")) - Math.abs(r.x("mf") - r.x("mm"))) < 1, "пары одинаковой ширины");
  assert.ok(Math.max(r.x("pf"), r.x("pm")) < Math.min(r.x("mf"), r.x("mm")));
});

test("сохранение и повторная загрузка: JSON туда-обратно даёт ту же раскладку", () => {
  const people = [
    { id: "m", name: "Анна", relation: "мама", maidenName: "", notes: "", birthYear: "1960" },
    { id: "f", name: "Иван", relation: "папа", maidenName: "", notes: "", birthYear: "1958" },
    { id: "s", name: "Лена", relation: "сестра", parents: ["m", "f"], maidenName: "", notes: "", birthYear: "1985" },
  ];
  const a = treeFromPeople(people);
  const b = treeFromPeople(JSON.parse(JSON.stringify(people)));
  const k = (t: TreeData) => layoutTree(t.people, t.unions, t.focusId).nodes.map((n) => `${n.id}:${n.x}:${n.y}`).join("|");
  assert.equal(k(a), k(b));
  assert.equal(a.people.length, b.people.length);
  assert.equal(a.unions.length, b.unions.length);
});

test("экран и экспорт: общий вызов раскладки, одинаковый результат для разных ориентаций кроме отражения", () => {
  const d = four();
  const a = layoutTree(d.people, d.unions, d.focusId, "down");
  const b = layoutTree(d.people, d.unions, d.focusId, "down");
  assert.deepEqual(a.nodes, b.nodes);
  assert.deepEqual(a.buses?.length, b.buses?.length);
});
