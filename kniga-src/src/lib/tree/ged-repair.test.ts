// Адресное исправление связей после загрузки GEDCOM (ged-repair.ts). Все данные синтетические: вымышленные люди и номера, собственных данных ничьей семьи нет.
import assert from "node:assert/strict";
import test from "node:test";
import type { Person as RodPerson } from "@/lib/rod/types";
import { parseGedcom } from "./importTree.ts";
import { gedToPeople, type ImportedPerson } from "./gedImport.ts";
import { matchExisting, planGedImport } from "./ged-match.ts";
import { applyRepair, auditCopy, judgeCopies, planRepair, remainingParentMismatches, revertRepair } from "./ged-repair.ts";

const SRC = "FAMYTALE|FamyTale";
const indi = (id: string, name: string, sex = "M") => `0 @${id}@ INDI\n1 NAME ${name}\n1 SEX ${sex}\n`;
const fam = (id: string, h: string, w: string, kids: string[]) => `0 @${id}@ FAM\n${h ? `1 HUSB @${h}@\n` : ""}${w ? `1 WIFE @${w}@\n` : ""}${kids.map((k) => `1 CHIL @${k}@\n`).join("")}`;
const file = (body: string, head = "1 SOUR FAMYTALE\n2 NAME FamyTale\n") => `0 HEAD\n${head}${body}0 TRLR\n`;
const load = (body: string, self: string, head?: string): ImportedPerson[] => {
  const r = parseGedcom(file(body, head));
  assert.ok("tree" in r);
  return gedToPeople(r.tree, self);
};
let uidN = 0;
const uid = () => `new${uidN++}`;
const rod = (id: string, first: string, last: string, over: Partial<RodPerson> = {}): RodPerson => ({ id, name: `${first} ${last}`.trim(), firstName: first, patronymic: "", lastName: last, relation: "Родственник", birthYear: "", maidenName: "", notes: "", fromFile: true, ...over });
const real = (id: string, key: string, first: string, last: string, over: Partial<RodPerson> = {}) => rod(id, first, last, { gedId: key, gedSource: SRC, ...over });
const by = (people: RodPerson[], id: string) => people.find((p) => p.id === id)!;

// ---------- Ситуация 1: ребёнок привязан к копии родителя без номера и без фамилии ----------
const S1 = indi("I10", "Ферапонт /Лугов/") + indi("I11", "Прохор //") + indi("I12", "Аглая /Лугова/", "F") + fam("F10", "I11", "I12", ["I10"]);
const people1 = (): RodPerson[] => [
  real("kid", "I10", "Ферапонт", "Лугов", { parents: ["dadCopy", "mom"] }),
  real("dad", "I11", "Прохор", "", { gender: "m", spouse: "mom" }),
  real("mom", "I12", "Аглая", "Лугова", { gender: "f", spouse: "dad" }),
  rod("dadCopy", "Прохор", "", { gender: "m", spouse: "mom" }),
];

test("копия родителя без номера: ребёнок переводится на настоящую запись, людей не становится меньше или больше", () => {
  const list = load(S1, "I10");
  const people = people1();
  const plan = planRepair(people, list);
  assert.equal(plan.verdicts.find((x) => x.id === "dadCopy")!.confidence, "high");
  const ch = plan.changes.filter((c) => c.kind === "parent-copy");
  assert.equal(ch.length, 1);
  assert.deepEqual(ch[0]!.op, { type: "replaceParent", from: "dadCopy", to: "dad" });
  const done = applyRepair(people, plan.changes);
  assert.deepEqual(by(done.people, "kid").parents, ["dad", "mom"]);
  assert.equal(done.people.length, people.length, "никого не удалили");
  assert.ok(done.people.some((p) => p.id === "dadCopy"), "пустая копия осталась на месте");
});

test("идемпотентность: повторный план после применения пуст, повторное применение ничего не меняет", () => {
  const list = load(S1, "I10");
  const first = applyRepair(people1(), planRepair(people1(), list).changes);
  assert.equal(planRepair(first.people, list).changes.filter((c) => c.selected).length, 0);
  const again = applyRepair(first.people, planRepair(people1(), list).changes);
  assert.equal(again.applied, 0, "старый план на уже исправленных данных пропускается");
  assert.deepEqual(again.people, first.people);
});

