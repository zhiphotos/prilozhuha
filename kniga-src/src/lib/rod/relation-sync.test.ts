// Этап 1 «отношения»: усыновители и опекуны при синхронизации двух устройств. Заготовка (устройства, сервер в памяти) та же, что в sync-merge-scenarios.test.ts. Прежний заголовок: сценарии объединения при конфликте на полной модели книги (люди с родственными связями, фото, места):
// настоящий клиентский код против настоящего серверного кода (память вместо Redis).
process.env.MEMORY_STORE = "1";
process.env.APP_ORIGINS = "https://app.example";
process.env.ACCESS_SECRET = "s".repeat(40);

import assert from "node:assert/strict";
import test from "node:test";
import { cloudText, restoreLocalBackup, syncCore, type Deps, type Meta, type Reply } from "./sync-engine.ts";
import { fingerprint, pruneKeys } from "./sync-logic.ts";
import { relationRefProblems } from "./relation-links.ts";

const { makeToken } = await import("../../../../kniga-api/lib/token.js");
const handler = (await import("../../../../kniga-api/lib/routes/sync.js")).default;

type Rec = { id: string } & Record<string, unknown>;
type Book = { people: Rec[]; pages: Rec[]; photos: Rec[]; places: Rec[] };
let seq = 0;

class Device {
  book: Book = { people: [], pages: [], photos: [], places: [] };
  meta: Meta = { rev: 0, hash: "", at: "" };
  backups = new Map<string, { label: string; text: string }>();
  base: string | null = null; // как в приложении: книга на момент последней синхронизации хранится на устройстве
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
      saveBase: async (text) => { this.base = text; },
      readBase: async () => (this.base ? (JSON.parse(this.base) as Record<string, unknown>) : null),
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


const link = { adoptedBy: [{ id: "усыновитель", year: "1999" }], caredBy: [{ id: "опекунша", role: "guardian" as const }] };
const baseBook = () => ({ people: [man("мать"), man("отец"), man("усыновитель"), man("опекунша"), man("ребёнок", { parents: ["мать", "отец"] }), man("другой", { notes: "" })] });

test("6а. усыновители и опекуны доезжают на второе устройство целиком, биологические родители не меняются", async () => {
  const order = `kr-rel-${++seq}-12345678`;
  const A = new Device(order, "dev-aaaaaaaa");
  const B = new Device(order, "dev-bbbbbbbb");
  A.book = { pages: [], photos: [], places: [], ...structuredClone(baseBook()) } as Book;
  A.person("ребёнок")!.adoptedBy = structuredClone(link.adoptedBy);
  A.person("ребёнок")!.caredBy = structuredClone(link.caredBy);
  assert.equal((await A.sync()).kind, "uploaded");
  assert.equal((await B.sync()).kind, "downloaded");
  assert.deepEqual(B.person("ребёнок")?.parents, ["мать", "отец"]);
  assert.deepEqual(B.person("ребёнок")?.adoptedBy, link.adoptedBy);
  assert.deepEqual(B.person("ребёнок")?.caredBy, link.caredBy);
  assert.deepEqual(relationRefProblems(B.book.people as never), []);
});

test("6б. конфликт (с основой, как в приложении): усыновление на одном устройстве, правка ДРУГОГО человека на втором: сохраняется и то и другое", async () => {
  const { A, B } = await conflictOf(baseBook(), (b) => { b.people.find((p) => p.id === "ребёнок")!.adoptedBy = structuredClone(link.adoptedBy); }, (b) => { b.people.find((p) => p.id === "другой")!.notes = "правка на B"; });
  const r = await B.sync("merge");
  assert.equal(r.kind, "merged");
  assert.deepEqual(B.person("ребёнок")?.adoptedBy, link.adoptedBy);
  assert.equal(B.person("другой")?.notes, "правка на B");
  assert.deepEqual((await cloudBook(A)).people.find((p) => p.id === "ребёнок")?.adoptedBy, link.adoptedBy);
});

test("6в. конфликт в ОДНОЙ карточке: усыновление на A, заметка на B. Остаётся карточка этого устройства, версия облака с усыновлением лежит в копии (известное ограничение объединения, как в сценарии 4)", async () => {
  const { B } = await conflictOf(baseBook(), (b) => { b.people.find((p) => p.id === "ребёнок")!.adoptedBy = structuredClone(link.adoptedBy); }, (b) => { b.people.find((p) => p.id === "ребёнок")!.notes = "заметка на B"; });
  await B.sync("merge");
  assert.equal(B.person("ребёнок")?.notes, "заметка на B");
  assert.equal(B.person("ребёнок")?.adoptedBy, undefined, "усыновление в итоговую карточку не попало");
  const cloudCopy = JSON.parse(B.backups.get(B.backupKey(/Облачная книга до объединения/)!)!.text) as Book;
  assert.deepEqual(cloudCopy.people.find((p) => p.id === "ребёнок")?.adoptedBy, link.adoptedBy, "но не потеряно: оно в резервной копии");
});

test("6г. резервные копии и восстановление: усыновители и опекуны возвращаются байт в байт", async () => {
  const { B } = await conflictOf(baseBook(), (b) => { b.people.find((p) => p.id === "другой")!.notes = "правка на A"; }, (b) => { const c = b.people.find((p) => p.id === "ребёнок")!; c.adoptedBy = structuredClone(link.adoptedBy); c.caredBy = structuredClone(link.caredBy); });
  const localBefore = JSON.stringify(B.book);
  await B.sync("merge");
  const mineKey = B.backupKey(/Книга на этом устройстве до объединения/)!;
  assert.equal(B.backups.get(mineKey)!.text, localBefore, "копия устройства с усыновителями совпадает с книгой до объединения");
  assert.deepEqual(B.person("ребёнок")?.adoptedBy, link.adoptedBy, "после объединения поля на месте");
  B.book = { people: [], pages: [], photos: [], places: [] }; // книгу потеряли
  assert.equal(await restoreLocalBackup(B.deps(), mineKey), true);
  assert.equal(JSON.stringify(B.book), localBefore, "восстановление из копии вернуло книгу с усыновителями и опекунами без изменений");
  assert.deepEqual(B.person("ребёнок")?.caredBy, link.caredBy);
});

test("6д. человека удалили на одном устройстве, на другом он нужен как усыновитель: после объединения он ВОЗВРАЩАЕТСЯ, битых ссылок нет", async () => {
  const withLink = baseBook();
  (withLink.people[4] as Rec).adoptedBy = structuredClone(link.adoptedBy);
  const { B } = await conflictOf(withLink, (b) => { b.people.push(man("A-new")); }, (b) => { b.people = b.people.filter((p) => p.id !== "усыновитель"); (b.people.find((p) => p.id === "ребёнок") as Rec).adoptedBy = undefined; });
  await B.sync("merge");
  assert.deepEqual(relationRefProblems(B.book.people as never), []);
});
