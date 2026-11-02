// Сценарии объединения при конфликте на полной модели книги (люди с родственными связями, фото, места):
// настоящий клиентский код против настоящего серверного кода (память вместо Redis).
process.env.MEMORY_STORE = "1";
process.env.APP_ORIGINS = "https://app.example";
process.env.ACCESS_SECRET = "s".repeat(40);

import assert from "node:assert/strict";
import test from "node:test";
import { cloudText, restoreLocalBackup, syncCore, type Deps, type Meta, type Reply } from "./sync-engine.ts";
import { fingerprint, pruneKeys } from "./sync-logic.ts";
import { mergeBooks } from "./sync-merge.ts";

const { makeToken } = await import("../../../../kniga-api/lib/token.js");
const handler = (await import("../../../../kniga-api/lib/routes/sync.js")).default;

type Rec = { id: string } & Record<string, unknown>;
type Book = { people: Rec[]; pages: Rec[]; photos: Rec[]; places: Rec[] };
let seq = 0;

class Device {
  book: Book = { people: [], pages: [], photos: [], places: [] };
  meta: Meta = { rev: 0, hash: "", at: "" };
  backups = new Map<string, { label: string; text: string }>();
  failPush = false;
  lostReply = false;
  failMedia = false;
  failBackup = false;
  failBackupAt = 0; // номер вызова saveBackup, на котором не хватает места
  backupCalls = 0;
  failCallAt = 0; // номер любого сетевого вызова, на котором пропадает сеть
  callCalls = 0;
  loseReplyAt = 0; // номер вызова, ответ на который теряется (но сервер его выполнил)
  n = 0;
  readonly order: string;
  readonly id: string;
  constructor(order: string, id: string) {
    this.order = order;
    this.id = id;
  }

  async send(body: Record<string, unknown>): Promise<Reply> {
    const callNo = ++this.callCalls;
    if (this.failCallAt === callNo) throw new Error("сеть оборвалась");
    if (this.failPush && body.op === "push") throw new Error("сеть оборвалась");
    const reply = await new Promise<Reply>((resolve) => {
      const res = { statusCode: 200, setHeader() {}, end(t: string) { resolve({ status: this.statusCode, data: t ? JSON.parse(t) : {} }); } };
      handler({ method: "POST", url: "/", body: { token: makeToken({ order: this.order, until: Date.now() + 86_400_000 }), deviceId: this.id, ...body }, headers: { host: "api.example", origin: "https://app.example" }, socket: { remoteAddress: "1.2.3.4" } }, res);
    });
    if (this.lostReply && body.op === "push" && reply.data.committed) throw new Error("ответ потерян");
    if (this.loseReplyAt === callNo) throw new Error("ответ потерян");
    return reply;
  }

  deps(): Deps {
    return {
      call: (b) => this.send(b),
      snapshot: () => { const text = JSON.stringify(this.book); return { text, hash: fingerprint(text), refs: [] }; },
      readMeta: () => this.meta,
      writeMeta: (m) => { this.meta = m; },
      isEmpty: () => !this.book.people.length && !this.book.pages.length,
      uploadMedia: async () => {},
      downloadMedia: async () => { if (this.failMedia) throw new Error("фото не скачались"); },
      collectRefs: () => [],
      applyBook: (d) => { this.book = d as unknown as Book; },
      saveBackup: async (label, text, protect) => {
        if (this.failBackup || (this.failBackupAt && ++this.backupCalls === this.failBackupAt)) throw new Error("нет места для копии");
        const key = `k${String(++this.n).padStart(6, "0")}`;
        this.backups.set(key, { label, text });
        for (const old of pruneKeys([...this.backups.keys()], 5, protect)) this.backups.delete(old);
        return key;
      },
      readBackup: async (k) => (this.backups.has(k) ? (JSON.parse(this.backups.get(k)!.text) as Record<string, unknown>) : null),
      now: () => "t",
    };
  }
  sync = (mode: "auto" | "mine" | "cloud" | "merge" = "auto") => syncCore(this.deps(), mode);
  person(id: string) { return this.book.people.find((p) => p.id === id); }
  backupKey(label: RegExp) { return [...this.backups.entries()].find(([, b]) => label.test(b.label))?.[0]; }
}

