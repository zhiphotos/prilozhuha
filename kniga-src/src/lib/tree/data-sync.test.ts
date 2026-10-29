// Регрессии по слою данных: удаление человека и выбор брака для ребёнка. Фикстуры синтетические.
import assert from "node:assert/strict";
import test from "node:test";
import type { Person as RodPerson } from "../rod/types.ts";
import { parentLimitMessage, parentsForChild, parentsForUnion, syncRelations, withoutPerson } from "./auto-links.ts";
import { treeFromPeople } from "./from-people.ts";
import { validatePeopleLinks } from "./relgraph.ts";

const R = (id: string, name: string, relation: string, extra: Partial<RodPerson> = {}): RodPerson => ({ id, name, relation, maidenName: "", notes: "", birthYear: "", ...extra });

test("удаление человека убирает ссылки на него из parents, spouse, moreSpouses и siblingOf; остальное не трогает", () => {
  const people = [
    R("a", "А", "я", { siblingOf: "b", treeRank: 20, treeSide: "left", line: "mom", unionFrom: "2001" }),
    R("b", "Б", "брат"),
    R("c", "В", "сын", { parents: ["a", "b"], spouse: "b", moreSpouses: [{ id: "b", status: "divorced" }, { id: "d" }] }),
    R("d", "Г", "жена"),
  ];
  const next = withoutPerson(people, "b");
  assert.equal(next.length, 3);
  const a = next.find((p) => p.id === "a")!;
  assert.equal(a.siblingOf, undefined, "siblingOf на удалённого убран");
  assert.deepEqual([a.treeRank, a.treeSide, a.line, a.unionFrom], [20, "left", "mom", "2001"], "ручная расстановка и годы не тронуты");
  const c = next.find((p) => p.id === "c")!;
  assert.deepEqual(c.parents, ["a"]);
  assert.equal(c.spouse, undefined);
  assert.deepEqual(c.moreSpouses, [{ id: "d" }]);
  assert.deepEqual(validatePeopleLinks(next), [], "после удаления висячих ссылок нет");
  assert.equal(people.find((p) => p.id === "a")!.siblingOf, "b", "исходный массив не изменён");
});

test("ребёнок второго брака получает второго супруга, а не первого", () => {
  const people = [
    R("me", "Я", "я", { spouse: "w1", moreSpouses: [{ id: "w2" }] }),
    R("w1", "Жена 1", "жена", { spouse: "me" }),
    R("w2", "Жена 2", "жена"),
  ];
  assert.deepEqual(parentsForChild(people, "me"), ["me", "w1"], "без выбора по-прежнему основной супруг");
  assert.deepEqual(parentsForUnion(people, "me", ["me", "w2"]), ["me", "w2"], "выбран второй брак");
  assert.deepEqual(parentsForUnion(people, "me", ["w2", "me"]), ["me", "w2"], "порядок пары не важен");
  assert.deepEqual(parentsForUnion(people, "me", ["me", "__mother_x"]), ["me"], "заглушка не записывается родителем");
  assert.deepEqual(parentsForUnion(people, "me", undefined), ["me", "w1"]);
  const kid = R("k", "Ребёнок", "сын", { parents: parentsForUnion(people, "me", ["me", "w2"]) });
  const data = treeFromPeople([...people, kid]);
  const birth = data.unions.find((u) => u.childIds.includes("k"))!;
  assert.deepEqual([...birth.partnerIds].sort(), ["me", "w2"]);
});

test("сводные братья, один известный родитель и несколько поколений собираются без потерь связей", () => {
  const people = [
    R("me", "Я", "я", { parents: ["f", "m"] }),
    R("f", "Отец", "папа", { parents: ["gf", "gm"], moreSpouses: [{ id: "m2", status: "divorced" }] }),
    R("m", "Мама", "мама", { spouse: "f" }),
    R("m2", "Первая жена отца", "мачеха"),
    R("half", "Сводный брат", "брат", { parents: ["f", "m2"] }),
    R("solo", "Сестра от мамы", "сестра", { parents: ["m"] }),
    R("gf", "Дед", "дедушка", { line: "dad", spouse: "gm" }),
    R("gm", "Бабушка", "бабушка", { line: "dad" }),
  ];
  const data = treeFromPeople(people);
  const parentsOf = (id: string) => [...(data.unions.find((u) => u.childIds.includes(id))?.partnerIds ?? [])].sort();
  assert.deepEqual(parentsOf("me"), ["f", "m"]);
  assert.deepEqual(parentsOf("half"), ["f", "m2"]);
  assert.deepEqual(parentsOf("solo"), ["m"]);
  assert.deepEqual(parentsOf("f"), ["gf", "gm"]);
  const before = JSON.stringify(people);
  treeFromPeople(people);
  assert.equal(JSON.stringify(people), before, "построение древа записи не меняет");
});

