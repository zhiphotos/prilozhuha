import assert from "node:assert/strict";
import test from "node:test";
import { personCardText } from "@/lib/rod/person-card";
import type { Person } from "@/lib/rod/types";

const p = (id: string, name: string, extra: Partial<Person> = {}): Person => ({ id, name, relation: "", birthYear: "", maidenName: "", notes: "", ...extra });

test("карточка: годы, родители, муж, братья и дети", () => {
  const people = [
    p("a", "Иванов Пётр", { gender: "m" }),
    p("b", "Иванова Анна", { gender: "f" }),
    p("m", "Иванова Мария", { birthYear: "1950", deathYear: "2010", birthPlace: "Тбилиси", parents: ["a", "b"], spouse: "h", gender: "f" }),
    p("h", "Петров Олег", { gender: "m" }),
    p("s", "Иванов Сергей", { parents: ["a", "b"] }),
    p("k", "Петрова Ира", { parents: ["m", "h"] }),
  ];
  assert.equal(personCardText(people[2]!, people), "Иванова Мария\n1950 – 2010\nТбилиси\nРодители: Иванов Пётр, Иванова Анна\nМуж: Петров Олег\nБратья и сёстры: Иванов Сергей\nДети: Петрова Ира");
});

test("карточка без данных: только имя", () => {
  assert.equal(personCardText(p("x", "Один"), [p("x", "Один")]), "Один");
});

test("карточка: девичья фамилия женщины попадает на страницу, у мужчины нет", () => {
  const woman = p("w", "Щербакова Галина", { gender: "f", maidenName: "Иванова", birthYear: "1954" });
  assert.equal(personCardText(woman, [woman]), "Щербакова Галина\nДевичья фамилия: Иванова\nрод. 1954");
  const man = p("m", "Щербаков Иван", { gender: "m", maidenName: "Иванов" });
  assert.equal(personCardText(man, [man]), "Щербаков Иван");
});
