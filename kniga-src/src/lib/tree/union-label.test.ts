// Этап 3в: подпись «ОБЩИЙ РЕБЁНОК» у пары со статусом coparents (синтетические люди). Раскладка карточек не меняется.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Person as RodPerson } from "../rod/types.ts";
import { treeFromPeople } from "./from-people.ts";
import { layoutBoheme } from "./boheme.ts";
import { layoutCameo } from "./cameo.ts";
import { layoutGzhel } from "./gzhel.ts";
import { layoutTaiga } from "./taiga.ts";
import { layoutPoster } from "./poster.ts";
import { buildLayout } from "./layout-engine.ts";
import { pillSize } from "./scheme-paths.ts";
import { COPARENTS_WORD, markLines, twoLineWord, unionWord, unionWordLower } from "./union-label.ts";
import type { TreeData, Union, UnionStatus } from "./types.ts";

type P = RodPerson;
const p = (id: string, gender: "m" | "f", extra: Partial<P> = {}): P => ({ id, name: id, firstName: id, lastName: "", relation: "", birthYear: "", maidenName: "", notes: "", gender, fromFile: true, ...extra }) as P;

/** Мария и Дмитрий: общий ребёнок без брака; Анна и Иван: женаты, ребёнок без отметки. */
const people = (): P[] => [
  p("М", "f"), p("Д", "m"), p("К", "m", { parents: ["М", "Д"], parentsUnmarried: true }),
  p("А", "f", { spouse: "И" }), p("И", "m"), p("Р", "f", { parents: ["А", "И"] }),
];
const tree = (): TreeData => treeFromPeople(people());
const pairOf = (t: TreeData, a: string, b: string) => t.unions.find((u) => u.partnerIds.includes(a) && u.partnerIds.includes(b))!;
/** Те же люди и те же связи, но у пары Марии и Дмитрия статус «брак»: сравниваем, что менялась только подпись. */
const asMarried = (t: TreeData): TreeData => ({ ...t, unions: t.unions.map((u) => (u.status === "coparents" ? ({ ...u, status: "married" } as Union) : u)) });
const xy = (nodes: { id: string; x: number; y: number }[]) => JSON.stringify(nodes.map((n) => [n.id, n.x, n.y]).sort());

test("12а. единственный источник: слово «ОБЩИЙ РЕБЁНОК» даёт только статус coparents", () => {
  const t = tree();
  assert.equal(pairOf(t, "М", "Д").status, "coparents");
  assert.equal(pairOf(t, "А", "И").status, "married");
  assert.equal(unionWord("coparents"), COPARENTS_WORD);
  assert.equal(unionWordLower("coparents"), "общий ребёнок");
  for (const s of ["married", "divorced", "widowed", "partner"] as UnionStatus[]) assert.notEqual(unionWord(s), COPARENTS_WORD, s);
});

test("12б. слова прежних статусов не изменились", () => {
  const was = (s: string) => (s === "divorced" ? "РАЗВОД" : s === "widowed" ? "ВДОВСТВО" : s === "partner" ? "СОЮЗ" : "БРАК");
  const wasLower = (s: string) => (s === "divorced" ? "развод" : s === "widowed" ? "вдов." : s === "partner" ? "союз" : "брак");
  for (const s of ["married", "divorced", "widowed", "partner"]) {
    assert.equal(unionWord(s as UnionStatus), was(s), s);
    assert.equal(unionWordLower(s), wasLower(s), s);
  }
});

test("12в. экран «Схема»: у пары coparents плашка под длинное слово (106: помещается между портретами пары), у остальных размеры прежние", () => {
  assert.equal(pillSize("coparents").w, 106);
  assert.equal(pillSize("coparents", true).w, 114);
  assert.deepEqual(pillSize("married"), { w: 72, h: 24 });
  assert.deepEqual(pillSize("divorced"), { w: 88, h: 24 });
  assert.deepEqual(pillSize("widowed"), { w: 112, h: 24 });
  assert.deepEqual(pillSize("partner"), { w: 72, h: 24 });
});

test("12г. «Схема»: карточки и положение плашки те же, что у такой же пары в браке; статус пары виден в раскладке", () => {
  const t = tree();
  const co = buildLayout(t.people, t.unions, t.focusId);
  const married = buildLayout(t.people, asMarried(t).unions, t.focusId);
  assert.equal(xy(co.nodes), xy(married.nodes), "координаты карточек не изменились");
  const statusOf = (L: typeof co) => L.spouses.map((s) => [s.unionId, s.status]).sort();
  assert.ok(statusOf(co).some(([, s]) => s === "coparents"));
  const pos = (L: typeof co) => JSON.stringify(L.spouses.map((s) => [s.unionId, s.x1, s.y1, s.x2, s.y2, s.curved ?? false]).sort());
  assert.equal(pos(co), pos(married), "линии пар не сдвинулись");
});

