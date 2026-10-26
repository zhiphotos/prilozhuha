import assert from "node:assert/strict";
import test from "node:test";
import { buildCase, nameVariants } from "./ancestorSearch.ts";

test("surname variants keep the full name and a masculine hint", () => {
  const variants = nameVariants("Волкова", "Анна", "Петровна");
  assert.equal(variants[0], "Волкова Анна Петровна");
  assert.ok(variants.some((item) => item.includes("мужская форма")));
});

test("a person of war age gets military archives, not a fabricated relative", () => {
  const plan = buildCase({
    firstName: "Иван",
    patronymic: "Петрович",
    lastName: "Волков",
    birthYear: "1912",
    deathYear: "",
    place: "село Красное",
    seek: "parents",
  });
  assert.ok(plan.leads.some((link) => link.id === "pamyat"));
  assert.match(plan.question, /Иван/);
  assert.match(plan.caution, /гипотеза/);
  assert.doesNotMatch(plan.letter, /найден отец/i);
});

test("a Galician place adds the Lviv archive", () => {
  const plan = buildCase({
    firstName: "Мария",
    patronymic: "",
    lastName: "Коваль",
    birthYear: "1890",
    deathYear: "",
    place: "Львов",
    seek: "parents",
  });
  assert.ok(plan.leads.some((lead) => lead.id === "tsdial"));
});
