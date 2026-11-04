import assert from "node:assert/strict";
import test from "node:test";
import { birthdayList } from "./birthdays.ts";

test("в список попадают только живые с полной датой, без фамилии", () => {
  const list = birthdayList([
    { name: "Мария Иванова", firstName: "Мария", birthYear: "05.03.1950", deathYear: "" },
    { name: "Пётр", firstName: "", birthYear: "1.9.1940", deathYear: "" },
    { name: "Только год", firstName: "Год", birthYear: "1948", deathYear: "" },
    { name: "Ушёл", firstName: "Иван", birthYear: "01.01.1900", deathYear: "1980" },
  ]);
  assert.deepEqual(list, [{ d: "03-05", n: "Мария" }, { d: "09-01", n: "Пётр" }]);
});
