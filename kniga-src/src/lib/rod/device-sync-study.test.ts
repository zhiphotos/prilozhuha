/**
 * С-4а: исследование синхронизации устройств на настоящем клиентском коде (sync-engine) против настоящего серверного кода (на памяти).
 * Тесты ЗАКРЕПЛЯЮТ ТЕКУЩЕЕ поведение (в том числе дефекты, помеченные «ДЕФЕКТ») и ничего не исправляют.
 */
process.env.MEMORY_STORE = "1";
process.env.APP_ORIGINS = "https://app.example";
process.env.ACCESS_SECRET = "s".repeat(40);

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cloudText, restoreLocalBackup, syncCore, syncSmart, type Deps, type Meta, type Reply } from "./sync-engine.ts";
import { fingerprint, pruneKeys } from "./sync-logic.ts";
import { mergeBooks } from "./sync-merge.ts";

const { makeToken } = await import("../../../../kniga-api/lib/token.js");
const handler = (await import("../../../../kniga-api/lib/routes/sync.js")).default;

let orderSeq = 0;
const newOrder = () => `kr-c4a-${++orderSeq}-12345678`;
type Rec = { id: string } & Record<string, unknown>;
type Book = { people: Rec[]; pages: Rec[]; spine?: unknown; fonts?: unknown[]; [k: string]: unknown };

class Device {
  book: Book = { people: [], pages: [] };
  meta: Meta = { rev: 0, hash: "", at: "" };
  base: string | null = null;
  backups = new Map<string, { label: string; text: string }>();
  seq = 0;
  /** Правка «пока идёт отправка» (после снимка книги, до записи метки): имитация того, что человек продолжает работать. */
  duringUpload?: () => void;
  /** Старая версия приложения: собирает и применяет только известные ключи (как DATA_KEYS в snapshot() и applyBookData()). */
  legacy = false;
  readonly order: string;
  readonly id: string;
  constructor(order: string, id: string) {
    this.order = order;
    this.id = id;
  }
  token = () => makeToken({ order: this.order, until: Date.now() + 86_400_000 });
  send = async (body: Record<string, unknown>): Promise<Reply> =>
    new Promise<Reply>((resolve) => {
      const res = { statusCode: 200, setHeader() {}, end(t: string) { resolve({ status: this.statusCode, data: t ? JSON.parse(t) : {} }); } };
      handler({ method: "POST", url: "/", body: { token: this.token(), deviceId: this.id, ...body }, headers: { host: "api.example", origin: "https://app.example" }, socket: { remoteAddress: "1.2.3.4" } }, res);
    });
  deps(): Deps {
    return {
      call: (body) => this.send(body),
      snapshot: () => {
        const text = JSON.stringify(this.legacy ? { people: this.book.people, pages: this.book.pages } : this.book);
        return { text, hash: fingerprint(text), refs: [] };
      },
      readMeta: () => this.meta,
      writeMeta: (m) => { this.meta = m; },
      isEmpty: () => !this.book.people.length && !this.book.pages.length,
      uploadMedia: async () => { this.duringUpload?.(); this.duringUpload = undefined; },
      downloadMedia: async () => {},
      collectRefs: () => [],
      applyBook: (data) => { this.book = this.legacy ? { people: data.people as Rec[], pages: data.pages as Rec[] } : { ...(data as Book) }; },
      saveBackup: async (label, text, protect) => {
        const key = `k${String(++this.seq).padStart(6, "0")}`;
        this.backups.set(key, { label, text });
        for (const old of pruneKeys([...this.backups.keys()], 5, protect)) this.backups.delete(old);
        return key;
      },
      readBackup: async (key) => (this.backups.has(key) ? (JSON.parse(this.backups.get(key)!.text) as Record<string, unknown>) : null),
      now: () => "t",
      saveBase: async (text) => { this.base = text; },
      readBase: async () => (this.base ? (JSON.parse(this.base) as Record<string, unknown>) : null),
    };
  }
  sync = (mode: "auto" | "mine" | "cloud" | "merge" = "auto") => syncCore(this.deps(), mode);
  smart = () => syncSmart(this.deps());
  person = (id: string) => this.book.people.find((p) => p.id === id);
  add = (id: string, extra: Record<string, unknown> = {}) => void this.book.people.push({ id, name: id, ...extra });
}
const pair = () => {
  const order = newOrder();
  return [new Device(order, "dev-a-000001"), new Device(order, "dev-b-000002")] as const;
};
const cloudBook = async (d: Device): Promise<Book> => {
  const head = await d.send({ op: "head" });
  return JSON.parse(await cloudText(d.deps(), Number(head.data.rev), Number(head.data.parts))) as Book;
};

