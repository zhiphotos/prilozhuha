// Проверка на файлах в манере разных программ (Gramps, MyHeritage, Ancestry) и на большом дереве.
// Все файлы синтетические: вымышленные люди, составлены вручную по характерным особенностям выгрузки каждой программы, а не взяты из реальных деревьев.
import assert from "node:assert/strict";
import test from "node:test";
import type { Person as RodPerson } from "@/lib/rod/types";
import { parseGedcom } from "./importTree.ts";
import { gedToPeople } from "./gedImport.ts";
import { planGedImport } from "./ged-match.ts";
import { applyRepair, planRepair, remainingParentMismatches, revertRepair } from "./ged-repair.ts";

const GRAMPS = `0 HEAD
1 SOUR Gramps
2 VERS 5.1.6
2 NAME Gramps
1 DATE 1 JAN 2026
1 SUBM @SUBM@
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
1 LANG Russian
0 @SUBM@ SUBM
1 NAME Тест
0 @I0000@ INDI
1 NAME Ферапонт /Лугов/
2 GIVN Ферапонт
2 SURN Лугов
1 SEX M
1 BIRT
2 DATE 3 MAR 1930
2 SOUR @S0000@
1 NOTE @N0000@
1 FAMC @F0000@
1 FAMS @F0001@
1 CHAN
2 DATE 2 JAN 2026
3 TIME 10:00:00
0 @I0001@ INDI
1 NAME Прохор //
2 GIVN Прохор
1 SEX M
1 FAMS @F0000@
0 @I0002@ INDI
1 NAME Аглая /Лугова/
2 GIVN Аглая
2 SURN Лугова
1 SEX F
1 FAMS @F0000@
0 @I0003@ INDI
1 NAME Ларна /Лугова/
2 GIVN Ларна
2 SURN Лугова
2 TYPE married
1 NAME Ларна /Мельникова/
2 TYPE birth
1 SEX F
1 FAMS @F0001@
0 @I0004@ INDI
1 NAME Лука /Лугов/
1 SEX M
1 FAMC @F0001@
0 @F0000@ FAM
1 HUSB @I0001@
1 WIFE @I0002@
1 CHIL @I0000@
0 @F0001@ FAM
1 HUSB @I0000@
1 WIFE @I0003@
1 CHIL @I0004@
1 MARR
2 DATE 1955
0 @N0000@ NOTE Длинная заметка
1 CONT вторая строка
1 CONC продолжение
0 @S0000@ SOUR
1 TITL Метрическая книга
0 TRLR
`;

const MYHERITAGE = "﻿" + `0 HEAD
1 SOUR MYHERITAGE
2 NAME MyHeritage Family Tree Builder
2 VERS 8.0.0
2 CORP MyHeritage.com
1 CHAR UTF-8
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 _RTLSAVE RTL
0 @I1@ INDI
1 RIN MH:I1
1 _UID 11AA
1 NAME Ферапонт /Лугов/
1 SEX M
1 BIRT
2 DATE ABT 1930
1 FAMC @F1@
1 FAMS @F2@
1 _UPD 5 NOV 2020 12:00:00 GMT -0500
0 @I2@ INDI
1 NAME Прохор
1 SEX M
1 FAMS @F1@
0 @I3@ INDI
1 NAME Аглая
2 GIVN Аглая
1 SEX F
1 FAMS @F1@
0 @I4@ INDI
1 NAME Ларна /Лугова/
2 _MARNM Лугова
1 SEX F
1 FAMS @F2@
0 @I5@ INDI
1 NAME Лука /Лугов/
1 SEX U
1 FAMC @F2@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
1 _UPD 5 NOV 2020 12:00:00 GMT -0500
0 @F2@ FAM
1 HUSB @I1@
1 WIFE @I4@
1 CHIL @I5@
1 MARR
2 DATE BEF 1960
0 TRLR
`.replace(/\n/g, "\r\n");

const ANCESTRY = `0 HEAD
1 SOUR Ancestry.com Family Trees
2 NAME Ancestry.com Member Trees
2 VERS 2020.1
2 CORP Ancestry.com
1 SUBM @SUBM@
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
1 _TREE Дерево
2 RIN 111111
0 @SUBM@ SUBM
1 NAME Тест
0 @I500000000001@ INDI
1 NAME Ферапонт /Лугов/
2 GIVN Ферапонт
2 SURN Лугов
1 SEX M
1 BIRT
2 DATE Between 1929 and 1931
2 PLAC Вымышленный город
1 _APID 1,7602::1001
1 FAMC @F500000000001@
1 FAMS @F500000000002@
0 @I500000000002@ INDI
1 NAME Прохор //
1 SEX M
1 FAMS @F500000000001@
0 @I500000000003@ INDI
1 NAME Аглая /Лугова/
1 SEX F
1 FAMS @F500000000001@
0 @I500000000004@ INDI
1 NAME Ларна /Лугова/
1 SEX F
1 FAMS @F500000000002@
0 @I500000000005@ INDI
1 NAME Лука /Лугов/
1 SEX M
1 NOTE Очень длинная строка заметки, которую выгрузка режет на части и продолжает
2 CONC  командой CONC без пробела.
1 FAMC @F500000000002@
0 @F500000000001@ FAM
1 HUSB @I500000000002@
1 WIFE @I500000000003@
1 CHIL @I500000000001@
0 @F500000000002@ FAM
1 HUSB @I500000000001@
1 WIFE @I500000000004@
1 CHIL @I500000000005@
0 TRLR
`;

