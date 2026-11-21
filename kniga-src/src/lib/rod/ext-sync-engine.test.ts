/** С-4б0: превышение лимита чужих ключей в синхронизации: книга, метка и облако не меняются, отправки нет. Настоящий клиентский код против настоящего серверного (память). */
process.env.MEMORY_STORE = "1";
process.env.APP_ORIGINS = "https://app.example";
process.env.ACCESS_SECRET = "s".repeat(40);

import assert from "node:assert/strict";
import test from "node:test";
import { restoreLocalBackup, syncCore, type Deps, type Meta, type Reply } from "./sync-engine.ts";
import { EXT_UNSAFE_MESSAGE, ExtOverflowError, readExt } from "./ext.ts";
import { fingerprint } from "./sync-logic.ts";

const { makeToken } = await import("../../../../kniga-api/lib/token.js");
const handler = (await import("../../../../kniga-api/lib/routes/sync.js")).default;

let seq = 0;
type Book = { people: { id: string }[]; pages: unknown[] };
class Device {
  book: Book = { people: [], pages: [] };
  meta: Meta = { rev: 0, hash: "", at: "" };
  ops: string[] = [];
  backups = new Map<string, string>();
  strict = false; // настоящая проверка чужих ключей
  refuse = false; // имитация настоящего applyBookData при превышении
  applied = 0;
  readonly order: string;
  readonly id: string;
  constructor(order: string, id: string) {
    this.order = order;
    this.id = id;
  }
  async send(body: Record<string, unknown>): Promise<Reply> {
    this.ops.push(String(body.op));
    return new Promise<Reply>((resolve) => {
      const res = { statusCode: 200, setHeader() {}, end(t: string) { resolve({ status: this.statusCode, data: t ? JSON.parse(t) : {} }); } };
      handler({ method: "POST", url: "/", body: { token: makeToken({ order: this.order, until: Date.now() + 86_400_000 }), deviceId: this.id, ...body }, headers: { host: "api.example", origin: "https://app.example" }, socket: { remoteAddress: "1.2.3.4" } }, res);
    });
  }
  deps(): Deps {
    return {
      call: (b) => this.send(b),
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
      applyBook: (data) => {
        if (this.refuse) throw new ExtOverflowError(["later"]);
        if (this.strict) readExt(data, ["people", "pages"], {});
        this.applied += 1;
        this.book = { people: data.people as { id: string }[], pages: data.pages as unknown[] };
      },
      saveBackup: async (label, text) => { const k = `k${++seq}`; this.backups.set(k, text); return k; },
      readBackup: async (k) => (this.backups.has(k) ? (JSON.parse(this.backups.get(k)!) as Record<string, unknown>) : null),
      now: () => "t",
    };
  }
}
const pair = () => {
  const order = `kr-ext-${++seq}-12345678`;
  return [new Device(order, "dev-a"), new Device(order, "dev-b")] as const;
};
const pushes = (d: Device) => d.ops.filter((o) => o === "push" || o === "put" || o.startsWith("media-put")).length;

test("01 скачивание из облака при превышении: ошибка, книга и метка как были, ничего не отправлено", async () => {
  const [a, b] = pair();
  a.book.people.push({ id: "p1" });
  assert.equal((await syncCore(a.deps())).kind, "uploaded");
  b.refuse = true;
  const metaBefore = JSON.stringify(b.meta);
  const out = await syncCore(b.deps());
  assert.equal(out.kind, "error");
  assert.match((out as { message: string }).message, /Обновите приложение/);
  assert.equal(b.applied, 0);
  assert.deepEqual(b.book, { people: [], pages: [] });
  assert.equal(JSON.stringify(b.meta), metaBefore);
  assert.equal(pushes(b), 0);
});
test("02 объединение при превышении: ошибка, книга и метка как были, в облако ничего не ушло", async () => {
  const [a, b] = pair();
  a.book.people.push({ id: "p1" });
  await syncCore(a.deps());
  await syncCore(b.deps());
  a.book.people.push({ id: "p2" });
  await syncCore(a.deps());
  b.book.people.push({ id: "p3" });
  b.refuse = true;
  const metaBefore = JSON.stringify(b.meta);
  const bookBefore = JSON.stringify(b.book);
  const opsBefore = b.ops.length;
  const out = await syncCore(b.deps(), "merge");
  assert.equal(out.kind, "error");
  assert.equal(JSON.stringify(b.book), bookBefore);
  assert.equal(JSON.stringify(b.meta), metaBefore);
  assert.equal(pushes({ ...b, ops: b.ops.slice(opsBefore) } as Device), 0);
  // облако осталось таким, как отправило первое устройство
  const c = new Device(a.order, "dev-c");
  assert.equal((await syncCore(c.deps())).kind, "downloaded");
  assert.deepEqual(c.book.people.map((p) => p.id).sort(), ["p1", "p2"]);
});
test("03 восстановление из локальной копии при превышении: ошибка пробрасывается, книга и метка как были", async () => {
  const [a] = pair();
  a.book.people.push({ id: "p1" });
  const key = await a.deps().saveBackup("копия", JSON.stringify({ people: [{ id: "старая" }], pages: [] }));
  a.refuse = true;
  const metaBefore = JSON.stringify(a.meta);
  await assert.rejects(restoreLocalBackup(a.deps(), key), ExtOverflowError);
  assert.deepEqual(a.book.people, [{ id: "p1" }]);
  assert.equal(JSON.stringify(a.meta), metaBefore);
});

test("04 в облаке ключ __proto__: и скачивание, и объединение отказывают явно, не теряют его молча и не загружают урезанное в облако", async () => {
  const [a, b] = pair();
  a.book = JSON.parse('{"people":[{"id":"p1"}],"pages":[],"__proto__":{"x":1}}');
  assert.equal((await syncCore(a.deps())).kind, "uploaded");
  b.strict = true;
  const out = await syncCore(b.deps());
  assert.equal(out.kind, "error");
  assert.equal((out as { message: string }).message, EXT_UNSAFE_MESSAGE);
  assert.deepEqual(b.book, { people: [], pages: [] });
  assert.equal(b.meta.rev, 0);
  assert.equal(pushes(b), 0);
  // объединение: у b тоже есть правка
  b.book = { people: [{ id: "p3" }], pages: [] };
  const merged = await syncCore(b.deps(), "merge");
  assert.equal(merged.kind, "error");
  assert.equal((merged as { message: string }).message, EXT_UNSAFE_MESSAGE);
  assert.deepEqual(b.book.people, [{ id: "p3" }]);
  assert.equal(pushes(b), 0);
});
