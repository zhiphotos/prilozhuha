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

test("лист на пружине гнётся, но край у пальца и корешок на месте", () => {
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
  const nx = mesh.cols + 1;
  const ny = mesh.rows + 1;
  const hinge = mesh.pos[0];
  const midRow = Math.round(ny * 0.5);
  const edge = mesh.pos[(midRow * nx + mesh.cols) * 3];
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 1; i < mesh.pos.length; i += 3) {
    minY = Math.min(minY, mesh.pos[i]);
    maxY = Math.max(maxY, mesh.pos[i]);
  }
  for (let i = 2; i < mesh.pos.length; i += 3) {
    minZ = Math.min(minZ, mesh.pos[i]);
    maxZ = Math.max(maxZ, mesh.pos[i]);
  }
  assert.ok(Math.abs(hinge - 80) < 2, `hinge ${hinge}`);
  assert.ok(Math.abs(edge - 260) < 14, `edge follows the finger ${edge}`);
  assert.ok(minY > -8 && maxY < 520 + 48, `sheet stayed in the page ${minY} ${maxY}`);
  assert.ok(maxZ > 40, `page actually bows ${maxZ}`);
});

test("короткая хорда поднимает середину листа, обрез остаётся на столе", () => {
  const mid = bowXZ(0.5, 60, 120);
  const edge = bowXZ(1, 60, 120);
  assert.ok(mid.z > 10);
  assert.ok(Math.abs(edge.z) < 0.001);
  assert.ok(Math.abs(edge.x - 60) < 0.001);
});
