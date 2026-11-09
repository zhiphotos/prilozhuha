// Боковые ветки супругов, кнопки «правее/левее» и «поменять супругов местами». Фикстуры синтетические.
import assert from "node:assert/strict";
import test from "node:test";
import { flipSpouse, moveBranch } from "./arrange.ts";
import { layoutTree } from "./layout.ts";
import type { Person, TreeData, Union } from "./types.ts";

const person = (id: string, gender: "m" | "f", extra: Partial<Person> = {}): Person => ({ id, firstName: id, patronymic: "", lastName: "", gender, birthYear: "", deathYear: "", photo: "", note: "", ...extra });
const union = (id: string, partners: string[], kids: string[]): Union => ({ id, partnerIds: partners, childIds: kids, status: "married", startYear: "", endYear: "" });
const xs = (data: TreeData) => new Map(layoutTree(data.people, data.unions, data.focusId).nodes.map((n) => [n.id, n.x]));
const rowOf = (data: TreeData, ids: string[]) => {
  const x = xs(data);
  return ids.slice().sort((a, b) => x.get(a)! - x.get(b)!);
};

/** Дедушка G1 и бабушка G2, у каждого свои родители и братья и сёстры. Выбранный «me» их внук. */
function grandPair(): TreeData {
  const p = (id: string, g: "m" | "f", birth = "") => person(id, g, { birthYear: birth });
  const people = [
    p("me", "m"), p("F", "m"), p("M", "f"), p("MF", "m"), p("MM", "f"),
    p("G1", "m", "1930"), p("G2", "f", "1932"),
    p("A1", "m"), p("A2", "f"), p("sisG1", "f", "1935"),
    p("B1", "m"), p("B2", "f"), p("broG2", "m", "1928"), p("sisG2", "f", "1936"),
  ];
  const unions = [
    union("u0", ["F", "M"], ["me"]), union("uF", ["G1", "G2"], ["F"]), union("uM", ["MF", "MM"], ["M"]),
    union("uA", ["A1", "A2"], ["G1", "sisG1"]), union("uB", ["B1", "B2"], ["broG2", "G2", "sisG2"]),
  ];
  return { people, unions, focusId: "me" };
}

test("боковые ветки супругов: сестра мужа слева от него, брат и сестра жены справа от неё, дети пар подряд", () => {
  const row = rowOf(grandPair(), ["G1", "G2", "sisG1", "broG2", "sisG2"]);
  assert.deepEqual(row.slice(0, 3), ["sisG1", "G1", "G2"], row.join(" | "));
  assert.deepEqual(row.slice(3).sort(), ["broG2", "sisG2"], row.join(" | "));
});

/** Родители «mom»+«dad» и четверо детей разного возраста; у одного из них своя семья с ребёнком. */
function fourKids(): TreeData {
  const people = [person("dad", "m"), person("mom", "f"), person("a", "m", { birthYear: "1980" }), person("b", "f", { birthYear: "1982" }), person("c", "m", { birthYear: "1984" }), person("d", "f", { birthYear: "1986" }), person("cw", "f"), person("ck", "m")];
  const unions = [union("u0", ["dad", "mom"], ["a", "b", "c", "d"]), union("u1", ["c", "cw"], ["ck"])];
  return { people, unions, focusId: "a" };
}
const withRanks = (data: TreeData, patches: { id: string; rank?: number }[]): TreeData => ({ ...data, people: data.people.map((p) => ({ ...p, rank: patches.find((q) => q.id === p.id)?.rank ?? p.rank })) });

test("«правее»: человек с семьёй меняется местами только с соседним братом или сестрой", () => {
  const data = fourKids();
  assert.deepEqual(rowOf(data, ["a", "b", "c", "d"]), ["a", "b", "c", "d"]);
  const patches = moveBranch(data.people, data.unions, data.focusId, "b", 1);
  assert.ok(patches.length > 0);
  assert.ok(patches.every((q) => ["a", "b", "c", "d"].includes(q.id)), "правки только у братьев и сестёр");
  const moved = withRanks(data, patches);
  assert.deepEqual(rowOf(moved, ["a", "b", "c", "d"]), ["a", "c", "b", "d"]);
  const x = xs(moved);
  assert.ok(Math.abs(x.get("ck")! - (x.get("c")! + x.get("cw")!) / 2) < 1, "ребёнок под серединой пары");
});

test("«левее» у самого левого среди братьев и сестёр: крайняя, правок нет; «правее» у самого правого тоже", () => {
  const data = fourKids();
  assert.deepEqual(moveBranch(data.people, data.unions, data.focusId, "a", -1), []);
  assert.deepEqual(moveBranch(data.people, data.unions, data.focusId, "d", 1), []);
  assert.ok(moveBranch(data.people, data.unions, data.focusId, "d", -1).length > 0, "не крайняя в другую сторону");
});

test("лишние ранги в других рядах и семьях не мешают: двигается ровно один шаг", () => {
  const data = grandPair();
  // ранги, как их оставляла старая версия: на весь ряд сразу, без связи с семьями
  const stale = withRanks(data, data.people.map((p, i) => ({ id: p.id, rank: (data.people.length - i) * 10 })));
  const kids = ["broG2", "G2", "sisG2"];
  const before = rowOf(stale, kids);
  const patches = moveBranch(stale.people, stale.unions, stale.focusId, before[0]!, 1);
  assert.ok(patches.length > 0, `${before.join(" | ")}: сдвиг вправо возможен`);
  assert.deepEqual(rowOf(withRanks(stale, patches), kids), [before[1], before[0], before[2]]);
});

test("«поменять супругов местами»: пара, у обоих которой есть родители, родители выбранного и блок из трёх человек", () => {
  const swapped = (d: TreeData, a: string, b: string) => {
    const x0 = xs(d);
    const patches = flipSpouse(d.people, d.unions, d.focusId, a);
    assert.ok(patches.length > 0);
    const d2 = { ...d, people: d.people.map((p) => { const q = patches.find((t) => t.id === p.id); return q ? { ...p, side: q.side ?? undefined } : p; }) };
    const x1 = xs(d2);
    return (x0.get(a)! - x0.get(b)!) * (x1.get(a)! - x1.get(b)!) < 0;
  };
  const data = grandPair();
  assert.ok(swapped(data, "G1", "G2"), "дедушка и бабушка со своими родителями");
  assert.ok(swapped(data, "F", "M"), "родители выбранного");
  const multi: TreeData = {
    people: [person("h", "m", { birthYear: "1950" }), person("w1", "f", { birthYear: "1952" }), person("w2", "f", { birthYear: "1955" }), person("k1", "m"), person("k2", "f")],
    unions: [union("m1", ["h", "w1"], ["k1"]), union("m2", ["h", "w2"], ["k2"])],
    focusId: "h",
  };
  assert.ok(swapped(multi, "w2", "h"), "блок из трёх человек");
});
