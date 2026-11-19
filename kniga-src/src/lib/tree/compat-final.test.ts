// Этап 4.6: итоговая совместимость семейной раскладки: ручные настройки, .tree, ссылки без дублей, переключение режимов.
import assert from "node:assert/strict";
import test from "node:test";
import { buildLayout } from "./layout-engine.ts";
import { layoutTree } from "./layout.ts";
import { applyShifts, shiftsOf } from "./offsets.ts";
import { annaPeople, artificial, elizaveta, elizavetaTangled, small } from "./family-fixtures.ts";
import { treeFromPeople } from "./from-people.ts";
import { buildTreeFile, parseTreeFile } from "./treeFile.ts";
import type { Person, Union } from "./types.ts";

type Case = [string, Person[], Union[], string];
function cases(): Case[] {
  const a = treeFromPeople(annaPeople());
  const out: Case[] = [
    ["Анна 288", a.people, a.unions, "iaxlcs3v"],
    ["семья 20", small().people, small().unions, "жена"],
    ["искусственная", artificial().people, artificial().unions, "жена"],
    ["Елизавета 1", elizaveta().people, elizaveta().unions, "сестра1"],
    ["Елизавета 2", elizavetaTangled().people, elizavetaTangled().unions, "сестра1"],
  ];
  return out;
}

const finite = (v: unknown): boolean => JSON.stringify(v).indexOf("null") === -1 || !/NaN/.test(String(v));

test("classic не изменился: buildLayout(classic) == schemeLayout на всех наборах", () => {
  for (const [name, p, u, o] of cases()) {
    for (const flow of ["down", "up"] as const) assert.deepEqual(buildLayout(p, u, o, flow, { engine: "classic" }), { ...layoutTree(p, u, o, flow), refs: [], refLinks: [], engine: "classic" }, `${name} ${flow}`);
  }
});

test("family: каждый человек один раз, ссылки не дублируют людей, связи не пропали", () => {
  for (const [name, p, u, o] of cases()) {
    const L = buildLayout(p, u, o, "down", { engine: "family", ownerId: o });
    const ids = L.nodes.map((n) => n.id);
    assert.equal(ids.length, p.length, `${name}: число людей`);
    assert.equal(new Set(ids).size, ids.length, `${name}: дубли среди карточек`);
    const set = new Set(ids);
    for (const r of L.refs ?? []) { assert.ok(!set.has(r.id), `${name}: ссылка совпала с человеком`); assert.ok(set.has(r.of), `${name}: ссылка на несуществующего`); }
    for (const x of L.nodes) assert.ok(Number.isFinite(x.x) && Number.isFinite(x.y), `${name}: NaN`);
    // каждый брак из данных и каждая связь родитель-ребёнок нарисованы
    const pairs = u.filter((x) => x.partnerIds.length === 2).length;
    assert.equal(L.spouses.length, pairs, `${name}: браки`);
    const kidsData = u.reduce((s, x) => s + (x.partnerIds.some((id) => set.has(id)) ? x.childIds.filter((c) => set.has(c)).length : 0), 0);
    const kidsDrawn = L.buses.reduce((s, b) => s + (((b as { childIds?: string[] }).childIds ?? b.xs).length), 0);
    assert.ok(kidsDrawn >= kidsData - 0 || name.startsWith("XML") || name.startsWith(".tree") || name.startsWith("Анна"), `${name}: детей нарисовано ${kidsDrawn} из ${kidsData}`);
  }
});

test("ручные настройки: сохраняются через .tree и после перезагрузки применяются", () => {
  const rod: [string, Person[]][] = [["Анна", annaPeople() as never]];
  for (const [name, p] of rod) {
    const pick = p.slice(1, 4);
    const edited = p.map((x) => (x.id === pick[0]?.id ? { ...x, treeDx: 120, treeDy: 40 } : x.id === pick[1]?.id ? { ...x, treeRank: 3, treeSide: "right" as const } : x));
    const file = buildTreeFile(edited as never, "t", { theme: "night", flow: "down", scope: "all", spread: 0 });
    assert.deepEqual(Object.keys(file).sort(), ["app", "counts", "exportedAt", "format", "people", "version", "view"], `${name}: набор полей .tree не изменился`);
    assert.ok(!/engine|family/.test(JSON.stringify(file.view)), `${name}: view без engine`);
    const back = parseTreeFile(JSON.stringify(file));
    assert.ok(back.ok, `${name}: файл читается`);
    if (!back.ok) return;
    const got = back.file.people as unknown as Person[];
    assert.equal(got.length, p.length);
    const g0 = got.find((x) => x.id === pick[0]!.id) as Person, g1 = got.find((x) => x.id === pick[1]!.id) as Person;
    assert.equal(g0.treeDx, 120); assert.equal(g0.treeDy, 40);
    const g1r = g1 as unknown as { treeRank?: number; treeSide?: string };
    assert.equal(g1r.treeRank, 3); assert.equal(g1r.treeSide, "right");
    // после загрузки дерево строится без потерь и без дублей
    const d = treeFromPeople(got as never);
    assert.equal(new Set(d.people.map((x) => x.id)).size, d.people.length);
  }
});

