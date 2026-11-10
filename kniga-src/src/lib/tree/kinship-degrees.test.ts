import assert from "node:assert/strict";
import test from "node:test";
import { genitivePhrase, kinship } from "./kinship.ts";
import type { Person, Union } from "./types.ts";

/** Общий предок A, от него две цепочки вниз: до меня (dF поколений) и до человека (dO поколений). */
function pair(dF: number, dO: number, otherGender: "m" | "f" = "m") {
  const people: Person[] = [{ id: "A", firstName: "Предок", patronymic: "", lastName: "Х", gender: "m", birthYear: "1700", deathYear: "", photo: "", note: "" }];
  const unions: Union[] = [];
  const chain = (tag: string, n: number, lastGender: "m" | "f") => {
    let prev = "A";
    for (let i = 1; i <= n; i++) {
      const id = `${tag}${i}`;
      people.push({ id, firstName: id, patronymic: "", lastName: "Х", gender: i === n ? lastGender : "m", birthYear: String(1700 + i * 25 + (tag === "O" ? 3 : 0)), deathYear: "", photo: "", note: "" });
      unions.push({ id: `u${tag}${i}`, partnerIds: [prev], childIds: [id], status: "married", startYear: "", endYear: "" });
      prev = id;
    }
    return prev;
  };
  const me = chain("F", dF, "m");
  const other = chain("O", dO, otherGender);
  return kinship(people, unions, me, other);
}

test("двоюродные и дальние ровесники: степень растёт без пропусков", () => {
  const words = ["", "", "Двоюродный", "Троюродный", "Четвероюродный", "Пятиюродный", "Шестиюродный", "Семиюродный", "Восьмиюродный", "9-юродный", "10-юродный"];
  for (let n = 3; n <= 10; n++) assert.equal(pair(n, n).title, `${words[n]} брат`, `n=${n}`);
});

test("дети и внуки троюродных: степень растёт с каждым поколением, не застревает", () => {
  assert.equal(pair(3, 4, "f").title, "Троюродная племянница");
  assert.equal(pair(3, 5).title, "Четвероюродный внук");
  assert.equal(pair(3, 5, "f").title, "Четвероюродная внучка");
  assert.equal(pair(3, 6).title, "Пятиюродный правнук");
  assert.equal(pair(3, 7).title, "Шестиюродный праправнук");
});

test("никакие две разные степени родства не получают одно название", () => {
  const seen = new Map<string, string>();
  for (let dF = 2; dF <= 8; dF++) {
    for (let dO = 2; dO <= 9; dO++) {
      const t = pair(dF, dO).title;
      const key = `${dF}/${dO}`;
      // Симметричные пары (брат и сестра по одному разу) различаются полом, а нам важна разница по поколениям.
      if (seen.has(t) && seen.get(t) !== key) assert.fail(`«${t}» у ${seen.get(t)} и у ${key}`);
      seen.set(t, key);
    }
  }
});

test("родительный падеж работает и для степеней числом", () => {
  assert.equal(genitivePhrase("9-юродная сестра"), "9-юродной сестры");
  assert.equal(genitivePhrase("Четвероюродный внук"), "четвероюродного внука");
  assert.equal(genitivePhrase("10-юродный брат"), "10-юродного брата");
});

test("обзор: у каждой пары поколений есть осмысленное название обоих полов, и оно склоняется", () => {
  const seen = new Map<string, string>();
  for (let dF = 1; dF <= 9; dF++) {
    for (let dO = 1; dO <= 10; dO++) {
      if (dF === dO && dF === 1) continue; // братья и сёстры считаются отдельно: стоят на общих родителях
      for (const g of ["m", "f"] as const) {
        const t = pair(dF, dO, g).title;
        assert.ok(t && !/undefined|NaN|\[object/.test(t), `${dF}/${dO}/${g}: «${t}»`);
        const gen = genitivePhrase(t);
        assert.ok(gen && !/undefined|NaN/.test(gen), `${dF}/${dO}/${g}: падеж «${gen}»`);
        const key = `${dF}/${dO}/${g}`;
        if (seen.has(t) && !/Предок|Потомок|Племянник \(|Племянница \(/.test(t)) assert.fail(`«${t}» у ${seen.get(t)} и у ${key}`);
        seen.set(t, key);
      }
    }
  }
});
