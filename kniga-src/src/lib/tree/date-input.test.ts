import assert from "node:assert/strict";
import test from "node:test";
import { isCalendarDate, maskDate, typeDate, yearAfterBlur } from "./date-input.ts";

test("только год остаётся годом", () => assert.equal(maskDate("1989"), "1989"));
test("восемь цифр становятся датой с точками", () => assert.equal(maskDate("18051989"), "18.05.1989"));
test("набор по одной цифре", () => {
  assert.equal(maskDate("18051"), "18.05.1");
  assert.equal(maskDate("180519"), "18.05.19");
});
test("точки, поставленные вручную, сохраняются", () => {
  assert.equal(maskDate("05.1989"), "05.1989");
  assert.equal(maskDate("18.05.1989"), "18.05.1989");
  assert.equal(maskDate("18/05/1989"), "18.05.1989");
});
test("стирание не ломает дату", () => assert.equal(maskDate("18.05."), "18.05."));

// Посимвольный ввод как в поле: символ вставляется в позицию курсора, маска возвращает значение, курсор и признак «точки ставил человек».
type Field = { value: string; caret: number; manualDots: boolean };
const empty = (): Field => ({ value: "", caret: 0, manualDots: false });
const type = (f: Field, chars: string): Field => {
  let cur = f;
  for (const ch of chars) {
    const next = cur.value.slice(0, cur.caret) + ch + cur.value.slice(cur.caret);
    cur = typeDate(cur.value, next, cur.caret + 1, cur.manualDots);
  }
  return cur;
};
const steps = (chars: string): string[] => {
  let cur = empty();
  const out: string[] = [];
  for (const ch of chars) { cur = type(cur, ch); out.push(cur.value); }
  return out;
};
const backspace = (f: Field, times = 1): Field => {
  let cur = f;
  for (let i = 0; i < times && cur.caret > 0; i += 1) {
    const next = cur.value.slice(0, cur.caret - 1) + cur.value.slice(cur.caret);
    cur = typeDate(cur.value, next, cur.caret - 1, cur.manualDots);
  }
  return cur;
};
const paste = (f: Field, text: string): Field => typeDate(f.value, f.value.slice(0, f.caret) + text + f.value.slice(f.caret), f.caret + text.length, f.manualDots);

