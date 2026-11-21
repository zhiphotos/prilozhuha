// Цепочка родства между двумя людьми. Данные вымышленные.
import assert from "node:assert/strict";
import test from "node:test";
import { findKinshipPath } from "./kinship-path.ts";
import type { Union } from "./types.ts";

const U = (id: string, partnerIds: string[], childIds: string[]): Union => ({ id, partnerIds, childIds, status: "married" } as Union);
// прадед+прабабка -> дед, двоюродный дед; дед+бабка -> отец, тётя; отец+мама -> я, сестра; тётя+дядя -> кузина; я+жена -> сын; двоюродный дед+его жена -> племянник деда
const unions = [
  U("u0", ["pradedA", "prababkaA"], ["ded", "dvDed"]),
  U("u1", ["ded", "babka"], ["otec", "tetya"]),
  U("u2", ["otec", "mama"], ["ya", "sestra"]),
  U("u3", ["tetya", "dyadya"], ["kuzina"]),
  U("u4", ["ya", "zhena"], ["syn"]),
  U("u5", ["dvDed", "dvBabka"], ["plemyannik"]),
  U("u6", ["mamaOtec", "mamaMat"], ["mama"]),
];
const ids = (s: Set<string>) => [...s].sort();

test("родитель и ребёнок: только связь между ними", () => {
  const p = findKinshipPath(unions, "otec", "ya");
  assert.equal(p.kind, "blood");
  assert.equal(p.steps, 1);
  assert.deepEqual(ids(p.people), ["otec", "ya"]);
  assert.deepEqual(p.parentLinks, [{ unionId: "u2", childId: "ya", parentId: "otec" }]);
  assert.equal(p.marriages.size, 0, "мама не входит, брак не подсвечен");
});

test("бабушка и внучка: цепочка через поколения, без братьев, сестёр и тёти", () => {
  const p = findKinshipPath(unions, "babka", "ya");
  assert.equal(p.kind, "blood");
  assert.equal(p.steps, 2);
  assert.deepEqual(ids(p.people), ["babka", "otec", "ya"]);
  assert.ok(!p.people.has("tetya") && !p.people.has("sestra") && !p.people.has("mama"));
  assert.deepEqual(p.chain, ["babka", "otec", "ya"]);
});

test("полные брат и сестра: путь через обоих общих родителей, брак родителей подсвечен", () => {
  const p = findKinshipPath(unions, "ya", "sestra");
  assert.equal(p.steps, 2);
  assert.deepEqual(ids(p.people), ["mama", "otec", "sestra", "ya"]);
  assert.equal(p.parentLinks.length, 4);
  assert.deepEqual([...p.marriages], ["u2"]);
});

test("двоюродные: путь через общего деда и бабку (обоих), без других родственников", () => {
  const p = findKinshipPath(unions, "ya", "kuzina");
  assert.equal(p.kind, "blood");
  assert.equal(p.steps, 4);
  assert.deepEqual(ids(p.people), ["babka", "ded", "kuzina", "otec", "tetya", "ya"]);
  assert.ok(!p.people.has("mama") && !p.people.has("dyadya") && !p.people.has("sestra"));
  assert.ok(p.marriages.has("u1"));
});

test("двоюродный дед и внук: через общего прадеда и прабабку", () => {
  const p = findKinshipPath(unions, "dvDed", "ya");
  assert.equal(p.steps, 4);
  assert.deepEqual(ids(p.people), ["ded", "dvDed", "otec", "prababkaA", "pradedA", "ya"]);
});

test("только через брак: невестка и свёкор, путь по браку", () => {
  const p = findKinshipPath(unions, "zhena", "otec");
  assert.equal(p.kind, "marriage");
  assert.deepEqual(ids(p.people), ["otec", "ya", "zhena"]);
  assert.deepEqual([...p.marriages], ["u4"]);
  assert.deepEqual(p.parentLinks, [{ unionId: "u2", childId: "ya", parentId: "otec" }]);
});

test("супруги: путь только по браку", () => {
  const p = findKinshipPath(unions, "ya", "zhena");
  assert.equal(p.kind, "marriage");
  assert.equal(p.steps, 1);
  assert.deepEqual([...p.marriages], ["u4"]);
});

test("кровный путь важнее брака: сын и жена идут через ребёнка, а не по браку с кровным", () => {
  const p = findKinshipPath(unions, "syn", "ya");
  assert.equal(p.kind, "blood");
  assert.equal(p.steps, 1);
});

test("нет связи: «не найдено», ничего не выделяется", () => {
  const p = findKinshipPath(unions, "ya", "chuzhoy");
  assert.equal(p.kind, "none");
  assert.equal(p.people.size, 0);
  assert.equal(findKinshipPath(unions, "ya", "ya").kind, "none");
});

test("зацикленные связи не вешают поиск", () => {
  const loop = [U("a", ["x"], ["y"]), U("b", ["y"], ["x"])];
  assert.equal(findKinshipPath(loop, "x", "y").steps, 1);
});