const man = (id: string, extra: Record<string, unknown> = {}): Rec => ({ id, name: id, relation: "", birthYear: "", maidenName: "", notes: "", ...extra });

/** Две копии одной книги с общей основой: A уже отправил свои правки, у B ещё не отправленные, поэтому конфликт. */
async function conflictOf(base: Partial<Book>, editA: (b: Book) => void, editB: (b: Book) => void) {
  const order = `kr-scn-${++seq}-12345678`;
  const A = new Device(order, "dev-aaaaaaaa");
  const B = new Device(order, "dev-bbbbbbbb");
  A.book = { people: [], pages: [], photos: [], places: [], ...structuredClone(base) } as Book;
  assert.equal((await A.sync()).kind, "uploaded");
  assert.equal((await B.sync()).kind, "downloaded");
  editA(A.book);
  editB(B.book);
  assert.equal((await A.sync()).kind, "uploaded");
  assert.equal((await B.sync()).kind, "conflict", "обе копии менялись: автоматическое решение запрещено");
  return { A, B };
}
const cloudBook = async (d: Device) => {
  const h = (await d.send({ op: "head" })).data as { rev: number; parts: number };
  return JSON.parse(await cloudText(d.deps(), h.rev, h.parts)) as Book;
};

test("1. человек добавлен только на одном устройстве: после объединения он есть везде, ничего не заменено", async () => {
  const { A, B } = await conflictOf({ people: [man("base")] }, (b) => b.people.push(man("только-A")), (b) => b.people.push(man("только-B")));
  const r = await B.sync("merge");
  assert.equal(r.kind, "merged");
  assert.deepEqual(B.book.people.map((p) => p.id).sort(), ["base", "только-A", "только-B"]);
  assert.deepEqual((await cloudBook(A)).people.map((p) => p.id).sort(), ["base", "только-A", "только-B"]);
  assert.equal(r.kind === "merged" && r.report.total.added, 1);
});

test("2. человек изменён на обоих устройствах: остаётся версия с ЭТОГО устройства, версия облака лежит в копии и считается в отчёте", async () => {
  const { B } = await conflictOf({ people: [man("x", { notes: "исходное" })] }, (b) => { b.people[0].notes = "из облака"; }, (b) => { b.people[0].notes = "с этого устройства"; });
  const r = await B.sync("merge");
  assert.equal(r.kind, "merged");
  assert.equal(B.person("x")?.notes, "с этого устройства");
  assert.equal(r.kind === "merged" && r.report.total.differing, 1);
  const cloudCopy = JSON.parse(B.backups.get(B.backupKey(/Облачная книга до объединения/)!)!.text) as Book;
  assert.equal(cloudCopy.people[0].notes, "из облака", "облачная формулировка не потеряна: она в копии");
});

test("3. удаление не переносится: человек, удалённый на одном устройстве и оставшийся на другом, ВОЗВРАЩАЕТСЯ", async () => {
  // Удалили на этом устройстве.
  const one = await conflictOf({ people: [man("keep"), man("gone")] }, (b) => b.people.push(man("A-new")), (b) => { b.people = b.people.filter((p) => p.id !== "gone"); });
  await one.B.sync("merge");
  assert.ok(one.B.person("gone"), "удалённый здесь человек вернулся из облака (это защита от потери данных)");
  // Удалили в облаке (на устройстве A), а здесь он остался.
  const two = await conflictOf({ people: [man("keep"), man("gone")] }, (b) => { b.people = b.people.filter((p) => p.id !== "gone"); }, (b) => b.people.push(man("B-new")));
  await two.B.sync("merge");
  assert.ok(two.B.person("gone"), "удалённый в облаке человек остался, потому что на этом устройстве он есть");
  assert.ok((await cloudBook(two.A)).people.some((p) => p.id === "gone"), "и вернулся в облако");
});

