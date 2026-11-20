// Этап 2 «отношения»: правила и подписи на синтетических деревьях (вымышленные роли, без имён). Проверяем в обе стороны.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Person as RodPerson } from "../rod/types.ts";
import { kinship } from "./kinship.ts";
import { treeFromPeople } from "./from-people.ts";
import { buildRelIndex, relationFacts, relationLabel, type RelFact } from "./relation-rules.ts";

type P = RodPerson;
const p = (id: string, gender: "m" | "f", extra: Partial<P> = {}): P => ({ id, name: id, relation: "", birthYear: "", maidenName: "", notes: "", gender, fromFile: true, ...extra }) as P;
const ix = (people: P[]) => buildRelIndex(people);
const titles = (people: P[], a: string, b: string, splitHalf = false, layer?: string) => relationFacts(ix(people), a, b, { splitHalf }).filter((f) => !layer || f.layer === layer).map((f) => f.title);

/** Каждое основание в одну сторону имеет парное в обратную: проверка «туда и обратно» для всех пар дерева. */
const MIRROR: Record<string, string> = {
  "adoptive-ancestor": "adopted-descendant", "adopted-descendant": "adoptive-ancestor", "step-parent": "step-child", "step-child": "step-parent",
  "step-sibling": "step-sibling", "adoption-sibling": "adoption-sibling", guardian: "ward", ward: "guardian", "foster-parent": "foster-child", "foster-child": "foster-parent",
  "raised-together": "raised-together", "full-sibling": "full-sibling", "uterine-sibling": "uterine-sibling", "consanguine-sibling": "consanguine-sibling", "half-sibling": "half-sibling", "sibling-unknown-fullness": "sibling-unknown-fullness",
};
function checkBothWays(people: P[], splitHalf = true) {
  const index = ix(people);
  const kinds = (a: string, b: string) => relationFacts(index, a, b, { splitHalf }).map((f: RelFact) => f.kind);
  for (const a of people) for (const b of people) {
    if (a.id === b.id) continue;
    for (const k of kinds(a.id, b.id)) {
      const m = MIRROR[k];
      if (m) assert.ok(kinds(b.id, a.id).includes(m), `${a.id} > ${b.id}: «${k}» без парного «${m}» в обратную сторону`);
    }
  }
}

test("полнородные: прежние слова с возрастом, в обе стороны", () => {
  const t = [p("М", "f"), p("О", "m"), p("Б", "m", { parents: ["М", "О"], birthYear: "1980" }), p("С", "f", { parents: ["М", "О"], birthYear: "1985" })];
  assert.deepEqual(titles(t, "С", "Б"), ["Старший брат"]);
  assert.deepEqual(titles(t, "Б", "С"), ["Младшая сестра"]);
  checkBothWays(t);
});

test("единоутробные, единокровные, сводные слова: «по матери», «по отцу» при включённой настройке, прежнее «сводный» при выключенной", () => {
  const t = [
    p("М", "f"), p("О1", "m"), p("О2", "m"), p("М2", "f"),
    p("А", "m", { parents: ["М", "О1"], birthYear: "1970" }), p("Б", "f", { parents: ["М", "О2"], birthYear: "1975" }), // общая мать
    p("В", "m", { parents: ["М2", "О1"], birthYear: "1978" }), // с А общий отец
  ];
  assert.deepEqual(titles(t, "А", "Б", true), ["Младшая сестра по матери"]);
  assert.deepEqual(titles(t, "Б", "А", true), ["Старший брат по матери"]);
  assert.deepEqual(titles(t, "А", "В", true), ["Младший брат по отцу"]);
  assert.deepEqual(titles(t, "В", "А", true), ["Старший брат по отцу"]);
  // настройка выключена: ровно прежние подписи книги (kinship.ts), в обе стороны
  const tree = treeFromPeople(t);
  for (const [a, b] of [["А", "Б"], ["Б", "А"], ["А", "В"], ["В", "А"]] as const) assert.deepEqual(titles(t, a, b, false), [kinship(tree.people, tree.unions, a, b).title]);
  checkBothWays(t);
});

