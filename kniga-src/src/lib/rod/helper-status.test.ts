import assert from "node:assert/strict";
import test from "node:test";
import { publishIfChangedWith, type HelperResult } from "./helper-auto.ts";
import { BASE_TOO_BIG, MAX_BASE_CHARS, baseSize, errorText, getSyncStatus, resetSyncStatus, setSyncStatus, statusOfRound, subscribeSyncStatus } from "./helper-status.ts";
import type { Book } from "./helper-changes.ts";

const book = (n: number): Book => ({ people: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Имя ${i}` })), places: [], stories: [], notes: [], pages: [], photos: [] }) as unknown as Book;

test("15а. размер считается как на сервере: длина JSON; граница ровно по пределу", () => {
  const b = book(10);
  assert.equal(baseSize(b).size, JSON.stringify(b).length);
  assert.equal(baseSize(b).limit, 2_500_000);
  assert.equal(MAX_BASE_CHARS, 2_500_000);
  assert.equal(baseSize(b).ok, true);
  const big = { ...book(0), notes: ["x".repeat(MAX_BASE_CHARS)] } as unknown as Book;
  assert.equal(baseSize(big).ok, false);
  const edge = { ...book(0), notes: [] } as unknown as Book;
  const room = MAX_BASE_CHARS - JSON.stringify({ ...edge, notes: [""] }).length;
  const exact = { ...edge, notes: ["x".repeat(room)] } as unknown as Book;
  assert.equal(baseSize(exact).size, MAX_BASE_CHARS);
  assert.equal(baseSize(exact).ok, true);
  const over = { ...edge, notes: ["x".repeat(room + 1)] } as unknown as Book;
  assert.equal(baseSize(over).ok, false);
});

test("15б. слишком большая книга: понятное сообщение с процентом, без цифр сервера и без слова «ошибка 400»", () => {
  const big = { ...book(0), notes: ["x".repeat(MAX_BASE_CHARS + 500_000)] } as unknown as Book;
  const text = BASE_TOO_BIG(baseSize(big));
  assert.match(text, /\d+%/);
  assert.match(text, /помощник/i);
  assert.ok(!text.includes("400"));
  assert.ok(!text.includes("—"), "без длинного тире");
});

test("15в. состояние: слушатели получают только настоящие изменения, сброс возвращает «ничего не показывать»", () => {
  resetSyncStatus();
  let calls = 0;
  const stop = subscribeSyncStatus(() => (calls += 1));
  setSyncStatus("ok", "Версия для помощников обновлена", 1);
  setSyncStatus("ok", "Версия для помощников обновлена", 2); // то же самое: не будим экран
  assert.equal(calls, 1);
  setSyncStatus("error", "Нет связи");
  assert.equal(calls, 2);
  assert.equal(getSyncStatus().state, "error");
  assert.equal(getSyncStatus().text, "Нет связи");
  stop();
  setSyncStatus("ok", "снова");
  assert.equal(calls, 2, "после отписки не вызывается");
  resetSyncStatus();
  assert.deepEqual({ ...getSyncStatus(), at: 0 }, { state: "off", text: "", at: 0 });
});

test("15г. каждый исход обхода помощника имеет понятный текст; без книги помощника ничего не показываем", () => {
  const all: HelperResult[] = ["no-session", "no-who", "waiting", "idle", "updated", "skipped"];
  for (const r of all) {
    const s = statusOfRound(r);
    if (r === "no-session") assert.equal(s, null);
    else {
      assert.ok(s && s.text.length > 10, r);
      assert.ok(!s.text.includes("—"));
    }
  }
  assert.equal(statusOfRound("waiting")!.state, "waiting");
  assert.equal(statusOfRound("updated")!.state, "ok");
});

test("15д. ошибка выкладки не глотается: из publishIfChangedWith она доходит до вызывающего (раньше helper.ts её прятал)", async () => {
  const lists = () => book(3);
  const fail = publishIfChangedWith({ hasRoom: () => true, lastSignature: () => "старая", lists, publish: async () => { throw new Error("Сервер не ответил."); } });
  await assert.rejects(fail, /Сервер не ответил/);
  assert.equal(errorText(new Error("Сервер не ответил.")), "Сервер не ответил.");
  assert.match(errorText("что-то"), /Повторю/);
});
