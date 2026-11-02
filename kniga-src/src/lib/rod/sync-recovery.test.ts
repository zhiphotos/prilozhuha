// Восстановление при пропавших частях облачной копии: настоящий клиентский код против настоящего серверного кода (память вместо Redis).
process.env.MEMORY_STORE = "1";
process.env.APP_ORIGINS = "https://app.example";
process.env.ACCESS_SECRET = "s".repeat(40);

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
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

const { redis } = await import("../../../../kniga-api/lib/redis.js");
const big = (id: string) => ({ id, name: id, note: randomBytes(1_300_000).toString("hex") });
const pk = (order: string, rev: number, i: number) => `kr:sync:${order}:p:${rev}:${i}`;
const headOf = async (d: Device) => (await d.send({ op: "head" })).data as { rev: number; parts: number };

async function twoRevs() {
  const order = newOrder();
  const A = new Device(order, "dev-aaaaaaaa");
  A.book.people.push(big("p1"));
  assert.equal(kind(await A.sync()), "uploaded");
  A.book.people.push(big("p2"));
  assert.equal(kind(await A.sync()), "uploaded");
  const h = await headOf(A);
  assert.ok(h.parts >= 3);
  return { order, A, h };
}

test("пропала часть: понятное сообщение вместо «Кусок не найден», книга на устройстве цела", async () => {
  const { order, h } = await twoRevs();
  await redis("DEL", pk(order, 2, 1));
  const C = new Device(order, "dev-cccccccc");
  const r = await C.sync();
  assert.equal(r.kind, "error");
  assert.match((r as { message: string }).message, /не хватает части книги/);
  assert.doesNotMatch((r as { message: string }).message, /Кусок не найден/);
  assert.deepEqual(C.ids(), []);
  assert.ok(h.rev === 2);
});

test("устройство, чья версия равна облаку: одна правка чинит облако, результат читается заново целиком", async () => {
  const { order, A, h } = await twoRevs();
  await redis("DEL", pk(order, 2, 1));
  assert.equal(kind(await A.sync()), "same");
  A.add("p3");
  assert.equal(kind(await A.sync()), "uploaded");
  const h3 = await headOf(A);
  const C = new Device(order, "dev-cccccccc");
  assert.equal(kind(await C.sync()), "downloaded");
  assert.deepEqual(C.ids(), ["p1", "p2", "p3"]);
  assert.ok(h3.rev === h.rev + 1);
});

test("устройство с другой версией выбирает «оставить с этого устройства» при нечитаемом облаке: облако восстанавливается", async () => {
  const { order, A } = await twoRevs();
  const B = new Device(order, "dev-bbbbbbbb");
  assert.equal(kind(await B.sync()), "downloaded");
  A.add("p3");
  assert.equal(kind(await A.sync()), "uploaded"); // версия 3
  const h3 = await headOf(A);
  for (let i = 0; i < h3.parts; i++) await redis("DEL", pk(order, 3, i)); // версия 3 пропала целиком
  B.add("b-only");
  assert.equal(kind(await B.sync("auto")), "conflict");
  const before = JSON.stringify(B.book);
  const cloudChoice = await B.sync("cloud"); // «взять из облака» невозможно, но ничего не ломает
  assert.equal(cloudChoice.kind, "error");
  assert.equal(JSON.stringify(B.book), before);
  const mine = await B.sync("mine"); // «оставить с этого устройства» теперь проходит
  assert.equal(mine.kind, "uploaded");
  const h4 = await headOf(B);
  assert.equal(h4.rev, 4);
  const C = new Device(order, "dev-cccccccc");
  assert.equal(kind(await C.sync()), "downloaded");
  assert.deepEqual(C.ids(), ["b-only", "p1", "p2"].sort());
});

test("сбой сети при чтении облака в «оставить с этого устройства» замену НЕ пропускает", async () => {
  const { order, A } = await twoRevs();
  const B = new Device(order, "dev-bbbbbbbb");
  assert.equal(kind(await B.sync()), "downloaded");
  A.add("p3");
  assert.equal(kind(await A.sync()), "uploaded");
  B.add("b-only");
  B.faults.push({ op: "part", nth: (B.counts.part ?? 0) + 1, mode: "before" }); // обрыв сети на первой части облачной копии
  const r = await B.sync("mine");
  assert.equal(r.kind, "error");
  const h = await headOf(A);
  assert.equal(h.rev, 3, "облако не заменено");
  assert.deepEqual(await cloudIds(A), ["p1", "p2", "p3"]);
});
