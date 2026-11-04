import test from "node:test";
import assert from "node:assert/strict";
import { ageText, parseDate, yearsAgoText, yearsWord } from "./age.ts";

const NOW = new Date(2026, 10, 4); // 4 ноября 2026

test("разбор дат: полная, месяц и год, только год, приблизительные", () => {
  assert.deepEqual(parseDate("28.10.1961"), { year: 1961, month: 10, day: 28, approx: false });
  assert.deepEqual(parseDate("10.1961"), { year: 1961, month: 10, approx: false });
  assert.deepEqual(parseDate("1989"), { year: 1989, approx: false });
  assert.equal(parseDate("около 1974")?.approx, true);
  assert.equal(parseDate("28.05.1968?")?.approx, true);
  assert.equal(parseDate(""), null);
  assert.equal(parseDate("давно"), null);
  assert.equal(parseDate("1950-1960"), null, "диапазон не разбираем: возраста нет");
});

test("склонение «год, года, лет»", () => {
  const w = (n: number) => `${n} ${yearsWord(n)}`;
  assert.deepEqual([1, 2, 5, 11, 12, 14, 21, 22, 25, 64, 101, 111].map(w), ["1 год", "2 года", "5 лет", "11 лет", "12 лет", "14 лет", "21 год", "22 года", "25 лет", "64 года", "101 год", "111 лет"]);
});

test("возраст живого по полной дате учитывает, был ли уже день рождения", () => {
  assert.equal(ageText("28.10.1961", undefined, NOW), "65 лет");
  assert.equal(ageText("05.11.1961", undefined, NOW), "64 года", "день рождения ещё впереди");
  assert.equal(ageText("04.11.1961", undefined, NOW), "65 лет", "в сам день рождения");
});

test("возраст по одному году помечен «≈»", () => {
  assert.equal(ageText("1989", undefined, NOW), "≈ 37 лет");
  assert.equal(ageText("около 1974", undefined, NOW), "≈ 52 года");
});

test("ушедшему: возраст между датами, а не до сегодняшнего дня", () => {
  assert.equal(ageText("21.01.1934", "17.08.2024", NOW), "90 лет");
  assert.equal(ageText("1936", "2024", NOW), "≈ 88 лет");
});

test("нет даты рождения, будущая или нелепая дата: возраста нет", () => {
  assert.equal(ageText("", "2000", NOW), null);
  assert.equal(ageText("2040", undefined, NOW), null);
  assert.equal(ageText("1700", undefined, NOW), null);
  assert.equal(ageText("1900", undefined, NOW), null, "старше 125 лет живым не бывает");
});

test("сколько лет назад", () => {
  assert.equal(yearsAgoText("04.11.2016", NOW), "10 лет назад");
  assert.equal(yearsAgoText("1996", NOW), "≈ 30 лет назад");
  assert.equal(yearsAgoText("2026", NOW), "в этом году");
  assert.equal(yearsAgoText("", NOW), null);
});