// ---------- Ситуация 2: безымянный родитель ----------
const S2 = indi("I20", "Мелентий /Ромашин/") + indi("I21", "Тимон /Ромашин/") + indi("I22", "// ", "F") + fam("F20", "I21", "I22", ["I20"]);
const people2 = (): RodPerson[] => [
  real("kid", "I20", "Мелентий", "Ромашин", { parents: ["dad"] }),
  real("dad", "I21", "Тимон", "Ромашин", { gender: "m", spouse: "nn" }),
  real("nn", "I22", "Без имени", "", { gender: "f", spouse: "dad" }),
];
test("потерянный безымянный родитель добавляется ребёнку, у которого записан только второй родитель", () => {
  const plan = planRepair(people2(), load(S2, "I20"));
  const ch = plan.changes.filter((c) => c.kind === "parent-nameless");
  assert.equal(ch.length, 1);
  assert.deepEqual(by(applyRepair(people2(), plan.changes).people, "kid").parents, ["dad", "nn"]);
});

test("безымянный родитель не добавляется, если записанный родитель не опознан по файлу (нет доказательства)", () => {
  const people = people2();
  by(people, "kid").parents = ["stranger"];
  people.push(rod("stranger", "Посторонний", "Человек"));
  assert.equal(planRepair(people, load(S2, "I20")).changes.filter((c) => c.kind === "parent-nameless").length, 0);
});

test("безымянный родитель не достраивается, если у ребёнка уже двое родителей", () => {
  const people = people2();
  by(people, "kid").parents = ["dad", "other"];
  people.push(rod("other", "Иная", "Особа", { gender: "f" }));
  assert.equal(planRepair(people, load(S2, "I20")).changes.length, 0);
});

// ---------- Ситуация 3: человек без фамилии записан один раз без номера ----------
const S3 = indi("I30", "Агриппина //", "F") + indi("I31", "Кондрат /Вишнев/") + indi("I32", "Лукиан //") + indi("I33", "Назар /Вишнев/") + fam("F30", "I31", "I30", ["I33"]) + fam("F31", "I32", "", ["I30"]);
const people3 = (): RodPerson[] => [
  rod("solo", "Агриппина", "", { gender: "f", spouse: "hub" }),
  real("hub", "I31", "Кондрат", "Вишнев", { gender: "m", spouse: "solo" }),
  real("dad", "I32", "Лукиан", "", { gender: "m" }),
  real("son", "I33", "Назар", "Вишнев", { parents: ["hub", "solo"] }),
];
test("человек без копии: возвращается номер файла и связь с родителем, дети не меняются, второй записи не появляется", () => {
  const list = load(S3, "I33");
  const people = people3();
  const plan = planRepair(people, list);
  assert.equal(plan.verdicts.find((v) => v.id === "solo")!.confidence, "restore");
  assert.deepEqual(plan.changes.map((c) => c.kind).sort(), ["parent-restored", "restore-id"]);
  const done = applyRepair(people, plan.changes);
  const e = by(done.people, "solo");
  assert.equal(e.gedId, "I30");
  assert.equal(e.gedSource, SRC);
  assert.deepEqual(e.parents, ["dad"]);
  assert.deepEqual(by(done.people, "son").parents, ["hub", "solo"], "дети не тронуты");
  assert.equal(done.people.length, people.length);
});

test("повторный импорт: человек без фамилии находится по связям, второго экземпляра нет ни до, ни после исправления", () => {
  const list = load(S3, "I33");
  const before = planGedImport(people3(), list, { updateLinks: false, uid });
  assert.ok(before.ok);
  assert.equal(before.added, 0, "найден по связям: супруг и ребёнок совпали");
  const repaired = applyRepair(people3(), planRepair(people3(), list).changes).people;
  const after = planGedImport(repaired, list, { updateLinks: false, uid });
  assert.ok(after.ok);
  assert.equal(after.added, 0);
  assert.equal(after.people.length, repaired.length);
});

