import assert from "node:assert/strict";
import test from "node:test";
import { dateKey, sortByDate } from "./event-sort.ts";

test("ключ даты: день и месяц важны, год главный", () => {
  assert.ok(dateKey("25.09.1935")! < dateKey("08.01.1936")!);
  assert.ok(dateKey("01.1935")! < dateKey("02.1935")!);
  assert.ok(dateKey("1935")! < dateKey("01.01.1936")!);
  assert.equal(dateKey("22 FEB 1999"), 19990222);
  assert.equal(dateKey("1950-е"), 19500000);
  assert.equal(dateKey("неизвестно"), null);
});

test("лента: по датам, внутри года по месяцу и дню, без даты в конце", () => {
  const list = [
    { year: "08.01.2014", title: "ушла" },
    { year: "", title: "без даты" },
    { year: "25.09.1935", title: "родилась" },
    { year: "29.02.1928", title: "мария" },
    { year: "1935", title: "год без месяца" },
    { year: "03.1935", title: "март" },
  ];
  assert.deepEqual(sortByDate(list).map((x) => x.title), ["мария", "год без месяца", "март", "родилась", "ушла", "без даты"]);
});