test("Э1 ДЕФЕКТ базы: правка, сделанная во время отправки, попадает в «базу» и при следующем слиянии теряется", async () => {
  const [a, b] = pair();
  a.add("p", { name: "Исх" });
  await a.sync();
  await b.sync();
  // A правит имя и отправляет; пока идёт отправка, человек дописывает заметку
  a.person("p")!.name = "Имя-A";
  a.duringUpload = () => { a.person("p")!.note = "ЗАМЕТКА, КОТОРОЙ НЕТ В ОБЛАКЕ"; };
  await a.sync();
  assert.equal((await cloudBook(a)).people[0].note, undefined, "в облако заметка не попала");
  assert.match(a.base!, /ЗАМЕТКА/, "а в «базу» попала: база снята после отправки, а не из отправленного текста");
  // B независимо меняет имя и отправляет раньше A
  b.person("p")!.year = "1999";
  await b.smart();
  const out = await a.sync("merge");
  assert.equal(out.kind, "merged");
  assert.equal(a.person("p")!.note, undefined, "заметка A потеряна из книги (останется только в резервной копии)");
  assert.ok([...a.backups.values()].some((x) => x.text.includes("ЗАМЕТКА")), "в резервной копии она есть: копии хранятся по пять штук и вытесняются");
});

test("Э2 обычная синхронизация с базой: правки разных записей на двух устройствах сходятся, повтор ничего не меняет", async () => {
  const [a, b] = pair();
  a.add("p1");
  a.add("p2");
  await a.sync();
  await b.sync();
  a.person("p1")!.name = "A1";
  b.person("p2")!.name = "B2";
  await a.sync();
  const out = await b.smart();
  assert.equal(out.kind, "merged");
  await a.sync();
  assert.equal(a.person("p1")!.name, "A1");
  assert.equal(a.person("p2")!.name, "B2");
  const rev = a.meta.rev;
  assert.equal((await a.sync()).kind, "same");
  assert.equal((await b.sync()).kind, "same");
  assert.equal(a.book.people.length, 2);
  assert.equal(a.meta.rev, rev);
});

test("Э3 ДЕФЕКТ: правка одной записи на обоих устройствах: сегодня побеждает здешняя, облачная правка в книге исчезает (у людей нет editedAt)", async () => {
  const [a, b] = pair();
  a.add("p", { year: "1950" });
  await a.sync();
  await b.sync();
  a.person("p")!.name = "Имя-A";
  b.person("p")!.year = "1951";
  await a.sync();
  const out = await b.smart();
  assert.equal(out.kind, "merged");
  assert.equal(b.person("p")!.year, "1951");
  assert.equal(b.person("p")!.name, "p", "правка имени с устройства A потеряна: поля разные, конфликта нет, но слияние идёт записью целиком");
});

test("Э4 без базы после сбоя: запись, изменённая на обоих, решается по «здешняя» молча (облачная версия остаётся только в резервной копии)", async () => {
  const [a, b] = pair();
  a.add("p", { year: "1950" });
  await a.sync();
  await b.sync();
  a.person("p")!.year = "1960";
  await a.sync();
  b.person("p")!.year = "1970";
  b.base = null; // база потеряна
  const out = await b.smart();
  assert.equal(out.kind, "merged");
  assert.equal(b.person("p")!.year, "1970");
  assert.ok([...b.backups.values()].some((x) => x.label.startsWith("Облачная книга до объединения") && x.text.includes("1960")));
});

test("Э5 ДЕФЕКТ: новое устройство с одной своей записью объединяется с облаком: настройки книги (разворот, шрифты) берутся пустые здешние, облачные теряются", async () => {
  const [a, b] = pair();
  a.add("p");
  a.book.spine = { text: "Наша семья", font: "script", size: 2 };
  a.book.fonts = ["Yauza", "Prata"];
  await a.sync();
  // новое устройство: значения по умолчанию, одна записанная до подключения запись
  b.book = { people: [], pages: [], spine: { text: "", font: "script", size: 0 }, fonts: [] };
  b.add("x");
  const out = await b.smart();
  assert.equal(out.kind, "merged");
  assert.deepEqual(b.book.spine, { text: "", font: "script", size: 0 });
  assert.deepEqual(b.book.fonts, []);
  assert.ok(b.person("p") && b.person("x"), "записи при этом объединились");
});

test("Э6 новое устройство без своих данных берёт облако целиком, без слияния", async () => {
  const [a, b] = pair();
  a.add("p");
  a.book.fonts = ["Yauza"];
  await a.sync();
  b.book = { people: [], pages: [], fonts: [] };
  const out = await b.sync();
  assert.equal(out.kind, "downloaded");
  assert.deepEqual(b.book.fonts, ["Yauza"]);
});

test("Э7 восстановление из резервной копии: копия считается правкой и заменяет облако, если облако не уходило вперёд", async () => {
  const [a] = pair();
  a.add("p", { name: "до" });
  await a.sync();
  a.person("p")!.name = "после";
  await a.sync();
  const key = await a.deps().saveBackup("до", JSON.stringify({ people: [{ id: "p", name: "до" }], pages: [] }));
  await restoreLocalBackup(a.deps(), key);
  const out = await a.sync();
  assert.equal(out.kind, "uploaded");
  assert.equal((await cloudBook(a)).people[0].name, "до");
  assert.match(a.base!, /до/, "база после этого совпадает с восстановленной версией");
});