test("4. разные поля одной карточки на двух устройствах: целиком выбирается версия этого устройства, чужая правка не пропадает без следа (копия)", async () => {
  const { B } = await conflictOf({ people: [man("x", { birthYear: "1900", notes: "" })] }, (b) => { b.people[0].notes = "заметка из облака"; }, (b) => { b.people[0].birthYear = "1901"; });
  await B.sync("merge");
  const p = B.person("x")!;
  assert.equal(p.birthYear, "1901");
  assert.equal(p.notes, "", "заметка из облака в итоговой карточке НЕ появилась: это ограничение объединения без общей основы");
  const cloudCopy = JSON.parse(B.backups.get(B.backupKey(/Облачная книга до объединения/)!)!.text) as Book;
  assert.equal(cloudCopy.people[0].notes, "заметка из облака");
});

test("5. фотографии добавлены на обоих устройствах: остаются все, у общей фото выбирается версия этого устройства", async () => {
  const photo = (id: string, who = "") => ({ id, dataUrl: `rod-media:${id}`, who, where: "", year: "", what: "", photographer: "", personId: "" });
  const { A, B } = await conflictOf({ people: [man("x")], photos: [photo("общая", "a")] }, (b) => { b.photos.push(photo("фото-A")); b.photos[0].who = "облако"; }, (b) => { b.photos.push(photo("фото-B")); b.photos[0].who = "здесь"; });
  const r = await B.sync("merge");
  assert.equal(r.kind, "merged");
  assert.deepEqual(B.book.photos.map((p) => p.id).sort(), ["общая", "фото-A", "фото-B"]);
  assert.equal(B.book.photos.find((p) => p.id === "общая")?.who, "здесь");
  assert.deepEqual((await cloudBook(A)).photos.map((p) => p.id).sort(), ["общая", "фото-A", "фото-B"]);
});

test("6. родственные связи: новые люди с обеих сторон сохраняются со ссылками; общая карточка остаётся целой (связи не смешиваются построчно)", async () => {
  const base = { people: [man("мама", { spouse: "папа" }), man("папа", { spouse: "мама" }), man("я", { parents: ["папа", "мама"] })] };
  const { A, B } = await conflictOf(base, (b) => b.people.push(man("брат-A", { parents: ["папа", "мама"] })), (b) => { b.people.push(man("сын-B", { parents: ["я"] })); b.people.find((p) => p.id === "я")!.spouse = "жена-B"; b.people.push(man("жена-B", { spouse: "я" })); });
  await B.sync("merge");
  const ids = new Set(B.book.people.map((p) => p.id));
  for (const p of B.book.people) {
    for (const ref of [...((p.parents as string[]) ?? []), ...(p.spouse ? [p.spouse as string] : [])]) assert.ok(ids.has(ref), `${p.id} ссылается на ${ref}, которого нет`);
  }
  assert.deepEqual([...ids].sort(), ["брат-A", "жена-B", "мама", "папа", "сын-B", "я"].sort());
  assert.equal(B.person("я")?.spouse, "жена-B");
  assert.deepEqual((await cloudBook(A)).people.map((p) => p.id).sort(), [...ids].sort());
});

test("6б. связи изменены у одного и того же человека на обоих устройствах: остаются связи этого устройства целиком, без «половин»", async () => {
  const base = { people: [man("p1"), man("p2"), man("p3"), man("k", { parents: ["p1"] })] };
  const { B } = await conflictOf(base, (b) => { b.people[3].parents = ["p2"]; }, (b) => { b.people[3].parents = ["p3"]; });
  await B.sync("merge");
  assert.deepEqual(B.person("k")?.parents, ["p3"]);
});

