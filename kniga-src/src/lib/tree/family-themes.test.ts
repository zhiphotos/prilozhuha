// Этап 4.4: «Камея», «Гжель», «Богема», «Тайга» ставят людей по семейной раскладке: координаты те же (до общего масштаба и сдвига), связи и ссылки на месте.
import assert from "node:assert/strict";
import test from "node:test";
import { buildLayout, type AppLayout } from "./layout-engine.ts";
import { layoutCameo } from "./cameo.ts";
import { layoutGzhel } from "./gzhel.ts";
import { layoutBoheme } from "./boheme.ts";
import { layoutTaiga } from "./taiga.ts";
import { annaPeople, artificial, elizaveta, elizavetaTangled, person, small, union } from "./family-fixtures.ts";
import { treeFromPeople } from "./from-people.ts";
import type { Person, Union } from "./types.ts";

type Sheet = { width: number; height: number; scale: number; scaleY?: number; nodes: { id: string; x: number; y: number }[]; vines: string[]; marks: { text: string }[]; far?: string[]; refs?: { id: string; of: string; x: number; y: number }[]; groups?: { text: string }[] };
const THEMES: [string, (p: Person[], u: Union[], f: string, flow: "down" | "up", a: ReadonlyMap<string, { x: number; y: number }>, fam?: AppLayout) => Sheet][] = [
  ["cameo", layoutCameo], ["gzhel", layoutGzhel], ["boheme", layoutBoheme], ["taiga", layoutTaiga],
];

function cases() {
  const a = treeFromPeople(annaPeople());
  const w = (() => {
    const people: Person[] = [person("ж", "f"), person("м", "m"), person("д", "m")];
    const unions: Union[] = [union("осн", ["ж", "м"], ["д"])];
    for (let i = 0; i < 3; i++) { people.push(person(`г${i}а`, "m"), person(`г${i}б`, "f"), person(`г${i}в`, "m")); unions.push(union(`гu${i}`, [`г${i}а`, `г${i}б`], [`г${i}в`])); }
    for (let i = 0; i < 5; i++) people.push(person(`о${i}`, i % 2 ? "m" : "f"));
    return { people, unions };
  })();
  const out: [string, Person[], Union[], { leftId: string; rightId?: string }][] = [
    ["Анна 288", a.people, a.unions, { leftId: "iaxlcs3v", rightId: "mtg8vg3n" }],
    ["семья на 20", small().people, small().unions, { leftId: "жена", rightId: "муж" }],
    ["искусственная", artificial().people, artificial().unions, { leftId: "жена", rightId: "муж" }],
    ["Елизавета 1", elizaveta().people, elizaveta().unions, { leftId: "сестра1", rightId: "брат1" }],
    ["Елизавета 2", elizavetaTangled().people, elizavetaTangled().unions, { leftId: "сестра1", rightId: "брат1" }],
    ["ветки и одиночки", w.people, w.unions, { leftId: "ж", rightId: "м" }],
  ];
  return out;
}

for (const flow of ["down", "up"] as const) {
  test(`четыре темы повторяют раскладку (flow ${flow}): те же места до масштаба, те же ссылки, линии без NaN`, () => {
    for (const [name, people, unions, pair] of cases()) {
      const fam = buildLayout(people, unions, pair.leftId, flow, { engine: "family", pair }) as AppLayout;
      const anchor = new Map(fam.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
      const minX = Math.min(...fam.nodes.map((n) => n.x)), minY = Math.min(...fam.nodes.map((n) => n.y));
      const sheets = THEMES.map(([t, fn]) => ({ t, s: fn(people, unions, pair.leftId, flow, anchor, fam) }));
      for (const { t, s } of sheets) {
        const tag = `${name} / ${t} / ${flow}`;
        assert.equal(s.nodes.length, people.length, `${tag}: людей столько же`);
        assert.equal(new Set(s.nodes.map((n) => n.id)).size, people.length, `${tag}: каждый один раз`);
        const sx = Math.min(...s.nodes.map((n) => n.x)), sy = Math.min(...s.nodes.map((n) => n.y));
        for (const n of s.nodes) {
          const a = anchor.get(n.id)!;
          assert.ok(Math.abs((n.x - sx) / s.scale - (a.x - minX)) < 1e-6 && Math.abs((n.y - sy) / (s.scaleY ?? s.scale) - (a.y - minY)) < 1e-6, `${tag}: место ${n.id} не то`);
        }
        assert.equal((s.refs ?? []).length, fam.refs.length, `${tag}: ссылки`);
        for (const r of s.refs ?? []) { const f = fam.refs.find((q) => q.id === r.id)!; assert.ok(Math.abs((r.x - sx) / s.scale - (f.x - minX)) < 1e-6, `${tag}: ссылка ${r.id} не там`); }
        assert.ok(s.vines.every((d) => !/NaN|undefined|Infinity/.test(d)) && (s.far ?? []).every((d) => !/NaN|undefined|Infinity/.test(d)), `${tag}: пути без NaN`);
        assert.ok(s.marks.length >= fam.spouses.length - 0 || fam.spouses.length === 0 || s.marks.length > 0, `${tag}: слова брака`);
        assert.equal((s.groups ?? []).map((g) => g.text).join("|"), (fam.groups ?? []).map((g) => g.text).join("|"), `${tag}: подписи групп`);
        if (fam.buses.length) assert.ok(s.vines.length + (s.far?.length ?? 0) > 0, `${tag}: линии детей есть`);
        assert.ok(s.width > 0 && s.height > 0);
      }
      // между темами: одинаковые нормированные координаты
      const norm = (s: Sheet) => { const sx = Math.min(...s.nodes.map((n) => n.x)), sy = Math.min(...s.nodes.map((n) => n.y)); return s.nodes.map((n) => [n.id, Math.round((n.x - sx) / s.scale * 1e6), Math.round((n.y - sy) / (s.scaleY ?? s.scale) * 1e6)] as const).sort(); };
      for (const { t, s } of sheets.slice(1)) assert.deepEqual(norm(s), norm(sheets[0]!.s), `${name}: ${t} совпадает с камеей`);
    }
  });
}

test("focusId не влияет на места в темах; без family темы работают как раньше (поля ссылок не добавляются)", () => {
  const w = cases()[3]!;
  const [, people, unions, pair] = w;
  const fam = buildLayout(people, unions, pair.leftId, "down", { engine: "family", pair }) as AppLayout;
  const anchor = new Map(fam.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  for (const [, fn] of THEMES) {
    const a = fn(people, unions, "сестра1", "down", anchor, fam);
    const b = fn(people, unions, "сын1", "down", anchor, fam);
    assert.deepEqual(a.nodes, b.nodes);
    const plain = fn(people, unions, "сестра1", "down", anchor);
    assert.equal(plain.refs, undefined);
    assert.equal(plain.far, undefined);
  }
});
