// Адресное исправление связей после загрузки GEDCOM (ged-repair.ts). Фикстуры синтетические: личных данных нет.
import assert from "node:assert/strict";
import test from "node:test";
import type { Person as RodPerson } from "@/lib/rod/types";
import { parseGedcom } from "./importTree.ts";
import { gedToPeople, type ImportedPerson } from "./gedImport.ts";
import { planGedImport } from "./ged-match.ts";
import { applyRepair, auditCopy, judgeCopies, planRepair, remainingParentMismatches, revertRepair } from "./ged-repair.ts";

const SRC = "FAMYTALE|FamyTale";
const indi = (id: string, name: string, sex = "M", extra = "") => `0 @${id}@ INDI\n1 NAME ${name}\n1 SEX ${sex}\n${extra}`;
const fam = (id: string, h: string, w: string, kids: string[]) => `0 @${id}@ FAM\n${h ? `1 HUSB @${h}@\n` : ""}${w ? `1 WIFE @${w}@\n` : ""}${kids.map((k) => `1 CHIL @${k}@\n`).join("")}`;
const file = (body: string) => `0 HEAD\n1 SOUR FAMYTALE\n2 NAME FamyTale\n${body}0 TRLR\n`;
const load = (body: string, self: string): ImportedPerson[] => {
  const r = parseGedcom(file(body));
  assert.ok("tree" in r);
  return gedToPeople(r.tree, self);
};
let n = 0;
const rod = (id: string, first: string, last: string, over: Partial<RodPerson> = {}): RodPerson => ({ id, name: `${first} ${last}`.trim(), firstName: first, patronymic: "", lastName: last, relation: "Родственник", birthYear: "", maidenName: "", notes: "", fromFile: true, ...over });
const real = (id: string, key: string, first: string, last: string, over: Partial<RodPerson> = {}) => rod(id, first, last, { gedId: key, gedSource: SRC, ...over });
const by = (people: RodPerson[], id: string) => people.find((p) => p.id === id)!;

// Семья А: ребёнок Пётр привязан к копии отца Степана (без номера, без фамилии); настоящий Степан и мать Анна есть.
const A = indi("I10", "Пётр /Белов/") + indi("I11", "Степан //") + indi("I12", "Анна /Белова/", "F") + fam("F10", "I11", "I12", ["I10"]);
const peopleA = (): RodPerson[] => [
  real("pet", "I10", "Пётр", "Белов", { parents: ["stepCopy", "anna"] }),
  real("step", "I11", "Степан", "", { gender: "m", spouse: "anna" }),
  real("anna", "I12", "Анна", "Белова", { gender: "f", spouse: "step" }),
  rod("stepCopy", "Степан", "", { gender: "m", spouse: "anna" }),
];

test("копия родителя без номера: ребёнок переводится на настоящую запись, людей не становится меньше или больше", () => {
  const list = load(A, "I10");
  const people = peopleA();
  const plan = planRepair(people, list);
  const v = plan.verdicts.find((x) => x.id === "stepCopy")!;
  assert.equal(v.confidence, "high");
  const ch = plan.changes.filter((c) => c.kind === "parent-copy");
  assert.equal(ch.length, 1);
  assert.deepEqual(ch[0]!.op, { type: "replaceParent", from: "stepCopy", to: "step" });
  const done = applyRepair(people, plan.changes);
  assert.deepEqual(by(done.people, "pet").parents, ["step", "anna"]);
  assert.equal(done.people.length, people.length, "никого не удалили");
  assert.ok(done.people.some((p) => p.id === "stepCopy"), "пустая копия осталась на месте");
});

test("идемпотентность: повторный план после применения пуст, повторное применение ничего не меняет", () => {
  const list = load(A, "I10");
  const first = applyRepair(peopleA(), planRepair(peopleA(), list).changes);
  assert.equal(planRepair(first.people, list).changes.filter((c) => c.selected).length, 0);
  const again = applyRepair(first.people, planRepair(peopleA(), list).changes);
  assert.equal(again.applied, 0, "старый план на уже исправленных данных пропускается");
  assert.deepEqual(again.people, first.people);
});

