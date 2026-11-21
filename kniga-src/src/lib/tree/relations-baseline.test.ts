// Этап 0 «отношения»: фиксируем, как книга работает СЕЙЧАС, до появления усыновления, опеки и новых подписей.
// 1) «Золотой снимок» трёх обезличенных старых книг: пары, подписи, пунктирные союзы, положение карточек.
//    Все следующие этапы обязаны оставить его без изменений. Обновить снимок можно только осознанно: UPDATE_GOLDEN=1.
// 2) Как сейчас записываются и подписываются 10 семейных ситуаций (relations-fixtures.ts).
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import type { Person as RodPerson } from "../rod/types.ts";
import { annaPeople } from "./family-fixtures.ts";
import { treeFromPeople } from "./from-people.ts";
import { halfUnionIds } from "./half-unions.ts";
import { kinship } from "./kinship.ts";
import { layoutTree } from "./layout.ts";
import { parseGedcom } from "./importTree.ts";
import { situations } from "./relations-fixtures.ts";

const diag = (name: string): RodPerson[] => (JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as { people: RodPerson[] }).people;

const books: Record<string, RodPerson[]> = {
  anna: annaPeople(),
  diag1029: diag("diag-1029-anon.json"),
  diag1101: diag("diag-1101-anon.json"),
};

function snapshot(people: RodPerson[]) {
  const data = treeFromPeople(people);
  const layout = layoutTree(data.people, data.unions, data.focusId);
  return {
    unions: data.unions.map((u) => ({ p: [...u.partnerIds].sort(), c: [...u.childIds].sort(), s: u.status })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    half: [...halfUnionIds(data.unions, data.people)].length,
    titles: Object.fromEntries(data.people.map((p) => [p.id, kinship(data.people, data.unions, data.focusId, p.id).title]).sort(([a], [b]) => String(a).localeCompare(String(b)))),
    nodes: Object.fromEntries(layout.nodes.map((n) => [n.id, [Math.round(n.x), Math.round(n.y)]]).sort(([a], [b]) => String(a).localeCompare(String(b)))),
  };
}

const GOLDEN = new URL("./fixtures/relations/golden-1120.json", import.meta.url);

test("золотой снимок: старые книги не изменились (пары, подписи, положение карточек)", () => {
  const now = Object.fromEntries(Object.entries(books).map(([k, v]) => [k, snapshot(v)]));
  if (process.env.UPDATE_GOLDEN === "1" || !existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, `${JSON.stringify(now, null, 1)}\n`);
    return;
  }
  const before = JSON.parse(readFileSync(GOLDEN, "utf8")) as typeof now;
  for (const key of Object.keys(now)) {
    assert.deepEqual(now[key]!.unions, before[key]!.unions, `${key}: пары и дети`);
    assert.equal(now[key]!.half, before[key]!.half, `${key}: пунктирные союзы`);
    assert.deepEqual(now[key]!.titles, before[key]!.titles, `${key}: подписи`);
    assert.deepEqual(now[key]!.nodes, before[key]!.nodes, `${key}: положение карточек`);
  }
});

// Как сейчас: ничего про усыновление и опеку не знаем, усыновлённый ребёнок это родной, опекун и приёмная семья «Родственник».
const TODAY: Record<string, Record<string, string>> = {
  "s1-stepfather-no-common": { "S>H": "Отчим", "H>S": "Сын супруга", "S>O1": "Отец" },
  "s2-stepfather-common-child": { "S>C": "Сводная сестра", "C>S": "Сводный брат", "S>H": "Отчим", "C>H": "Отец" },
  "s3-child-from-other-man": { "K>H": "Отчим", "K>P": "Отец", "H>K": "Сын супруга" },
  "s4-stepmother": { "A>W2": "Мачеха", "A>E": "Сводная сестра", "E>A": "Сводная сестра", "E>W2": "Мать" },
  "s5-step-siblings": { "K1>K2": "Родственник", "K1>P2": "Мачеха", "K2>P1": "Отчим" },
  "s6-adopted-by-stepfather": { "K>H": "Отчим", "K>F": "Отец" },
  "s7-adopted-bio-unknown": { "K>A1": "Отец", "K>A2": "Мать" },
  "s8-guardian-grandmother": { "K>G": "Бабушка", "K>P": "Отец" },
  "s9-uncle-adopts-nephew": { "K>U": "Дядя", "K>B": "Отец" },
  "s10-foster-family": { "K>R": "Родственник", "K>P": "Отец" },
};

for (const s of situations) {
  test(`сейчас: ${s.id}`, () => {
    const want = TODAY[s.id]!;
    for (const [a, b] of s.pairs) assert.equal(kinship(s.people, s.unions, a, b).title, want[`${a}>${b}`], `${a} > ${b}`);
  });
}

test("образцы согласованы: у каждой ситуации есть ожидание будущих этапов", () => {
  assert.equal(situations.length, 10);
  for (const s of situations) assert.ok(s.later?.expect, s.id);
  assert.equal(new Set(situations.map((s) => s.id)).size, situations.length);
});

// GEDCOM: строение по реальным файлам (человек с двумя FAMC, ADOP с HUSB, PEDI «Adopted» с заглавной), имена вымышленные.
// Сегодня импорт не читает PEDI, ADOP, _FREL, _MREL: все дети записываются родными, ребёнок из двух семей попадает в обе семьи без пометки вида связи
// (позже при сборке книги из списка людей он остаётся только в одном союзе).
test("GEDCOM сейчас: усыновление и опека не распознаются, все дети родные", () => {
  const text = readFileSync(new URL("./fixtures/relations/ged-adoption-1120.ged", import.meta.url), "utf8");
  const r = parseGedcom(text);
  assert.ok("tree" in r);
  const { people, unions } = r.tree;
  const idOf = (first: string) => people.find((p) => p.firstName.startsWith(first))!.id;
  const owner = (child: string) => unions.filter((u) => u.childIds.includes(child));
  // Ребёнок, указанный в двух семьях, записан в обеих как обычный; какая семья родная, а какая усыновляющая, данные не хранят.
  const adopted = idOf("Ребёнок");
  assert.equal(owner(adopted).length, 2, "ребёнок записан в обеих семьях");
  assert.ok(unions.every((u) => !("kind" in u) && !("adopted" in u)));
  // Приёмный (foster), запечатанный (sealing) и с _FREL: сегодня обычные дети второй семьи.
  for (const first of ["Воспитанник", "Дочь /Запечатанная/".split(" ")[0]!, "Сын"]) assert.ok(people.some((p) => p.firstName.startsWith(first)));
  const second = unions.find((u) => u.partnerIds.some((id) => people.find((p) => p.id === id)?.firstName.startsWith("Усыновитель")))!;
  assert.equal(second.childIds.length, 4, "усыновлённый, foster, sealing и _FREL записаны обычными детьми");
  // Новых полей (усыновители, опека) в данных нет.
  assert.ok(people.every((p) => !("adoptedBy" in p) && !("caredBy" in p)));
});