test("цепочка «брат брата»: результат не зависит от порядка записей, оба стоят в семье родителей", () => {
  const base = [
    R("me", "Я", "я", { parents: ["f", "m"] }),
    R("f", "Отец", "папа"),
    R("m", "Мама", "мама", { spouse: "f" }),
  ];
  const a = R("a", "Сестра", "сестра", { siblingOf: "me" });
  const b = R("b", "Брат сестры", "брат", { siblingOf: "a" });
  const parentsOf = (data: ReturnType<typeof treeFromPeople>, id: string) => [...(data.unions.find((u) => u.childIds.includes(id))?.partnerIds ?? [])].sort();
  const childUnions = (data: ReturnType<typeof treeFromPeople>, id: string) => data.unions.filter((u) => u.childIds.includes(id)).length;
  // «Люди» хранят новых вперёд: самый новый (b) стоит первым.
  for (const order of [[b, a, ...base], [...base, a, b], [a, ...base, b], [b, ...base, a]]) {
    const data = treeFromPeople(order);
    assert.deepEqual(parentsOf(data, "a"), ["f", "m"], "сестра под родителями выбранного");
    assert.deepEqual(parentsOf(data, "b"), ["f", "m"], "брат сестры тоже");
    assert.equal(childUnions(data, "a"), 1, "у сестры один набор родителей");
    assert.equal(data.people.some((p) => p.id.startsWith("__")), false, "призрачных родителей нет");
  }
});

test("«брат» только по слову «кем приходится» встаёт к родителям «меня» и при явно заданных родителях", () => {
  const data = treeFromPeople([
    R("bro", "Брат", "брат"),
    R("me", "Я", "я", { parents: ["f", "m"] }),
    R("f", "Отец", "папа"),
    R("m", "Мама", "мама", { spouse: "f" }),
  ]);
  const birth = data.unions.find((u) => u.childIds.includes("bro"));
  assert.ok(birth, "у брата есть родители");
  assert.deepEqual([...birth!.partnerIds].sort(), ["f", "m"]);
  assert.equal(data.unions.filter((u) => u.childIds.includes("me")).length, 1);
});

test("третий родитель: приложение хранит двоих, добавление третьего отклоняется до записи с понятным текстом", () => {
  const people = [
    R("c", "Ребёнок", "я", { parents: ["p1", "p2"] }),
    R("p1", "Родитель 1", "папа"),
    R("p2", "Родитель 2", "мама"),
    R("one", "Один", "сын", { parents: ["p1"] }),
    R("lost", "Потерянный", "сын", { parents: ["gone"] }),
  ];
  assert.match(parentLimitMessage(people, "c") ?? "", /двое родителей/);
  assert.equal(parentLimitMessage(people, "one"), null, "один родитель: можно добавить второго");
  assert.equal(parentLimitMessage(people, "lost"), null, "ссылка на отсутствующего родителем не считается");
  assert.equal(parentLimitMessage(people, "p1"), null);
  // файл с тремя родителями: в древе только двое, и это видно в проверке, а не молча
  const three = [...people, R("x", "Третий", "дядя"), R("t", "Трое", "сын", { parents: ["p1", "p2", "x"] })];
  assert.ok(validatePeopleLinks(three).some((m) => m.includes("больше двух родителей")));
  const data = treeFromPeople(three);
  assert.deepEqual([...(data.unions.find((u) => u.childIds.includes("t"))?.partnerIds ?? [])].sort(), ["p1", "p2"]);
});

test("подпись «Кем приходится» не переписывается, если она уже та же, что вычислена (отличается только регистр)", () => {
  const people = [
    R("me", "Я", "я", { parents: ["f", "m"] }),
    R("f", "Отец", "папа", { parents: ["gf"] }),
    R("m", "Мама", "мама", { spouse: "f" }),
    R("gf", "Дед", "Дедушка"),
    R("u", "Дядя", "дядя", { parents: ["gf"] }),
  ];
  const next = syncRelations(people);
  assert.equal(next.find((p) => p.id === "u")!.relation, "дядя", "та же подпись в другом регистре остаётся как введена");
  assert.equal(next.find((p) => p.id === "gf")!.relation, "Дедушка");
});
