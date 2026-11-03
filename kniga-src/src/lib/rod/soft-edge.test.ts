import assert from "node:assert/strict";
import test from "node:test";
import { boxHeight, cleanSoft, maskStyleFromUrls, softDataUrl, softSvg } from "./soft-edge.ts";

test("старые блоки без поля и мусор в поле остаются без растушёвки", () => {
  assert.equal(cleanSoft(undefined), undefined);
  assert.equal(cleanSoft(null), undefined);
  assert.equal(cleanSoft("x"), undefined);
  assert.equal(cleanSoft({ shape: "star", amount: 50 }), undefined);
  assert.equal(cleanSoft({ shape: "oval", amount: 0 }), undefined);
  assert.equal(cleanSoft({ shape: "oval", amount: "abc" }), undefined);
});

test("сила ограничена 1..100 и округляется", () => {
  assert.deepEqual(cleanSoft({ shape: "rect", amount: 250 }), { shape: "rect", amount: 100 });
  assert.deepEqual(cleanSoft({ shape: "rect", amount: 12.6 }), { shape: "rect", amount: 13 });
});

test("маска для каждой формы строится и сильнее сила – шире размытие и отступ", () => {
  for (const shape of ["rect", "oval", "rough"] as const) {
    const weak = softSvg({ shape, amount: 10 }, 100);
    const strong = softSvg({ shape, amount: 90 }, 100);
    assert.match(weak, /feGaussianBlur/);
    const dev = (s: string) => Number(/stdDeviation="([\d.]+)"/.exec(s)?.[1]);
    assert.ok(dev(strong) > dev(weak), shape);
  }
});

test("неровный край одинаков при каждом построении (не мигает, экран = печать)", () => {
  const a = softSvg({ shape: "rough", amount: 60 }, 80);
  assert.equal(a, softSvg({ shape: "rough", amount: 60 }, 80));
  assert.match(a, /<path d="M/);
  assert.ok(!/NaN/.test(a));
});

test("маска без числовых ошибок на крайних пропорциях", () => {
  for (const h of [5, 20, 100, 400, 1000]) for (const shape of ["rect", "oval", "rough"] as const) assert.ok(!/NaN|Infinity/.test(softSvg({ shape, amount: 100 }, h)), `${shape} ${h}`);
});

test("высота блока считается по реальным пропорциям страницы", () => {
  assert.equal(boxHeight({ w: 50, h: 50 }), 100); // страница квадратная по умолчанию
  assert.equal(boxHeight({ w: 40 }, 0.5), 50);
});

test("две маски складываются пересечением, одна – без композиции", () => {
  const one = maskStyleFromUrls(["a"]) as Record<string, string>;
  assert.equal(one.maskComposite, undefined);
  const two = maskStyleFromUrls(["a", "b"]) as Record<string, string>;
  assert.equal(two.maskComposite, "intersect, intersect");
  assert.equal(two.WebkitMaskComposite, "source-in, source-in");
  assert.equal(maskStyleFromUrls([]), undefined);
  assert.match(softDataUrl({ shape: "oval", amount: 30 }, 100), /^data:image\/svg\+xml/);
});
