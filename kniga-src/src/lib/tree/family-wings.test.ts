// Крылья семейной раскладки: родня женщины и родня мужа не перемешиваются, даже при вторых браках предков и нехватке места.
// Деревья синтетические (family-wings-fixtures.ts), настоящих имён и данных нет.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { layoutFamily, wingsOf } from "./family-layout.ts";
import { resolveCentralPair } from "./layout-engine.ts";
import { applyShifts, shiftsOf } from "./offsets.ts";
import { annaPeople } from "./family-fixtures.ts";
import { bigWorld, lcg, mk, randomWorld, rowMixing, treeOf, type P } from "./family-wings-fixtures.ts";

const PAIR = { leftId: "W", rightId: "H" };
const lay = (ps: P[]) => { const t = treeOf(ps); return { t, L: layoutFamily(t.people as never, t.unions as never, PAIR) }; };
const hash = (nodes: { id: string; x: number; y: number }[]) => createHash("sha1").update(JSON.stringify([...nodes].sort((a, b) => (a.id < b.id ? -1 : 1)).map((n) => [n.id, Math.round(n.x), Math.round(n.y)]))).digest("hex");
const json = <T,>(name: string): T => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as T;
const fromMin = (rows: { id: string; gender: "m" | "f"; parents: string[]; spouse: string | null; moreSpouses: string[] }[]): P[] => rows.map((r) => mk(r.id, r.gender, { parents: r.parents, ...(r.spouse ? { spouse: r.spouse } : {}), ...(r.moreSpouses.length ? { moreSpouses: r.moreSpouses } : {}) }));

test("14а. крыло считается по родословной: вторые браки и дети от них остаются в своём крыле, дети пары нейтральны", () => {
  const ps = [
    mk("W", "f", { spouse: "H", parents: ["wf", "wm"] }), mk("H", "m", { spouse: "W", parents: ["hf", "hm"] }),
    mk("wf", "m", { spouse: "wm", moreSpouses: ["wx"] }), mk("wm", "f", { spouse: "wf" }), mk("wx", "f", { spouse: "wf" }),
    mk("wh", "m", { parents: ["wf", "wx"] }), mk("whk", "m", { parents: ["wh"] }),
    mk("hf", "m", { spouse: "hm" }), mk("hm", "f", { spouse: "hf", moreSpouses: ["hx"] }), mk("hx", "m", { spouse: "hm" }), mk("hh", "f", { parents: ["hx", "hm"] }),
    mk("c1", "m", { parents: ["W", "H"] }), mk("g1", "f", { parents: ["c1"] }),
  ];
  const t = treeOf(ps);
  const w = wingsOf(t.unions as never, new Set(t.people.map((p) => p.id)), PAIR);
  for (const id of ["wf", "wm", "wx", "wh", "whk"]) assert.equal(w.get(id), -1, id);
  for (const id of ["hf", "hm", "hx", "hh"]) assert.equal(w.get(id), 1, id);
  for (const id of ["c1", "g1"]) assert.equal(w.get(id) ?? 0, 0, `${id}: ребёнок пары нейтрален`);
});

test("14б. родня обеих сторон (двоюродные браки) спорная: крыла нет, ставится как раньше", () => {
  // общий дед у родителей жены и мужа: линии сходятся, расстояния равны
  const ps = [
    mk("W", "f", { spouse: "H", parents: ["a", "b"] }), mk("H", "m", { spouse: "W", parents: ["c", "d"] }),
    mk("a", "m", { spouse: "b", parents: ["g1", "g2"] }), mk("b", "f", { spouse: "a" }),
    mk("c", "m", { spouse: "d", parents: ["g1", "g2"] }), mk("d", "f", { spouse: "c" }),
    mk("g1", "m", { spouse: "g2" }), mk("g2", "f", { spouse: "g1" }),
  ];
  const t = treeOf(ps);
  const w = wingsOf(t.unions as never, new Set(t.people.map((p) => p.id)), PAIR);
  assert.equal(w.get("g1") ?? 0, 0);
  assert.equal(w.get("g2") ?? 0, 0);
  assert.equal(w.get("a"), -1);
  assert.equal(w.get("c"), 1);
  const { L } = lay(ps);
  assert.equal(L.nodes.length, t.people.length, "никого не потеряли");
});

