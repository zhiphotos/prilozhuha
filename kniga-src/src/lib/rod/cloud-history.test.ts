// Определение no-cloud: только по явному признаку «книга создана на этом устройстве и ни разу не синхронизировалась».
// Пустые отметки синхронизации сами по себе ничего не доказывают (синтетические книги, настоящие projects.ts и applyBookData).
import assert from "node:assert/strict";
import test from "node:test";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};
const g = globalThis as unknown as Record<string, unknown>;
g.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, setTimeout, clearTimeout, localStorage: g.localStorage, location: { href: "http://localhost/", origin: "http://localhost" } };
g.document = { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };

const { addProjectMeta, addProjectWithId, setActiveProject, activeProjectId, isLocalOnly, clearLocalOnly, MAIN_ID } = await import("./projects.ts");
const { applyBookData } = await import("./backup.ts");
const { cloudHistoryFrom, cloudCheckFor } = await import("./cloud-check.ts");
const { parentsDiff, replacePolicy } = await import("../tree/second-parent.ts");

const REPLACE = parentsDiff(["мать", "отец"], ["мать", "друг"]);
const ADD = parentsDiff(["мать"], ["мать", "друг"]);
const metaKey = () => (activeProjectId() === MAIN_ID ? "kniga-sync" : `kniga-sync:${activeProjectId()}`);
/** То же, что делает checkCloudBeforeEdit без входа в аккаунт. */
const check = () =>
  cloudCheckFor({
    authorized: false,
    history: () => cloudHistoryFrom(() => localStorage.getItem(metaKey()), async () => null, () => isLocalOnly(activeProjectId())),
    run: async () => ({ kind: "same" }),
    isBusy: () => false,
  });

test("11а. книга создана на этом устройстве, признак есть, отметок нет: no-cloud, замена разрешена", async () => {
  const meta = addProjectMeta("Книга для проверки");
  setActiveProject(meta.id);
  assert.equal(isLocalOnly(meta.id), true);
  const cloud = await check();
  assert.equal(cloud, "no-cloud");
  assert.equal(replacePolicy(REPLACE, cloud).allowed, true);
});

test("11б. отметки синхронизации стёрты, книга осталась: отсутствие отметок не доказывает отсутствие облака, замена запрещена", async () => {
  const meta = addProjectMeta("Книга, которая была в облаке");
  setActiveProject(meta.id);
  clearLocalOnly(meta.id); // любая попытка синхронизации (makeDeps) снимает признак навсегда
  mem.delete(metaKey()); // браузер или человек стёр отметку синхронизации
  const cloud = await check();
  assert.equal(cloud, "unknown");
  assert.equal(replacePolicy(REPLACE, cloud).allowed, false);
});

test("11в. первая книга и книга из облака не получают признака: при пустых отметках unknown, замена запрещена", async () => {
  mem.delete("kniga-sync");
  setActiveProject(MAIN_ID);
  assert.equal(isLocalOnly(MAIN_ID), false);
  assert.equal(await check(), "unknown");
  addProjectWithId("облако1", "Из облака");
  setActiveProject("облако1");
  assert.equal(isLocalOnly("облако1"), false);
  const cloud = await check();
  assert.equal(cloud, "unknown");
  assert.equal(replacePolicy(REPLACE, cloud).allowed, false);
});

test("11г. книга восстановлена из локальной копии без истории синхронизации: признак снят, замена запрещена", async () => {
  const meta = addProjectMeta("Книга из копии");
  setActiveProject(meta.id);
  assert.equal(await check(), "no-cloud", "до восстановления признак был");
  applyBookData({ people: [], pages: [], photos: [] }); // так применяются и копия, и облако
  assert.equal(isLocalOnly(meta.id), false);
  const cloud = await check();
  assert.equal(cloud, "unknown");
  assert.equal(replacePolicy(REPLACE, cloud).allowed, false, "отсутствие облачной копии не доказано");
});

test("11д. признак нельзя вернуть тем, что отметки пусты; удалённая книга признака не оставляет", async () => {
  const meta = addProjectMeta("Разовая");
  clearLocalOnly(meta.id);
  mem.delete(`kniga-sync:${meta.id}`);
  setActiveProject(meta.id);
  assert.equal(isLocalOnly(meta.id), false);
  assert.equal(await check(), "unknown");
});

test("11е. unknown разрешает добавление без удаления, но блокирует замену и снятие", () => {
  assert.equal(replacePolicy(ADD, "unknown").allowed, true);
  assert.equal(replacePolicy(REPLACE, "unknown").allowed, false);
  const REMOVE = parentsDiff(["мать", "отец"], ["мать"]);
  assert.equal(replacePolicy(REMOVE, "unknown").allowed, false, "снятие родителя тоже блокируется");
});
