import assert from "node:assert/strict";
import test from "node:test";
import { GIFT_CARDS, lookOf, readWish } from "@/lib/rod/gift";

test("неизвестное оформление заменяется первым", () => {
  assert.equal(lookOf("zzz").id, GIFT_CARDS[0]!.id);
  assert.equal(lookOf("rose").id, "rose");
});

test("битый намёк не роняет приложение", () => {
  assert.equal(readWish("%%%"), null);
  assert.equal(readWish(""), null);
});