// Семья Б: безымянная мать I22 есть в списке и записана супругой Ильи, но у ребёнка записан только отец.
const Bg = indi("I20", "Мирон /Ильин/") + indi("I21", "Илья /Ильин/") + indi("I22", "// ", "F") + fam("F20", "I21", "I22", ["I20"]);
const peopleB = (): RodPerson[] => [
  real("mir", "I20", "Мирон", "Ильин", { parents: ["ilya"] }),
  real("ilya", "I21", "Илья", "Ильин", { gender: "m", spouse: "nn" }),
  real("nn", "I22", "Без имени", "", { gender: "f", spouse: "ilya" }),
];
test("потерянный безымянный родитель добавляется ребёнку, у которого записан только второй родитель", () => {
  const list = load(Bg, "I20");
  const plan = planRepair(peopleB(), list);
  const ch = plan.changes.filter((c) => c.kind === "parent-nameless");
  assert.equal(ch.length, 1);
  assert.deepEqual(applyRepair(peopleB(), plan.changes).people.find((p) => p.id === "mir")!.parents, ["ilya", "nn"]);
});

test("безымянный родитель не добавляется, если записанный родитель не опознан по файлу (нет доказательства)", () => {
  const list = load(Bg, "I20");
  const people = peopleB();
  by(people, "mir").parents = ["stranger"];
  people.push(rod("stranger", "Чужой", "Человек"));
  assert.equal(planRepair(people, list).changes.filter((c) => c.kind === "parent-nameless").length, 0);
});

// Семья В: Евдокия (без фамилии) записана один раз и без номера; настоящей записи с номером нет. Это не копия.
const Cg = indi("I30", "Евдокия //", "F") + indi("I31", "Егор /Жуков/") + indi("I32", "Иван //") + indi("I33", "Николай /Жуков/") + fam("F30", "I31", "I30", ["I33"]) + fam("F31", "I32", "", ["I30"]);
const peopleC = (): RodPerson[] => [
  rod("evd", "Евдокия", "", { gender: "f", spouse: "egor" }),
  real("egor", "I31", "Егор", "Жуков", { gender: "m", spouse: "evd" }),
  real("ivan", "I32", "Иван", "", { gender: "m" }),
  real("nik", "I33", "Николай", "Жуков", { parents: ["egor", "evd"] }),
];
test("Евдокия: возвращается номер файла и связь с отцом, дети не меняются, второй записи не появляется", () => {
  const list = load(Cg, "I33");
  const people = peopleC();
  const plan = planRepair(people, list);
  assert.equal(plan.verdicts.find((v) => v.id === "evd")!.confidence, "restore");
  assert.deepEqual(plan.changes.map((c) => c.kind).sort(), ["parent-restored", "restore-id"]);
  const done = applyRepair(people, plan.changes);
  const e = by(done.people, "evd");
  assert.equal(e.gedId, "I30");
  assert.equal(e.gedSource, SRC);
  assert.deepEqual(e.parents, ["ivan"]);
  assert.deepEqual(by(done.people, "nik").parents, ["egor", "evd"], "дети не тронуты");
  assert.equal(done.people.length, people.length);
});

test("повторная загрузка файла после возврата номера и без него не создаёт второй Евдокии", () => {
  const list = load(Cg, "I33");
  const before = planGedImport(peopleC(), list, { updateLinks: false, uid: () => `new${n++}` });
  assert.ok(before.ok);
  assert.equal(before.added, 0, "найдена по связям: муж и ребёнок совпали");
  const repaired = applyRepair(peopleC(), planRepair(peopleC(), list).changes).people;
  const after = planGedImport(repaired, list, { updateLinks: false, uid: () => `new${n++}` });
  assert.ok(after.ok);
  assert.equal(after.added, 0);
  assert.equal(after.people.length, repaired.length);
});