test("человек без фамилии не склеивается по одному имени, если связи не совпадают с файлом", () => {
  const list = load(S3, "I33");
  const current = [real("hub", "I31", "Кондрат", "Вишнев"), rod("other", "Агриппина", "", { gender: "f" })];
  assert.equal(matchExisting(current, list).has("I30"), false);
});

test("два одинаково подходящих кандидата по связям: не склеиваем", () => {
  const list = load(S3, "I33");
  const current = [real("hub", "I31", "Кондрат", "Вишнев", { spouse: "a" }), rod("a", "Агриппина", "", { gender: "f", spouse: "hub" }), rod("b", "Агриппина", "", { gender: "f", spouse: "hub" })];
  assert.equal(matchExisting(current, list).has("I30"), false);
});

// ---------- Ситуация 4: одинаковые имена у разных людей ----------
const S4 = indi("I40", "Ираида //", "F") + indi("I41", "Евлампий /Столяров/") + indi("I42", "Савва /Столяров/") + indi("I43", "Ираида //", "F") + indi("I44", "Варлаам /Мельников/") + indi("I45", "Клим /Мельников/") + fam("F40", "I41", "I40", ["I42"]) + fam("F41", "I44", "I43", ["I45"]);
const people4 = (): RodPerson[] => [
  real("w1", "I40", "Ираида", "", { gender: "f", spouse: "h1" }),
  real("w2", "I43", "Ираида", "", { gender: "f", spouse: "h2" }),
  real("h1", "I41", "Евлампий", "Столяров", { gender: "m", spouse: "mix" }),
  real("k1", "I42", "Савва", "Столяров", { parents: ["h1", "mix"] }),
  real("h2", "I44", "Варлаам", "Мельников", { gender: "m", spouse: "mix" }),
  real("k2", "I45", "Клим", "Мельников", { parents: ["h2", "mix"] }),
  rod("mix", "Ираида", "", { gender: "f", spouse: "h1" }),
];
test("смешанная запись двух одноимённых: не копия, по умолчанию ничего не меняется, исправления подготовлены и выключены", () => {
  const list = load(S4, "I42");
  const people = people4();
  const plan = planRepair(people, list);
  const v = plan.verdicts.find((x) => x.id === "mix")!;
  assert.equal(v.confidence, "low");
  assert.ok(v.mixed);
  assert.equal(plan.changes.filter((c) => c.selected).length, 0, "ничего не включено само");
  const kid2 = plan.changes.find((c) => c.personId === "k2")!;
  assert.deepEqual(kid2.op, { type: "replaceParent", from: "mix", to: "w2" });
  assert.equal(kid2.selected, false);
  assert.deepEqual(applyRepair(people, plan.changes).people, people, "по умолчанию данные те же");
  const enabled = applyRepair(people, plan.changes, new Set([kid2.id]));
  assert.deepEqual(by(enabled.people, "k2").parents, ["h2", "w2"]);
  assert.deepEqual(by(enabled.people, "k1").parents, ["h1", "mix"], "соседний ребёнок без отдельного выбора не тронут");
});

const S4b = indi("I50", "Гордей /Орлов/") + indi("I51", "Гордей /Орлов/") + indi("I52", "Гордей /Орлов/") + indi("I53", "Зоя /Орлова/", "F") + fam("F50", "I50", "", ["I51", "I52"]) + fam("F51", "I52", "", ["I53"]);
test("одноимённые отец и сыновья: план не меняет ни одной связи", () => {
  const people = [real("z0", "I50", "Гордей", "Орлов", { gender: "m" }), real("z1", "I51", "Гордей", "Орлов", { gender: "m", parents: ["z0"] }), real("z2", "I52", "Гордей", "Орлов", { gender: "m", parents: ["z0"] }), real("zn", "I53", "Зоя", "Орлова", { gender: "f", parents: ["z0"] })];
  assert.equal(planRepair(people, load(S4b, "I51")).changes.length, 0);
});

