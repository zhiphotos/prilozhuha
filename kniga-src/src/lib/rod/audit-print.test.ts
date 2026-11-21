// Аудит PDF для печати (ветка claude/audit-tree-tests, в main не сливается). Проверяет структуру PDF и арифметику размеров, ничего не меняя в экспорте.
// { todo } = требование, которого сейчас нет в экспорте (не требование конкретной типографии, а общие признаки печатного PDF).
import assert from "node:assert/strict";
import test from "node:test";
import { MM, buildJpegPdf } from "./pdf.ts";
import { printPlan } from "../tree/exportPoster.ts";

const fakeJpeg = (n: number) => new Uint8Array(n).fill(0xff);
const text = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

test("PDF: таблица xref указывает точно на объекты, длины потоков верны (2 страницы, вылеты)", () => {
  const pdf = buildJpegPdf([{ bytes: fakeJpeg(1000), width: 100, height: 100, pageW: 220 * MM, pageH: 220 * MM, bleed: 5 * MM }, { bytes: fakeJpeg(500), width: 50, height: 50 }]);
  const s = text(pdf);
  assert.ok(s.startsWith("%PDF-1.4") && s.trimEnd().endsWith("%%EOF"));
  const xrefAt = Number(/startxref\n(\d+)\n%%EOF/.exec(s)![1]);
  assert.equal(s.slice(xrefAt, xrefAt + 4), "xref");
  const count = Number(/xref\n0 (\d+)\n/.exec(s.slice(xrefAt))![1]);
  const rows = s.slice(xrefAt).split("\n").slice(3, 3 + count - 1);
  rows.forEach((row, i) => { const off = Number(row.slice(0, 10)); assert.ok(s.slice(off).startsWith(`${i + 1} 0 obj`), `объект ${i + 1} не по смещению ${off}`); });
  for (const m of s.matchAll(/\/Length (\d+) >>\nstream\n/g)) { const start = m.index! + m[0].length; assert.ok(s.slice(start + Number(m[1])).startsWith("\nendstream") || s.slice(start + Number(m[1])).startsWith("endstream"), "длина потока не совпала"); }
});

test("PDF: TrimBox = лист минус вылет со всех сторон, BleedBox = весь лист", () => {
  const pdf = text(buildJpegPdf([{ bytes: fakeJpeg(10), width: 10, height: 10, pageW: 200, pageH: 300, bleed: 10 }]));
  assert.match(pdf, /\/MediaBox \[0 0 200\.00 300\.00\]/);
  assert.match(pdf, /\/BleedBox \[0 0 200\.00 300\.00\]/);
  assert.match(pdf, /\/TrimBox \[10\.00 10\.00 190\.00 290\.00\]/);
});

test("PDF: без вылета TrimBox/BleedBox не пишутся (страницы для чтения с экрана)", () => {
  assert.doesNotMatch(text(buildJpegPdf([{ bytes: fakeJpeg(10), width: 10, height: 10 }])), /TrimBox/);
});

test("печать древа: A4/A3 действительно A4/A3 в пунктах, а карточка читаема (≥2,3 см) на всех масштабах", () => {
  for (const paper of ["A4", "A3"] as const) for (const scale of ["large", "medium", "small"] as const) { const p = printPlan(1672, 1328, { paper, scale }); assert.ok(p.cardCm >= 2.3, `${paper}/${scale}: ${p.cardCm} см`); assert.ok(p.rows >= 1); }
});

test("печать древа: число листов для 100 человек (≈8500 ед. ширины) на A4 крупно непрактично (оценка printPlan > 20)", () => {
  const p = printPlan(8500, 3320, { paper: "A4", scale: "large" });
  assert.ok(p.estSheets > 20, `оценка ${p.estSheets} листов: фиксируем как факт, не как ошибку`);
});

// ── Отсутствующие возможности печатного PDF ──
const sample = () => text(buildJpegPdf([{ bytes: fakeJpeg(10), width: 10, height: 10, pageW: 100, pageH: 100, bleed: 5 }]));
test("ОТСУТСТВУЕТ P-1: цветовой профиль печати (OutputIntent / ICC)", { todo: "в PDF только /DeviceRGB без профиля; типографии просят CMYK или профиль" }, () => assert.match(sample(), /OutputIntent/));
test("ОТСУТСТВУЕТ P-2: сведения о документе (/Info: название, автор, дата)", { todo: "нет /Info" }, () => assert.match(sample(), /\/Info/));
test("ОТСУТСТВУЕТ P-3: разрешение страницы ≥300 ppi при выводе в натуральную величину для листов древа (сейчас ≈173 ppi у многолистовой печати)", { todo: "savePdfSheets: RASTER=2.4 → 2,4×72 = 172,8 ppi; savePdf(плакат): 96 ppi при масштабе 0,75" }, () => assert.ok(2.4 * 72 >= 300));
test("ОТСУТСТВУЕТ P-4: вылет под обрез у древа (только у книги)", { todo: "savePdf/savePdfSheets не передают bleed" }, () => assert.fail("нет параметра bleed в экспорте древа"));
test("ОТСУТСТВУЕТ P-5: векторный текст и встроенные шрифты", { todo: "каждая страница — одна JPEG-картинка; текст не выделяется и не масштабируется без потерь" }, () => assert.match(sample(), /\/Font/));
