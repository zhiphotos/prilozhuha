// Привязка людей к фотографии (замечание Lilya): несколько человек, поиск, подпись из имён, «Сохранить» не остаётся серым после выбора человека.
import assert from "node:assert/strict";
import test from "node:test";
import { canSavePhoto, photoCaption, photoLinkFields, photoPeopleIds } from "./photo-people.ts";

const people = [
  { id: "a", name: "Нина Ивановна" },
  { id: "b", name: "Пётр" },
  { id: "c", name: "" },
];

test("прежняя привязка (один человек) читается как список из одного", () => {
  assert.deepEqual(photoPeopleIds({ personId: "a" }), ["a"]);
  assert.deepEqual(photoPeopleIds({ personId: "" }), []);
  assert.deepEqual(photoPeopleIds({ personId: "a", personIds: ["a", "b", "a"] }), ["a", "b"]);
});

test("запись привязки: первый человек остаётся в personId для прежних версий приложения", () => {
  assert.deepEqual(photoLinkFields(["b", "a", "b"]), { personId: "b", personIds: ["b", "a"] });
  assert.deepEqual(photoLinkFields([]), { personId: "", personIds: [] });
});

test("подпись: написанное важнее, иначе имена отмеченных людей, безымянные пропускаются", () => {
  assert.equal(photoCaption("Бабушка и мама", ["a"], people), "Бабушка и мама");
  assert.equal(photoCaption("  ", ["a", "b"], people), "Нина Ивановна, Пётр");
  assert.equal(photoCaption("", ["c"], people), "");
  assert.equal(photoCaption("", [], people), "");
});

test("БЫЛО: после выбора человека кнопка оставалась неактивной, пока вручную не напишешь «Кто на фото»; СТАЛО: активна", () => {
  const oldRule = (dataUrl: string, who: string) => Boolean(dataUrl) && Boolean(who.trim()); // прежнее условие disabled
  assert.equal(oldRule("data:x", ""), false, "так было: человек выбран, подпись пуста, кнопка серая");
  assert.equal(canSavePhoto({ dataUrl: "data:x", who: "", ids: ["a"], people }), true);
  assert.equal(canSavePhoto({ dataUrl: "data:x", who: "", ids: [], people }), false, "без подписи и без людей сохранять нечего");
  assert.equal(canSavePhoto({ dataUrl: "", who: "x", ids: ["a"], people }), false, "без снимка нельзя");
  assert.equal(canSavePhoto({ dataUrl: "data:x", who: "x", ids: [], people, busy: true }), false, "пока снимок открывается, нельзя");
});