const rod = (id: string, first: string, last: string, over: Partial<RodPerson> = {}): RodPerson => ({ id, name: `${first} ${last}`.trim(), firstName: first, patronymic: "", lastName: last, relation: "Родственник", birthYear: "", maidenName: "", notes: "", fromFile: true, ...over });

for (const [label, text, selfFirst] of [["Gramps", GRAMPS, "Ферапонт"], ["MyHeritage (BOM, CRLF)", MYHERITAGE, "Ферапонт"], ["Ancestry (CONC, _APID, диапазоны дат)", ANCESTRY, "Ферапонт"]] as const) {
  test(`${label}: разбор, первая загрузка, исправление и повторная загрузка`, () => {
    const parsed = parseGedcom(text);
    assert.ok("tree" in parsed, `файл не разобран: ${JSON.stringify(parsed)}`);
    const selfId = parsed.tree.people.find((p) => p.firstName === selfFirst)?.id ?? "";
    const list = gedToPeople(parsed.tree, selfId);
    assert.equal(list.length, 5, "все пять человек прочитаны");
    const child = list.find((p) => p.firstName === selfFirst)!;
    assert.equal(child.parentKeys.length, 2, "у героя двое родителей из семьи");
    assert.ok(list.find((p) => p.firstName === "Лука")!.parentKeys.length >= 1);
    assert.ok(list.every((p) => p.source), "источник распознан");
    // чтение особенностей формата: имена, пол, супруги, годы, источник
    const byFirst = (f: string) => list.find((p) => p.firstName === f)!;
    assert.equal(byFirst("Аглая").gender, "f", "пол F читается");
    assert.equal(byFirst("Прохор").gender, "m", "пол M читается");
    assert.equal(byFirst("Прохор").lastName, "", "запись без фамилии читается без фамилии, а не как «//»");
    assert.equal(byFirst("Ферапонт").spouseKey, byFirst("Ларна").key, "супруга берётся из семьи");
    assert.ok(byFirst("Лука").parentKeys.includes(byFirst("Ферапонт").key) && byFirst("Лука").parentKeys.includes(byFirst("Ларна").key), "родители ребёнка из семьи");
    if (label.startsWith("Gramps")) assert.equal(byFirst("Ферапонт").birthYear, "03.03.1930", "полная дата 3 MAR 1930");
    if (label.startsWith("MyHeritage")) assert.equal(byFirst("Ферапонт").birthYear, "1930", "приблизительная дата ABT 1930");
    if (label.startsWith("Ancestry")) assert.ok(["1929", "1930", "1931"].includes(byFirst("Ферапонт").birthYear ?? ""), "диапазон дат даёт один из годов");
    assert.match(list[0]!.source ?? "", label.startsWith("Gramps") ? /Gramps/ : label.startsWith("MyHeritage") ? /MYHERITAGE/ : /Ancestry/, "источник совпадает с программой");

    let n = 0;
    const uid = () => `u${n++}`;
    const first = planGedImport([], list, { updateLinks: false, uid });
    assert.ok(first.ok);
    // повторная загрузка того же файла ничего не добавляет
    const again = planGedImport(first.people, list, { updateLinks: false, uid });
    assert.ok(again.ok);
    assert.equal(again.added, 0);
    assert.equal(planRepair(first.people, list).changes.filter((c) => c.selected).length, 0, "после чистой загрузки исправлять нечего");

    // старый дефект: безымянный по фамилии родитель продублирован копией без номера, ребёнок смотрит на копию
    const dad = first.people.find((p) => p.firstName === "Прохор")!;
    const mom = first.people.find((p) => p.firstName === "Аглая")!;
    const kid = first.people.find((p) => p.firstName === selfFirst)!;
    const ghost = rod("ghost", "Прохор", "", { gender: "m", spouse: mom.id });
    const broken = first.people.map((p) => (p.id === kid.id ? { ...p, parents: [ghost.id, mom.id] } : p)).concat(ghost);
    assert.equal(remainingParentMismatches(broken, list).length, 1);
    const plan = planRepair(broken, list);
    const done = applyRepair(broken, plan.changes);
    assert.deepEqual(done.people.find((p) => p.id === kid.id)!.parents, [dad.id, mom.id]);
    assert.equal(done.people.length, broken.length);
    assert.equal(remainingParentMismatches(done.people, list).length, 0);
    assert.deepEqual(revertRepair(done.people, done.journal).people, broken);
    const reimport = planGedImport(done.people, list, { updateLinks: false, uid });
    assert.ok(reimport.ok);
    assert.equal(reimport.added, 0, "после исправления повторная загрузка не плодит копий");
  });
}