// ---------- Ситуация 5: несколько супругов ----------
const S5 = indi("I60", "Мартын /Седов/") + indi("I61", "Лада //", "F") + indi("I62", "Зина //", "F") + indi("I63", "Артём /Седов/") + indi("I64", "Вера /Седова/", "F") + fam("F60", "I60", "I61", ["I63"]) + fam("F61", "I60", "I62", ["I64"]);
const people5 = (): RodPerson[] => [
  real("m", "I60", "Мартын", "Седов", { gender: "m", spouse: "ladaCopy", moreSpouses: [{ id: "zinaCopy", status: "married" }] }),
  real("lada", "I61", "Лада", "", { gender: "f", spouse: "m" }),
  real("zina", "I62", "Зина", "", { gender: "f", spouse: "m" }),
  real("son", "I63", "Артём", "Седов", { parents: ["m", "ladaCopy"] }),
  real("dau", "I64", "Вера", "Седова", { gender: "f", parents: ["m", "zinaCopy"] }),
  rod("ladaCopy", "Лада", "", { gender: "f", spouse: "m" }),
  rod("zinaCopy", "Зина", "", { gender: "f", spouse: "m" }),
];
test("несколько супругов: копия основного и копия дополнительного супруга заменяются на настоящие записи, порядок и статус сохраняются", () => {
  const list = load(S5, "I63");
  const plan = planRepair(people5(), list);
  const kinds = plan.changes.map((c) => c.op.type).sort();
  assert.ok(kinds.includes("replaceSpouse") && kinds.includes("replaceMoreSpouse"), kinds.join(","));
  const done = applyRepair(people5(), plan.changes).people;
  assert.equal(by(done, "m").spouse, "lada");
  assert.deepEqual(by(done, "m").moreSpouses, [{ id: "zina", status: "married" }]);
  assert.deepEqual(by(done, "son").parents, ["m", "lada"]);
  assert.deepEqual(by(done, "dau").parents, ["m", "zina"]);
  assert.deepEqual(revertRepair(done, applyRepair(people5(), plan.changes).journal).people, people5());
});

// ---------- Ситуация 6: запись без связей и без даты; отсутствующий и неоднозначный номер ----------
test("запись без связей и без даты: уверенность средняя, изменений нет, указано, чего не хватает", () => {
  const list = load(indi("I70", "Харитон //") + indi("I71", "Ульяна /Сосновская/", "F") + fam("F70", "I70", "I71", []), "I71");
  const people = [real("a", "I70", "Харитон", "", { gender: "m" }), rod("b", "Харитон", "", { gender: "m" }), real("c", "I71", "Ульяна", "Сосновская")];
  const plan = planRepair(people, list);
  assert.equal(plan.verdicts.find((v) => v.id === "b")!.confidence, "medium");
  assert.equal(plan.changes.length, 0);
  assert.ok(plan.verdicts[0]!.gaps.length > 0);
});

test("файл без источника (нет номера и источника в шапке): план пуст, ничего не предлагается", () => {
  const list = load(S1, "I10", "");
  assert.equal(planRepair(people1(), list).changes.length, 0);
  assert.equal(judgeCopies(people1(), list).length, 0);
});

test("запись с номером из другого файла не считается настоящей записью: копией не заменяется", () => {
  const people = people1();
  by(people, "dad").gedSource = "ДРУГОЙ|ИСТОЧНИК";
  assert.equal(planRepair(people, load(S1, "I10")).changes.filter((c) => c.kind === "parent-copy").length, 0);
});

// ---------- Ситуация 7: ручные изменения пользователя между импортами ----------
test("ручное изменение между импортами: повторный импорт не перезаписывает связи, исправление не возвращает то, что человек поправил", () => {
  const list = load(S1, "I10");
  const fixed = applyRepair(people1(), planRepair(people1(), list).changes).people;
  const mine = fixed.map((p) => (p.id === "kid" ? { ...p, parents: ["mom"], notes: "моя заметка" } : p)); // человек убрал отца и написал заметку
  const re = planGedImport(mine, list, { updateLinks: false, uid });
  assert.ok(re.ok);
  assert.deepEqual(by(re.people, "kid").parents, ["mom"], "связи при обычной загрузке не трогаются");
  assert.equal(by(re.people, "kid").notes, "моя заметка");
  assert.equal(planRepair(mine, list).changes.filter((c) => c.selected).length, 0, "ничего не навязывается заново");
});

