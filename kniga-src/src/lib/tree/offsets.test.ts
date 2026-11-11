// Ручной сдвиг карточек: линии тянутся за карточкой. Фикстуры синтетические.
import assert from "node:assert/strict";
import test from "node:test";
import { layoutTree } from "./layout.ts";
import { applyShifts, shiftsOf, type Shift } from "./offsets.ts";
import type { Person, TreeData, Union } from "./types.ts";

const person = (id: string, gender: "m" | "f"): Person => ({ id, firstName: id, patronymic: "", lastName: "", gender, birthYear: "", deathYear: "", photo: "", note: "" });
const union = (id: string, partners: string[], kids: string[]): Union => ({ id, partnerIds: partners, childIds: kids, status: "married", startYear: "", endYear: "" });
const family = (): TreeData => ({
  people: [person("F", "m"), person("M", "f"), person("a", "m"), person("b", "f")],
  unions: [union("u", ["F", "M"], ["a", "b"])],
  focusId: "a",
});
const base = () => {
  const d = family();
  return { d, layout: layoutTree(d.people, d.unions, d.focusId, "down") };
};
const node = (l: ReturnType<typeof layoutTree>, id: string) => l.nodes.find((n) => n.id === id)!;
const S = (entries: [string, Shift][]) => new Map(entries);

test("без сдвигов возвращается та же раскладка", () => {
  const { d, layout } = base();
  assert.equal(applyShifts(layout, d.unions, new Map()), layout);
  assert.equal(applyShifts(layout, d.unions, S([["a", { dx: 0, dy: 0 }]])), layout);
});

test("карточка ребёнка уезжает, остальные стоят на месте", () => {
  const { d, layout } = base();
  const out = applyShifts(layout, d.unions, S([["a", { dx: 120, dy: 60 }]]));
  assert.equal(node(out, "a").x, node(layout, "a").x + 120);
  assert.equal(node(out, "a").y, node(layout, "a").y + 60);
  assert.equal(node(out, "b").x, node(layout, "b").x);
  assert.equal(node(out, "F").y, node(layout, "F").y);
});

test("линия к ребёнку тянется до его новой карточки, у брата с сестрой остаётся прежней", () => {
  const { d, layout } = base();
  const bus0 = layout.buses[0]!;
  const out = applyShifts(layout, d.unions, S([["a", { dx: 0, dy: 80 }]]));
  const bus = out.buses[0]!;
  assert.equal(bus.xs.length, 2);
  assert.ok(bus.childTops);
  const ia = bus.xs.indexOf(node(out, "a").x);
  const ib = bus.xs.indexOf(node(out, "b").x);
  assert.equal(bus.childTops![ia], bus0.childTop + 80);
  assert.equal(bus.childTops![ib], bus0.childTop);
  assert.ok(bus.busY < Math.min(...bus.childTops!));
});

test("линия брака тянется за сдвинутым супругом", () => {
  const { d, layout } = base();
  const out = applyShifts(layout, d.unions, S([["M", { dx: 90, dy: -30 }]]));
  const link = out.spouses[0]!;
  const f = node(out, "F");
  const m = node(out, "M");
  assert.deepEqual([link.x1, link.y1, link.x2, link.y2], f.x <= m.x ? [f.x, f.y, m.x, m.y] : [m.x, m.y, f.x, f.y]);
  assert.equal(link.curved, true);
});

test("линия детей начинается от середины сдвинутых родителей", () => {
  const { d, layout } = base();
  const out = applyShifts(layout, d.unions, S([["F", { dx: -100, dy: 0 }]]));
  const f = node(out, "F");
  const m = node(out, "M");
  assert.equal(out.buses[0]!.fromX, (f.x + m.x) / 2);
});

test("родитель опущен ниже: линия детей начинается ниже, перекладина не заходит на детей", () => {
  const { d, layout } = base();
  const out = applyShifts(layout, d.unions, S([["F", { dx: 0, dy: 40 }]]));
  const bus = out.buses[0]!;
  assert.equal(bus.fromY, layout.buses[0]!.fromY! + 40);
  assert.ok(bus.busY <= bus.childTop - 16);
});

test("сдвиги складываются: два раза по половине равно одному целому", () => {
  const { d, layout } = base();
  const whole = applyShifts(layout, d.unions, S([["a", { dx: 100, dy: 50 }]]));
  const half = applyShifts(applyShifts(layout, d.unions, S([["a", { dx: 50, dy: 25 }]])), d.unions, S([["a", { dx: 50, dy: 25 }]]));
  assert.deepEqual(half.nodes, whole.nodes);
  assert.deepEqual(half.buses[0]!.xs, whole.buses[0]!.xs);
  assert.deepEqual(half.buses[0]!.childTops, whole.buses[0]!.childTops);
});

test("исходная раскладка не портится", () => {
  const { d, layout } = base();
  const copy = JSON.stringify(layout);
  applyShifts(layout, d.unions, S([["a", { dx: 50, dy: 50 }], ["F", { dx: 10, dy: 10 }]]));
  assert.equal(JSON.stringify(layout), copy);
});

test("размер схемы растёт, если карточку увезли за край", () => {
  const { d, layout } = base();
  const out = applyShifts(layout, d.unions, S([["a", { dx: 3000, dy: 2000 }]]));
  assert.ok(out.width >= node(out, "a").x + 100);
  assert.ok(out.height >= node(out, "a").y + 100);
});

test("сдвиги читаются из списка людей", () => {
  const m = shiftsOf([{ id: "a", treeDx: 5, treeDy: -7 }, { id: "b" }, { id: "c", treeDx: 0, treeDy: 0 }]);
  assert.deepEqual([...m], [["a", { dx: 5, dy: -7 }]]);
});