test("неизвестен второй родитель: «брат или сестра» без выдуманного уточнения и пометка", () => {
  const t = [p("М", "f"), p("О", "m"), p("А", "m", { parents: ["М"], birthYear: "1970" }), p("Б", "f", { parents: ["М", "О"], birthYear: "1975" })];
  const f = relationFacts(ix(t), "А", "Б", { splitHalf: true });
  assert.equal(f[0]?.kind, "sibling-unknown-fullness");
  assert.equal(f[0]?.title, "Младшая сестра");
  assert.equal(f[0]?.ambiguous, true);
});

test("отчим и пасынок: партнёр матери не становится отцом, в обе стороны", () => {
  const t = [p("М", "f", { spouse: "Х" }), p("Х", "m", { spouse: "М" }), p("О1", "m"), p("С", "m", { parents: ["М", "О1"], birthYear: "1990" })];
  assert.deepEqual(titles(t, "С", "Х"), ["Отчим"]);
  assert.deepEqual(titles(t, "Х", "С"), ["Пасынок"]);
  assert.deepEqual(titles(t, "С", "О1"), ["Отец"], "родной отец прежний");
  assert.equal(relationFacts(ix(t), "С", "Х").some((f) => f.layer === "blood"), false, "отчим не кровный");
  checkBothWays(t);
});

test("мачеха и падчерица; развод даёт «бывший»; союз до рождения ребёнка ему никем не приходится", () => {
  const t = [p("О", "m", { spouse: "Ж" }), p("Ж", "f", { spouse: "О" }), p("М1", "f"), p("Д", "f", { parents: ["О", "М1"], birthYear: "1990" })];
  assert.deepEqual(titles(t, "Д", "Ж"), ["Мачеха"]);
  assert.deepEqual(titles(t, "Ж", "Д"), ["Падчерица"]);
  const div = [p("О", "m", { spouse: "Ж", spouseStatus: "divorced", unionTo: "2000" }), p("Ж", "f"), p("М1", "f"), p("Д", "f", { parents: ["О", "М1"], birthYear: "1990" })];
  assert.deepEqual(titles(div, "Д", "Ж"), ["Бывшая мачеха"]);
  assert.deepEqual(titles(div, "Ж", "Д"), ["Бывшая падчерица"]);
  const early = [p("О", "m", { spouse: "Ж", spouseStatus: "divorced", unionTo: "1985" }), p("Ж", "f"), p("М1", "f"), p("Д", "f", { parents: ["О", "М1"], birthYear: "1990" })];
  assert.deepEqual(titles(early, "Д", "Ж"), [], "расстались до рождения ребёнка: связи нет");
});

test("общий ребёнок не делает брак: человек без записи партнёра не отчим", () => {
  const t = [p("М", "f"), p("О1", "m"), p("Р", "m"), p("С", "m", { parents: ["М", "О1"], birthYear: "1990" }), p("К", "f", { parents: ["М", "Р"], birthYear: "1995" })];
  assert.deepEqual(titles(t, "С", "Р"), [], "Р только отец сводного по матери ребёнка, партнёром М не записан");
  assert.deepEqual(titles(t, "К", "С", true), ["Старший брат по матери"]);
});

test("сводные братья и сёстры: общих родителей нет, родители в паре; в обе стороны", () => {
  const t = [p("П1", "m", { spouse: "П2" }), p("П2", "f", { spouse: "П1" }), p("Q1", "f"), p("Q2", "m"), p("К1", "f", { parents: ["П1", "Q1"], birthYear: "1990" }), p("К2", "m", { parents: ["П2", "Q2"], birthYear: "1992" })];
  assert.deepEqual(titles(t, "К1", "К2"), ["Сводный брат"]);
  assert.deepEqual(titles(t, "К2", "К1"), ["Сводная сестра"]);
  assert.deepEqual(titles(t, "К1", "П2"), ["Мачеха"]);
  assert.deepEqual(titles(t, "К2", "П1"), ["Отчим"]);
  checkBothWays(t);
});