test("remainingParentMismatches считает расхождения с файлом и сходится после применения", () => {
  const list = load(S1, "I10");
  assert.equal(remainingParentMismatches(people1(), list).length, 1);
  assert.equal(remainingParentMismatches(applyRepair(people1(), planRepair(people1(), list).changes).people, list).length, 0);
});

test("auditCopy: у копии с фото или заметкой отмечены собственные данные, пустая копия чистая", () => {
  const r = rod("r", "Прохор", "", { gedId: "I11" });
  assert.deepEqual(auditCopy(rod("c", "Прохор", ""), r), []);
  assert.deepEqual(auditCopy(rod("c", "Прохор", "", { photo: "p1", notes: "заметка о нём" }), r).sort(), ["заметка", "фото"]);
  assert.deepEqual(auditCopy(rod("c", "Прохор", "", { notes: "то же" }), rod("r", "Прохор", "", { notes: "то же" })), []);
  assert.deepEqual(auditCopy(rod("c", "Прохор", "", { attachments: [{ id: "x", ref: "r", name: "n" } as never] }), r), ["вложения"]);
});

// ---------- Ситуация 8: частичное применение, отмена, повторное применение ----------
const ALL = S1 + S2.replace(/I2/g, "I8").replace(/F2/g, "F8") + S3.replace(/I3/g, "I9").replace(/F3/g, "F9");
const allPeople = (): RodPerson[] => [
  ...people1(),
  real("kid2", "I80", "Мелентий", "Ромашин", { parents: ["dad2"] }),
  real("dad2", "I81", "Тимон", "Ромашин", { gender: "m", spouse: "nn2" }),
  real("nn2", "I82", "Без имени", "", { gender: "f", spouse: "dad2" }),
  rod("solo3", "Агриппина", "", { gender: "f", spouse: "hub3" }),
  real("hub3", "I91", "Кондрат", "Вишнев", { gender: "m", spouse: "solo3" }),
  real("dad3", "I92", "Лукиан", "", { gender: "m" }),
  real("son3", "I93", "Назар", "Вишнев", { parents: ["hub3", "solo3"] }),
];
test("в функции применения выключенные изменения не применяются без явного выбора, а включённые вручную применяются", () => {
  const people = people4();
  const plan = planRepair(people, load(S4, "I42"));
  const off = plan.changes.filter((c) => !c.selected);
  assert.ok(off.length >= 1);
  assert.equal(applyRepair(people, plan.changes).applied, 0, "без выбора: ни одного");
  assert.equal(applyRepair(people, plan.changes, new Set()).applied, 0, "пустой выбор: ни одного");
  assert.equal(applyRepair(people, plan.changes, new Set(off.map((c) => c.id))).applied, off.length);
});

test("отмена частичного применения возвращает ровно применённое и не трогает правки пользователя", () => {
  const list = load(ALL, "I10");
  const original = allPeople();
  const plan = planRepair(original, list);
  assert.ok(plan.changes.filter((c) => c.selected).length >= 4);
  const part = plan.changes.filter((c) => c.selected).slice(0, 2);
  const applied = applyRepair(original, plan.changes, new Set(part.map((c) => c.id)));
  assert.equal(applied.applied, 2);
  const edited = applied.people.map((p) => (p.id === "mom" ? { ...p, notes: "правка пользователя" } : p));
  edited.push(rod("newbie", "Новичок", "Тестов"));
  const back = revertRepair(edited, applied.journal);
  assert.equal(back.reverted, 2);
  assert.deepEqual(back.kept, []);
  const expected = original.map((p) => (p.id === "mom" ? { ...p, notes: "правка пользователя" } : p));
  expected.push(rod("newbie", "Новичок", "Тестов"));
  assert.deepEqual(back.people, expected);
});