test("Э8 идемпотентность: повторное объединение того же состояния не создаёт записей и новых версий", async () => {
  const [a, b] = pair();
  a.add("p");
  await a.sync();
  await b.sync();
  a.add("n1");
  b.add("n2");
  await a.sync();
  await b.smart();
  await a.sync();
  const before = JSON.stringify(a.book);
  const rev = a.meta.rev;
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await a.smart()).kind, "same");
    assert.equal((await b.smart()).kind, "same");
  }
  assert.equal(JSON.stringify(a.book), before);
  assert.equal(a.meta.rev, rev);
  assert.equal(a.book.people.length, 3);
});

test("Э9 удаление сегодня: запись, удалённая на одном устройстве и не менявшаяся на другом, возвращается (воскресает)", async () => {
  const [a, b] = pair();
  a.add("p");
  a.add("q");
  await a.sync();
  await b.sync();
  a.book.people = a.book.people.filter((x) => x.id !== "q");
  await a.sync();
  const out = await b.smart();
  assert.equal(out.kind, "downloaded"); // у B ничего не менялось: просто берёт облако, где q уже нет
  assert.deepEqual(b.book.people.map((x) => x.id), ["p"]);
  // а вот если B успел что-то поменять, слияние возвращает q
  const [c, d] = pair();
  c.add("p");
  c.add("q");
  await c.sync();
  await d.sync();
  c.book.people = c.book.people.filter((x) => x.id !== "q");
  await c.sync();
  d.person("p")!.name = "другое";
  await d.smart();
  assert.ok(d.person("q"), "q воскресла: mergeBooks не переносит удаления");
});

test("Э10 совместимость версий: старый клиент собирает книгу только из DATA_KEYS и теряет любой новый ключ верхнего уровня; поля внутри записей он сохраняет", () => {
  const src = readFileSync(new URL("./backup.ts", import.meta.url), "utf8");
  const keys = [...src.match(/export const DATA_KEYS = \[([^\]]+)\]/)![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.includes("people") && !keys.includes("tombstones") && !keys.includes("conflicts"));
  // то же выражение, что в snapshot() и applyBookData()
  const cloud = { people: [{ id: "p", name: "x", _conflict: { theirs: { name: "y" } } }], pages: [], conflicts: [{ id: "p" }], tombstones: [{ id: "q" }] };
  const applied = Object.fromEntries(keys.filter((k) => k in cloud).map((k) => [k, (cloud as Record<string, unknown>)[k]]));
  assert.equal("conflicts" in applied, false);
  assert.equal("tombstones" in applied, false);
  assert.deepEqual((applied.people as Rec[])[0]._conflict, { theirs: { name: "y" } }, "поле внутри записи проходит");
});

test("Э11 совместимость версий: старый mergeBooks при правке записи на обоих устройствах оставляет одну версию целиком, метка внутри записи теряется", () => {
  const withMark = { id: "p", name: "x", _conflict: { theirs: { name: "y" } } };
  const plain = { id: "p", name: "z" };
  const base = { people: [{ id: "p", name: "w" }], pages: [] };
  const { data } = mergeBooks({ people: [plain], pages: [] }, { people: [withMark], pages: [] }, base);
  assert.equal(("_conflict" in (data.people as Rec[])[0]), false);
});

test("Э12 старое устройство стирает неизвестный ключ верхнего уровня в облаке (то, чего нельзя допустить для очереди конфликтов и отметок удалений)", async () => {
  const order = newOrder();
  const a = new Device(order, "dev-a-000001");
  const c = new Device(order, "dev-c-000003");
  c.legacy = true;
  a.add("p");
  a.book.ext_queue = [{ id: "q1" }];
  await a.sync();
  assert.deepEqual((await cloudBook(a)).ext_queue, [{ id: "q1" }]);
  await c.sync(); // скачало: ключ отброшен
  c.add("c1");
  await c.sync(); // отправило книгу без ключа
  assert.equal((await cloudBook(a)).ext_queue, undefined, "ключ в облаке стёрт");
});

test("Э13 «читатель» (устройство без фильтра по ключам) сохраняет ключ, сам чинит облако после старого устройства и по пропаже метки видит, что старое устройство ещё работает", async () => {
  const order = newOrder();
  const a = new Device(order, "dev-a-000001");
  const b = new Device(order, "dev-b-000002");
  const c = new Device(order, "dev-c-000003");
  c.legacy = true;
  a.add("p");
  a.book.ext_canary = { v: 1 };
  await a.sync();
  await b.sync();
  assert.deepEqual(b.book.ext_canary, { v: 1 }, "читатель B получил и хранит ключ");
  await c.sync();
  c.add("c1");
  await c.sync();
  assert.equal((await cloudBook(a)).ext_canary, undefined, "старое устройство стёрло метку в облаке: так читатель замечает его присутствие");
  a.add("a1");
  const out = await a.smart();
  assert.equal(out.kind, "merged");
  assert.deepEqual((await cloudBook(a)).ext_canary, { v: 1 }, "A вернул ключ в облако при следующей синхронизации");
  assert.ok((await cloudBook(a)).people.some((p) => p.id === "c1") && (await cloudBook(a)).people.some((p) => p.id === "a1"));
});
