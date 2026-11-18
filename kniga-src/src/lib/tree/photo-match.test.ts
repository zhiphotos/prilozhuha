import assert from "node:assert/strict";
import test from "node:test";
import { matchPerson, parseFileName, planPhotos } from "./photo-match.ts";

const people = [
  { id: "1", firstName: "Валентина", patronymic: "Константиновна", lastName: "Бурова", maidenName: "Юдина" },
  { id: "2", firstName: "Валерий", patronymic: "Владимирович", lastName: "Буров" },
  { id: "3", firstName: "Мария", patronymic: "Петровна", lastName: "Юдина" },
  { id: "4", firstName: "Мария", patronymic: "Петровна", lastName: "Шилова", maidenName: "Юдина" },
];
const f = (n: string) => new File(["x"], n);

test("разбирает номер варианта", () => {
    assert.deepEqual(parseFileName("Попов Иван (2).jpg"), { base: "Попов Иван", variant: 2 });
    assert.equal(parseFileName("Бурова (Юдина) Валентина.jpg").base, "Бурова (Юдина) Валентина");
});
test("находит по фамилии и девичьей", () => {
    assert.equal(matchPerson("Бурова (Юдина) Валентина Константиновна", people)?.id, "1");
    assert.equal(matchPerson("Шилова (Юдина) Мария Петровна", people)?.id, "4");
    assert.equal(matchPerson("Юдина (Наместникова) Мария Петровна", people)?.id, "3");
});
test("не угадывает чужих", () => {
    assert.equal(matchPerson("Иванов Иван", people), null);
});
test("берёт фото без номера и не трогает людей с фото", () => {
    const plan = planPhotos([f("Буров Валерий Владимирович (2).jpg"), f("Буров Валерий Владимирович.jpg"), f("Ктото Левый.jpg")], people);
    assert.equal(plan.assign.length, 1);
    assert.equal(plan.assign[0]!.file.name, "Буров Валерий Владимирович.jpg");
    assert.deepEqual(plan.unmatched, ["Ктото Левый.jpg"]);
    assert.equal(planPhotos([f("Буров Валерий Владимирович.jpg")], [{ ...people[1]!, photo: "media:a" }]).skipped, 1);
  });
