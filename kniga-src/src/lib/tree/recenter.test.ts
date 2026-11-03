import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { layoutTree } from "./layout.ts";
import { centerCandidates, relationCard, relationNote, relationsFrom, UNDETERMINED, viewFrom } from "./recenter.ts";
import { treeFromPeople } from "./from-people.ts";
import { MODE_SCOPE, SCOPES, type CenterMode } from "./scope.ts";
import type { Gender, Person, Union } from "./types.ts";

const p = (id: string, gender: Gender = "u", birthYear = ""): Person => ({ id, firstName: id, patronymic: "", lastName: "", gender, birthYear, deathYear: "", photo: "", note: "" });
const u = (id: string, partnerIds: string[], childIds: string[], status: Union["status"] = "married"): Union => ({ id, partnerIds, childIds, status, startYear: "", endYear: "" });

// Вымышленная семья.
// ded+bab -> mom, uncle; mom+dad -> me, sis; mom+dad2 -> halfB (неполнородный); uncle+auntW -> cousin (двоюродный)
// me+wife -> kid -> grandkid; me+ex (в разводе) -> kid2; stranger без связей
const people = [
  p("ded", "m"), p("bab", "f"), p("mom", "f"), p("dad", "m"), p("dad2", "m"), p("uncle", "m"), p("auntW", "f"),
  p("me", "m", "1990"), p("sis", "f", "1992"), p("halfB", "m", "1998"), p("cousin", "m"),
  p("wife", "f"), p("ex", "f"), p("kid", "f"), p("kid2", "m"), p("grandkid", "f"), p("stranger", "u"),
];
const unions = [
  u("u1", ["ded", "bab"], ["mom", "uncle"]),
  u("u2", ["mom", "dad"], ["me", "sis"]),
  u("u3", ["mom", "dad2"], ["halfB"]),
  u("u4", ["uncle", "auntW"], ["cousin"]),
  u("u5", ["me", "wife"], ["kid"]),
  u("u6", ["me", "ex"], ["kid2"], "divorced"),
  u("u7", ["kid"], ["grandkid"]),
];
const rel = (center: string, id: string) => relationsFrom(people, unions, center).get(id)!;

test("центр = любой человек: сам он «Центр», а остальные считаются от него", () => {
  for (const c of people) {
    const all = relationsFrom(people, unions, c.id);
    assert.equal(all.size, people.length);
    assert.equal(all.get(c.id)!.kind, "center");
  }
});

test("предок: от внука к деду и обратно", () => {
  assert.equal(rel("grandkid", "me").title, "Дедушка");
  assert.equal(rel("grandkid", "ded").title, "Прапрадедушка (4)");
  assert.equal(rel("ded", "grandkid").title, "Праправнучка (4)");
  assert.equal(rel("me", "ded").title, "Дедушка");
});

test("потомок: от мамы к ребёнку и внучке", () => {
  assert.equal(rel("mom", "me").title, "Сын");
  assert.equal(rel("mom", "kid").title, "Внучка");
  assert.equal(rel("me", "grandkid").title, "Внучка");
});

test("родной и неполнородный брат или сестра", () => {
  assert.equal(rel("me", "sis").title, "Младшая сестра");
  assert.equal(rel("sis", "me").title, "Старший брат");
  assert.equal(rel("me", "halfB").title, "Младший сводный брат");
  assert.equal(rel("halfB", "sis").title, "Старшая сводная сестра");
});

test("супруг, бывший супруг и несколько браков у одного человека", () => {
  assert.equal(rel("me", "wife").title, "Жена");
  assert.equal(rel("me", "ex").title, "Бывшая жена");
  assert.equal(rel("wife", "me").title, "Муж");
  assert.equal(rel("wife", "kid").title, "Дочь");
  assert.equal(rel("wife", "kid2").kind !== "undetermined", true);
});

test("двоюродный: от центра «двоюродный брат» и обратно, а от двоюродного брата мама центра – тётя", () => {
  assert.equal(rel("me", "cousin").title, "Двоюродный брат");
  assert.equal(rel("cousin", "me").title, "Двоюродный брат");
  assert.equal(rel("cousin", "mom").title, "Тётя");
  assert.equal(rel("cousin", "kid").title.includes("племянник") || rel("cousin", "kid").title.includes("племянница"), true);
});

