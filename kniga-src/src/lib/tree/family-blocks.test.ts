// Этап 4.1.2: отдельные группы родни (блоки), сетка одиночек, дети одинокого родителя, далёкие связи, метки. Данные вымышленные.
import assert from "node:assert/strict";
import test from "node:test";
import { layoutFamily, type FamilyLayout } from "./family-layout.ts";
import { H_GAP, PLATE_W } from "./metrics.ts";
import { annaPeople, elizaveta, person, small, union } from "./family-fixtures.ts";
import { treeFromPeople } from "./from-people.ts";
import type { Person, Union } from "./types.ts";

const GAP = PLATE_W + H_GAP;

/** Основное дерево: пара «ж»+«м» с двумя детьми и родителями мужа. */
function mainTree() {
  const people = [person("ж", "f"), person("м", "m"), person("мо", "m"), person("мм", "f"), person("д1", "m"), person("д2", "f")];
  const unions = [union("осн", ["ж", "м"], ["д1", "д2"]), union("род_м", ["мо", "мм"], ["м"])];
  return { people, unions };
}
/** Отдельная группа: дед с бабой, двое детей, у одного из них жена и внук. Не связана с главной парой. */
function group(prefix: string) {
  const p = (id: string, g: "m" | "f") => person(`${prefix}${id}`, g);
  const people = [p("дед", "m"), p("баба", "f"), p("с1", "m"), p("с2", "f"), p("жена", "f"), p("внук", "m")];
  const unions = [union(`${prefix}u1`, [`${prefix}дед`, `${prefix}баба`], [`${prefix}с1`, `${prefix}с2`]), union(`${prefix}u2`, [`${prefix}с1`, `${prefix}жена`], [`${prefix}внук`])];
  return { people, unions };
}
function world(groups: number, singles: number) {
  const m = mainTree();
  const people: Person[] = [...m.people];
  const unions: Union[] = [...m.unions];
  for (let i = 0; i < groups; i++) { const g = group(`г${i}_`); people.push(...g.people); unions.push(...g.unions); }
  for (let i = 0; i < singles; i++) people.push(person(`одиночка${i}`, i % 2 ? "m" : "f"));
  return { people, unions };
}
const PAIR = { leftId: "ж", rightId: "м" };

/** Пары «союз → ребёнок», у которых нет ни обычной, ни далёкой шины. */
export function lostPairs(L: FamilyLayout, unions: Union[]) {
  const at = new Map(L.nodes.map((n) => [n.id, n]));
  const drawn = new Set<string>();
  for (const b of L.buses) {
    const u = unions.find((x) => x.id === b.unionId)!;
    for (const x of b.xs) for (const c of u.childIds) if (at.get(c)?.x === x) drawn.add(`${u.id}>${c}`);
  }
  const lost: string[] = [];
  for (const u of unions) for (const c of u.childIds) if (at.has(c) && u.partnerIds.some((q) => at.has(q)) && !drawn.has(`${u.id}>${c}`)) lost.push(`${u.id}>${c}`);
  return lost;
}
/** Брачные линии, под которыми на той же высоте стоит чужая карточка. */
export function falseLines(L: FamilyLayout, ids?: Set<string>) {
  return L.spouses.filter((s) => {
    const lo = Math.min(s.x1, s.x2), hi = Math.max(s.x1, s.x2);
    return L.nodes.some((n) => n.y === s.y1 && n.x > lo + 1 && n.x < hi - 1 && (!ids || ids.has(n.id)));
  }).length;
}
function noOverlap(L: FamilyLayout) {
  const rows = new Map<number, number[]>();
  for (const n of L.nodes) (rows.get(n.y) ?? rows.set(n.y, []).get(n.y)!).push(n.x);
  for (const r of L.refs) (rows.get(r.y) ?? rows.set(r.y, []).get(r.y)!).push(r.x);
  for (const xs of rows.values()) { xs.sort((a, b) => a - b); for (let i = 1; i < xs.length; i++) assert.ok(xs[i]! - xs[i - 1]! >= GAP - 1, "карточки налезают"); }
}