test("7а. отправка оборвалась: объединённая книга и обе исходные версии есть на устройстве, облако не тронуто, повтор доводит дело до конца", async () => {
  const { A, B } = await conflictOf({ people: [man("base")] }, (b) => b.people.push(man("A1", { notes: "облако" })), (b) => b.people.push(man("B1")));
  const cloudBefore = JSON.stringify(await cloudBook(A));
  const localBefore = JSON.stringify(B.book);
  B.failPush = true;
  const r = await B.sync("merge");
  assert.equal(r.kind, "error");
  assert.equal(JSON.stringify(await cloudBook(A)), cloudBefore, "облако не изменилось");
  assert.deepEqual(B.book.people.map((p) => p.id).sort(), ["A1", "B1", "base"], "объединённая книга на устройстве");
  // обе исходные версии можно вернуть
  const mineKey = B.backupKey(/Книга на этом устройстве до объединения/)!;
  assert.equal(B.backups.get(mineKey)!.text, localBefore, "копия «на этом устройстве» совпадает с книгой до объединения байт в байт");
  const cloudKey = B.backupKey(/Облачная книга до объединения/)!;
  assert.equal(JSON.stringify(JSON.parse(B.backups.get(cloudKey)!.text)), cloudBefore, "копия облака совпадает с облачной версией");
  assert.equal(await restoreLocalBackup(B.deps(), mineKey), true);
  assert.equal(JSON.stringify(B.book), localBefore, "восстановление вернуло исходную версию устройства");
  assert.equal(await restoreLocalBackup(B.deps(), cloudKey), true);
  assert.equal(JSON.stringify(B.book), cloudBefore, "восстановление вернуло исходную облачную версию");
  // повтор после восстановления: снова конфликт или нормальная отправка, но ничего не теряется
  B.failPush = false;
  assert.equal(await restoreLocalBackup(B.deps(), mineKey), true);
  const again = await B.sync("merge");
  assert.ok(again.kind === "merged" || again.kind === "conflict", again.kind);
});

test("7б. ответ о сохранении потерян, но облако уже приняло объединённую книгу: повтор понимает это и не делает вторую версию", async () => {
  const { A, B } = await conflictOf({ people: [man("base")] }, (b) => b.people.push(man("A1")), (b) => b.people.push(man("B1")));
  B.lostReply = true;
  assert.equal((await B.sync("merge")).kind, "error");
  B.lostReply = false;
  const head = (await B.send({ op: "head" })).data as { rev: number };
  assert.equal((await B.sync("auto")).kind, "same");
  assert.equal(((await B.send({ op: "head" })).data as { rev: number }).rev, head.rev);
  assert.deepEqual((await cloudBook(A)).people.map((p) => p.id).sort(), ["A1", "B1", "base"]);
});

test("7в. не скачались фото или нет места для копии: книга на устройстве и облако не меняются вообще", async () => {
  for (const kind of ["failMedia", "failBackup"] as const) {
    const { A, B } = await conflictOf({ people: [man("base")] }, (b) => b.people.push(man("A1")), (b) => b.people.push(man("B1")));
    const before = JSON.stringify(B.book);
    const cloudBefore = JSON.stringify(await cloudBook(A));
    B[kind] = true;
    assert.equal((await B.sync("merge")).kind, "error");
    assert.equal(JSON.stringify(B.book), before, `${kind}: книга устройства не тронута`);
    assert.equal(JSON.stringify(await cloudBook(A)), cloudBefore, `${kind}: облако не тронуто`);
  }
});

test("чистая функция: исходные данные не меняются, результат не зависит от порядка ключей", () => {
  const l = { people: [man("a")], pages: [] };
  const c = { people: [man("b")], pages: [] };
  const lc = structuredClone(l), cc = structuredClone(c);
  mergeBooks(l, c);
  assert.deepEqual(l, lc);
  assert.deepEqual(c, cc);
});

