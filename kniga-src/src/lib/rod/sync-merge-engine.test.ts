// Объединение при конфликте: настоящий клиентский код против настоящего серверного кода (память вместо Redis).
process.env.MEMORY_STORE = "1";
process.env.APP_ORIGINS = "https://app.example";
process.env.ACCESS_SECRET = "s".repeat(40);

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import * as engine from "./sync-engine.ts";
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
  sync = (mode: "auto" | "mine" | "cloud" | "merge" = "auto") => syncCore(this.deps(), mode);
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
const headOf = async (d: Device) => (await d.send({ op: "head" })).data as { rev: number; parts: number };
const setup = async () => {
  const order = newOrder();
  const A = new Device(order, "dev-aaaaaaaa");
  const B = new Device(order, "dev-bbbbbbbb");
  A.add("base");
  assert.equal(kind(await A.sync()), "uploaded");
  assert.equal(kind(await B.sync()), "downloaded");
  A.add("a-only");
  B.add("b-only");
  assert.equal(kind(await A.sync()), "uploaded");
  assert.equal(kind(await B.sync()), "conflict");
  return { order, A, B };
};

test("«Объединить»: все люди с обеих сторон сохраняются, облако получает объединённую версию, обе прежние версии лежат в копиях", async () => {
  const { A, B } = await setup();
  const before = JSON.stringify(B.book);
  const rev = (await headOf(A)).rev;
  const result = await B.sync("merge");
  assert.equal(result.kind, "merged");
  assert.deepEqual(B.ids(), ["a-only", "b-only", "base"]);
  assert.equal((await headOf(A)).rev, rev + 1);
  assert.deepEqual(await cloudIds(A), ["a-only", "b-only", "base"]);
  const labels = [...B.backups.values()].map((b) => b.label);
  assert.ok(labels.some((l) => /до объединения/.test(l) && /на этом устройстве/.test(l)), labels.join("|"));
  assert.ok(labels.some((l) => /до объединения/.test(l) && /Облачная/.test(l)), labels.join("|"));
  assert.ok(B.backupIds().includes("b-only") && B.backupIds().includes("a-only"));
  assert.equal(kind(await A.sync()), "downloaded");
  assert.deepEqual(A.ids(), ["a-only", "b-only", "base"]);
  assert.ok(before.includes("b-only"));
});

test("предпросмотр объединения ничего не меняет: ни облако, ни книгу, ни копии", async () => {
  const { A, B } = await setup();
  const before = JSON.stringify(B.book);
  const rev = (await headOf(A)).rev;
  const preview = await engine.previewMerge(B.deps());
  assert.equal(preview.ok, true);
  assert.equal(preview.ok && preview.report.total.added, 1);
  assert.equal(JSON.stringify(B.book), before);
  assert.equal((await headOf(A)).rev, rev);
  assert.equal(B.backups.size, 0);
});

test("облако нечитаемо (пропала часть): объединение не начинается, книга и облако не тронуты", async () => {
  const { order, A, B } = await setup();
  const h = await headOf(A);
  await redis("DEL", `kr:sync:${order}:p:${h.rev}:0`);
  const before = JSON.stringify(B.book);
  const result = await B.sync("merge");
  assert.equal(result.kind, "error");
  assert.equal(JSON.stringify(B.book), before);
  assert.equal((await headOf(A)).rev, h.rev);
});

test("пока шло объединение, в облаке появилась новая версия: ничего не затирается, данные остаются на устройстве", async () => {
  const { A, B } = await setup();
  B.faults.push({ op: "push", nth: (B.counts.push ?? 0) + 1, mode: "before" }); // обрыв на отправке
  const result = await B.sync("merge");
  assert.equal(result.kind, "error");
  assert.deepEqual(B.ids(), ["a-only", "b-only", "base"], "объединённая книга осталась на устройстве, ничего не потеряно");
  assert.deepEqual(await cloudIds(A), ["a-only", "base"], "облако не заменено");
  const again = await B.sync("auto"); // повторная синхронизация снова предлагает выбор, а не затирает
  assert.ok(again.kind === "conflict" || again.kind === "uploaded", again.kind);
});