test("повторные браки: у каждого из троих свой тип родства, ничего не потеряно", () => {
  // Отец Ф: первая жена В1 (развод) и сын А; вторая жена В2 (брак) со своей дочерью Д от другого отца Х; у Ф и В2 общий сын Е.
  const t = [
    p("Ф", "m", { spouse: "В2", moreSpouses: [{ id: "В1", status: "divorced" }] }), p("В1", "f"), p("В2", "f", { spouse: "Ф" }), p("Х", "m"),
    p("А", "m", { parents: ["Ф", "В1"], birthYear: "1970" }), p("Д", "f", { parents: ["В2", "Х"], birthYear: "1975" }), p("Е", "m", { parents: ["Ф", "В2"], birthYear: "1980" }),
  ];
  assert.deepEqual(titles(t, "А", "Е", true), ["Младший брат по отцу"]);
  assert.deepEqual(titles(t, "Е", "А", true), ["Старший брат по отцу"]);
  assert.deepEqual(titles(t, "Д", "Е", true), ["Младший брат по матери"]);
  assert.deepEqual(titles(t, "Е", "Д", true), ["Старшая сестра по матери"]);
  assert.deepEqual(titles(t, "А", "Д", true, "family"), ["Сводная сестра"]);
  assert.deepEqual(titles(t, "Д", "А", true, "family"), ["Сводный брат"]);
  assert.deepEqual(titles(t, "А", "В2", true, "family"), ["Мачеха"]);
  assert.deepEqual(titles(t, "Д", "Ф", true, "family"), ["Отчим"]);
  assert.deepEqual(titles(t, "Е", "В1", true, "family"), ["Бывшая мачеха"], "бывшая жена отца, не родившая и не воспитывавшая Е, по правилам «бывшая мачеха»");
  checkBothWays(t);
});

test("усыновление: усыновитель, усыновлённый, родные родители не стёрты; усыновитель не отчим", () => {
  const t = [p("М", "f", { spouse: "Н" }), p("О", "m"), p("Н", "m", { spouse: "М" }), p("К", "m", { parents: ["М", "О"], adoptedBy: [{ id: "Н" }], birthYear: "1990" })];
  assert.deepEqual(titles(t, "К", "Н"), ["Усыновитель"]);
  assert.deepEqual(titles(t, "Н", "К"), ["Усыновлённый сын"]);
  assert.deepEqual(titles(t, "К", "О"), ["Отец"]);
  assert.equal(relationFacts(ix(t), "К", "Н").some((f) => f.kind === "step-parent"), false, "усыновитель не записывается отчимом");
  assert.deepEqual(titles(t, "К", "М"), ["Мать"]);
  checkBothWays(t);
});

test("усыновлён, биологические неизвестны: только усыновитель, в обе стороны", () => {
  const t = [p("А1", "m"), p("А2", "f"), p("К", "f", { adoptedBy: [{ id: "А1" }, { id: "А2" }] })];
  assert.deepEqual(titles(t, "К", "А1"), ["Усыновитель"]);
  assert.deepEqual(titles(t, "К", "А2"), ["Усыновительница"]);
  assert.deepEqual(titles(t, "А2", "К"), ["Усыновлённая дочь"]);
  assert.equal(relationFacts(ix(t), "К", "А1").some((f) => f.layer === "blood"), false);
});