test("14в. четыре минимальных дерева из разбора (второй брак предка уезжал на чужую сторону): стороны разделены, люди на месте", () => {
  const data = json<Record<string, Parameters<typeof fromMin>[0]>>("wings/family-wings-min.json");
  for (const [name, rows] of Object.entries(data)) {
    const ps = fromMin(rows);
    const { t, L } = lay(ps);
    assert.equal(rowMixing(L.nodes as never, ps), 0, `${name}: стороны перемешаны`);
    assert.equal(L.nodes.length, t.people.length, `${name}: все люди на листе`);
    assert.equal(new Set(L.nodes.map((n) => n.id)).size, L.nodes.length, `${name}: без дублей`);
  }
});

test("14г. 300 случайных деревьев (вторые браки, дети от разных браков): ни одного смешения сторон в ряду, никто не потерян", () => {
  let worlds = 0;
  for (const [d, p] of [[3, 0.3], [3, 0.6], [4, 0.3], [4, 0.6], [4, 1]] as const) for (let s = 1; s <= 60; s++) {
    const ps = randomWorld(s, d, p);
    const { t, L } = lay(ps);
    worlds++;
    assert.equal(rowMixing(L.nodes as never, ps), 0, `мир ${d}-${p}-${s}`);
    assert.equal(L.nodes.length, t.people.length, `мир ${d}-${p}-${s}: все на листе`);
  }
  assert.equal(worlds, 300);
});

test("14д. неизвестны родители у жены или у мужа: родня мужа не оказывается левее жены, и наоборот", () => {
  for (const who of ["W", "H"]) for (const [d, p] of [[3, 0.6], [4, 0.6], [4, 1]] as const) for (let s = 1; s <= 40; s++) {
    const ps = randomWorld(s, d, p).map((q) => (q.id === who ? { ...q, parents: [] } : q));
    const { L } = lay(ps);
    assert.equal(rowMixing(L.nodes as never, ps), 0, `${who} без родителей, мир ${d}-${p}-${s}`);
  }
});

test("14е. порядок людей в файле не влияет; замена номеров людей не ломает разделение сторон", () => {
  const rnd = lcg(5);
  const shuffle = <T,>(a: T[]) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j]!, r[i]!]; } return r; };
  for (let s = 1; s <= 40; s++) {
    const ps = randomWorld(s, 4, 0.6);
    const base = hash(lay(ps).L.nodes as never);
    for (let k = 0; k < 3; k++) assert.equal(hash(lay(shuffle(ps)).L.nodes as never), base, `мир ${s}: порядок в файле`);
    const names = new Map(ps.map((q) => [q.id, q.id === "W" || q.id === "H" ? q.id : `p${Math.floor(rnd() * 1e7).toString(36).padStart(6, "0")}`]));
    const renamed = ps.map((q) => ({ ...q, id: names.get(q.id), name: names.get(q.id), firstName: names.get(q.id), parents: (q.parents ?? []).map((x: string) => names.get(x)), spouse: q.spouse ? names.get(q.spouse) : undefined, moreSpouses: (q.moreSpouses ?? []).map((x: string) => names.get(x)) }));
    assert.equal(rowMixing(lay(renamed).L.nodes as never, renamed), 0, `мир ${s}: другие номера`);
  }
});

test("14ж. где раньше стороны не смешивались, раскладка совпадает до пикселя (эталон снят со старой раскладки)", () => {
  const gold = json<Record<string, string>>("wings/family-wings-golden.json");
  const keys = Object.keys(gold);
  assert.ok(keys.length >= 50);
  for (const key of keys) {
    const [d, p, s] = key.split("-").map(Number) as [number, number, number];
    assert.equal(hash(lay(randomWorld(s, d, p)).L.nodes as never), gold[key], `мир ${key}`);
  }
});