test("родня по браку считается от нового центра: свёкор и тёща, не придумываются", () => {
  assert.equal(rel("wife", "mom").kind, "inlaw");
  assert.equal(rel("wife", "mom").undetermined, false);
});

test("недостаточно данных: человек без связей и люди без пути не получают придуманного родства", () => {
  assert.equal(rel("me", "stranger").title, UNDETERMINED);
  assert.equal(rel("me", "stranger").undetermined, true);
  assert.equal(rel("stranger", "me").undetermined, true);
  // Мать жены одного супруга и родня другого супруга: связи через две свадьбы не считаются родством.
  assert.equal(rel("ex", "wife").undetermined, true);
  assert.match(relationNote(rel("me", "stranger")), /не хватает связей/);
});

test("несколько общих предков: двойные двоюродные – один титул, два пути, пометка есть", () => {
  const ppl = ["a1", "a2", "b1", "b2", "m1", "m2", "k1", "k2", "x1", "x2"].map((id) => p(id, "u"));
  const un = [
    u("g1", ["a1", "a2"], ["b1", "b2"]), // две семьи с общими «дедами»
    u("g2", ["m1", "m2"], ["s1", "s2"]),
    u("c1", ["b1", "s1"], ["k1"]),
    u("c2", ["b2", "s2"], ["k2"]),
  ];
  const all = [...ppl, p("s1", "f"), p("s2", "f")];
  const r = relationsFrom(all, un, "k1").get("k2")!;
  assert.equal(r.title, "Двоюродный брат");
  assert.equal(r.paths, 2);
  assert.match(relationCard(r), /несколько путей/);
});

test("несколько путей с разными названиями: показывается «также …», порядок один и тот же при каждом запуске", () => {
  // Дядя женился на племяннице: у их ребёнка G – дедушка (через отца) и прадедушка (через мать).
  const ppl = [p("G", "m"), p("F", "m"), p("Mf", "m"), p("M", "f"), p("cc", "u")];
  const un = [u("a", ["G"], ["F", "Mf"]), u("b", ["Mf"], ["M"]), u("c", ["F", "M"], ["cc"])];
  const one = relationsFrom(ppl, un, "cc").get("G")!;
  const two = relationsFrom([...ppl].reverse(), [...un].reverse(), "cc").get("G")!;
  assert.deepEqual(one, two);
  assert.equal(one.paths, 2);
  assert.equal(one.title, "Дедушка");
  assert.deepEqual(one.also, ["Прадедушка"]);
  assert.match(relationNote(one), /Также: Прадедушка/);
});

test("циклы и кривые данные не зависают и не падают", () => {
  const ppl = [p("A"), p("B"), p("C"), p("D")];
  const bad = [u("1", ["A"], ["B"]), u("2", ["B"], ["C"]), u("3", ["C"], ["A"]), u("4", ["D"], ["D"]), u("5", ["A", "A"], ["A"])];
  const started = Date.now();
  for (const c of ppl) {
    relationsFrom(ppl, bad, c.id);
    for (const mode of Object.keys(MODE_SCOPE) as CenterMode[]) viewFrom(ppl, bad, c.id, mode);
    layoutTree(ppl, bad, c.id);
  }
  assert.ok(Date.now() - started < 5000);
});

test("режимы показа от центра", () => {
  const ids = (center: string, mode: CenterMode) => viewFrom(people, unions, center, mode).people.map((x) => x.id).sort();
  assert.deepEqual(ids("mom", "ancestors"), ["bab", "ded", "mom"]);
  assert.deepEqual(ids("mom", "descendants"), ["dad", "dad2", "ex", "grandkid", "halfB", "kid", "kid2", "me", "mom", "sis", "wife"]);
  assert.deepEqual(ids("me", "siblings"), ["dad", "ex", "halfB", "me", "mom", "sis", "wife"]);
  assert.deepEqual(ids("cousin", "direct"), ["auntW", "bab", "cousin", "ded", "uncle"]);
  assert.equal(ids("me", "whole").length, people.length);
  assert.ok(!ids("me", "blood").includes("stranger"));
  assert.ok(!ids("me", "blood").includes("auntW"));
  // Центр всегда в показанном.
  for (const mode of Object.keys(MODE_SCOPE) as CenterMode[]) assert.ok(ids("kid", mode).includes("kid"));
  // Все режимы есть в переключателе.
  for (const s of Object.values(MODE_SCOPE)) assert.ok(SCOPES.some((x) => x.id === s));
});