test("если пользователь после применения сам изменил связь, отмена её не перезаписывает", () => {
  const list = load(ALL, "I10");
  const original = allPeople();
  const plan = planRepair(original, list);
  const applied = applyRepair(original, plan.changes);
  assert.deepEqual(by(applied.people, "kid").parents, ["dad", "mom"]);
  const edited = applied.people.map((p) => (p.id === "kid" ? { ...p, parents: ["mom"] } : p));
  const back = revertRepair(edited, applied.journal);
  assert.deepEqual(by(back.people, "kid").parents, ["mom"], "его правка осталась");
  assert.equal(back.kept.length, 1);
  assert.match(back.kept[0]!, /Ферапонт/);
  assert.equal("gedId" in by(back.people, "solo3"), false, "остальные изменения отменены");
  assert.deepEqual(by(back.people, "kid2").parents, ["dad2"]);
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

test("отмена возвращает признак fromFile и номер как было, если их у записи не было", () => {
  const list = load(S3, "I33");
  const original = people3();
  delete by(original, "solo").fromFile;
  const applied = applyRepair(original, planRepair(original, list).changes);
  assert.equal(by(applied.people, "solo").fromFile, true);
  const back = revertRepair(applied.people, applied.journal);
  assert.equal("gedId" in by(back.people, "solo"), false);
  assert.equal("fromFile" in by(back.people, "solo"), false);
  assert.deepEqual(back.people, original);
});

test("применение пропускает изменение, если связь уже поправили вручную", () => {
  const list = load(S1, "I10");
  const plan = planRepair(people1(), list);
  const changed = people1();
  by(changed, "kid").parents = ["dad", "mom"];
  const r = applyRepair(changed, plan.changes);
  assert.equal(r.applied, 0);
  assert.equal(r.skipped.length, 1);
});

// ---------- Ситуация 9: произвольные деревья (генератор), без привязки к размеру и структуре ----------
const NAMES = ["Альдор", "Бренна", "Витарис", "Гелиана", "Дармон", "Ерида", "Жолин", "Зарина", "Ианта", "Корвин", "Лессия", "Мирдан", "Нолина", "Орвен", "Пелиас", "Рисана", "Сорен", "Тавия", "Улан", "Фенира", "Хельга", "Цинна", "Эльмир", "Ярна"];
const SURN = ["Арвелов", "Бросов", "Вельмин", "Гаранов", "Дорин", "Ештов", "Жарков", "Зелин"];
function synth(seed: number, target: number) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]!;
  type P = { key: string; first: string; last: string; sex: "M" | "F"; nameless: boolean };
  const people: P[] = [];
  const fams: { h?: string; w?: string; kids: string[] }[] = [];
  const free: P[] = [];
  const mk = (sex: "M" | "F", last?: string): P => {
    const nameless = rnd() < 0.05;
    const noLast = !last && rnd() < 0.4;
    const p: P = { key: `I${100 + people.length}`, first: nameless ? "" : pick(NAMES), last: nameless || noLast ? "" : last ?? pick(SURN), sex, nameless };
    people.push(p);
    return p;
  };
  const take = (sex: "M" | "F") => { const i = free.findIndex((p) => p.sex === sex && rnd() < 0.7); return i >= 0 ? free.splice(i, 1)[0]! : mk(sex); };
  while (people.length < target) {
    const h = take("M"), w = take("F");
    const kids = Array.from({ length: Math.floor(rnd() * 4) }, () => mk(rnd() < 0.5 ? "M" : "F", h.last || undefined));
    fams.push({ h: h.key, w: w.key, kids: kids.map((k) => k.key) });
    free.push(...kids);
    if (rnd() < 0.12) fams.push({ h: h.key, w: mk("F").key, kids: [] }); // второй брак
  }
  const text = people.map((p) => indi(p.key, `${p.first} /${p.last}/`, p.sex)).join("") + fams.map((f, i) => fam(`F${i + 1}`, f.h ?? "", f.w ?? "", f.kids)).join("");
  return { text, first: people[0]!.key, rnd };
}