test("усыновление внутри семьи: дядя усыновил племянника; двоюродные стали ещё и братьями по усыновлению; ничего не потеряно", () => {
  const t = [
    p("Д1", "m"), p("Д2", "f"), p("Б", "m", { parents: ["Д1", "Д2"] }), p("У", "m", { parents: ["Д1", "Д2"] }),
    p("Ж", "f"), p("К", "m", { parents: ["Б", "Ж"], adoptedBy: [{ id: "У" }], birthYear: "1990" }), p("Сын", "f", { parents: ["У"], birthYear: "1992" }),
  ];
  assert.deepEqual(titles(t, "К", "У"), ["Дядя", "Усыновитель"]);
  assert.deepEqual(titles(t, "У", "К"), ["Племянник", "Усыновлённый сын"]);
  assert.deepEqual(titles(t, "К", "Сын"), ["Двоюродная сестра", "Младшая сестра по усыновлению"]);
  assert.deepEqual(titles(t, "Сын", "К"), ["Двоюродный брат", "Старший брат по усыновлению"]);
  assert.deepEqual(titles(t, "К", "Б"), ["Отец", "Дядя (по усыновлению)"], "родной отец, а для усыновителя он родной брат: по закону дядя по усыновлению");
  assert.deepEqual(titles(t, "Б", "К"), ["Сын", "Племянник (по усыновлению)"]);
  checkBothWays(t);
});

test("человек одновременно кровный и приёмный родственник: дедушка усыновил внука, отец стал ему братом по усыновлению", () => {
  const t = [p("Дед", "m"), p("Б", "m", { parents: ["Дед"], birthYear: "1960" }), p("Ж", "f"), p("К", "m", { parents: ["Б", "Ж"], adoptedBy: [{ id: "Дед" }], birthYear: "1985" })];
  assert.deepEqual(titles(t, "К", "Дед"), ["Дедушка", "Усыновитель"]);
  assert.deepEqual(titles(t, "Дед", "К"), ["Внук", "Усыновлённый сын"]);
  assert.deepEqual(titles(t, "К", "Б"), ["Отец", "Старший брат по усыновлению"]);
  assert.deepEqual(titles(t, "Б", "К"), ["Сын", "Младший брат по усыновлению"]);
  checkBothWays(t);
});

test("усыновлённый и кровная родня остаются: родной брат и брат по усыновлению у одного человека", () => {
  const t = [
    p("М", "f"), p("О", "m"), p("Рб", "f", { parents: ["М", "О"], birthYear: "1990" }), p("А1", "m"), p("А2", "f"), p("Своя", "m", { parents: ["А1", "А2"], birthYear: "1991" }),
    p("К", "m", { parents: ["М", "О"], adoptedBy: [{ id: "А1" }, { id: "А2" }], birthYear: "1992" }),
  ];
  assert.deepEqual(titles(t, "К", "Рб"), ["Старшая сестра"], "родная сестра (прежняя подпись)");
  assert.deepEqual(titles(t, "К", "Своя"), ["Старший брат по усыновлению"].map((x) => x.replace("брат", "брат")));
  assert.deepEqual(titles(t, "Своя", "К"), ["Младший брат по усыновлению"]);
  checkBothWays(t);
});

test("опека не усыновление и не родство: опекун, подопечный, приёмная семья без усыновления, воспитывались вместе", () => {
  const t = [
    p("Р1", "m"), p("Р2", "f"), p("К", "m", { parents: ["Р1", "Р2"], caredBy: [{ id: "Опек", role: "guardian" }, { id: "Пр", role: "foster" }], birthYear: "2000" }),
    p("Опек", "f"), p("Пр", "m"), p("Л", "f", { caredBy: [{ id: "Опек", role: "guardian" }], birthYear: "2002" }),
  ];
  assert.deepEqual(titles(t, "К", "Опек"), ["Опекун"]);
  assert.deepEqual(titles(t, "Опек", "К"), ["Подопечный"]);
  assert.deepEqual(titles(t, "К", "Пр"), ["Приёмный отец без усыновления"]);
  assert.deepEqual(titles(t, "Пр", "К"), ["Воспитанник приёмной семьи"]);
  assert.deepEqual(titles(t, "К", "Л"), ["Воспитывались вместе под опекой"]);
  assert.deepEqual(titles(t, "Л", "К"), ["Воспитывались вместе под опекой"]);
  for (const f of relationFacts(ix(t), "К", "Опек")) assert.notEqual(f.layer, "adoption", "опека не называется усыновлением");
  assert.equal(relationFacts(ix(t), "К", "Л").some((f) => f.layer === "blood" || f.layer === "adoption"), false, "воспитанники не братья и сёстры");
  checkBothWays(t);
});

