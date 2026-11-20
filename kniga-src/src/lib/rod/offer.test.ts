import { test } from "node:test";
import assert from "node:assert/strict";
import { PROGRAM_PRICE } from "./content.ts";
import { OFFER_ON, offerPhase, priceNow, payNote, lessonPayNote, saleBannerText, showOldPrice, saleDaysLeft, SALE_END, YEAR_PRICE } from "./offer.ts";

const at = (iso: string) => Date.parse(iso);

test("по умолчанию акция выключена и тексты прежние", () => {
  assert.equal(OFFER_ON, false);
  assert.equal(priceNow(), PROGRAM_PRICE);
  assert.equal(payNote(), "Один платёж, без подписки");
  assert.equal(saleBannerText(), null);
  assert.equal(showOldPrice(), true);
});

test("до 1 декабря: плашка, срок, старый тариф", () => {
  const now = at("2026-11-27T10:00:00+03:00");
  assert.equal(offerPhase(now, true), "sale");
  assert.equal(priceNow(now, true), PROGRAM_PRICE);
  const b = saleBannerText(now, true);
  assert.ok(b && b.title.includes("осталось 4 дня"));
  assert.ok(b.text.includes(`${YEAR_PRICE} в год`));
  assert.ok(payNote(now, true).includes("до 30 ноября"));
});

test("30 ноября последний день, 1 декабря уже подписка", () => {
  const last = at("2026-11-30T23:59:00+03:00");
  assert.equal(saleDaysLeft(last), 1);
  assert.ok(saleBannerText(last, true)?.title.includes("последний день"));
  const after = SALE_END;
  assert.equal(offerPhase(after, true), "after");
  assert.equal(priceNow(after, true), `${YEAR_PRICE} в год`);
  assert.equal(saleBannerText(after, true), null);
  assert.equal(showOldPrice(after, true), false);
  assert.ok(!payNote(after, true).includes("без подписки"));
  assert.ok(!lessonPayNote(after, true).includes("без подписки"));
});

test("слова «день, дня, дней» склоняются верно", () => {
  const t = (d: number) => saleBannerText(SALE_END - d * 86400000 + 1000, true)?.title ?? "";
  assert.ok(t(2).includes("2 дня"));
  assert.ok(t(5).includes("5 дней"));
  assert.ok(t(11).includes("11 дней"));
  assert.ok(t(21).includes("21 день"));
});
