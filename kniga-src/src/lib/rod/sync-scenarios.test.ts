// Приёмка синхронизации: настоящий клиентский код (sync-engine) против настоящего серверного кода (kniga-api/lib/routes/sync.js на памяти).
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
const big = (id: string) => ({ id, name: id, note: randomBytes(1_300_000).toString("hex") }); // несжимаемый текст: версия в несколько кусков

test("1. локальная версия новее облачной: уходит в облако", async () => {
  const a = new Device(newOrder(), "dev-aaaaaaaa");
  a.add("p1");
  assert.equal(kind(await a.sync()), "uploaded");
  a.add("p2");
  assert.equal(kind(await a.sync()), "uploaded");
  assert.deepEqual(await cloudIds(a), ["p1", "p2"]);
  assert.equal(kind(await a.sync()), "same");
});

test("2. облачная версия новее локальной: подтягивается, ничего не теряется", async () => {
  const order = newOrder();
  const a = new Device(order, "dev-aaaaaaaa"), b = new Device(order, "dev-bbbbbbbb");
  a.add("p1"); await a.sync();
  assert.equal(kind(await b.sync()), "downloaded");
  assert.deepEqual(b.ids(), ["p1"]);
  a.add("p2"); await a.sync();
  assert.equal(kind(await b.sync()), "downloaded");
  assert.deepEqual(b.ids(), ["p1", "p2"]);
});

test("3. обе версии изменены: автосинхронизация ничего не меняет, выбор сохраняет другую версию в копии", async () => {
  const order = newOrder();
  const a = new Device(order, "dev-aaaaaaaa"), b = new Device(order, "dev-bbbbbbbb");
  a.add("p1"); await a.sync(); await b.sync();
  a.add("fromA"); await a.sync();
  b.add("fromB");
  const r = await b.sync();
  assert.equal(r.kind, "conflict");
  assert.deepEqual(b.ids(), ["fromB", "p1"], "книга на устройстве не тронута");
  assert.deepEqual(await cloudIds(b), ["fromA", "p1"], "облако не тронуто");
  // «оставить мою»: облачная версия предварительно сохраняется
  assert.equal(kind(await b.sync("mine")), "uploaded");
  assert.ok(b.backupIds().includes("fromA"), "облачная версия сохранена на устройстве");
  assert.deepEqual(await cloudIds(b), ["fromB", "p1"]);
  // «взять облако» у третьей стороны: локальная версия предварительно сохраняется
  a.add("fromA2");
  const r2 = await a.sync();
  assert.equal(r2.kind, "conflict");
  assert.equal(kind(await a.sync("cloud")), "downloaded");
  assert.ok(a.backupIds().includes("fromA2"), "локальная версия сохранена перед заменой");
  assert.deepEqual(a.ids(), ["fromB", "p1"]);
});

test("4. потерян ответ сервера после успешной записи: повтор не даёт конфликта и не пишет второй раз", async () => {
  const a = new Device(newOrder(), "dev-aaaaaaaa");
  a.add("p1"); await a.sync();
  a.add("p2");
  a.faults.push({ op: "push", nth: 2, mode: "after" }); // вторая запись (последняя часть) дошла, ответ потерян
  const first = await a.sync();
  assert.equal(first.kind, "error");
  const revAfter = Number((await a.send({ op: "head" })).data.rev);
  assert.equal(revAfter, 2, "сервер принял версию");
  const second = await a.sync();
  assert.equal(second.kind, "same", "повтор распознаёт свою же версию");
  assert.equal(Number((await a.send({ op: "head" })).data.rev), 2, "второй версии нет");
  assert.deepEqual(await cloudIds(a), ["p1", "p2"]);
});

test("5. обрыв сети во время отправки (несколько частей): облако целое, повтор доходит", async () => {
  const a = new Device(newOrder(), "dev-aaaaaaaa");
  a.add("p1"); await a.sync();
  a.book.people.push(big("huge"));
  a.faults.push({ op: "push", nth: 2, mode: "before" });
  assert.equal((await a.sync()).kind, "error");
  assert.deepEqual(await cloudIds(a), ["p1"], "облако осталось прежним и читается целиком");
  assert.equal(a.meta.rev, 1, "отметка версии не сдвинулась");
  assert.equal(kind(await a.sync()), "uploaded");
  assert.deepEqual(await cloudIds(a), ["huge", "p1"]);
});