test("человек без карточки на схеме и неизвестный союз не ломают расчёт", () => {
  const { d, layout } = base();
  const out = applyShifts(layout, [], S([["ghost", { dx: 10, dy: 10 }], ["a", { dx: 10, dy: 0 }]]));
  assert.equal(node(out, "a").x, node(layout, "a").x + 10);
  assert.equal(out.buses[0]!.xs.length, layout.buses[0]!.xs.length);
  void d;
});

// ---- Те же места во всех стилях ----
import { layoutBoheme } from "./boheme.ts";
import { layoutCameo } from "./cameo.ts";
import { layoutGzhel } from "./gzhel.ts";
import { layoutPoster } from "./poster.ts";
import { layoutTaiga } from "./taiga.ts";
import { schemeAnchor, schemeLayout } from "./scheme.ts";

const wide = (): TreeData => ({
  people: [person("F", "m"), person("M", "f"), person("a", "m"), person("b", "f"), person("c", "m")],
  unions: [union("u", ["F", "M"], ["a", "b", "c"])],
  focusId: "a",
});

const styles: [string, (d: TreeData, anchor?: ReadonlyMap<string, { x: number; y: number }>) => { nodes: { id: string; x: number; y: number }[]; width: number; height: number }][] = [
  ["Древо", (d, a) => layoutPoster(d.people, d.unions, d.focusId, "down", a)],
  ["Камея", (d, a) => layoutCameo(d.people, d.unions, d.focusId, "down", a)],
  ["Гжель", (d, a) => layoutGzhel(d.people, d.unions, d.focusId, "down", a)],
  ["Богема", (d, a) => layoutBoheme(d.people, d.unions, d.focusId, "down", a)],
  ["Тайга", (d, a) => layoutTaiga(d.people, d.unions, d.focusId, "down", a)],
];

for (const [name, make] of styles) {
  test(`${name}: карточки стоят так же, как на схеме (с ручным сдвигом), только в другом масштабе`, () => {
    const d = wide();
    d.people.find((p) => p.id === "b")!.treeDx = 260;
    d.people.find((p) => p.id === "b")!.treeDy = 140;
    const anchor = schemeAnchor(d.people, d.unions, d.focusId, "down");
    const sheet = make(d, anchor);
    const ids = [...anchor.keys()];
    const ax = ids.map((id) => anchor.get(id)!.x);
    const ay = ids.map((id) => anchor.get(id)!.y);
    const sx = ids.map((id) => sheet.nodes.find((n) => n.id === id)!.x);
    const sy = ids.map((id) => sheet.nodes.find((n) => n.id === id)!.y);
    // Порядок слева направо и сверху вниз тот же.
    const order = (v: number[]) => ids.map((_, i) => v.filter((x) => x < v[i]! - 1e-6).length);
    assert.deepEqual(order(sx), order(ax));
    assert.deepEqual(order(sy), order(ay));
    // Один общий масштаб по обеим осям: отношения расстояний сохраняются.
    const i0 = ax.findIndex((x) => x !== ax[0]);
    const j0 = ay.findIndex((y) => y !== ay[0]);
    if (i0 > 0 && j0 > 0) {
      const kx = (sx[i0]! - sx[0]!) / (ax[i0]! - ax[0]!);
      const ky = (sy[j0]! - sy[0]!) / (ay[j0]! - ay[0]!);
      assert.ok(Math.abs(kx - ky) < 1e-6, `масштаб по осям разный: ${kx} и ${ky}`);
    }
    // Внутри листа.
    for (let i = 0; i < ids.length; i += 1) {
      assert.ok(sx[i]! > 0 && sx[i]! < sheet.width);
      assert.ok(sy[i]! > 0 && sy[i]! < sheet.height);
    }
  });

  test(`${name}: без якоря раскладка прежняя`, () => {
    const d = wide();
    assert.deepEqual(make(d).nodes, make(d, undefined).nodes);
  });

  test(`${name}: неполный якорь (кого-то нет на схеме) не ломает раскладку`, () => {
    const d = wide();
    const anchor = schemeAnchor(d.people, d.unions, d.focusId, "down");
    anchor.delete("c");
    assert.deepEqual(make(d, anchor).nodes, make(d).nodes);
  });
}

test("карточки в стилях не налезают друг на друга после сдвига", () => {
  const d = wide();
  d.people.find((p) => p.id === "c")!.treeDx = 30; d.people.find((p) => p.id === "c")!.treeDy = 300;
  const anchor = schemeAnchor(d.people, d.unions, d.focusId, "down");
  const sheet = layoutCameo(d.people, d.unions, d.focusId, "down", anchor);
  for (let i = 0; i < sheet.nodes.length; i += 1)
    for (let j = i + 1; j < sheet.nodes.length; j += 1) {
      const a = sheet.nodes[i]!;
      const b = sheet.nodes[j]!;
      assert.ok(Math.abs(a.x - b.x) >= 160 || Math.abs(a.y - b.y) >= 160, `${a.id} и ${b.id} налезают`);
    }
});

test("схема с ручными сдвигами из списка людей совпадает со схемой, собранной вручную", () => {
  const d = wide();
  d.people.find((p) => p.id === "a")!.treeDx = 50;
  const viaScheme = schemeLayout(d.people, d.unions, d.focusId, "down");
  const manual = applyShifts(layoutTree(d.people, d.unions, d.focusId, "down"), d.unions, shiftsOf(d.people));
  assert.deepEqual(viaScheme.nodes, manual.nodes);
});