test("A2: отдельные группы родни раскладываются блоками, основное дерево не двигается", () => {
  const base = mainTree();
  const L0 = layoutFamily(base.people, base.unions, PAIR);
  const w = world(5, 0);
  const L = layoutFamily(w.people, w.unions, PAIR);
  assert.equal(L.nodes.length, w.people.length);
  assert.equal(new Set(L.nodes.map((n) => n.id)).size, w.people.length, "каждый один раз");
  assert.equal(L.blocks.length, 5);
  assert.ok(L.blocks.every((b) => b.length === 6), "каждая группа цела");
  assert.equal(L.singles.length, 0);
  const at = new Map(L.nodes.map((n) => [n.id, n]));
  for (const n of L0.nodes) assert.deepEqual([at.get(n.id)!.x, at.get(n.id)!.y], [n.x, n.y], `основное дерево сдвинулось: ${n.id}`);
  // внутри каждого блока связи видны: у обоих союзов есть шина, дети ниже родителей
  assert.deepEqual(lostPairs(L, w.unions), []);
  for (let i = 0; i < 5; i++) { const d = at.get(`г${i}_дед`)!, s = at.get(`г${i}_с1`)!, v = at.get(`г${i}_внук`)!; assert.ok(s.y > d.y && v.y > s.y); }
  // блоки стоят ниже основного дерева и не смешиваются
  const mainY = Math.max(...L0.nodes.map((n) => at.get(n.id)!.y));
  for (const b of L.blocks) for (const id of b) assert.ok(at.get(id)!.y > mainY, "блок не ниже основного дерева");
  const owner = new Map<string, number>(); L.blocks.forEach((b, i) => b.forEach((id) => owner.set(id, i)));
  assert.equal(falseLines(L), 0);
  noOverlap(L);
});

test("A2: порядок данных и повторный расчёт ничего не меняют", () => {
  const w = world(4, 7);
  const a = layoutFamily(w.people, w.unions, PAIR);
  const b = layoutFamily([...w.people].reverse(), [...w.unions].reverse(), PAIR);
  const pos = (L: FamilyLayout) => L.nodes.map((n) => [n.id, n.x, n.y]).sort();
  assert.deepEqual(pos(a), pos(b));
});

test("A1: одиночки собраны сеткой в несколько рядов и не удлиняют дерево", () => {
  const w = world(0, 40);
  const L = layoutFamily(w.people, w.unions, PAIR);
  const L0 = layoutFamily(mainTree().people, mainTree().unions, PAIR);
  assert.equal(L.nodes.length, w.people.length);
  assert.equal(L.singles.length, 40);
  const rows = new Set(L.singles.map((id) => L.nodes.find((n) => n.id === id)!.y));
  assert.ok(rows.size >= 3, `рядов сетки: ${rows.size}`);
  assert.ok(L.width <= Math.max(L0.width, 13 * GAP) + GAP, `ширина ${L.width} против ${L0.width}`);
  assert.equal(L.buses.length, L0.buses.length, "связей одиночкам не добавлено");
  assert.equal(L.spouses.length, L0.spouses.length);
  noOverlap(L);
});

test("A3: дети одинокого родителя размещены под ним, фиктивного второго родителя нет", () => {
  // Пара ж+м; у отца мужа «мо» есть брак с «мм» и отдельный список детей «от неизвестного»: союз из одного человека.
  const m = mainTree();
  const people = [...m.people, person("п1", "m"), person("п2", "f")];
  const unions = [...m.unions, union("одинокий", ["мо"], ["п1", "п2"])];
  const L = layoutFamily(people, unions, PAIR);
  assert.equal(L.nodes.length, people.length);
  assert.equal(L.refs.every((r) => r.of !== "п1" && r.of !== "п2"), true);
  assert.deepEqual(lostPairs(L, unions), []);
  const at = new Map(L.nodes.map((n) => [n.id, n]));
  const bus = L.buses.find((b) => b.unionId === "одинокий")!;
  assert.ok(bus, "шина детей одинокого родителя есть");
  assert.equal(bus.xs.length, 2);
  assert.ok(at.get("п1")!.y > at.get("мо")!.y);
  assert.equal(L.blocks.length, 0, "дети не уехали в отдельный блок");
  noOverlap(L);
});

test("D1/C: метка «далеко» только у тех, у кого есть родители; у каждой метки нарисована далёкая шина; потерянных связей нет", () => {
  const a = treeFromPeople(annaPeople());
  const s = small(), e = elizaveta();
  const cases: [string, FamilyLayout, Union[], Person[]][] = [
    ["anna", layoutFamily(a.people, a.unions, { leftId: "iaxlcs3v", rightId: "mtg8vg3n" }), a.unions, a.people],
    ["small", layoutFamily(s.people, s.unions, { leftId: "жена", rightId: "муж" }), s.unions, s.people],
    ["eliz", layoutFamily(e.people, e.unions, { leftId: "сестра1", rightId: "брат1" }), e.unions, e.people],
  ];
  for (const [name, L, unions, people] of cases) {
    const hasParents = (id: string) => unions.some((u) => u.childIds.includes(id) && u.partnerIds.some((q) => people.some((p) => p.id === q)));
    for (const id of L.detached) assert.ok(hasParents(id), `${name}: метка без родителей у ${id}`);
    for (const id of L.far) assert.ok(L.buses.some((b) => b.far && b.xs.includes(L.nodes.find((n) => n.id === id)!.x)), `${name}: нет далёкой шины для ${id}`);
    assert.deepEqual(lostPairs(L, unions), [], `${name}: потеряны связи`);
    assert.ok(L.buses.filter((b) => b.far).every((b) => b.xs.length === 1), "далёкая шина на одного ребёнка");
  }
});