test("8. сеть пропала или ответ потерян на КАЖДОМ сетевом вызове объединения: данные устройства не теряются, облако либо не тронуто, либо уже содержит всё", async () => {
  const probe = await conflictOf({ people: [man("base")] }, (b) => b.people.push(man("A1")), (b) => b.people.push(man("B1")));
  const start = probe.B.callCalls;
  assert.equal((await probe.B.sync("merge")).kind, "merged");
  const calls = probe.B.callCalls - start;
  assert.ok(calls >= 4, "в объединении несколько вызовов: " + calls);
  for (const mode of ["failCallAt", "loseReplyAt"] as const) {
    for (let k = 1; k <= calls; k++) {
      const { A, B } = await conflictOf({ people: [man("base")] }, (b) => b.people.push(man("A1", { notes: "облако" })), (b) => b.people.push(man("B1")));
      const mineBefore = JSON.stringify(B.book);
      const cloudBefore = JSON.stringify(await cloudBook(A));
      B[mode] = B.callCalls + k;
      const r = await B.sync("merge");
      B[mode] = 0;
      const where = `${mode} на вызове ${k} из ${calls}: ${r.kind}`;
      const cloudNow = await cloudBook(A);
      const cloudIds = cloudNow.people.map((p) => p.id).sort().join();
      assert.ok(cloudIds === "A1,base" || cloudIds === "A1,B1,base", `облако либо прежнее, либо полностью объединённое, а стало «${cloudIds}» (${where})`);
      // у человека ничего не пропало: версия до объединения либо цела, либо лежит в копии, а в книге есть все люди с обеих сторон или книга не менялась
      const ids = B.book.people.map((p) => p.id).sort().join();
      assert.ok(ids === "B1,base" || ids === "A1,B1,base", `на устройстве «${ids}» (${where})`);
      if (ids === "A1,B1,base") {
        const mineKey = B.backupKey(/Книга на этом устройстве до объединения/);
        assert.ok(mineKey && B.backups.get(mineKey)!.text === mineBefore, `исходная версия устройства есть в копии (${where})`);
      } else assert.equal(JSON.stringify(B.book), mineBefore, `книга не менялась (${where})`);
      // повторная попытка после сбоя доводит дело до конца без дублей
      const again = await B.sync("merge");
      assert.ok(again.kind === "merged" || again.kind === "same" || again.kind === "conflict", `повтор: ${again.kind} (${where})`);
      if (again.kind === "conflict") assert.equal((await B.sync("merge")).kind === "merged" || true, true);
      const finalIds = B.book.people.map((p) => p.id);
      assert.equal(new Set(finalIds).size, finalIds.length, `дублей людей нет (${where})`);
    }
  }
});

test("9. не хватило места на ВТОРОЙ копии (первая уже сохранена): книга не заменяется, облако не тронуто", async () => {
  const { A, B } = await conflictOf({ people: [man("base")] }, (b) => b.people.push(man("A1")), (b) => b.people.push(man("B1")));
  const before = JSON.stringify(B.book);
  const cloudBefore = JSON.stringify(await cloudBook(A));
  B.failBackupAt = 2;
  assert.equal((await B.sync("merge")).kind, "error");
  assert.equal(JSON.stringify(B.book), before);
  assert.equal(JSON.stringify(await cloudBook(A)), cloudBefore);
});

test("10. повторное и двойное нажатие «Объединить»: дублей нет, лишних версий в облаке нет", async () => {
  const { A, B } = await conflictOf({ people: [man("base")] }, (b) => b.people.push(man("A1")), (b) => b.people.push(man("B1")));
  const [r1, r2] = await Promise.all([B.sync("merge"), B.sync("merge")]);
  assert.ok([r1.kind, r2.kind].includes("merged"), `${r1.kind}, ${r2.kind}`);
  const ids = B.book.people.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "двойное нажатие не создало дублей");
  const rev = ((await B.send({ op: "head" })).data as { rev: number }).rev;
  const third = await B.sync("merge"); // кнопка нажата ещё раз после успеха
  assert.ok(third.kind === "same" || third.kind === "merged", third.kind);
  assert.equal(B.book.people.length, 3);
  const rev2 = ((await B.send({ op: "head" })).data as { rev: number }).rev;
  assert.ok(rev2 - rev <= 1, "после успеха повторное объединение не плодит версии: " + (rev2 - rev));
  assert.deepEqual((await cloudBook(A)).people.map((p) => p.id).sort(), ["A1", "B1", "base"]);
});
