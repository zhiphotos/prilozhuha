import assert from "node:assert/strict";
import test from "node:test";
import { cutBackground } from "./sticker.ts";

function blank(width: number, height: number, r: number, g: number, b: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

test("plain backdrop lifts and the subject stays", () => {
  const width = 80;
  const height = 100;
  const data = blank(width, height, 245, 242, 236);
  for (let y = 28; y < 78; y++) {
    for (let x = 24; x < 58; x++) {
      const o = (y * width + x) * 4;
      data[o] = 150;
      data[o + 1] = 70;
      data[o + 2] = 80;
    }
  }
  assert.equal(cutBackground(data, width, height), true);
  assert.equal(data[3], 0);
  const center = (50 * width + 40) * 4;
  assert.equal(data[center], 150);
  assert.equal(data[center + 3], 255);
});

test("a full-frame picture is left alone", () => {
  const data = blank(40, 40, 40, 90, 70);
  const before = data[20];
  assert.equal(cutBackground(data, 40, 40), false);
  assert.equal(data[20], before);
  assert.equal(data[3], 255);
});