// Семья Г: два тёзки Людмилы (разные мужья), в списке они слились в одну запись без номера.
const Dg = indi("I40", "Людмила //", "F") + indi("I41", "Валерий /Кукобаков/") + indi("I42", "Антон /Кукобаков/") + indi("I43", "Людмила //", "F") + indi("I44", "Сергей /Филипцев/") + indi("I45", "Роман /Филипцев/") + fam("F40", "I41", "I40", ["I42"]) + fam("F41", "I44", "I43", ["I45"]);
const peopleD = (): RodPerson[] => [
  real("l1", "I40", "Людмила", "", { gender: "f", spouse: "val" }),
  real("l2", "I43", "Людмила", "", { gender: "f", spouse: "ser" }),
  real("val", "I41", "Валерий", "Кукобаков", { gender: "m", spouse: "mix" }),
  real("ant", "I42", "Антон", "Кукобаков", { parents: ["val", "mix"] }),
  real("ser", "I44", "Сергей", "Филипцев", { gender: "m", spouse: "mix" }),
  real("rom", "I45", "Роман", "Филипцев", { parents: ["ser", "mix"] }),
  rod("mix", "Людмила", "", { gender: "f", spouse: "val" }),
];
test("смешанная запись двух Людмил: не копия, по умолчанию ничего не меняется, исправление Романа подготовлено и выключено", () => {
  const list = load(Dg, "I42");
  const people = peopleD();
  const plan = planRepair(people, list);
  const v = plan.verdicts.find((x) => x.id === "mix")!;
  assert.equal(v.confidence, "low");
  assert.ok(v.mixed);
  assert.equal(plan.changes.filter((c) => c.selected).length, 0, "ничего не включено само");
  const roman = plan.changes.find((c) => c.personId === "rom")!;
  assert.deepEqual(roman.op, { type: "replaceParent", from: "mix", to: "l2" });
  assert.equal(roman.selected, false);
  const untouched = applyRepair(people, plan.changes);
  assert.deepEqual(untouched.people, people, "по умолчанию данные те же");
  const enabled = applyRepair(people, plan.changes, new Set([roman.id]));
  assert.deepEqual(by(enabled.people, "rom").parents, ["ser", "l2"]);
  assert.deepEqual(by(enabled.people, "ant").parents, ["val", "mix"], "Антона без отдельного выбора не трогаем");
});

// Семья Д: одноимённые отец и сыновья (как спорные Захаровы): ничего не объединяем и не переставляем.
const Eg = indi("I50", "Иван /Захаров/") + indi("I51", "Иван /Захаров/") + indi("I52", "Иван /Захаров/") + indi("I53", "Нина /Захарова/", "F") + fam("F50", "I50", "", ["I51", "I52"]) + fam("F51", "I52", "", ["I53"]);
test("тёзки-отец и сыновья: план не меняет ни одной связи", () => {
  const list = load(Eg, "I51");
  const people = [
    real("z0", "I50", "Иван", "Захаров", { gender: "m" }),
    real("z1", "I51", "Иван", "Захаров", { gender: "m", parents: ["z0"] }),
    real("z2", "I52", "Иван", "Захаров", { gender: "m", parents: ["z0"] }),
    real("zn", "I53", "Нина", "Захарова", { gender: "f", parents: ["z0"] }),
  ];
  assert.equal(planRepair(people, list).changes.length, 0);
});

test("запись без связей и без даты: уверенность средняя, изменений нет, объединения нет", () => {
  const list = load(indi("I60", "Фёдор //") + indi("I61", "Мария /Пряхина/", "F") + fam("F60", "I60", "I61", []), "I61");
  const people = [real("f1", "I60", "Фёдор", "", { gender: "m" }), rod("f2", "Фёдор", "", { gender: "m" }), real("m1", "I61", "Мария", "Пряхина")];
  const plan = planRepair(people, list);
  assert.equal(plan.verdicts.find((v) => v.id === "f2")!.confidence, "medium");
  assert.equal(plan.changes.length, 0);
  assert.ok(plan.verdicts[0]!.gaps.length > 0, "указано, чего не хватает");
});

test("remainingParentMismatches считает расхождения с файлом и сходится после применения", () => {
  const list = load(A, "I10");
  const people = peopleA();
  assert.equal(remainingParentMismatches(people, list).length, 1);
  assert.equal(remainingParentMismatches(applyRepair(people, planRepair(people, list).changes).people, list).length, 0);
  assert.equal(judgeCopies(people, list).length, 1);
});

test("auditCopy: у копии с фото или заметкой отмечены собственные данные, пустая копия чистая", () => {
  const r = rod("r", "Степан", "", { gedId: "I11" });
  assert.deepEqual(auditCopy(rod("c", "Степан", ""), r), []);
  assert.deepEqual(auditCopy(rod("c", "Степан", "", { photo: "p1", notes: "служил в 1944" }), r).sort(), ["заметка", "фото"]);
  assert.deepEqual(auditCopy(rod("c", "Степан", "", { notes: "то же" }), rod("r", "Степан", "", { notes: "то же" })), []);
});