test("6. обрыв сети во время загрузки: книга на устройстве не тронута, повтор доходит", async () => {
  const order = newOrder();
  const a = new Device(order, "dev-aaaaaaaa"), b = new Device(order, "dev-bbbbbbbb");
  a.book.people.push(big("huge")); a.add("p1"); await a.sync();
  b.faults.push({ op: "part", nth: 2, mode: "before" });
  assert.equal((await b.sync()).kind, "error");
  assert.deepEqual(b.ids(), [], "ничего не применено наполовину");
  assert.equal(b.meta.rev, 0);
  assert.equal(kind(await b.sync()), "downloaded");
  assert.deepEqual(b.ids(), ["huge", "p1"]);
});

test("7. повторные запросы после восстановления связи не создают версий и не применяют правки дважды", async () => {
  const a = new Device(newOrder(), "dev-aaaaaaaa");
  a.add("p1"); await a.sync();
  for (let i = 0; i < 3; i += 1) assert.equal(kind(await a.sync()), "same");
  assert.equal(Number((await a.send({ op: "head" })).data.rev), 1);
  // тот же запрос записи, отправленный повторно, сервер принимает как уже принятый
  const snap = a.deps().snapshot();
  const again = await a.send({ op: "push", baseRev: 0, parts: 1, i: 0, data: "r:" + snap.text, hash: snap.hash });
  assert.ok(again.status === 200 || again.status === 409);
  assert.equal(Number((await a.send({ op: "head" })).data.rev), 1);
});

test("8. восстановление одной из пяти локальных копий; лимит не удаляет восстанавливаемую копию", async () => {
  const a = new Device(newOrder(), "dev-aaaaaaaa");
  const keys: string[] = [];
  for (let i = 1; i <= 7; i += 1) {
    a.book = { people: [{ id: `v${i}`, name: `v${i}` }], pages: [] };
    keys.push(await a.deps().saveBackup(`копия ${i}`, a.deps().snapshot().text));
  }
  assert.equal(a.backups.size, 5, "хранится пять копий");
  assert.deepEqual([...a.backups.values()].map((b) => (JSON.parse(b.text) as Book).people[0]!.id), ["v3", "v4", "v5", "v6", "v7"], "самые старые удалены, свежие целы");
  const wanted = keys[2]!; // v3 - самая старая из оставшихся
  a.book = { people: [{ id: "current", name: "current" }], pages: [] };
  assert.equal(await restoreLocalBackup(a.deps(), wanted), true);
  assert.deepEqual(a.ids(), ["v3"]);
  assert.ok(a.backups.has(wanted), "восстановленная копия осталась");
  assert.ok(a.backupIds().includes("current"), "прежняя книга сохранена отдельной копией");
  assert.equal(a.meta.hash, "", "восстановленная версия помечена как правка");
});

test("9. возврат на предыдущую облачную версию", async () => {
  const order = newOrder();
  const a = new Device(order, "dev-aaaaaaaa"), b = new Device(order, "dev-bbbbbbbb");
  a.add("p1"); await a.sync();
  a.add("p2"); await a.sync();
  a.add("p3"); await a.sync();
  const r = await restorePreviousCloud(a.deps());
  assert.equal(r.kind, "uploaded");
  assert.deepEqual(a.ids(), ["p1", "p2"]);
  assert.ok(a.backupIds().includes("p3"), "книга до возврата сохранена");
  assert.equal(kind(await b.sync()), "downloaded");
  assert.deepEqual(b.ids(), ["p1", "p2"]);
});

test("10. открытие старой копии при новой облачной версии не затирает облако", async () => {
  const order = newOrder();
  const a = new Device(order, "dev-aaaaaaaa"), b = new Device(order, "dev-bbbbbbbb");
  a.add("p1"); await a.sync(); await b.sync();
  const oldCopy = JSON.parse(JSON.stringify(b.book)) as Book;
  a.add("newer"); await a.sync();
  // b открывает старую копию: перед заменой делается резервная копия, потом книга заменяется
  await b.deps().saveBackup("до копии", b.deps().snapshot().text);
  b.book = oldCopy;
  b.book.people.push({ id: "fromOldCopy", name: "x" });
  const r = await afterOpenCopy(b.deps());
  assert.equal(r.kind, "conflict");
  assert.deepEqual(await cloudIds(b), ["newer", "p1"], "облако не тронуто");
  assert.deepEqual(b.ids(), ["fromOldCopy", "p1"], "копия осталась на устройстве");
  assert.equal(kind(await b.sync("cloud")), "downloaded");
  assert.ok(b.backupIds().includes("fromOldCopy"), "копию можно вернуть");
});