test("пример заказчика: 23 → 231 → 23.1 → 2311 → 23.11 → 23111989 → 23.11.1989", () => {
  assert.deepEqual(steps("23111989"), ["2", "23", "23.1", "23.11", "23.11.1", "23.11.19", "23.11.198", "23.11.1989"]);
});
test("после двух цифр точки нет: это может быть год", () => assert.equal(type(empty(), "23").value, "23"));
test("курсор стоит в конце после автоматических точек", () => {
  const f = type(empty(), "231");
  assert.equal(f.value, "23.1");
  assert.equal(f.caret, 4);
  assert.equal(type(empty(), "23111989").caret, 10);
});
test("год 1989 остаётся годом, годы 1980-1999 и 2000-х тоже", () => {
  assert.equal(type(empty(), "1989").value, "1989");
  assert.equal(type(empty(), "1948").value, "1948");
  assert.equal(type(empty(), "1999").value, "1999");
  assert.equal(type(empty(), "2024").value, "2024");
  assert.deepEqual(steps("1989"), ["1", "19", "19.8", "1989"]);
});
test("годы, похожие на день и месяц (1905, 1910): на вводе «19.10», при выходе из поля снова год", () => {
  const f = type(empty(), "1910");
  assert.equal(f.value, "19.10");
  assert.equal(yearAfterBlur(f.value, f.manualDots), "1910");
  assert.equal(yearAfterBlur("19.10.", false), "1910");
  assert.equal(yearAfterBlur("19.10", true), "19.10", "если точки ставил человек, не трогаем");
  assert.equal(yearAfterBlur("23.11.1989", false), "23.11.1989");
});
test("точки вручную: 23.11.1989, 1.5.1989, 05.1989 остаются как набраны", () => {
  assert.equal(type(empty(), "23.11.1989").value, "23.11.1989");
  assert.equal(type(empty(), "1.5.1989").value, "1.5.1989");
  assert.equal(type(empty(), "05.1989").value, "05.1989");
  assert.equal(type(empty(), "23.11.").value, "23.11.");
});
test("невозможный день или месяц: точка не ставится", () => {
  assert.equal(type(empty(), "351").value, "351");
  assert.equal(type(empty(), "23151").value, "23.15.1");
  assert.equal(type(empty(), "2315").value, "2315", "месяца 15 нет, значит это год");
});
test("удаление с конца без застревания", () => {
  let f = type(empty(), "23111989");
  const seen: string[] = [];
  for (let i = 0; i < 10; i += 1) { f = backspace(f); seen.push(f.value); }
  assert.deepEqual(seen, ["23.11.198", "23.11.19", "23.11.1", "23.11.", "23.11", "23.1", "23.", "23", "2", ""]);
});
test("стёртая автоматическая точка не возвращается без новой цифры", () => {
  let f = type(empty(), "231");
  f = backspace(f);
  assert.equal(f.value, "23.");
  f = backspace(f);
  assert.equal(f.value, "23");
});
test("исправление цифры в середине: курсор на месте, точки не добавляются", () => {
  const f = type(empty(), "23111989");
  const edited = backspace({ ...f, caret: 5 });
  assert.equal(edited.value, "23.1.1989");
  assert.equal(edited.caret, 4);
  const retyped = type(edited, "2");
  assert.equal(retyped.value, "23.12.1989");
  assert.equal(retyped.caret, 5);
});
test("вставка цифры в середину готовой даты не ломает остальное", () => {
  const f = type(empty(), "23.11.1989");
  const mid = type({ ...f, caret: 3 }, "0");
  assert.equal(mid.value, "23.01.1989", "лишняя цифра в месяце не удлиняет его: месяц остаётся из двух цифр");
});
test("слова не трогаем: около 1974, до 1978, примерно в мае", () => {
  for (const text of ["около 1974", "до 1978", "примерно в мае", "ок. 1950"]) assert.equal(type(empty(), text).value, text);
});
test("диапазон 1950-1960 и другие знаки не форматируются (вставка или после буквы)", () => {
  assert.equal(paste(empty(), "1950-1960").value, "1950-1960");
  assert.equal(paste(empty(), "1950–1960").value, "1950–1960");
  assert.equal(paste(empty(), "12/05/1989").value, "12/05/1989");
  assert.equal(type(empty(), "ок. 1950-1960").value, "ок. 1950-1960");
});
test("ограничение: диапазон «1950-1960» цифрами с первых символов: до дефиса идёт как год", () => {
  const f = type(empty(), "1950");
  assert.equal(f.value, "1950", "год остаётся годом");
  assert.equal(type(f, "-1960").value, "1950-1960", "дефис и дальше отключают маску");
});
test("пробел не превращается в точку", () => {
  assert.equal(type(empty(), " ").value, " ");
  assert.equal(paste(empty(), "23 11").value, "23 11");
  assert.equal(type(empty(), "до 12 мая").value, "до 12 мая");
});
test("вставка целиком: цифры раскладываются, готовая дата и год остаются", () => {
  assert.equal(paste(empty(), "23111989").value, "23.11.1989");
  assert.equal(paste(empty(), "23.11.1989").value, "23.11.1989");
  assert.equal(paste(empty(), "1989").value, "1989");
  assert.equal(paste(empty(), "около 1974").value, "около 1974");
  assert.equal(paste(empty(), "05.1989").value, "05.1989");
});
test("лишние точки и длина ограничиваются", () => {
  assert.equal(type(empty(), "23..").value, "23.");
  assert.equal(type(empty(), "23111989999").value, "23.11.1989");
});
test("открытие сохранённой даты ничего не меняет: маска применяется только к вводу", () => {
  for (const saved of ["1950-1960", "около 1974", "18.5.1989", "99.99.9999", "19.10"]) assert.equal(typeDate(saved, saved, saved.length).value, saved);
});
test("проверка календарной даты", () => {
  assert.equal(isCalendarDate("23.11.1989"), true);
  assert.equal(isCalendarDate("29.02.2020"), true);
  assert.equal(isCalendarDate("29.02.2019"), false);
  assert.equal(isCalendarDate("31.04.2020"), false);
  assert.equal(isCalendarDate("32.01.2020"), false);
  assert.equal(isCalendarDate("12.13.2020"), false);
  assert.equal(isCalendarDate("1989"), true);
  assert.equal(isCalendarDate("около 1974"), true);
  assert.equal(isCalendarDate("05.1989"), true);
});
