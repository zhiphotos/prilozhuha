// Приёмка загрузки GED на постоянных синтетических файлах (src/lib/tree/fixtures). Настоящий файл Familio здесь НЕ используется: его у нас нет.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gedToPeople } from "./gedImport.ts";
import { linkDiffs, matchExisting, planGedImport, possibleSame } from "./ged-match.ts";
import { parseGedcom } from "./importTree.ts";
import type { Person as RodPerson } from "@/lib/rod/types";

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
const list = (text: string, self = "I1") => {
  const r = parseGedcom(text);
  assert.ok("tree" in r, "файл читается");
  return gedToPeople(r.tree, self);
};
const counter = () => { let n = 0; return () => `u${++n}`; };
let globalSeq = 0;
const freshId = () => `g${++globalSeq}`; // как случайные id в приложении: не повторяются между загрузками
const importInto = (current: RodPerson[], text: string, opts: { updateLinks?: boolean; uid?: () => string; self?: string } = {}) => {
  const l = list(text, opts.self);
  const plan = planGedImport(current, l, { updateLinks: opts.updateLinks ?? false, uid: opts.uid ?? freshId });
  assert.ok(plan.ok, plan.ok ? "" : plan.reason);
  return { plan, list: l };
};
const byFile = (people: RodPerson[], key: string) => people.find((p) => p.gedId === key)!;

test("первая загрузка: люди добавлены, id файла и источник записаны, фамилия не повторяется", () => {
  const { plan } = importInto([], fixture("ged-family-v1.ged"));
  assert.equal(plan.people.length, 8);
  assert.ok(plan.people.every((p) => p.gedId && p.gedSource === "SYNTH|Synthetic"));
  const wife = byFile(plan.people, "I2");
  assert.equal(wife.lastName, "Тестова");
  assert.equal(wife.maidenName, "Образцова");
  assert.equal(wife.name, "Тестия Первая Тестова");
});

test("повторная загрузка того же файла: ни добавлений, ни изменений данных", () => {
  const first = importInto([], fixture("ged-family-v1.ged")).plan.people;
  const again = importInto(first, fixture("ged-family-v1.ged")).plan;
  assert.equal(again.added, 0);
  assert.equal(again.people.length, first.length);
  assert.deepEqual(again.people, first, "данные не изменились ни в одном поле");
});

test("люди без фамилии не задваиваются и не склеиваются между собой", () => {
  const first = importInto([], fixture("ged-family-v1.ged")).plan.people;
  const nameless = first.filter((p) => p.name === "Малыш");
  assert.equal(nameless.length, 2);
  const again = importInto(first, fixture("ged-family-v1.ged")).plan.people;
  assert.equal(again.filter((p) => p.name === "Малыш").length, 2);
  assert.notEqual(byFile(again, "I3").id, byFile(again, "I4").id);
});

test("одинаковые имена у разных людей не объединяются", () => {
  const first = importInto([], fixture("ged-family-v1.ged")).plan.people;
  const a = byFile(first, "I5"), b = byFile(first, "I6");
  assert.notEqual(a.id, b.id);
  const m = matchExisting(first, list(fixture("ged-family-v1.ged")));
  assert.equal(new Set([...m.values()].map((x) => x.id)).size, m.size);
});

test("одинаковые id в разных источниках не склеивают людей", () => {
  // у человека уже есть своя запись «я», поэтому у людей первого файла это слово заменено
  const first = importInto([], fixture("ged-family-v1.ged")).plan.people.map((p) => (p.relation === "я" ? { ...p, relation: "Муж" } : p));
  const other = importInto(first, fixture("ged-other-source.ged"), { self: "I2" }).plan;
  assert.equal(other.added, 2, "оба человека из другого источника добавлены");
  assert.equal(other.people.length, first.length + 2);
  for (const p of first) assert.deepEqual(other.people.find((x) => x.id === p.id), p, "прежние люди не изменены");
});

test("изменение фамилии без связи с прежней: человек не склеивается, дубль виден в просмотре, прежняя запись цела", () => {
  const first = importInto([], fixture("ged-family-v1.ged")).plan.people;
  const l2 = list(fixture("ged-family-v2.ged"));
  const matched = matchExisting(first, l2);
  const possible = possibleSame(first, l2, matched);
  assert.ok(possible.some((x) => x.fileName.includes("Другая-Новая")));
  const plan = importInto(first, fixture("ged-family-v2.ged")).plan;
  assert.ok(plan.people.some((p) => p.lastName === "Двойная-Фамилия"), "прежняя запись осталась");
  assert.ok(plan.people.some((p) => p.lastName === "Другая-Новая"), "новая добавлена отдельно");
});