test("10б. открытие копии, когда облако не менялось, уходит в облако", async () => {
  const order = newOrder();
  const a = new Device(order, "dev-aaaaaaaa");
  a.add("p1"); await a.sync();
  a.book = { people: [{ id: "copy", name: "copy" }], pages: [] };
  assert.equal((await afterOpenCopy(a.deps())).kind, "uploaded");
  assert.deepEqual(await cloudIds(a), ["copy"]);
});

test("11. два устройства редактируют одну книгу: каждая правка остаётся где-то доступной", async () => {
  const order = newOrder();
  const a = new Device(order, "dev-aaaaaaaa"), b = new Device(order, "dev-bbbbbbbb");
  const made = new Set<string>();
  const add = (d: Device, id: string) => { d.add(id); made.add(id); };
  add(a, "a1"); await a.sync(); await b.sync();
  for (let round = 0; round < 4; round += 1) {
    add(a, `a-r${round}`); add(b, `b-r${round}`);
    await a.sync();
    const rb = await b.sync();
    if (rb.kind === "conflict") await b.sync(round % 2 ? "mine" : "cloud");
    const ra = await a.sync();
    if (ra.kind === "conflict") await a.sync("cloud");
  }
  const everywhere = new Set([...a.ids(), ...b.ids(), ...(await cloudIds(a)), ...a.backupIds(), ...b.backupIds()]);
  for (const id of made) assert.ok(everywhere.has(id), `правка ${id} не потеряна`);
});

test("12. возвращение после долгого офлайна", async () => {
  const order = newOrder();
  const a = new Device(order, "dev-aaaaaaaa"), b = new Device(order, "dev-bbbbbbbb");
  a.add("p1"); await a.sync(); await b.sync();
  for (let i = 0; i < 5; i += 1) { a.add(`a${i}`); await a.sync(); }
  assert.equal(kind(await b.sync()), "downloaded", "без своих правок: просто догоняет");
  assert.equal(b.ids().length, 6);
  for (let i = 0; i < 3; i += 1) { a.add(`more${i}`); await a.sync(); }
  b.add("offlineEdit");
  assert.equal((await b.sync()).kind, "conflict", "со своими правками: решает человек");
  assert.ok(b.ids().includes("offlineEdit"));
});

test("совместимость: новый клиент со старым сервером (без отпечатка в ответах)", async () => {
  const a = new Device(newOrder(), "dev-aaaaaaaa");
  a.stripHash = true;
  a.add("p1");
  assert.equal(kind(await a.sync()), "uploaded");
  a.add("p2");
  assert.equal(kind(await a.sync()), "uploaded");
});

test("совместимость: старый клиент (запись без отпечатка) с новым сервером", async () => {
  const a = new Device(newOrder(), "dev-aaaaaaaa");
  const r = await a.send({ op: "push", baseRev: 0, parts: 1, i: 0, data: "r:" + JSON.stringify({ people: [], pages: [] }) });
  assert.equal(r.status, 200);
  assert.equal(r.data.committed, true);
  const r2 = await a.send({ op: "push", baseRev: 1, parts: 1, i: 0, data: "r:" + JSON.stringify({ people: [{ id: "x", name: "x" }], pages: [] }) });
  assert.equal(r2.data.committed, true);
});

test("лимит пяти копий: чистка не оставляет пусто и не трогает защищённую", () => {
  assert.deepEqual(pruneKeys(["k1", "k2", "k3"], 5), []);
  assert.deepEqual(pruneKeys(["k1", "k2", "k3", "k4", "k5", "k6"], 5), ["k1"]);
  assert.deepEqual(pruneKeys(["k1", "k2", "k3", "k4", "k5", "k6"], 5, "k1"), ["k2"]);
  assert.deepEqual(pruneKeys(["k1", "k2"], 0), ["k1"], "хотя бы одна копия остаётся всегда");
  assert.deepEqual(pruneKeys(["k1"], 0), []);
});