// ---------- Большое дерево ----------
test("дерево от 1000 человек: время плана, корректность, идемпотентность, отмена", () => {
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const N = 1500;
  const lines: string[] = [];
  const parentsOf: Record<number, [number, number]> = {};
  const couples: [number, number, number[]][] = [];
  // поколениями: пары, у каждой 0–4 детей; половина людей без фамилии
  let next = 0;
  const gender = (i: number) => (i % 2 ? "F" : "M");
  const mk = () => next++;
  const pool: number[] = [];
  while (next < N) {
    const h = pool.length > 1 ? pool.splice(Math.floor(rnd() * pool.length), 1)[0]! : mk();
    const w = mk();
    const kids = Array.from({ length: Math.floor(rnd() * 5) }, () => mk());
    couples.push([h, w, kids]);
    for (const k of kids) parentsOf[k] = [h, w];
    pool.push(...kids);
  }
  for (let i = 0; i < next; i++) lines.push(`0 @I${i}@ INDI\n1 NAME Имя${i % 40} /${rnd() < 0.5 ? "" : "Фам" + (i % 25)}/\n1 SEX ${gender(i)}\n1 BIRT\n2 DATE ${1800 + (i % 200)}\n`);
  couples.forEach(([h, w, kids], i) => lines.push(`0 @F${i}@ FAM\n1 HUSB @I${h}@\n1 WIFE @I${w}@\n${kids.map((k) => `1 CHIL @I${k}@\n`).join("")}`));
  const parsed = parseGedcom(`0 HEAD\n1 SOUR FAMYTALE\n2 NAME FamyTale\n${lines.join("")}0 TRLR\n`);
  assert.ok("tree" in parsed);
  const list = gedToPeople(parsed.tree, parsed.tree.people[0]!.id);
  assert.ok(list.length >= 1000, `людей в файле: ${list.length}`);
  let n = 0;
  const uid = () => `u${n++}`;
  const t0 = performance.now();
  const first = planGedImport([], list, { updateLinks: false, uid });
  const tFirst = performance.now() - t0;
  assert.ok(first.ok);
  // дефект: у каждого пятого безымянного по фамилии родителя есть копия без номера, на неё переставлены связи детей
  let people: RodPerson[] = [...first.people];
  let ghosts = 0;
  for (const p of first.people) {
    if (p.lastName || rnd() > 0.2) continue;
    const g = rod(`g${p.id}`, p.firstName ?? "", "", { gender: p.gender, spouse: p.spouse });
    people = people.map((q) => ((q.parents ?? []).includes(p.id) ? { ...q, parents: q.parents!.map((x) => (x === p.id ? g.id : x)) } : q));
    people.push(g);
    ghosts++;
  }
  const original = structuredClone(people);
  const t1 = performance.now();
  const plan = planRepair(people, list);
  const tPlan = performance.now() - t1;
  const okIds = new Set(plan.verdicts.filter((v) => v.confidence === "high" || v.confidence === "restore").map((v) => v.id));
  for (const c of plan.changes.filter((x) => x.selected)) assert.ok(okIds.has(c.op.type === "replaceParent" || c.op.type === "replaceSpouse" || c.op.type === "replaceMoreSpouse" ? c.op.from : c.personId) || c.kind === "parent-nameless" || c.kind === "parent-restored", `включено без высокой уверенности: ${c.kind}`);
  const t2 = performance.now();
  const done = applyRepair(people, plan.changes);
  const tApply = performance.now() - t2;
  const t3 = performance.now();
  const re = planGedImport(done.people, list, { updateLinks: false, uid });
  const tRe = performance.now() - t3;
  assert.ok(re.ok);
  console.log(`  [1000+] людей ${list.length}, копий ${ghosts}, план ${tPlan.toFixed(0)} мс, применение ${tApply.toFixed(0)} мс, первая загрузка ${tFirst.toFixed(0)} мс, повторная ${tRe.toFixed(0)} мс, исправлений ${done.applied}`);
  assert.equal(done.people.length, original.length);
  assert.equal(re.added, 0);
  assert.equal(planRepair(done.people, list).changes.filter((c) => c.selected).length, 0);
  assert.deepEqual(revertRepair(done.people, done.journal).people, original);
  assert.ok(tPlan < 5000 && tFirst < 5000 && tRe < 5000, "каждая операция быстрее 5 с");
});
