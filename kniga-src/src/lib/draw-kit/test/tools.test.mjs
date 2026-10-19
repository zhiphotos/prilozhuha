import assert from "node:assert/strict";
import test from "node:test";
import { floodRegion, paintPixels } from "../src/flood.js";
import { planStamps, targetContour, walkSegment } from "../src/geometry.js";
import { defineBrush } from "../src/brushes.js";
import { parseColor } from "../src/color.js";

test("цвет #rgb и #rrggbb", () => {
  assert.deepEqual(parseColor("#abc"), { r: 170, g: 187, b: 204, a: 1, css: "#abc" });
  const full = parseColor("#8c3a3a");
  assert.equal(full.r, 140);
  assert.equal(full.g, 58);
  assert.equal(full.b, 58);
});

test("штампы идут ровным шагом и не сбрасывают хвост между точками", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 8, y: 0 },
    { x: 12, y: 0 },
  ];
  const stamps = planStamps(points, 10);
  assert.deepEqual(
    stamps.map((stamp) => stamp.x),
    [0, 10],
  );
});

test("живой шаг помнит остаток от прошлого отрезка", () => {
  const placed = [];
  let since = 0;
  let last = { x: 0, y: 0 };
  for (const x of [4, 8, 12]) {
    const next = { x, y: 0 };
    since = walkSegment(last, next, since, 10, (stamp) => placed.push(stamp.x));
    last = next;
  }
  assert.deepEqual(placed, [10]);
  assert.ok(Math.abs(since - 2) < 1e-6);
});

test("заливается последний замкнутый контур, тычок после него пропускается", () => {
  const circle = stroke(square(10, 10, 80), 4);
  const speck = stroke(
    [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 1 },
    ],
    4,
  );
  const found = targetContour([circle, speck]);
  assert.equal(found?.open, false);
  assert.equal(found?.stroke, circle);
});

test("длинный открытый контур не подменяется более ранней фигурой", () => {
  const circle = stroke(square(0, 0, 40), 4);
  const line = stroke(
    [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 80, y: 10 },
      { x: 120, y: 10 },
    ],
    4,
  );
  const found = targetContour([circle, line]);
  assert.equal(found?.open, true);
  assert.equal(found?.stroke, line);
});

test("почти сошедшиеся концы считаются замкнутыми", () => {
  const almost = stroke(
    [
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 90 },
      { x: 10, y: 90 },
      { x: 14, y: 12 },
    ],
    6,
  );
  const found = targetContour([almost]);
  assert.equal(found?.open, false);
});

test("заливка внутри рамки не выходит наружу и не трогает линию", () => {
  const { data, width, height } = box(32, 4, 27);
  const region = floodRegion(data, width, height, 16, 16, { gap: 0 });
  assert.equal(region.ok, true);
  assert.equal(region.pixels.length, 22 * 22);
  paintPixels(data, region.pixels, [140, 58, 58, 255]);
  assert.equal(data[(4 * width + 4) * 4 + 3], 255);
  assert.equal(data[(5 * width + 5) * 4], 140);
  assert.equal(data[(0 * width + 0) * 4 + 3], 0);
});

test("дыра в контуре не заливает весь лист", () => {
  const { data, width, height } = box(32, 4, 27);
  data[(4 * width + 10) * 4 + 3] = 0;
  const region = floodRegion(data, width, height, 16, 16, { gap: 0 });
  assert.equal(region.ok, false);
  assert.equal(region.reason, "open");
  assert.equal(data[(16 * width + 16) * 4 + 3], 0);
});

test("сжатие стен на 1 пиксель закрывает дырку в один пиксель", () => {
  const { data, width, height } = box(32, 4, 27);
  data[(4 * width + 10) * 4 + 3] = 0;
  const region = floodRegion(data, width, height, 16, 16, { gap: 1 });
  assert.equal(region.ok, true);
});

test("тап по линии — это стена, не заливка", () => {
  const { data, width, height } = box(32, 4, 27);
  const region = floodRegion(data, width, height, 4, 10, { gap: 0 });
  assert.deepEqual(region, { ok: false, reason: "wall" });
});

test("своя кисть — это объект, отдельный движок не нужен", () => {
  const id = defineBrush({
    id: "berry",
    name: "Ягода",
    tip: "round",
    spacing: 1.4,
    defaultSize: 8,
  }).id;
  assert.equal(id, "berry");
  assert.throws(() => defineBrush({ id: "x", tip: "image" }));
});

function stroke(points, size) {
  return { points, size, closed: false };
}

function square(x, y, side) {
  return [
    { x, y },
    { x: x + side, y },
    { x: x + side, y: y + side },
    { x, y: y + side },
    { x, y },
  ];
}

function box(size, a, b) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = a; y <= b; y++) {
    for (let x = a; x <= b; x++) {
      const edge = x === a || y === a || x === b || y === b;
      if (!edge) continue;
      const o = (y * size + x) * 4;
      data[o] = 20;
      data[o + 1] = 16;
      data[o + 2] = 12;
      data[o + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}