test("12д. четыре печатных вида: подпись «общий ребёнок», у брака «брак», карточки на тех же местах", () => {
  const t = tree();
  const m = asMarried(t);
  const layouts = [
    ["Boheme", layoutBoheme], ["Cameo", layoutCameo], ["Gzhel", layoutGzhel], ["Taiga", layoutTaiga],
  ] as const;
  for (const [name, fn] of layouts) {
    const co = fn(t.people, t.unions, t.focusId);
    const mar = fn(t.people, m.unions, t.focusId);
    const texts = co.marks.map((x) => x.text).sort();
    const want = name === "Gzhel" ? "общий\nребёнок" : "общий ребёнок"; // у «Гжели» подпись в две строки: между рамками тесно
    assert.ok(texts.includes(want), `${name}: нет подписи`);
    assert.ok(texts.includes("брак"), `${name}: у настоящего брака слово прежнее`);
    assert.equal(co.marks.filter((x) => x.text === want).length, 1, name);
    assert.equal(mar.marks.some((x) => x.text.includes("общий")), false, name);
    assert.equal(xy(co.nodes), xy(mar.nodes), `${name}: координаты карточек`);
    assert.equal(JSON.stringify(co.vines), JSON.stringify(mar.vines), `${name}: линии`);
    assert.equal(JSON.stringify(co.marks.map((x) => [x.x, x.y]).sort()), JSON.stringify(mar.marks.map((x) => [x.x, x.y]).sort()), `${name}: места подписей`);
  }
});

