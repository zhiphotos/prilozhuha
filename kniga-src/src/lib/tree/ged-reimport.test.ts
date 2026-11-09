import assert from "node:assert/strict";
import test from "node:test";
import { parseGedcom } from "./importTree.ts";
import { gedToPeople, type ImportedPerson } from "./gedImport.ts";
import { linkDiffs, matchExisting, planGedImport } from "./ged-match.ts";
import type { Person as RodPerson } from "@/lib/rod/types";

const ged = (id: string, name: string, extra = "") => `0 @${id}@ INDI\n1 NAME ${name}\n${extra}`;
const file = (people: string, source = "FAMYTALE") => `0 HEAD\n1 SOUR ${source}\n2 NAME FamyTale\n${people}0 TRLR\n`;
const load = (text: string, selfKey: string) => {
  const r = parseGedcom(text);
  assert.ok("tree" in r);
  return gedToPeople(r.tree, selfKey);
};
const asRod = (p: ImportedPerson, id: string, over: Partial<RodPerson> = {}): RodPerson => ({
  id, name: `${p.firstName} ${p.lastName}`.trim(), firstName: p.firstName, patronymic: p.patronymic, lastName: p.lastName,
  relation: p.relation, birthYear: p.birthYear, maidenName: "", notes: "", fromFile: true, gedId: p.key, gedSource: p.source, ...over,
});

test("повторная загрузка того же файла находит всех, в том числе людей без фамилии", () => {
  const text = file(ged("I1", "Брунгильда //") + ged("I2", "Модест //") + ged("I3", "Брунгильда //") + ged("I4", "// "), "FAMYTALE");
  const list = load(text, "I1");
  assert.ok(list.length >= 3);
  const current = list.map((p, i) => asRod(p, `u${i}`));
  assert.equal(matchExisting(current, list).size, list.length);
});

test("в чужом файле тот же I1 с другим именем не склеивается", () => {
  const mine = load(file(ged("I1", "Брунгильда /Пробина/")), "I1");
  const other = load(file(ged("I1", "Гертруда /Опытова/")), "I1");
  const current = mine.map((p, i) => asRod(p, `u${i}`));
  assert.equal(matchExisting(current, other).size, 0);
});

test("однофамильцы без дат не склеиваются между собой при совпадении id", () => {
  const list = load(file(ged("I1", "Эдгар /Макетов/") + ged("I2", "Эдгар /Макетов/")), "I1");
  const current = list.map((p, i) => asRod(p, `u${i}`));
  const m = matchExisting(current, list);
  assert.equal(new Set([...m.values()].map((x) => x.id)).size, list.length);
});

test("связи, которые отличаются, не считаются совпадением и попадают в список различий", () => {
  const text = file(ged("I1", "Брунгильда /Пробина/", "1 FAMC @F1@\n") + ged("I2", "Модест /Пробин/") + ged("I3", "Вера /Пробина/") + `0 @F1@ FAM\n1 HUSB @I2@\n1 WIFE @I3@\n1 CHIL @I1@\n`);
  const list = load(text, "I1");
  const current = list.map((p, i) => asRod(p, `u${i}`, p.key === "I1" ? { parents: ["чужой-1", "чужой-2"] } : {}));
  const matched = matchExisting(current, list);
  const diffs = linkDiffs(current, list, matched);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0]!.what, "родители");
});

test("повторная загрузка дописывает девичью фамилию, которой не было, и не трогает связи и уже записанную фамилию", () => {
  const text = file(
    ged("I1", "Анна /Ветрова/", "2 SURN Ветрова\n1 SEX F\n1 FAMS @F1@\n") +
      ged("I2", "Борис /Ветров/", "1 SEX M\n1 FAMS @F1@\n") +
      ged("I3", "Вера /Громова/", "2 SURN Лесная\n1 SEX F\n1 FAMC @F1@\n") +
      "0 @F1@ FAM\n1 HUSB @I2@\n1 WIFE @I1@\n1 CHIL @I3@\n",
  );
  const list = load(text, "I3");
  const withMaiden = list.find((p) => p.firstName === "Вера");
  assert.equal(withMaiden?.maidenName, "Лесная", "из файла читается девичья фамилия");
  const current = list.map((p, i) => asRod(p, `u${i}`));
  const vera = current.find((c) => c.firstName === "Вера")!;
  const anna = current.find((c) => c.firstName === "Анна")!;
  anna.maidenName = "Моя запись";
  const boris = current.find((c) => c.firstName === "Борис")!;
  vera.parents = [boris.id, anna.id];
  anna.spouse = boris.id;
  boris.spouse = anna.id;
  const before = current.map((c) => ({ id: c.id, parents: c.parents, spouse: c.spouse }));
  const plan = planGedImport(current, list, { updateLinks: false, uid: () => "x" });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  const after = new Map(plan.people.map((c) => [c.id, c]));
  assert.equal(after.get(vera.id)?.maidenName, "Лесная", "пустая девичья фамилия дописана");
  assert.equal(after.get(anna.id)?.maidenName, "Моя запись", "уже записанная не перезаписана");
  assert.deepEqual(before.map((b) => ({ id: b.id, parents: after.get(b.id)?.parents, spouse: after.get(b.id)?.spouse })), before, "связи остались как были");
  assert.equal(plan.added, 0, "новых людей нет");
});
