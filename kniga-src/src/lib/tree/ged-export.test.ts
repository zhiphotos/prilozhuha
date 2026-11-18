import assert from "node:assert/strict";
import test from "node:test";
import { gedcomFromTree, gedDate } from "./gedExport.ts";
import { parseGedcom } from "./importTree.ts";
import type { Person, TreeData } from "./types.ts";

const P = (id: string, firstName: string, over: Partial<Person> = {}): Person => ({ id, firstName, patronymic: "", lastName: "", gender: "u", birthYear: "", deathYear: "", photo: "", note: "", ...over });

const tree: TreeData = {
  focusId: "c",
  people: [
    P("m", "Анна", { patronymic: "Ивановна", lastName: "Петрова", maidenName: "Сидорова", gender: "f", birthYear: "23.05.1950", birthPlace: "Ярославль", note: "Учительница.\nЛюбила сад." }),
    P("f", "Пётр", { lastName: "Петров", gender: "m", birthYear: "1948", deathYear: "05.2010" }),
    P("c", "Дарина", { lastName: "Петрова", gender: "f", birthYear: "12.03.1980" }),
    P("__mother_x", "Мама", { gender: "f" }),
  ],
  unions: [{ id: "u1", partnerIds: ["f", "m"], childIds: ["c"], status: "married", startYear: "1975", endYear: "" }],
};

test("дата в GEDCOM-вид", () => {
  assert.equal(gedDate("23.05.2002"), "23 MAY 2002");
  assert.equal(gedDate("05.2002"), "MAY 2002");
  assert.equal(gedDate("1990"), "1990");
});

test("файл начинается с HEAD, кончается TRLR, без пустых заготовок", () => {
  const text = gedcomFromTree(tree, new Date("2026-11-18T00:00:00Z"));
  assert.ok(text.startsWith("0 HEAD\r\n"));
  assert.ok(text.endsWith("0 TRLR\r\n"));
  assert.ok(!text.includes("Мама"));
  assert.ok(text.includes("1 CHAR UTF-8"));
});

test("наш же импорт читает файл обратно: люди, даты, связи, девичья фамилия", () => {
  const r = parseGedcom(gedcomFromTree(tree));
  assert.ok("tree" in r);
  const t = r.tree;
  assert.equal(t.people.length, 3);
  const anna = t.people.find((p) => p.firstName === "Анна")!;
  assert.equal(anna.lastName, "Петрова");
  assert.equal(anna.birthYear, "23.05.1950");
  assert.equal(anna.gender, "f");
  assert.equal(anna.maidenName, "Сидорова");
  assert.match(anna.note, /Учительница/);
  assert.match(anna.note, /Любила сад/);
  const dar = t.people.find((p) => p.firstName === "Дарина")!;
  const u = t.unions.find((x) => x.childIds.includes(dar.id))!;
  assert.equal(u.partnerIds.length, 2);
  assert.equal(u.startYear, "1975");
  assert.equal(t.people.find((p) => p.firstName === "Пётр")!.deathYear, "05.2010");
});

test("файл с BOM (как скачивается из приложения) тоже читается", () => {
  const r = parseGedcom("\uFEFF" + gedcomFromTree(tree));
  assert.ok("tree" in r);
  assert.equal(r.tree.people.length, 3);
});
