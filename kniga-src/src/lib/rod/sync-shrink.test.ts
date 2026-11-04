// Защита облака от пустой или резко уменьшившейся книги. Основа: приёмка синхронизации: настоящий клиентский код (sync-engine) против настоящего серверного кода (kniga-api/lib/routes/sync.js на памяти).
process.env.MEMORY_STORE = "1";
process.env.APP_ORIGINS = "https://app.example";
process.env.ACCESS_SECRET = "s".repeat(40);

import assert from "node:assert/strict";
import test from "node:test";
import { afterOpenCopy, cloudText, restoreLocalBackup, restorePreviousCloud, syncCore, type Deps, type Meta, type Reply, type SyncOutcome } from "./sync-engine.ts";
import { fingerprint, pruneKeys } from "./sync-logic.ts";

const { makeToken } = await import("../../../../kniga-api/lib/token.js");
const handler = (await import("../../../../kniga-api/lib/routes/sync.js")).default;

let orderSeq = 0;
const newOrder = () => `kr-scn-${++orderSeq}-12345678`;

type Person = { id: string; name: string; note?: string };
type Book = { people: Person[]; pages: unknown[] };
type Fault = { op: string; nth: number; mode: "before" | "after" };

class Device {
  book: Book = { people: [], pages: [] };
  meta: Meta = { rev: 0, hash: "", at: "" };
  backups = new Map<string, { label: string; text: string }>();
  faults: Fault[] = [];
  counts: Record<string, number> = {};
  stripHash = false; // имитация старого сервера без отпечатка
  seq = 0;
  readonly order: string;
  readonly id: string;
  constructor(order: string, id: string) {
    this.order = order;
    this.id = id;
  }

  token = () => makeToken({ order: this.order, until: Date.now() + 86_400_000 });

  async send(body: Record<string, unknown>): Promise<Reply> {
    const op = String(body.op);
    const n = (this.counts[op] = (this.counts[op] ?? 0) + 1);
    const fault = this.faults.find((f) => f.op === op && f.nth === n);
    if (fault?.mode === "before") throw new Error("сеть оборвалась");
    const reply = await new Promise<Reply>((resolve) => {
      const res = { statusCode: 200, setHeader() {}, end(t: string) { resolve({ status: this.statusCode, data: t ? JSON.parse(t) : {} }); } };
      handler({ method: "POST", url: "/", body: { token: this.token(), deviceId: this.id, ...body }, headers: { host: "api.example", origin: "https://app.example" }, socket: { remoteAddress: "1.2.3.4" } }, res);
    });
    if (fault?.mode === "after") throw new Error("ответ потерян");
    if (this.stripHash && op === "head") for (const k of ["hash", "prevRev", "prevParts"]) delete reply.data[k];
    return reply;
  }

  deps(): Deps {
    return {
      call: (body) => this.send(body),
      snapshot: () => {
        const text = JSON.stringify(this.book);
        return { text, hash: fingerprint(text), refs: [] };
      },
      readMeta: () => this.meta,
      writeMeta: (m) => { this.meta = m; },
      isEmpty: () => !this.book.people.length && !this.book.pages.length,
      uploadMedia: async () => {},
      downloadMedia: async () => {},
      collectRefs: () => [],
      applyBook: (data) => { this.book = { people: data.people as Person[], pages: data.pages as unknown[] }; },
      saveBackup: async (label, text, protect) => {
        const key = `k${String(++this.seq).padStart(6, "0")}`;
        this.backups.set(key, { label, text });
        for (const old of pruneKeys([...this.backups.keys()], 5, protect)) this.backups.delete(old);
        return key;
      },
      readBackup: async (key) => (this.backups.has(key) ? (JSON.parse(this.backups.get(key)!.text) as Record<string, unknown>) : null),
      now: () => "t",
    };
  }
  sync = (mode: "auto" | "mine" | "cloud" = "auto") => syncCore(this.deps(), mode);
  add(id: string, note = "") { this.book.people.push({ id, name: id, note }); }
  ids() { return this.book.people.map((p) => p.id).sort(); }
  backupIds(): string[] { return [...this.backups.values()].flatMap((b) => (JSON.parse(b.text) as Book).people.map((p) => p.id)); }
}

