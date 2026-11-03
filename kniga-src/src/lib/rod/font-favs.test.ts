import test from "node:test";
import assert from "node:assert/strict";
import { parseFavs, toggleFavList } from "./font-favs.ts";

test("звёздочка добавляет шрифт в конец и снимается повторным нажатием", () => {
  assert.deepEqual(toggleFavList([], "custom:bristol"), ["custom:bristol"]);
  assert.deepEqual(toggleFavList(["custom:bristol"], "custom:sacco"), ["custom:bristol", "custom:sacco"]);
  assert.deepEqual(toggleFavList(["custom:bristol", "custom:sacco"], "custom:bristol"), ["custom:sacco"]);
});
test("сохранённое читается устойчиво: мусор, повторы и не строки отбрасываются", () => {
  assert.deepEqual(parseFavs(null), []);
  assert.deepEqual(parseFavs("не json"), []);
  assert.deepEqual(parseFavs('{"a":1}'), []);
  assert.deepEqual(parseFavs('["custom:a","custom:a",5,"",null,"custom:b"]'), ["custom:a", "custom:b"]);
});