test("A3: детские списки одинокого родителя не двигают остальных (сравнение с деревом без них)", () => {
  const m = mainTree();
  const L0 = layoutFamily(m.people, m.unions, PAIR);
  const L = layoutFamily([...m.people, person("п1", "m"), person("п2", "f")], [...m.unions, union("одинокий", ["мо"], ["п1", "п2"])], PAIR);
  const at = new Map(L.nodes.map((n) => [n.id, n]));
  for (const n of L0.nodes) assert.deepEqual([at.get(n.id)!.x, at.get(n.id)!.y], [n.x, n.y], `сдвинулась карточка ${n.id}`);
});

test("несколько браков подряд: супруги одного человека не ближе одной карточки (случай x1245)", () => {
  // «р» состоит в браке с матерью мужа «пб» и ещё с «с»: у «р» двое супругов в одном ряду и у каждого свои дети (пара справа, значит сдвиг идёт в другую сторону).
  const people = [person("ж", "f"), person("м", "m"), person("па", "m"), person("пб", "f"), person("р", "m"), person("с", "f"), person("к1", "m"), person("к2", "f"), person("к3", "m")];
  const unions = [union("осн", ["ж", "м"], []), union("род_м", ["па", "пб"], ["м"]), union("б2", ["пб", "р"], ["к1"]), union("б3", ["р", "с"], ["к2", "к3"])];
  const L = layoutFamily(people, unions, PAIR);
  assert.equal(L.nodes.length, people.length);
  noOverlap(L);
  assert.deepEqual(lostPairs(L, unions), []);
});

/** Детерминированный генератор, чтобы случайные семьи были воспроизводимы. */
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function randomFamily(seed: number) {
  const r = rng(seed);
  const people: Person[] = [];
  const unions: Union[] = [];
  let n = 0;
  const mk = (g: "m" | "f") => { const p = person(`p${n++}`, g); people.push(p); return p; };
  const pairs: [Person, Person][] = [];
  for (let i = 0; i < 2 + Math.floor(r() * 2); i++) pairs.push([mk("m"), mk("f")]);
  let frontier = pairs.map(([a, b]) => [a, b] as [Person, Person]);
  for (let gen = 0; gen < 3; gen++) {
    const next: [Person, Person][] = [];
    for (const [a, b] of frontier) {
      const kids: Person[] = [];
      for (let i = 0; i < 1 + Math.floor(r() * 3); i++) kids.push(mk(r() < 0.5 ? "m" : "f"));
      unions.push(union(`u${unions.length}`, [a.id, b.id], kids.map((k) => k.id)));
      for (const k of kids) if (r() < 0.8) { const sp = mk(k.gender === "m" ? "f" : "m"); unions.push(union(`u${unions.length}`, [k.id, sp.id], [])); next.push([k, sp]); }
      // повторный брак: у одного из родителей второй супруг и свои дети
      if (r() < 0.3) { const x = mk(a.gender === "m" ? "f" : "m"); const k2 = mk("m"); unions.push(union(`u${unions.length}`, [a.id, x.id], [k2.id])); }
      // отдельный список детей от неизвестного второго родителя
      if (r() < 0.2) { const k3 = mk("f"); unions.push(union(`u${unions.length}`, [b.id], [k3.id])); }
    }
    frontier = next;
  }
  // одна отдельная группа и пара одиночек
  const g = group(`z${seed}_`); people.push(...g.people); unions.push(...g.unions);
  people.push(person(`s${seed}a`, "m"), person(`s${seed}b`, "f"));
  return { people, unions, pair: { leftId: pairs[0]![0].id, rightId: pairs[0]![1].id } };
}

test("случайные семьи: все на месте, без наложений, связи не теряются, линия через чужую карточку рисуется дугой, результат повторяется", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { people, unions, pair } = randomFamily(seed);
    const L = layoutFamily(people, unions, pair);
    const tag = `seed ${seed}`;
    assert.equal(L.nodes.length, people.length, tag);
    assert.equal(new Set(L.nodes.map((q) => q.id)).size, people.length, `${tag}: дубли`);
    noOverlap(L);
    assert.deepEqual(lostPairs(L, unions), [], `${tag}: потеряны связи`);
    const straightCovered = L.spouses.filter((s) => !s.curved && falseLines({ ...L, spouses: [s] } as FamilyLayout) > 0);
    assert.equal(straightCovered.length, 0, `${tag}: прямая брачная линия под чужой карточкой`);
    const again = layoutFamily([...people].reverse(), [...unions].reverse(), pair);
    assert.deepEqual(again.nodes.map((q) => [q.id, q.x, q.y]).sort(), L.nodes.map((q) => [q.id, q.x, q.y]).sort(), `${tag}: порядок данных меняет раскладку`);
  }
});
