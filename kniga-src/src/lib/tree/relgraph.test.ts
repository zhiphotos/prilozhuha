import assert from "node:assert/strict";
import test from "node:test";
import { treeFromPeople, SELF_ID } from "./from-people.ts";
import { buildRelationshipGraph, calculateGenerations, findSiblings, parentIdsOf, resolveBranch, validateGraph } from "./relgraph.ts";
import type { TreeData } from "./types.ts";

const base = { maidenName: "", notes: "", birthYear: "" };
const P = (id: string, name: string, relation: string, extra: object = {}) => ({ ...base, id, name, relation, ...extra });
const person = (id: string, gender: "m" | "f") => ({ id, firstName: id, patronymic: "", lastName: "", gender, birthYear: "", deathYear: "", photo: "", note: "" });
const sample = (): TreeData => ({
  people: [person("gm", "f"), person("gf", "m"), person("m", "f"), person("f", "m"), person("x", "m"), person("me", "f"), person("sis", "f"), person("half", "m"), person("h", "m"), person("hm", "f")],
  unions: [
    { id: "u1", partnerIds: ["gf", "gm"], childIds: ["m"], status: "married", startYear: "", endYear: "" },
    { id: "u2", partnerIds: ["f", "m"], childIds: ["me", "sis"], status: "married", startYear: "", endYear: "" },
    { id: "u3", partnerIds: ["m", "x"], childIds: ["half"], status: "divorced", startYear: "", endYear: "" },
    { id: "u4", partnerIds: ["h", "hm"], childIds: ["h"], status: "married", startYear: "", endYear: "" },
  ],
  focusId: "me",
});

test("братья по двум родителям родные, по одному неполнородные, второй родитель остаётся своим", () => {
  const g = buildRelationshipGraph(sample());
  const sib = Object.fromEntries(findSiblings("me", g).map((s) => [s.id, s]));
  assert.equal(sib.sis!.kind, "full");
  assert.equal(sib.half!.kind, "half");
  assert.deepEqual(sib.half!.shared, ["m"]);
  assert.deepEqual(parentIdsOf(g, "half").sort(), ["m", "x"]);
});

test("поколения по родителям, партнёрство их не меняет; повторный запуск одинаков", () => {
  const g = buildRelationshipGraph(sample());
  const a = calculateGenerations("me", g);
  assert.equal(a.gen.get("m"), -1);
  assert.equal(a.gen.get("gm"), -2);
  assert.equal(a.gen.get("sis"), 0);
  assert.equal(a.gen.get("half"), 0);
  assert.equal(a.gen.get("x"), -1);
  const b = calculateGenerations("me", buildRelationshipGraph(sample()));
  assert.deepEqual([...a.gen], [...b.gen]);
  assert.equal(g.parents.size, buildRelationshipGraph(sample()).parents.size);
});

test("цикл и родитель самому себе обнаруживаются", () => {
  const d = sample();
  d.unions.push({ id: "u9", partnerIds: ["me"], childIds: ["gm"], status: "married", startYear: "", endYear: "" });
  const codes = validateGraph(buildRelationshipGraph(d)).map((i) => i.code);
  assert.ok(codes.includes("cycle"));
  const e = sample();
  e.unions.push({ id: "u8", partnerIds: ["sis"], childIds: ["sis"], status: "married", startYear: "", endYear: "" });
  assert.ok(validateGraph(buildRelationshipGraph(e)).some((i) => i.code === "self-parent"));
});

test("ветка: мама и папа центра, родня мужа отдельно", () => {
  const d = sample();
  d.people.push(person("husb", "m"), person("hmom", "f"));
  d.unions.push({ id: "u5", partnerIds: ["me", "husb"], childIds: [], status: "married", startYear: "", endYear: "" }, { id: "u6", partnerIds: ["hmom"], childIds: ["husb"], status: "married", startYear: "", endYear: "" });
  const g = buildRelationshipGraph(d);
  const gender = (id: string) => d.people.find((p) => p.id === id)!.gender as "m" | "f";
  assert.equal(resolveBranch("gm", "me", g, gender), "mother");
  assert.equal(resolveBranch("x", "me", g, gender), "other");
  assert.equal(resolveBranch("half", "me", g, gender), "mother");
  assert.equal(resolveBranch("hmom", "me", g, gender), "spouse");
});