test("опекун, он же родная бабушка: оба основания видны", () => {
  const t = [p("Б", "f"), p("Р", "m", { parents: ["Б"] }), p("М", "f"), p("К", "m", { parents: ["Р", "М"], caredBy: [{ id: "Б", role: "guardian" }] })];
  assert.deepEqual(titles(t, "К", "Б"), ["Бабушка", "Опекун"]);
  assert.deepEqual(titles(t, "Б", "К"), ["Внук", "Подопечный"]);
});

test("усыновление и опека одного человека разными людьми не смешиваются", () => {
  const t = [p("А", "m"), p("О", "f"), p("К", "f", { adoptedBy: [{ id: "А" }], caredBy: [{ id: "О", role: "foster" }] })];
  assert.deepEqual(titles(t, "К", "А"), ["Усыновитель"]);
  assert.deepEqual(titles(t, "К", "О"), ["Приёмная мать без усыновления"]);
});

test("двоюродные и дальняя родня без новых связей: ровно прежние подписи", () => {
  const t = [
    p("Д1", "m"), p("Д2", "f"), p("А", "m", { parents: ["Д1", "Д2"] }), p("Б", "m", { parents: ["Д1", "Д2"] }), p("Ж1", "f"), p("Ж2", "f"),
    p("К1", "m", { parents: ["А", "Ж1"], birthYear: "1990" }), p("К2", "f", { parents: ["Б", "Ж2"], birthYear: "1992" }),
  ];
  const tree = treeFromPeople(t);
  const index = ix(t);
  for (const a of t) for (const b of t) if (a.id !== b.id) {
    const bloodTitles = relationFacts(index, a.id, b.id).filter((f) => f.layer === "blood").map((f) => f.title);
    const legacy = kinship(tree.people, tree.unions, a.id, b.id);
    if (["ancestor", "descendant", "collateral", "sibling"].includes(legacy.kind)) assert.deepEqual(bloodTitles, [legacy.title], `${a.id} > ${b.id}`);
    assert.equal(relationFacts(index, a.id, b.id).some((f) => f.layer === "adoption" || f.layer === "care"), false);
  }
  assert.deepEqual(titles(t, "К1", "К2"), ["Двоюродная сестра"]);
  assert.deepEqual(titles(t, "К2", "К1"), ["Двоюродный брат"]);
});

// Старые книги: на двух обезличенных старых книгах (и без новых полей) кровные подписи совпадают с прежними для каждой пары, усыновления и опеки нет.
for (const name of ["diag-1029-anon.json", "diag-1101-anon.json"]) {
  test(`старая книга ${name}: все пары, подписи крови совпадают с прежними, усыновления и опеки нет`, () => {
    const people = (JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as { people: P[] }).people;
    const tree = treeFromPeople(people);
    const index = ix(people);
    let pairs = 0;
    for (const a of people) for (const b of people) {
      if (a.id === b.id) continue;
      pairs += 1;
      const facts = relationFacts(index, a.id, b.id, { splitHalf: false });
      const legacy = kinship(tree.people, tree.unions, a.id, b.id);
      if (["ancestor", "descendant", "collateral", "sibling"].includes(legacy.kind)) assert.equal(facts.find((f) => f.layer === "blood")?.title, legacy.title, `${a.id} > ${b.id}`);
      assert.equal(facts.some((f) => f.layer === "adoption" || f.layer === "care"), false, "в старой книге усыновления и опеки нет");
    }
    assert.ok(pairs > 400);
  });
}

test("relationLabel склеивает основания в одну строку", () => {
  const t = [p("Дед", "m"), p("Б", "m", { parents: ["Дед"] }), p("К", "m", { parents: ["Б"], adoptedBy: [{ id: "Дед" }] })];
  assert.equal(relationLabel(ix(t), "К", "Дед"), "Дедушка · Усыновитель");
});