test("14з. реальные обезличенные книги: все владельцы с парой, стороны в рядах не перемешаны, никто не потерян", () => {
  let checked = 0;
  for (const f of ["diag-1029-anon.json", "diag-1029b-anon.json", "diag-1030-anon.json", "diag-1101-anon.json"]) {
    const t = treeOf(json<{ people: P[] }>(f).people);
    for (const p of t.people) {
      const { pair } = resolveCentralPair(t.people as never, t.unions as never, p.id);
      if (!pair.rightId) continue;
      const L = layoutFamily(t.people as never, t.unions as never, pair);
      assert.equal(L.nodes.length, t.people.length, `${f}:${p.id}: все на листе`);
      const w = wingsOf(t.unions as never, new Set(t.people.map((q) => q.id)), pair);
      let mixed = 0;
      for (const a of L.nodes) for (const b of L.nodes) if (a.gen === b.gen && w.get(a.id) === -1 && w.get(b.id) === 1 && a.x > b.x) mixed++;
      assert.equal(mixed, 0, `${f}:${p.id}: стороны перемешаны`);
      checked++;
    }
  }
  assert.ok(checked >= 60, `проверено ${checked}`);
});

test("14и. ручные сдвиги карточек: у каждого человека итог равен месту в раскладке плюс его сдвиг; без смешения сторон сдвиги ничего не меняют", () => {
  const ps = randomWorld(7, 4, 0.6);
  const moved = ps.map((q, i) => (i % 5 === 0 ? { ...q, treeDx: 37 + i, treeDy: i % 2 ? -21 : 14 } : q));
  const { t, L } = lay(moved);
  const shifts = shiftsOf(moved as never);
  const out = applyShifts(L as never, t.unions as never, shifts) as unknown as typeof L;
  const at = new Map(L.nodes.map((n) => [n.id, n]));
  for (const n of out.nodes) {
    const s = shifts.get(n.id) ?? { dx: 0, dy: 0 };
    assert.equal(n.x, at.get(n.id)!.x + s.dx, n.id);
    assert.equal(n.y, at.get(n.id)!.y + s.dy, n.id);
  }
  // сдвиги не входят в раскладку: с ними и без них базовые координаты те же
  assert.equal(hash(lay(ps).L.nodes as never), hash(L.nodes as never));
});

test("14к. ветка, которой не нашлось места рядом, отодвинута на свою сторону, но связана с родителем линией (шина или пометка «далёкая»)", () => {
  const rows = json<Record<string, Parameters<typeof fromMin>[0]>>("wings/family-wings-min.json");
  for (const [name, r] of Object.entries(rows)) {
    const ps = fromMin(r);
    const { t, L } = lay(ps);
    const inBus = new Set(L.buses.flatMap((b) => b.childIds));
    const far = new Set(L.far);
    for (const p of t.people) {
      if (!ps.find((q) => q.id === p.id)?.parents?.length) continue;
      assert.ok(inBus.has(p.id) || far.has(p.id), `${name}/${p.id}: нет линии к родителям`);
    }
  }
});

test("14л. быстро: дерево около 2 000 человек раскладывается за разумное время и без смешения сторон", () => {
  const ps = bigWorld(2000);
  const t = treeOf(ps);
  const a = performance.now();
  const L = layoutFamily(t.people as never, t.unions as never, PAIR);
  const ms = performance.now() - a;
  assert.equal(L.nodes.length, t.people.length);
  assert.equal(rowMixing(L.nodes as never, ps), 0);
  assert.ok(ms < 6000, `${Math.round(ms)} мс`);
});

test("14м. «Анна» (обезличенная реальная книга, 288 человек): стороны разделены; 223 человека жены и 64 мужа на своих местах, никто не потерян", () => {
  const t = treeOf(annaPeople() as unknown as P[]);
  const pair = { leftId: "iaxlcs3v", rightId: "mtg8vg3n" };
  const L = layoutFamily(t.people as never, t.unions as never, pair);
  const w = wingsOf(t.unions as never, new Set(t.people.map((p) => p.id)), pair);
  assert.equal([...w.values()].filter((v) => v === -1).length, 223);
  assert.equal([...w.values()].filter((v) => v === 1).length, 64);
  assert.equal(L.nodes.length, t.people.length);
  let mixed = 0;
  for (const a of L.nodes) for (const b of L.nodes) if (a.gen === b.gen && w.get(a.id) === -1 && w.get(b.id) === 1 && a.x > b.x) mixed++;
  assert.equal(mixed, 0, "раньше здесь были 436 пар в 69 перепутанных людях");
});