test("люди из списка: родители мужа не становятся моими, ссылки на родителей не меняются", () => {
  const data = treeFromPeople([
    P("m", "Анна", "мама"), P("f", "Иван", "папа"), P("mh", "Зина", "свекровь", { parents: [] }), P("h", "Пётр", "муж", { parents: ["mh"] }),
  ]);
  const g = buildRelationshipGraph(data);
  assert.ok(!parentIdsOf(g, SELF_ID).includes("mh"));
  assert.deepEqual(parentIdsOf(g, "h"), ["mh"]);
  const again = buildRelationshipGraph(treeFromPeople([
    P("m", "Анна", "мама"), P("f", "Иван", "папа"), P("mh", "Зина", "свекровь"), P("h", "Пётр", "муж", { parents: ["mh"] }),
  ]));
  assert.equal(again.ids.size, g.ids.size);
});

test("предок не становится братом: родители не копируются", async () => {
  const { onSiblingSet } = await import("./auto-links.ts");
  const mk = (id: string, parents?: string[]) => ({ ...base, id, name: id, relation: "x", parents });
  const patch = onSiblingSet([mk("me", ["mom"]), mk("mom")], "mom", "me");
  assert.deepEqual(patch, {});
});

test("«мать мужа» без связи не становится моей мамой", () => {
  const data = treeFromPeople([P("mh", "Зина", "мать мужа"), P("h", "Пётр", "муж", { parents: ["mh"] }), P("m", "Анна", "мама")]);
  const g = buildRelationshipGraph(data);
  assert.deepEqual(parentIdsOf(g, SELF_ID).filter((id) => !id.startsWith("__")), ["m"]);
  const alone = buildRelationshipGraph(treeFromPeople([P("mh", "Зина", "мать мужа"), P("h", "Пётр", "муж")]));
  assert.ok(!parentIdsOf(alone, SELF_ID).includes("mh"));
});

test("прадедушка: явная связь решает, при двух бабушках/дедушках без неё не угадываем", () => {
  const people = [
    P("m", "Анна", "мама"), P("gm", "Нина", "бабушка", { line: "mom" }), P("gf", "Пётр", "дедушка", { line: "mom" }), P("pr", "Семён", "прадедушка", { line: "mom" }),
  ];
  const loose = treeFromPeople(people);
  assert.ok(!parentIdsOf(buildRelationshipGraph(loose), "gm").includes("pr"));
  assert.ok(!parentIdsOf(buildRelationshipGraph(loose), "gf").includes("pr"));
  assert.equal(loose.ambiguous?.[0]?.id, "pr");
  const picked = treeFromPeople(people.map((p) => (p.id === "gm" ? { ...p, parents: ["pr"] } : p)));
  assert.deepEqual(parentIdsOf(buildRelationshipGraph(picked), "gm"), ["pr"]);
  assert.ok(!parentIdsOf(buildRelationshipGraph(picked), "gf").includes("pr"));
  assert.equal(picked.ambiguous?.length, 0);
  const one = treeFromPeople([people[0]!, people[1]!, people[3]!]);
  assert.deepEqual(parentIdsOf(buildRelationshipGraph(one), "gm"), ["pr"]);
});

test("братья с разными вторыми родителями остаются в своих союзах", () => {
  const data = treeFromPeople([
    P("m", "Анна", "мама"), P("f", "Иван", "папа"), P("x", "Олег", "отчим"),
    P("b1", "Лёва", "брат", { parents: ["m", "f"] }), P("b2", "Миша", "брат", { parents: ["m", "x"] }),
  ]);
  const g = buildRelationshipGraph(data);
  assert.deepEqual(parentIdsOf(g, "b2").sort(), ["m", "x"]);
  assert.deepEqual(parentIdsOf(g, "b1").sort(), ["f", "m"]);
  assert.equal(findSiblings("b1", g).find((s) => s.id === "b2")?.kind, "half");
});
