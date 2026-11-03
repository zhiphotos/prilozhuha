import assert from "node:assert/strict";
import test from "node:test";
import { FX_LIST, applyFxPixels, blur, cleanFx, fxKey, noise, pickFx, type FxId, type PhotoFx } from "./photo-fx.ts";

const W = 48, H = 36;
/** Синтетическое «фото»: диагональный градиент с цветным оттенком. */
function sample(): Uint8ClampedArray {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const i = (y * W + x) * 4;
    const t = (x / W + y / H) / 2;
    d[i] = 40 + 180 * t; d[i + 1] = 60 + 120 * (1 - t); d[i + 2] = 90 + 100 * Math.sin(t * 3); d[i + 3] = 255;
  }
  return d;
}
const run = (fx: PhotoFx) => { const d = sample(); applyFxPixels(d, W, H, fx); return d; };
const px = (d: Uint8ClampedArray, x: number, y: number) => Array.from(d.slice((y * W + x) * 4, (y * W + x) * 4 + 3));
const NODOC = FX_LIST.filter((f) => f.id !== "halftone"); // растру нужен холст браузера

test("настройка: неизвестный пресет, мусор и сила 0 дают «без эффекта» (старые и новые книги открываются)", () => {
  for (const bad of [undefined, null, 5, "sepia", {}, { id: "nope", amount: 50 }, { id: "bw", amount: 0 }, { id: "bw", amount: "x" }]) assert.equal(cleanFx(bad), undefined);
  assert.deepEqual(cleanFx({ id: "bw", amount: 999 }), { id: "bw", amount: 100 });
  assert.deepEqual(cleanFx({ id: "riso", amount: 40.4, c1: "#AABBCC", c2: "red" }), { id: "riso", amount: 40, c1: "#aabbcc" });
});

test("в блоке хранится только id, сила и цвета (в резервную копию и синхронизацию попадает параметр, не картинка)", () => {
  const stored = JSON.stringify(pickFx("duotone"));
  assert.ok(stored.length < 80);
  assert.deepEqual(JSON.parse(stored), cleanFx(JSON.parse(stored)));
  assert.deepEqual(pickFx("sepia"), { id: "sepia", amount: 80 });
});

test("смена пресета сохраняет выбранные цвета, ключ кэша зависит от всех параметров", () => {
  assert.equal(pickFx("riso", { id: "duotone", amount: 100, c1: "#111111", c2: "#eeeeee" }).c1, "#111111");
  assert.notEqual(fxKey({ id: "bw", amount: 50 }), fxKey({ id: "bw", amount: 51 }));
  assert.notEqual(fxKey({ id: "duotone", amount: 50, c1: "#000000" }), fxKey({ id: "duotone", amount: 50, c1: "#000001" }));
});

test("шум постоянный: одинаковый при каждом вызове", () => {
  assert.equal(noise(10, 20, 3), noise(10, 20, 3));
  assert.notEqual(noise(10, 20, 3), noise(11, 20, 3));
});

test("размытие сохраняет ровное поле и среднюю яркость", () => {
  const flat = new Float32Array(20 * 20).fill(100);
  assert.ok(Array.from(blur(flat, 20, 20, 3)).every((v) => Math.abs(v - 100) < 1e-3));
  const a = new Float32Array(20 * 20); a[210] = 4000;
  const b = blur(a, 20, 20, 2);
  assert.ok(Math.abs(b.reduce((s, v) => s + v, 0) - 4000) < 1);
});

test("каждый пресет даёт осмысленный результат: не пусто, не белый лист, прозрачность не трогается, одинаково при повторе", () => {
  for (const f of NODOC) {
    const fx = pickFx(f.id as FxId);
    const a = run(fx), b = run(fx);
    assert.deepEqual(Array.from(a), Array.from(b), `${f.id} повтор`);
    const sum = a.reduce((s, v, i) => (i % 4 === 3 ? s : s + v), 0) / (W * H * 3);
    assert.ok(sum > 15 && sum < 245, `${f.id} средняя яркость ${sum}`);
    for (let i = 3; i < a.length; i += 4) assert.equal(a[i], 255);
  }
});

test("чем больше сила, тем сильнее отличие от оригинала", () => {
  const diff = (id: FxId, amount: number) => { const o = sample(), n = run({ id, amount }); let s = 0; for (let i = 0; i < o.length; i += 4) s += Math.abs(o[i] - n[i]) + Math.abs(o[i + 1] - n[i + 1]) + Math.abs(o[i + 2] - n[i + 2]); return s; };
  for (const id of ["bw", "sepia", "vintage", "vignette", "dreamy", "cross", "duotone"] as FxId[]) assert.ok(diff(id, 90) > diff(id, 15), id);
});

test("свойства пресетов: ч/б серое, сепия тёплая, дуотон крайние цвета, виньетка темнит углы, цианотипия синяя", () => {
  const bw = px(run({ id: "bw", amount: 80 }), 20, 15);
  assert.ok(bw[0] === bw[1] && bw[1] === bw[2]);
  const se = px(run({ id: "sepia", amount: 100 }), 20, 15);
  assert.ok(se[0] > se[2]);
  const cy = px(run({ id: "cyanotype", amount: 100 }), 20, 15);
  assert.ok(cy[2] > cy[0]);
  const vg = run({ id: "vignette", amount: 100 }), orig = sample();
  assert.ok(px(vg, 0, 0)[0] < px(orig, 0, 0)[0] * 0.6);
  assert.ok(Math.abs(px(vg, W / 2, H / 2)[0] - px(orig, W / 2, H / 2)[0]) < 6);
  const d = new Uint8ClampedArray(W * H * 4).fill(255);
  d.set([0, 0, 0, 255], 0);
  applyFxPixels(d, W, H, { id: "duotone", amount: 100, c1: "#102030", c2: "#f0e0d0" });
  assert.deepEqual(px(d, 0, 0).map((v) => Math.round(v / 8)), [0x10, 0x20, 0x30].map((v) => Math.round(v / 8)));
  assert.ok(px(d, W - 1, H - 1)[0] > 225);
});