test("изменение имени: не склеивается, виден в просмотре", () => {
  const first = importInto([], fixture("ged-family-v1.ged")).plan.people;
  const text = fixture("ged-family-v1.ged").replace("Дочь Первая /Тестова/", "Доченька Первая /Тестова/");
  const l2 = list(text);
  const possible = possibleSame(first, l2, matchExisting(first, l2));
  assert.equal(possible.length, 1);
  assert.equal(possible[0]!.name, "Дочь Первая Тестова");
});

test("смена фамилии при замужестве (прежняя становится девичьей) узнаётся по id", () => {
  const first = importInto([], fixture("ged-family-v1.ged").replace("Алла /Двойная-Фамилия/", "Алла /Девичья/")).plan.people;
  const text = fixture("ged-family-v1.ged").replace("Алла /Двойная-Фамилия/", "Алла /Замужняя (Девичья)/\n2 SURN Девичья");
  const l2 = list(text);
  const m = matchExisting(first, l2);
  assert.equal(m.get("I7")?.id, byFile(first, "I7").id);
});

test("изменённые связи: по умолчанию остаются прежними, с подтверждением заменяются", () => {
  const first = importInto([], fixture("ged-family-v1.ged")).plan.people;
  const before = byFile(first, "I8").parents;
  const l2 = list(fixture("ged-family-v2.ged"));
  assert.equal(linkDiffs(first, l2, matchExisting(first, l2)).length >= 1, true);
  const kept = importInto(first, fixture("ged-family-v2.ged")).plan.people;
  assert.deepEqual(byFile(kept, "I8").parents, before, "связи не тронуты");
  const replaced = importInto(first, fixture("ged-family-v2.ged"), { updateLinks: true }).plan.people;
  const newDad = byFile(replaced, "I9").id;
  assert.ok(byFile(replaced, "I8").parents?.includes(newDad), "после подтверждения связь заменена");
});

test("пользовательская подпись «Кем приходится» сохраняется", () => {
  const first = importInto([], fixture("ged-family-v1.ged")).plan.people.map((p) => (p.gedId === "I2" ? { ...p, relation: "любимая мама" } : p));
  const kept = importInto(first, fixture("ged-family-v2.ged")).plan.people;
  assert.equal(byFile(kept, "I2").relation, "любимая мама");
  const replaced = importInto(first, fixture("ged-family-v2.ged"), { updateLinks: true }).plan.people;
  assert.notEqual(byFile(replaced, "I2").relation, "любимая мама", "только по явному подтверждению");
});

test("отмена загрузки и повторная загрузка после отмены дают тот же результат", () => {
  const base = importInto([], fixture("ged-family-v1.ged")).plan.people;
  const snapshot = JSON.stringify(base); // то, что сохраняется резервной копией перед загрузкой
  const run = () => importInto(JSON.parse(snapshot) as RodPerson[], fixture("ged-family-v2.ged"), { uid: counter() }).plan.people;
  const afterImport = run();
  const norm = (x: unknown) => JSON.parse(JSON.stringify(x)) as unknown; // как после записи копии
  assert.notDeepEqual(norm(afterImport), norm(base));
  const restored = JSON.parse(snapshot) as RodPerson[]; // отмена = возврат копии
  assert.deepEqual(restored, norm(base), "после отмены книга как была");
  assert.deepEqual(norm(run()), norm(afterImport), "повторная загрузка после отмены даёт то же");
});

test("в списке уже есть другой «я»: загрузка отклоняется и ничего не меняет", () => {
  const mine: RodPerson = { id: "me", name: "Совсем Другая", firstName: "Совсем", patronymic: "", lastName: "Другая", relation: "я", birthYear: "", maidenName: "", notes: "" };
  const plan = planGedImport([mine], list(fixture("ged-family-v1.ged")), { updateLinks: false, uid: freshId });
  assert.equal(plan.ok, false);
});

test("синтетический файл «как Familio» (НЕ настоящий): девичья фамилия не повторяется, поле _MARNM не ломает", () => {
  const { plan } = importInto([], fixture("ged-familio-like.ged"), { self: "I2" });
  const anna = byFile(plan.people, "I1");
  assert.equal(anna.lastName, "Тестерова");
  assert.equal(anna.maidenName, "Образцова");
  assert.equal(anna.name, "Брунгильда Тестерова");
});
