import assert from "node:assert/strict";
import test from "node:test";
import { kinship } from "./kinship.ts";
import type { Person, Union } from "./types.ts";

const p = (id: string, gender: Person["gender"]): Person => ({ id, firstName: id, patronymic: "", lastName: "", gender, birthYear: "", deathYear: "", photo: "", note: "" });
const u = (id: string, partnerIds: string[], childIds: string[]): Union => ({ id, partnerIds, childIds, status: "married", startYear: "", endYear: "" });

// я; мама с папой; бабушка с дедушкой; их сын (мой дядя) и его жена; тётя (сестра папы) и её муж.
const people = [p("me", "f"), p("mom", "f"), p("dad", "m"), p("gm", "f"), p("gf", "m"), p("uncle", "m"), p("uncleWife", "f"), p("aunt", "f"), p("auntHusb", "m")];
const unions = [
  u("u1", ["mom", "dad"], ["me"]),
  u("u2", ["gm", "gf"], ["dad", "uncle", "aunt"]),
  u("u3", ["uncle", "uncleWife"], []),
  u("u4", ["aunt", "auntHusb"], []),
];

test("жена дяди подписана как тётя, а не «Супруг»", () => {
  assert.equal(kinship(people, unions, "me", "uncleWife").card, "Тётя (жена дяди)");
});
test("муж тёти подписан как дядя", () => {
  assert.equal(kinship(people, unions, "me", "auntHusb").card, "Дядя (муж тёти)");
});

test("пол не указан: жена дяди всё равно тётя", () => {
  const noGender = people.map((x) => (x.id === "uncleWife" ? { ...x, gender: "u" as const } : x));
  assert.equal(kinship(noGender, unions, "me", "uncleWife").card, "Тётя (жена дяди)");
});
