// Регрессии по диагностике двух деревьев (23 и 27 человек, 2026-10-29). Данные из файлов не копируются: фикстуры синтетические, с теми же приёмами записи связей.
import assert from "node:assert/strict";
import test from "node:test";
import type { Person as RodPerson } from "../rod/types.ts";
import { treeFromPeople } from "./from-people.ts";
import { layoutTree } from "./layout.ts";
import { validatePeopleLinks } from "./relgraph.ts";
import { buildDiagnostics } from "./treeFile.ts";
import type { Person, TreeData, Union } from "./types.ts";

const R = (id: string, name: string, relation: string, extra: Partial<RodPerson> = {}): RodPerson => ({ id, name, relation, maidenName: "", notes: "", birthYear: "", ...extra });
const person = (id: string, gender: "m" | "f", extra: Partial<Person> = {}): Person => ({ id, firstName: id, patronymic: "", lastName: "", gender, birthYear: "", deathYear: "", photo: "", note: "", ...extra });
const union = (id: string, partners: string[], kids: string[]): Union => ({ id, partnerIds: partners, childIds: kids, status: "married", startYear: "", endYear: "" });
const parentsOf = (data: TreeData, id: string) => data.unions.filter((u) => u.childIds.includes(id)).map((u) => [...u.partnerIds].sort());

test("D1: родитель с подписью «двоюродная бабушка» не отбрасывается, дети остаются у пары, а не у одного", () => {
  const data = treeFromPeople([
    R("me", "Я Я", "я", { gender: "m" }),
    R("aunt", "Вера Тестова", "Двоюродная бабушка", { gender: "f" }),
    R("uncleH", "Пётр Тестов", "Муж двоюродной бабушки", { gender: "m", spouse: "aunt" }),
    R("k1", "Олег Тестов", "Двоюродный дядя", { gender: "m", parents: ["aunt", "uncleH"] }),
    R("k2", "Нина Образцова", "Двоюродная тётя", { gender: "f", parents: ["uncleH", "aunt"] }),
  ]);
  assert.deepEqual(parentsOf(data, "k1"), [["aunt", "uncleH"]], "оба родителя");
  assert.deepEqual(parentsOf(data, "k2"), [["aunt", "uncleH"]], "оба родителя, порядок не важен");
  assert.equal(data.unions.filter((u) => u.partnerIds.length === 1 && u.partnerIds[0] === "uncleH").length, 0, "нет одиночного союза мужа");
});

test("D1: настоящий брат по-прежнему не может быть ребёнком «меня» (старая защита сохранена)", () => {
  const data = treeFromPeople([
    R("me", "Я Я", "я", { gender: "f" }),
    R("mom", "Мама", "мама", { gender: "f" }),
    R("dad", "Папа", "папа", { gender: "m" }),
    R("bro", "Брат", "брат", { gender: "m", parents: ["me"] }),
  ]);
  assert.ok(!parentsOf(data, "bro").some((p) => p.includes("me")), "я не родитель брата");
});

test("D2: линия «мама» достраивается и когда родители «меня» заданы явно, а «мама» занята как родитель сводной сестры", () => {
  const data = treeFromPeople([
    R("me", "Я Я", "я", { gender: "f", parents: ["dad", "mom"] }),
    R("mom", "Анна Мать", "Мать", { gender: "f", parents: [] }),
    R("dad", "Борис Отец", "Отец", { gender: "m", parents: [] }),
    R("hs", "Ольга Сводная", "Старшая сводная сестра", { parents: ["mom"], siblingOf: "me" }),
    R("gm", "Зоя Бабушка", "Бабушка", { gender: "f", line: "mom" }),
    R("gd", "Глеб Дедушка", "Дедушка", { gender: "m", line: "mom", spouse: "gm" }),
  ]);
  assert.deepEqual(parentsOf(data, "mom"), [["gd", "gm"]], "мама стоит под бабушкой и дедушкой своей линии");
});