const cloudIds = async (d: Device): Promise<string[]> => {
  const head = await d.send({ op: "head" });
  const data = JSON.parse(await cloudText(d.deps(), Number(head.data.rev), Number(head.data.parts))) as Book;
  return data.people.map((p) => p.id).sort();
};
const kind = (o: SyncOutcome) => o.kind;
const fill = (d: Device, n: number) => { for (let i = 1; i <= n; i += 1) d.add(`p${i}`); };
const FULL = ["p1", "p10", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"];

test("1. книга потерялась на устройстве, метки остались: пустая книга НЕ затирает полное облако", async () => {
  const a = new Device(newOrder(), "dev-aaaaaaaa");
  fill(a, 10);
  assert.equal(kind(await a.sync()), "uploaded");
  assert.equal(a.meta.size, 10, "размер запомнился при синхронизации");
  a.book = { people: [], pages: [] }; // очистили данные сайта, а метка синхронизации осталась
  const result = await a.sync();
  assert.deepEqual(result, { kind: "conflict", reason: "shrunk" });
  assert.deepEqual(await cloudIds(a), FULL, "облако не тронуто");
});

test("2. старая метка без размера: защита сверяет с самим облаком", async () => {
  const a = new Device(newOrder(), "dev-aaaaaaaa");
  fill(a, 10);
  await a.sync();
  a.meta = { rev: a.meta.rev, hash: a.meta.hash, at: a.meta.at }; // как в версиях до защиты
  a.book = { people: [], pages: [] };
  assert.deepEqual(await a.sync(), { kind: "conflict", reason: "shrunk" });
  assert.deepEqual(await cloudIds(a), FULL);
});

test("3. резко уменьшилась (10 -> 3): остановка; обычное удаление одной записи проходит", async () => {
  const a = new Device(newOrder(), "dev-aaaaaaaa");
  fill(a, 10);
  await a.sync();
  a.book.people.splice(3);
  assert.deepEqual(await a.sync(), { kind: "conflict", reason: "shrunk" });
  a.book = { people: FULL.map((id) => ({ id, name: id })), pages: [] };
  a.book.people.pop(); // убрали одну запись из десяти
  assert.equal(kind(await a.sync()), "uploaded");
  assert.equal((await cloudIds(a)).length, 9);
});

test("4. «Оставить мою» сознательно заменяет облако, но облачная версия сначала сохраняется копией", async () => {
  const a = new Device(newOrder(), "dev-aaaaaaaa");
  fill(a, 10);
  await a.sync();
  a.book = { people: [], pages: [] };
  assert.equal(kind(await a.sync()), "conflict");
  assert.equal(kind(await a.sync("mine")), "uploaded");
  assert.deepEqual(a.backupIds().sort(), FULL, "облачная книга лежит в резервной копии");
});

test("5. «Взять облако» после остановки возвращает полную книгу", async () => {
  const a = new Device(newOrder(), "dev-aaaaaaaa");
  fill(a, 10);
  await a.sync();
  a.book = { people: [], pages: [] };
  assert.equal(kind(await a.sync()), "conflict");
  assert.equal(kind(await a.sync("cloud")), "downloaded");
  assert.deepEqual(a.ids(), FULL);
});

test("6. «Объединить» тоже возвращает облачные записи", async () => {
  const a = new Device(newOrder(), "dev-aaaaaaaa");
  fill(a, 10);
  await a.sync();
  a.book = { people: [{ id: "new1", name: "new1" }], pages: [] };
  assert.equal(kind(await a.sync()), "conflict");
  assert.equal(kind((await syncCore(a.deps(), "merge"))), "merged");
  assert.deepEqual(a.ids(), [...FULL, "new1"].sort());
});

test("7. маленькая книга (меньше 6 записей) защитой не стесняется", async () => {
  const a = new Device(newOrder(), "dev-aaaaaaaa");
  fill(a, 4);
  await a.sync();
  a.book.people.splice(1);
  assert.equal(kind(await a.sync()), "uploaded");
});

test("8. новое устройство с пустой книгой просто берёт облако, без вопросов", async () => {
  const order = newOrder();
  const a = new Device(order, "dev-aaaaaaaa");
  fill(a, 10);
  await a.sync();
  const b = new Device(order, "dev-bbbbbbbb");
  assert.equal(kind(await b.sync()), "downloaded");
  assert.deepEqual(b.ids(), FULL);
  assert.equal(b.meta.size, 10);
});

test("9. другое устройство добавило записи: обычная синхронизация по-прежнему работает в обе стороны", async () => {
  const order = newOrder();
  const a = new Device(order, "dev-aaaaaaaa");
  fill(a, 8);
  await a.sync();
  const b = new Device(order, "dev-bbbbbbbb");
  await b.sync();
  b.add("fromB");
  assert.equal(kind(await b.sync()), "uploaded");
  assert.equal(kind(await a.sync()), "downloaded");
  assert.ok(a.ids().includes("fromB"));
});
