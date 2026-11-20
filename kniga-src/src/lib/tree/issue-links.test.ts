// Замечания о связях несут номер человека, чтобы строка плашки вела к нужной карточке. Данные вымышленные.
import assert from "node:assert/strict";
import test from "node:test";
import { validatePeopleLinks, validatePeopleLinksWithIds } from "./relgraph.ts";

test("каждое замечание о записях несёт номер человека, текст прежний", () => {
  const people = [
    { id: "a", name: "Альдор", parents: ["a"] },
    { id: "b", name: "Бренна", parents: ["ghost"] },
    { id: "c", name: "Витарис", spouse: "c" },
  ];
  const withIds = validatePeopleLinksWithIds(people);
  assert.deepEqual(withIds.map((x) => x.id), ["a", "b", "c"]);
  assert.deepEqual(withIds.map((x) => x.text), validatePeopleLinks(people), "старый вызов даёт те же тексты");
});