test("произвольные синтетические деревья: исправление не удаляет людей, не выходит за план, идемпотентно, отменяется точно, повторная загрузка не плодит копий", () => {
  let totalChanges = 0, totalGhosts = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const target = 8 + ((seed * 37) % 150);
    const { text, first, rnd } = synth(seed, target);
    const list = load(text, first);
    // «первая загрузка старой версии»: все записи есть, но у части безымянных родителей у детей нет связи, а у части людей без фамилии есть копия без номера, на которую переставлены связи
    let people: RodPerson[] = list.map((p, i) => ({ ...rod(`p${i}`, p.firstName, p.lastName, { gender: p.gender, relation: p.relation }), gedId: p.key, gedSource: p.source }));
    const idOf = new Map(list.map((p, i) => [p.key, `p${i}`]));
    people = people.map((c, i) => ({ ...c, parents: list[i]!.parentKeys.map((k) => idOf.get(k)!).filter((id) => !(people[Number(id.slice(1))]?.firstName === "Без имени" && rnd() < 0.5)), spouse: list[i]!.spouseKey ? idOf.get(list[i]!.spouseKey!) : undefined, moreSpouses: (list[i]!.moreSpouses ?? []).map((m) => ({ id: idOf.get(m.key)!, status: "married" as const })) }));
    for (const c of people.map((x) => ({ ...x }))) {
      if (c.lastName || c.firstName === "Без имени" || rnd() < 0.5) continue;
      const ghost: RodPerson = rod(`g${c.id}`, c.firstName!, "", { gender: c.gender, spouse: c.spouse, moreSpouses: c.moreSpouses });
      people = people.map((p) => ({
        ...p,
        parents: (p.parents ?? []).map((id) => (id === c.id && rnd() < 0.7 ? ghost.id : id)),
        spouse: p.spouse === c.id && rnd() < 0.7 ? ghost.id : p.spouse,
      }));
      people.push(ghost);
      totalGhosts++;
    }
    const original = structuredClone(people);
    const plan = planRepair(people, list);
    const before = remainingParentMismatches(people, list).length;
    const done = applyRepair(people, plan.changes);
    totalChanges += done.applied;
    assert.equal(done.people.length, original.length, `seed ${seed}: людей столько же`);
    assert.deepEqual(done.people.map((p) => p.id), original.map((p) => p.id), `seed ${seed}: те же id в том же порядке`);
    const planned = new Set(plan.changes.filter((c) => c.selected).map((c) => c.personId));
    for (const p of done.people) if (!planned.has(p.id)) assert.deepEqual(p, original.find((o) => o.id === p.id), `seed ${seed}: вне плана не менялся ${p.id}`);
    assert.ok(remainingParentMismatches(done.people, list).length <= before, `seed ${seed}: расхождений не больше`);
    assert.equal(planRepair(done.people, list).changes.filter((c) => c.selected).length, 0, `seed ${seed}: повторный план пуст`);
    assert.equal(applyRepair(done.people, plan.changes).applied, 0, `seed ${seed}: повтор ничего не применяет`);
    assert.deepEqual(revertRepair(done.people, done.journal).people, original, `seed ${seed}: отмена возвращает исходное`);
    const high = new Set(plan.verdicts.filter((v) => v.confidence === "high").map((v) => v.id));
    for (const p of done.people) if (p.gedId) {
      for (const id of p.parents ?? []) assert.ok(!high.has(id), `seed ${seed}: связь с копией высокой уверенности не осталась`);
      assert.ok(!high.has(p.spouse ?? ""), `seed ${seed}: супруг-копия высокой уверенности не остался`);
    }
    let n = 0;
    const re = planGedImport(done.people, list, { updateLinks: false, uid: () => `n${n++}` });
    assert.ok(re.ok);
    assert.equal(re.added, 0, `seed ${seed}: повторная загрузка не добавляет людей`);
  }
  assert.ok(totalGhosts > 20 && totalChanges > 0, `генератор действительно создал копии (${totalGhosts}) и исправления (${totalChanges})`);
});