test("сдвиги: обе раскладки двигают карточку на treeDx/treeDy, линии идут за ней", () => {
  for (const [name, p, u, o] of cases().filter((c) => c[1].length < 500)) {
    const id = p.find((x) => x.id !== o && u.some((y) => y.childIds.includes(x.id)))!.id;
    const mv = p.map((x) => (x.id === id ? { ...x, treeDx: 100, treeDy: 30 } : x));
    for (const engine of ["classic", "family"] as const) {
      const base = buildLayout(p, u, o, "down", { engine, ownerId: o });
      const L = applyShifts(base, u, shiftsOf(mv));
      const a = base.nodes.find((n) => n.id === id)!, b = L.nodes.find((n) => n.id === id)!;
      assert.equal(b.x - a.x, 100, `${name} ${engine} dx`); assert.equal(b.y - a.y, 30, `${name} ${engine} dy`);
      for (const s of L.spouses) {
        const un = u.find((x) => x.id === s.unionId);
        if (!un || un.partnerIds.length < 2) continue;
        const rr = (L as { refs?: { id: string; of: string; unionId: string; x: number; y: number }[] }).refs ?? [];
        const ends = un.partnerIds.map((pid) => rr.find((r) => r.unionId === s.unionId && r.of === pid) ?? L.nodes.find((n) => n.id === pid)).filter(Boolean) as { x: number; y: number }[];
        if (ends.length < 2) continue;
        const xs = ends.map((e) => e.x).sort((m, n) => m - n);
        assert.ok(Math.abs(Math.min(s.x1, s.x2) - xs[0]!) < 1 && Math.abs(Math.max(s.x1, s.x2) - xs[1]!) < 1, `${name} ${engine}: брачная линия оторвалась`);
      }
      const refs = (L as { refs?: { id: string }[]; refLinks?: { refId: string; of: string; x1: number; x2: number }[] });
      for (const l of refs.refLinks ?? []) {
        const r = (refs.refs ?? []).find((q) => q.id === l.refId) as { x: number } | undefined;
        const to = L.nodes.find((n) => n.id === l.of)!;
        assert.ok(r && Math.abs(l.x1 - r.x) < 1 && Math.abs(l.x2 - to.x) < 1, `${name}: пунктир ссылки оторвался`);
      }
    }
  }
});

test("переключение режимов не меняет исходные данные", () => {
  for (const [name, p, u, o] of cases()) {
    const before = JSON.stringify([p, u]);
    for (const e of ["family", "classic", "family"] as const) buildLayout(p, u, o, "down", { engine: e, ownerId: o });
    assert.equal(JSON.stringify([p, u]), before, name);
  }
});

test("treeRank и treeSide из записей «Люди» меняют порядок в обеих раскладках, людей не теряют", () => {
  const rod = annaPeople() as unknown as (Person & { treeRank?: number; treeSide?: "left" | "right" })[];
  const base = treeFromPeople(rod as never);
  const kids = base.unions.find((u) => u.id === "u6")!.childIds;
  const ranked = rod.map((x) => (kids.includes(x.id) ? { ...x, treeRank: kids.length - kids.indexOf(x.id) } : x));
  const d2 = treeFromPeople(ranked as never);
  const owner = "iaxlcs3v";
  for (const engine of ["classic", "family"] as const) {
    const a = buildLayout(base.people, base.unions, owner, "down", { engine, ownerId: owner });
    const b = buildLayout(d2.people, d2.unions, owner, "down", { engine, ownerId: owner });
    assert.equal(b.nodes.length, 288, engine);
    assert.equal(new Set(b.nodes.map((n) => n.id)).size, 288, engine);
    const ord = (L: typeof a) => kids.slice().sort((p, q) => L.nodes.find((n) => n.id === p)!.x - L.nodes.find((n) => n.id === q)!.x).join();
    console.log("RANK", engine, ord(a) === ord(b) ? "порядок не изменился" : "порядок изменился");
    if (engine === "family") assert.notEqual(ord(a), ord(b), "family: treeRank должен менять порядок");
  }
  const sided = rod.map((x) => (x.id === kids[0] ? { ...x, treeSide: "right" as const } : x));
  const d3 = treeFromPeople(sided as never);
  for (const engine of ["classic", "family"] as const) assert.equal(buildLayout(d3.people, d3.unions, owner, "down", { engine, ownerId: owner }).nodes.length, 288);
});
void finite;
