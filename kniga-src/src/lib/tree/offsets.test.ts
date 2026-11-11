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