test("12е. «Афиша»: у coparents подпись вместо колец, у брака кольца; карточки на тех же местах", () => {
  const t = tree();
  const co = layoutPoster(t.people, t.unions, t.focusId);
  const mar = layoutPoster(t.people, asMarried(t).unions, t.focusId);
  assert.deepEqual(co.labels.map((l) => l.text), [COPARENTS_WORD]);
  // Как в приложении: карточки поставлены вплотную по раскладке «Схемы» (зазора для линии и колец нет), подпись всё равно есть.
  const L = buildLayout(t.people, t.unions, t.focusId);
  const anchor = new Map(L.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  const tight = layoutPoster(t.people, t.unions, t.focusId, "down", anchor);
  assert.equal(tight.labels.length, 1, "и без зазора между карточками подпись остаётся");
  assert.equal(co.rings.length, mar.rings.length - 1, "колец на одно меньше: у пары без брака их нет");
  assert.equal(mar.labels.length, 0);
  assert.equal(xy(co.nodes), xy(mar.nodes), "координаты карточек");
  assert.equal(JSON.stringify(co.links), JSON.stringify(mar.links), "линии");
  const a = co.nodes.find((n) => n.id === "М")!;
  const b = co.nodes.find((n) => n.id === "Д")!;
  assert.equal(co.labels[0]!.x, (a.x + b.x) / 2, "подпись по середине между карточками пары");
  assert.ok(co.labels[0]!.y < a.y - co.cardH / 2, "при «Сверху вниз» плашка над парой");
  const up = layoutPoster(t.people, t.unions, t.focusId, "up");
  const au = up.nodes.find((n) => n.id === "М")!;
  assert.ok(up.labels[0]!.y > au.y + up.cardH / 2, "при «Снизу вверх» плашка под парой");
});

test("12ж. книга без «общего ребёнка» рисуется как раньше: ни одной новой подписи", () => {
  for (const name of ["diag-1029-anon.json", "diag-1101-anon.json"]) {
    const ppl = (JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as { people: P[] }).people;
    const t = treeFromPeople(ppl);
    assert.ok(t.unions.every((u) => u.status !== "coparents"), name);
    const poster = layoutPoster(t.people, t.unions, t.focusId);
    assert.equal(poster.labels.length, 0, name);
    for (const fn of [layoutBoheme, layoutCameo, layoutGzhel, layoutTaiga]) assert.equal(fn(t.people, t.unions, t.focusId).marks.some((x) => x.text.includes("общий")), false, name);
    for (const fn of [layoutBoheme, layoutCameo, layoutGzhel, layoutTaiga]) assert.equal(fn(t.people, t.unions, t.focusId).marks.some((x) => x.text.includes("пара")), false, `${name}: слова «пара» у обычных пар нет`);
  }
});

test("12з. пара превращается в брак через явное поле: подпись «общий ребёнок» пропадает", () => {
  const married = people().map((x) => (x.id === "М" ? { ...x, spouse: "Д" } : x));
  const t = treeFromPeople(married);
  assert.equal(pairOf(t, "М", "Д").status, "married");
  assert.equal(layoutPoster(t.people, t.unions, t.focusId).labels.length, 0);
});

/** Дерево, где у первой пары (Мария и Дмитрий) задан нужный статус, у второй (Анна и Иван) остаётся брак. */
const withStatus = (status: string): TreeData => {
  const t = tree();
  return { ...t, unions: t.unions.map((u) => (u.partnerIds.includes("М") && u.partnerIds.includes("Д") ? ({ ...u, status } as Union) : u)) };
};
const STATUS_WORDS: [string, string, string][] = [
  ["married", "БРАК", "брак"],
  ["divorced", "РАЗВОД", "развод"],
  ["widowed", "ВДОВСТВО", "вдов."],
  ["partner", "СОЮЗ", "союз"],
  ["coparents", "ОБЩИЙ РЕБЁНОК", "общий ребёнок"],
];

test("13а. все поддерживаемые статусы: слово на плашке и строчное слово верные", () => {
  for (const [status, upper, lower] of STATUS_WORDS) {
    assert.equal(unionWord(status as UnionStatus), upper, status);
    assert.equal(unionWordLower(status), lower, status);
  }
});

test("13б. незнакомый статус не превращается в «БРАК»: нейтральное «ПАРА»", () => {
  for (const weird of ["", "что-то-ещё", "MARRIED", "unknown", "civil"]) {
    assert.equal(unionWord(weird as UnionStatus), "ПАРА", weird);
    assert.equal(unionWordLower(weird), "пара", weird);
    assert.notEqual(unionWord(weird as UnionStatus), "БРАК", weird);
    assert.notEqual(unionWordLower(weird), "брак", weird);
  }
  assert.equal(unionWord("married"), "БРАК", "настоящий брак по-прежнему «БРАК»");
});

test("13в. печатные темы: у каждого статуса на паре верная подпись, у второй пары (брак) остаётся «брак»", () => {
  const themes = [["Boheme", layoutBoheme], ["Cameo", layoutCameo], ["Gzhel", layoutGzhel], ["Taiga", layoutTaiga]] as const;
  for (const [status, , lower] of STATUS_WORDS) {
    for (const [name, fn] of themes) {
      const t = withStatus(status);
      const texts = fn(t.people, t.unions, t.focusId).marks.map((x) => x.text);
      const expected = name === "Gzhel" ? twoLineWord(lower) : lower;
      assert.ok(texts.includes(expected), `${name}/${status}: нет «${expected}»`);
      assert.ok(texts.includes("брак"), `${name}/${status}: у второй пары «брак»`);
    }
  }
  for (const weird of ["что-то-ещё", ""]) {
    for (const [name, fn] of themes) {
      const t = withStatus(weird);
      const texts = fn(t.people, t.unions, t.focusId).marks.map((x) => x.text);
      assert.ok(texts.includes("пара"), `${name}/${weird}: нужно «пара»`);
      assert.equal(texts.filter((x) => x === "брак").length, 1, `${name}/${weird}: «брак» только у настоящего брака`);
    }
  }
});

test("13г. «Схема»: у каждого статуса пара в раскладке с тем же статусом, слово берётся из union-label", () => {
  for (const [status, upper] of STATUS_WORDS) {
    const t = withStatus(status);
    const L = buildLayout(t.people, t.unions, t.focusId);
    const pair = L.spouses.find((s) => s.status === status);
    assert.ok(pair, status);
    assert.equal(unionWord(pair!.status), upper);
  }
});

test("13д. «Афиша»: подпись только у coparents, у остальных статусов и у незнакомого её нет", () => {
  for (const [status] of STATUS_WORDS) {
    const t = withStatus(status);
    const P = layoutPoster(t.people, t.unions, t.focusId);
    assert.equal(P.labels.length, status === "coparents" ? 1 : 0, status);
  }
  const t = withStatus("что-то-ещё");
  assert.equal(layoutPoster(t.people, t.unions, t.focusId).labels.length, 0);
});

test("13е. две строки только у «общего ребёнка» и только в «Гжели»; остальные слова в одну строку", () => {
  assert.deepEqual(markLines(twoLineWord("общий ребёнок")), ["общий", "ребёнок"]);
  for (const w of ["брак", "развод", "вдов.", "союз", "пара"]) assert.deepEqual(markLines(twoLineWord(w)), [w], w);
  const t = tree();
  const L = buildLayout(t.people, t.unions, t.focusId, "down", { engine: "family", ownerId: "М" });
  const g = layoutGzhel(t.people, t.unions, t.focusId, "down", undefined, L);
  assert.ok(g.marks.some((x) => x.text === "общий\nребёнок"), "Гжель в раскладке «пара в центре»: две строки");
  for (const fn of [layoutBoheme, layoutCameo, layoutTaiga]) {
    const o = fn(t.people, t.unions, t.focusId, "down", undefined, L);
    assert.ok(o.marks.some((x) => x.text === "общий ребёнок"), "в других темах одна строка");
    assert.equal(o.marks.some((x) => x.text.includes("\n")), false);
  }
  const cards = (m: { nodes: { id: string; x: number; y: number }[] }) => xy(m.nodes);
  const plain = layoutGzhel(t.people, asMarried(t).unions, t.focusId, "down", undefined, L);
  assert.equal(cards(g), cards(plain), "две строки не двигают карточки");
});
