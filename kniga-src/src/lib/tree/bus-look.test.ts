// Вид линий family на экране: цвета соседних семей и прыжки на пересечениях (проверяется именно то, что попадёт на экран, а не наличие полей).
import assert from "node:assert/strict";
import test from "node:test";
import { BUS_PALETTE, busColorIndex, busHops, foreignEntries, hoppedH, type LookBus } from "./bus-look.ts";

const bus = (unionId: string, fromX: number, fromY: number, busY: number, xs: number[], childTop: number): LookBus => ({ unionId, fromX, fromY, busY, xs, childTop });

test("соседние семьи одного ряда получают разные цвета, далёкие друг от друга могут совпасть, один союз красится одинаково", () => {
  const list = [bus("a", 100, 0, 160, [60, 140], 290), bus("b", 300, 0, 160, [260, 340], 290), bus("c", 600, 0, 160, [560, 640], 290), bus("a", 100, 0, 200, [900], 290)];
  const c = busColorIndex(list);
  assert.notEqual(c[0], c[1], "соседние семьи сливаются по цвету");
  assert.equal(c[0], c[3], "один союз в разные цвета");
  assert.ok(c.every((i) => i >= 0 && i < BUS_PALETTE.length));
  assert.deepEqual(busColorIndex(list), c, "результат нестабилен");
  assert.deepEqual(busColorIndex([...list].reverse()).reverse(), c, "результат зависит от порядка линий");
});

test("вертикаль чужой семьи через перекладину даёт прыжок, у своей семьи и на краю нет", () => {
  const A = bus("a", 100, 0, 100, [100, 140], 300); // вертикали детей на x=100 и x=140 идут с y=100 до 300
  const B = bus("b", 0, 0, 200, [60, 220], 300); // перекладина y=200 от 60 до 220 пересекает x=140
  const hops = busHops([A, B]);
  assert.deepEqual(hops.get(1), [100, 140], "нет прыжков на перекладине B");
  assert.equal(hops.get(0), undefined, "прыжок на перекладине A не нужен: ни одна вертикаль B её не пересекает");
  const same = busHops([A, { ...B, unionId: "a" }]);
  assert.equal(same.size, 0, "одна семья прыгает через себя");
  const edge = busHops([{ ...A, xs: [140] }, bus("b", 140, 0, 200, [140, 220], 300)]); // x=140 это край перекладины B
  assert.equal(edge.size, 0, "вертикаль на самом краю перекладины не пересечение");
});

test("горизонталь с прыжком: дуга выше линии, концы на месте, прыжки у самых концов отбрасываются", () => {
  const d = hoppedH(0, 100, 50, [50]);
  assert.match(d, /^M 0 50 H 43 a 7 7 0 0 1 14 0 H 100$/);
  assert.equal(hoppedH(0, 100, 50, [3]), "M 0 50 H 100");
  assert.match(hoppedH(100, 0, 50, [50]), /^M 100 50 H 57 a 7 7 0 0 0 -14 0 H 0$/);
});

test("вход издалека рядом с детьми другой пары помечается, свои братья и одиночные дальние нет", () => {
  const nodes = [{ id: "m", x: 0, y: 500 }, { id: "g", x: 200, y: 500 }, { id: "s", x: 400, y: 500 }, { id: "alone", x: 3000, y: 500 }];
  const red = { ...bus("red", 200, 0, 160, [0, 400], 454), childIds: ["m", "s"] };
  const green = { ...bus("green", 1500, 0, 180, [200], 454), childIds: ["g"] }; // родители далеко, рядом дети красной пары
  const lone = { ...bus("blue", 4500, 0, 200, [3000], 454), childIds: ["alone"] }; // родители далеко, соседей нет
  const marked = foreignEntries([red, green, lone], nodes);
  assert.deepEqual([...marked.keys()], ["g"], "помечен не тот человек");
  assert.equal(marked.get("g"), 1, "номер линии не тот: нужен зелёный союз");
  // свои дети той же пары рядом не помечаются, даже если линия длинная
  const same = foreignEntries([{ ...bus("red", 2000, 0, 160, [0, 200], 454), childIds: ["m", "g"] }], nodes);
  assert.equal(same.size, 0);
});