test("смена центра не меняет данные", () => {
  const before = JSON.stringify({ people, unions });
  for (const c of people) {
    relationsFrom(people, unions, c.id);
    for (const mode of Object.keys(MODE_SCOPE) as CenterMode[]) viewFrom(people, unions, c.id, mode);
    layoutTree(people, unions, c.id);
  }
  assert.equal(JSON.stringify({ people, unions }), before);
});

test("пустые заготовки «Мама»/«Папа» нельзя выбрать центром; список алфавитный и ищется по началу слов", () => {
  const withGhost = [...people, { ...p("__mother_x", "f"), firstName: "Мама" }];
  assert.ok(!centerCandidates(withGhost).some((x) => x.id === "__mother_x"));
  const named = [{ ...p("1"), firstName: "Борис", lastName: "Яров" }, { ...p("2"), firstName: "Анна", lastName: "Агеева" }, { ...p("3"), firstName: "Вера", lastName: "Агеева" }];
  assert.deepEqual(centerCandidates(named).map((x) => x.id), ["2", "3", "1"]);
  assert.deepEqual(centerCandidates(named, "аге ве").map((x) => x.id), ["3"]);
  assert.deepEqual(centerCandidates(named, "яров").map((x) => x.id), ["1"]);
});

const R = (id: string, name: string, relation: string, extra: Record<string, unknown> = {}) => ({ id, name, relation, maidenName: "", notes: "", birthYear: "", ...extra });

test("слово «кем приходится» не влияет на родство от другого центра, когда связи заданы явно", () => {
  const book = (words: Record<string, string>) => [
    R("me", "Я", words.me ?? "я", { gender: "f", parents: ["mom", "dad"] }),
    R("mom", "Мама", words.mom ?? "мама", { gender: "f", parents: ["gm", "gf"] }), R("dad", "Папа", words.dad ?? "папа", { gender: "m" }),
    R("gm", "Бабушка", words.gm ?? "бабушка", { gender: "f", line: "mom" }), R("gf", "Дедушка", words.gf ?? "дедушка", { gender: "m", line: "mom" }),
    R("aunt", "Тётя", words.aunt ?? "тётя", { gender: "f", parents: ["gm", "gf"] }),
    R("cuz", "Двоюродная", words.cuz ?? "двоюродная сестра", { gender: "f", parents: ["aunt"] }),
  ];
  const run = (words: Record<string, string>) => {
    const d = treeFromPeople(book(words) as never);
    const out = relationsFrom(d.people, d.unions, "cuz");
    return [...out.values()].filter((x) => !x.id.startsWith("__")).map((x) => `${x.id}:${x.title}`).sort();
  };
  // Те же связи, но слова «кем приходится» (кроме записи «я») перепутаны: итог от центра «cuz» тот же.
  const same = run({});
  const messy = run({ mom: "знакомая", dad: "друг семьи", gm: "соседка", gf: "коллега", aunt: "родственница", cuz: "приятельница" });
  assert.deepEqual(messy, same);
});

test("на обезличенных файлах: любой центр считается, раскладывается и не меняет данные", () => {
  const dir = new URL("./fixtures/", import.meta.url);
  let checked = 0;
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".json") && !n.startsWith("._"))) {
    const j = JSON.parse(fs.readFileSync(new URL(f, dir), "utf8"));
    const d = treeFromPeople(j.people);
    const snap = JSON.stringify({ people: d.people, unions: d.unions });
    const picks = d.people.filter((x) => !x.id.startsWith("__")).slice(0, 12);
    for (const c of picks) {
      const rels = relationsFrom(d.people, d.unions, c.id);
      assert.equal(rels.get(c.id)!.kind, "center", `${f}`);
      layoutTree(viewFrom(d.people, d.unions, c.id, "blood").people, viewFrom(d.people, d.unions, c.id, "blood").unions, c.id);
      checked += 1;
    }
    assert.equal(JSON.stringify({ people: d.people, unions: d.unions }), snap, `${f}: данные не меняются`);
  }
  assert.ok(checked > 0);
});