/** Родословная: у выбранного отец F и мама M; у каждого свои родители. */
function twoSides(rank: { m?: number; f?: number }): TreeData {
  const people = [
    person("me", "m"), person("F", "m"), person("M", "f"),
    person("FF", "m", { rank: rank.f }), person("FM", "f", { rank: rank.f }),
    person("MF", "m", { rank: rank.m }), person("MM", "f", { rank: rank.m }),
  ];
  return { people, unions: [union("u1", ["F", "M"], ["me"]), union("u2", ["FF", "FM"], ["F"]), union("u3", ["MF", "MM"], ["M"])], focusId: "me" };
}
const xs = (data: TreeData) => new Map(layoutTree(data.people, data.unions, data.focusId).nodes.map((n) => [n.id, n.x]));

test("L1: rank, записанный на весь ряд, не ставит сторону мамы левее стороны отца", () => {
  // moveBranch пишет rank = i*10 всем веткам ряда: сторона мамы получила меньшие числа.
  const x = xs(twoSides({ m: 0, f: 30 }));
  assert.ok(x.get("FF")! < x.get("MF")!, "отец слева, мама справа");
  assert.ok(x.get("FM")! < x.get("MM")!);
});

test("L1: rank внутри одной стороны по-прежнему работает (ручной порядок веток)", () => {
  const people = [
    person("me", "m"), person("F", "m"), person("M", "f"), person("FF", "m"), person("FM", "f"), person("MF", "m"), person("MM", "f"),
    person("S", "f", { rank: 20 }), person("SH", "m", { rank: 20 }), person("T", "f", { rank: 10 }), person("TH", "m", { rank: 10 }),
  ];
  // две сестры мамы со своими мужьями, без детей: пользователь поставил T левее S.
  const unions = [union("u1", ["F", "M"], ["me"]), union("u2", ["FF", "FM"], ["F"]), union("u3", ["MF", "MM"], ["M", "S", "T"])];
  const x = xs({ people, unions: [...unions, union("u4", ["SH", "S"], []), union("u5", ["TH", "T"], [])], focusId: "me" });
  assert.ok(x.get("FF")! < x.get("MF")!, "стороны не перепутаны");
});

test("L2: ребёнок двоюродной ветки остаётся под своими родителями и не уезжает на другую сторону", () => {
  // у мамы сестра S с мужем H и сыном K (двоюродный брат выбранного, тот же ряд).
  const people = [
    person("me", "m"), person("F", "m"), person("M", "f"), person("FF", "m"), person("FM", "f"), person("MF", "m"), person("MM", "f"),
    person("S", "f"), person("H", "m"), person("K", "m"),
  ];
  const unions = [union("u1", ["F", "M"], ["me"]), union("u2", ["FF", "FM"], ["F"]), union("u3", ["MF", "MM"], ["M", "S"]), union("u4", ["H", "S"], ["K"])];
  const x = xs({ people, unions, focusId: "me" });
  const mid = (x.get("H")! + x.get("S")!) / 2;
  assert.ok(Math.abs(x.get("K")! - mid) <= 400, `K (${x.get("K")}) под родителями (${mid})`);
  assert.ok(x.get("K")! > x.get("me")!, "ветка мамы остаётся справа от выбранного");
});

test("валидация: ссылки на несуществующих людей видны в проверках, данные не меняются", () => {
  const people: RodPerson[] = [
    R("a", "Максим Примеров", "Дедушка", { siblingOf: "missing-1", parents: ["missing-2"] }),
    R("b", "Алла", "Бабушка", { spouse: "missing-3", moreSpouses: [{ id: "missing-4" }] }),
    R("c", "Кто-то", "Брат", { siblingOf: "c" }),
  ];
  const before = JSON.stringify(people);
  const raw = validatePeopleLinks(people);
  assert.equal(JSON.stringify(people), before, "данные не тронуты");
  for (const id of ["missing-1", "missing-2", "missing-3", "missing-4"]) assert.ok(raw.some((m) => m.includes(id)), `есть замечание про ${id}`);
  assert.ok(raw.some((m) => m.includes("самому себе")), "siblingOf на себя");
  const diag = buildDiagnostics(people, { anonymize: false, now: new Date("2026-10-30T00:00:00Z") });
  assert.ok(diag.checks.raw.some((m) => m.includes("missing-1")), "диагностика показывает висячий siblingOf");
  assert.equal(JSON.stringify(people), before, "диагностика не меняет данные");
});
