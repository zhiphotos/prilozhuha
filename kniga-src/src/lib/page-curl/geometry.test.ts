import assert from "node:assert/strict";
import test from "node:test";
import {
  bowXZ,
  buildBowMesh,
  bulgeFor,
  deformPeel,
  sineLength,
  solveCurlX,
  verticalDeform,
} from "./geometry.ts";

test("натянутый лист не вспухает", () => {
  assert.equal(bulgeFor(100, 100), 0);
  assert.ok(bulgeFor(40, 100) > 20);
});

test("дуга длиннее хорды и близка к длине бумаги", () => {
  const bulge = bulgeFor(80, 100);
  const length = sineLength(80, bulge);
  assert.ok(Math.abs(length - 100) < 1.5);
});

test("обрез вертикального завитка садится на палец", () => {
  const pageW = 400;
  const fingerX = 120;
  const radius = 22;
  const curlX = solveCurlX(fingerX, pageW, radius);
  const edge = verticalDeform(pageW, curlX, radius);
  assert.ok(Math.abs(edge.x - fingerX) < 1.2, `edge ${edge.x}`);
  assert.equal(verticalDeform(0, curlX, radius).z, 0);
});

test("угол загиба оказывается на пальце", () => {
  const W = 420;
  const H = 560;
  const fingerX = 80;
  const fingerY = 500;
  const corner = deformPeel(W, H, fingerX, fingerY, W, H, 30);
  assert.ok(Math.abs(corner.x - fingerX) < 2, `x ${corner.x}`);
  assert.ok(Math.abs(corner.y - fingerY) < 8, `y ${corner.y}`);
  const spine = deformPeel(4, H / 2, fingerX, fingerY, W, H, 30);
  assert.ok(Math.abs(spine.x - 4) < 1);
  assert.equal(spine.z, 0);
});

test("лист на пружине остаётся целым прямоугольником", () => {
  const mesh = buildBowMesh({
    hingeX: 80,
    top: 0,
    width: 400,
    height: 520,
    fingerX: 80 + 180,
    fingerY: 260,
    grabT: 0.5,
    grabS: 1,
    ringR: 0,
    stiff: 1,
    dir: 1,
  });
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < mesh.pos.length; i += 3) {
    minX = Math.min(minX, mesh.pos[i]);
    maxX = Math.max(maxX, mesh.pos[i]);
    minY = Math.min(minY, mesh.pos[i + 1]);
    maxY = Math.max(maxY, mesh.pos[i + 1]);
  }
  assert.ok(Math.abs(minY) < 2, `top ${minY}`);
  assert.ok(Math.abs(maxY - 520) < 2, `bottom ${maxY}`);
  assert.ok(Math.abs(minX - 80) < 2, `hinge ${minX}`);
  assert.ok(maxX < 80 + 190, `edge stayed with the finger ${maxX}`);
});

test("короткая хорда поднимает середину листа, обрез остаётся на столе", () => {
  const mid = bowXZ(0.5, 60, 120);
  const edge = bowXZ(1, 60, 120);
  assert.ok(mid.z > 10);
  assert.ok(Math.abs(edge.z) < 0.001);
  assert.ok(Math.abs(edge.x - 60) < 0.001);
});