test("applyRepair пропускает изменение, если связь уже поправили вручную", () => {
  const list = load(A, "I10");
  const plan = planRepair(peopleA(), list);
  const changed = peopleA();
  by(changed, "pet").parents = ["step", "anna"];
  const r = applyRepair(changed, plan.changes);
  assert.equal(r.applied, 0);
  assert.equal(r.skipped.length, 1);
});

// Частичное применение и отмена: берём три семьи сразу (А, Б, В), чтобы в плане было несколько независимых изменений.
const ALL = A + Bg + Cg;
const allPeople = (): RodPerson[] => [...peopleA(), ...peopleB(), ...peopleC()];

test("в функции применения выключенные изменения не применяются без явного выбора, а включённые вручную применяются", () => {
  const list = load(Dg, "I42");
  const people = peopleD();
  const plan = planRepair(people, list);
  const off = plan.changes.filter((c) => !c.selected);
  assert.ok(off.length >= 1);
  assert.equal(applyRepair(people, plan.changes).applied, 0, "без выбора: ни одного");
  assert.equal(applyRepair(people, plan.changes, new Set()).applied, 0, "пустой выбор: ни одного");
  assert.equal(applyRepair(people, plan.changes, new Set(off.map((c) => c.id))).applied, off.length, "явный выбор включает");
});

test("отмена частичного применения возвращает ровно применённое и не трогает правки пользователя", () => {
  const list = load(ALL, "I10");
  const original = allPeople();
  const plan = planRepair(original, list);
  assert.ok(plan.changes.filter((c) => c.selected).length >= 4);
  const part = plan.changes.filter((c) => c.selected).slice(0, 2);
  const applied = applyRepair(original, plan.changes, new Set(part.map((c) => c.id)));
  assert.equal(applied.applied, 2);
  // после применения пользователь поправил другого человека и добавил нового
  const edited = applied.people.map((p) => (p.id === "anna" ? { ...p, notes: "правка пользователя" } : p));
  edited.push(rod("newbie", "Новичок", "Тестов"));
  const back = revertRepair(edited, applied.journal);
  assert.equal(back.reverted, 2);
  assert.deepEqual(back.kept, []);
  const expected = original.map((p) => (p.id === "anna" ? { ...p, notes: "правка пользователя" } : p));
  expected.push(rod("newbie", "Новичок", "Тестов"));
  assert.deepEqual(back.people, expected, "всё как до применения плюс правки пользователя; неприменённые изменения не тронуты");
});

test("если пользователь после применения сам изменил связь, отмена её не перезаписывает", () => {
  const list = load(ALL, "I10");
  const original = allPeople();
  const plan = planRepair(original, list);
  const applied = applyRepair(original, plan.changes);
  const mineBefore = by(applied.people, "pet").parents;
  assert.deepEqual(mineBefore, ["step", "anna"]);
  const edited = applied.people.map((p) => (p.id === "pet" ? { ...p, parents: ["anna"] } : p)); // пользователь убрал отца
  const back = revertRepair(edited, applied.journal);
  assert.deepEqual(by(back.people, "pet").parents, ["anna"], "его правка осталась");
  assert.equal(back.kept.length, 1);
  assert.match(back.kept[0]!, /Пётр/);
  assert.deepEqual(by(back.people, "evd").gedId, undefined, "остальные изменения отменены");
  assert.deepEqual(by(back.people, "mir").parents, ["ilya"]);
});

test("повторное применение того же плана ничего не меняет и не пишет в журнал; отмена после него возвращает исходное", () => {
  const list = load(ALL, "I10");
  const original = allPeople();
  const plan = planRepair(original, list);
  const first = applyRepair(original, plan.changes);
  const second = applyRepair(first.people, plan.changes);
  assert.equal(second.applied, 0);
  assert.equal(second.journal.length, 0);
  assert.deepEqual(second.people, first.people);
  assert.equal(second.skipped.length, plan.changes.filter((c) => c.selected).length);
  assert.deepEqual(revertRepair(second.people, first.journal).people, original);
});

test("отмена возвращает признак fromFile и номер у Евдокии как было", () => {
  const list = load(Cg, "I33");
  const original = peopleC();
  delete by(original, "evd").fromFile;
  const applied = applyRepair(original, planRepair(original, list).changes);
  assert.equal(by(applied.people, "evd").fromFile, true);
  const back = revertRepair(applied.people, applied.journal);
  assert.equal("gedId" in by(back.people, "evd"), false);
  assert.equal("fromFile" in by(back.people, "evd"), false);
  assert.deepEqual(back.people, original);
});
