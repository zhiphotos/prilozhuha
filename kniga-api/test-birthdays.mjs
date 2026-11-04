import assert from "node:assert/strict";
import { cleanBirthdays } from "./lib/routes/push-subscribe.js";

const out = cleanBirthdays([
  { d: "03-05", n: "Мария" },
  { d: "13-01", n: "Плохой месяц" },
  { d: "02-30", n: "ok формат" },
  { d: "09-01", n: "  <b>Пётр</b>  ", extra: "фамилия" },
  { d: "09-01", n: "" },
  "мусор",
]);
assert.deepEqual(out, [{ d: "03-05", n: "Мария" }, { d: "02-30", n: "ok формат" }, { d: "09-01", n: "bПётр/b" }]);
assert.deepEqual(cleanBirthdays(undefined), []);
assert.equal(cleanBirthdays(Array.from({ length: 500 }, () => ({ d: "01-01", n: "А" }))).length, 200);
console.log("birthdays ok");
