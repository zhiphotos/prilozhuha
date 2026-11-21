/**
 * С-4б1 (дефект Э1): «база» синхронизации и метка должны соответствовать ТОМУ тексту, который реально отправлен в облако,
 * а не более позднему состоянию книги. Настоящий клиентский код (sync-engine) против настоящего серверного (память вместо Redis).
 */
process.env.MEMORY_STORE = "1";
process.env.APP_ORIGINS = "https://app.example";
process.env.ACCESS_SECRET = "s".repeat(40);

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";
import { STAMP_FAILED_MESSAGE, afterOpenCopy, cloudText, restoreLocalBackup, restorePreviousCloud, syncCore, syncSmart, trustedBase, weightOf, type Deps, type Meta, type Reply } from "./sync-engine.ts";
import { openCopyFlow } from "./open-copy-flow.ts";
import { fingerprint, pruneKeys } from "./sync-logic.ts";

const { makeToken } = await import("../../../../kniga-api/lib/token.js");
const handler = (await import("../../../../kniga-api/lib/routes/sync.js")).default;

let orderSeq = 0;
type Rec = { id: string } & Record<string, unknown>;
type Book = { people: Rec[]; pages: Rec[] };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Device {
  book: Book = { people: [], pages: [] };
  meta: Meta = { rev: 0, hash: "", at: "" };
  bases: Record<"a" | "b", string | null> = { a: null, b: null };
  /** Текущая база: ячейка, чей отпечаток указан в метке (метка без baseHash: ячейка a). */
  get base(): string | null {
    const { a, b } = this.bases;
    if (this.meta.baseHash === undefined) return a;
    return [a, b].find((t) => t && fingerprint(t) === this.meta.baseHash) ?? null;
  }
  set base(text: string | null) {
    this.bases.a = text;
    this.bases.b = null;
  }
  backups = new Map<string, { label: string; text: string }>();
  seq = 0;
  /** Правка «пока идёт отправка»: после снимка книги, до записи метки. */
  duringUpload?: () => void;
  baseDelays: number[] = []; // задержки записи базы по порядку вызовов
  baseFails = false;
  writeMetaThrows = false; // запись метки не происходит вовсе (как обрыв до записи)
  failReadbackOnce = false; // метка записана, но проверочное чтение сразу после неё падает
  private throwNextRead = false;
  onWriteMeta?: () => void; // что видно в момент, когда метка ещё не записана
  readBaseFailsFor: "a" | "b" | null = null;
  metaFails = false; // writeMeta молча не записывает (как localStorage без места)
  backupFails = false;
  intercept?: (body: Record<string, unknown>) => Reply | undefined;
  readonly order: string;
  readonly id: string;
  constructor(order: string, id: string) {
    this.order = order;
    this.id = id;
  }
  token = () => makeToken({ order: this.order, until: Date.now() + 86_400_000 });
  send = async (body: Record<string, unknown>): Promise<Reply> => {
    const fake = this.intercept?.(body);
    if (fake) return fake;
    return new Promise<Reply>((resolve) => {
      const res = { statusCode: 200, setHeader() {}, end(t: string) { resolve({ status: this.statusCode, data: t ? JSON.parse(t) : {} }); } };
      handler({ method: "POST", url: "/", body: { token: this.token(), deviceId: this.id, ...body }, headers: { host: "api.example", origin: "https://app.example" }, socket: { remoteAddress: "1.2.3.4" } }, res);
    });
  };
  deps(): Deps {
    return {
      call: (body) => this.send(body),
      snapshot: () => {
        const text = JSON.stringify(this.book);
        return { text, hash: fingerprint(text), refs: [] };
      },
      readMeta: () => {
        if (this.throwNextRead) {
          this.throwNextRead = false;
          throw new Error("чтение метки не удалось");
        }
        return this.meta;
      },
      writeMeta: (m) => {
        this.onWriteMeta?.();
        if (this.writeMetaThrows) throw new Error("обрыв до записи метки");
        if (!this.metaFails) this.meta = m;
        if (this.failReadbackOnce) {
          this.failReadbackOnce = false;
          this.throwNextRead = true;
        }
      },
      isEmpty: () => !this.book.people.length && !this.book.pages.length,
      uploadMedia: async () => { this.duringUpload?.(); this.duringUpload = undefined; },
      downloadMedia: async () => {},
      collectRefs: () => [],
      applyBook: (data) => { this.book = { people: data.people as Rec[], pages: data.pages as Rec[] }; },
      saveBackup: async (label, text, protect) => {
        if (this.backupFails) throw new Error("нет места для копии");
        const key = `k${String(++this.seq).padStart(6, "0")}`;
        this.backups.set(key, { label, text });
        for (const old of pruneKeys([...this.backups.keys()], 5, protect)) this.backups.delete(old);
        return key;
      },
      readBackup: async (key) => (this.backups.has(key) ? (JSON.parse(this.backups.get(key)!.text) as Record<string, unknown>) : null),
      now: () => "t",
      saveBase: async (text, slot) => {
        const wait = this.baseDelays.shift();
        if (wait) await sleep(wait);
        if (this.baseFails) throw new Error("диск переполнен");
        this.bases[slot] = text;
      },
      readBase: async (slot) => {
        if (this.readBaseFailsFor === slot) throw new Error("чтение базы не удалось");
        return this.bases[slot];
      },
    };
  }
  sync = (mode: "auto" | "mine" | "cloud" | "merge" = "auto") => syncCore(this.deps(), mode);
  person = (id: string) => this.book.people.find((p) => p.id === id);
  add = (id: string, extra: Record<string, unknown> = {}) => void this.book.people.push({ id, name: id, ...extra });
}
const pair = () => {
  const order = `kr-c4b1-${++orderSeq}-12345678`;
  return [new Device(order, "dev-a-000001"), new Device(order, "dev-b-000002")] as const;
};
const cloudBook = async (d: Device): Promise<Book> => {
  const head = await d.send({ op: "head" });
  return JSON.parse(await cloudText(d.deps(), Number(head.data.rev), Number(head.data.parts))) as Book;
};
const NOTE = "ЗАМЕТКА ВО ВРЕМЯ ОТПРАВКИ";

test("01 Э1: база после отправки равна отправленному тексту, а не книге с правкой, сделанной во время отправки", async () => {
  const [a] = pair();
  a.add("p", { name: "Исх" });
  await a.sync();
  a.person("p")!.name = "Имя-A";
  a.duringUpload = () => { a.person("p")!.note = NOTE; };
  const sent = JSON.stringify({ people: [{ id: "p", name: "Имя-A" }], pages: [] });
  await a.sync();
  await sleep(10);
  assert.equal((await cloudBook(a)).people[0].note, undefined, "в облако правка не попала");
  assert.equal(a.base, sent, "база должна быть ровно отправленным текстом");
  assert.doesNotMatch(a.base!, /ЗАМЕТКА/);
  assert.equal(a.person("p")!.note, NOTE, "правка осталась на устройстве");
});
test("02 правка во время отправки не считается отправленной: метка не совпадает с книгой, следующий цикл отправляет её", async () => {
  const [a, b] = pair();
  a.add("p");
  await a.sync();
  a.person("p")!.name = "Имя-A";
  a.duringUpload = () => { a.person("p")!.note = NOTE; };
  await a.sync();
  assert.notEqual(a.meta.hash, fingerprint(JSON.stringify(a.book)), "книга изменилась после отправки: метка не должна ей соответствовать");
  const out = await a.sync();
  assert.equal(out.kind, "uploaded");
  assert.equal((await cloudBook(a)).people[0].note, NOTE);
  await b.sync();
  assert.equal(b.person("p")!.note, NOTE);
});
test("03 Э1 целиком: после объединения с чужой правкой правка, сделанная во время отправки, не теряется и уходит в облако", async () => {
  const [a, b] = pair();
  a.add("p", { name: "Исх" });
  a.add("r", { name: "Чужая" });
  await a.sync();
  await b.sync();
  a.person("p")!.name = "Имя-A";
  a.duringUpload = () => { a.person("p")!.note = NOTE; };
  await a.sync();
  b.person("r")!.year = "1999";
  await syncSmart(b.deps());
  const out = await a.sync("merge");
  assert.equal(out.kind, "merged");
  assert.equal(a.person("p")!.note, NOTE, "заметка осталась в книге");
  assert.equal(a.person("r")!.year, "1999");
  await a.sync();
  const cloud = await cloudBook(a);
  assert.equal(cloud.people.find((p) => p.id === "p")!.note, NOTE);
  assert.equal(cloud.people.find((p) => p.id === "r")!.year, "1999");
});
test("04 путь «409, но облако уже держит нашу версию»: база тоже равна отправленному тексту", async () => {
  const [a] = pair();
  a.add("p");
  await a.sync();
  a.person("p")!.name = "Имя-A";
  a.duringUpload = () => { a.person("p")!.note = NOTE; };
  let sentHash = "";
  a.intercept = (body) => {
    if (body.op === "push") {
      sentHash = String(body.hash);
      return { status: 409, data: {} };
    }
    if (body.op === "head" && sentHash) return { status: 200, data: { rev: 9, hash: sentHash, parts: 1 } };
    return undefined;
  };
  await a.sync();
  await sleep(10);
  assert.equal(a.meta.rev, 9);
  assert.doesNotMatch(a.base ?? "", /ЗАМЕТКА/);
  assert.equal(a.base, JSON.stringify({ people: [{ id: "p", name: "Имя-A" }], pages: [] }));
});
test("05 объединение с отправкой: правка во время отправки объединённой книги не попадает в базу и не теряется", async () => {
  const [a, b] = pair();
  a.add("p");
  await a.sync();
  await b.sync();
  b.add("n2");
  await b.sync();
  a.add("n1");
  a.duringUpload = () => { a.person("p")!.note = NOTE; };
  const out = await a.sync("merge");
  assert.equal(out.kind, "merged");
  await sleep(10);
  assert.doesNotMatch(a.base ?? "", /ЗАМЕТКА/);
  assert.equal(a.person("p")!.note, NOTE);
  assert.equal((await a.sync()).kind, "uploaded");
  assert.equal((await cloudBook(a)).people.find((p) => p.id === "p")!.note, NOTE);
});
test("06 размер в метке считается по отправленному тексту, а не по книге, выросшей за время отправки", async () => {
  const [a] = pair();
  for (let i = 0; i < 7; i += 1) a.add(`p${i}`);
  await a.sync();
  assert.equal(a.meta.size, 7);
  a.person("p0")!.name = "новое";
  a.duringUpload = () => { for (let i = 0; i < 20; i += 1) a.add(`late${i}`); };
  await a.sync();
  assert.equal(a.meta.size, 7, "в облаке 7 записей, а не 27");
});
test("07 скачивание: база равна книге, применённой из облака", async () => {
  const [a, b] = pair();
  a.add("p", { name: "из облака" });
  await a.sync();
  await b.sync();
  await sleep(10);
  assert.equal(b.base, JSON.stringify(b.book));
});
test("08 две отправки подряд: медленная запись старой базы не затирает новую", async () => {
  const [a] = pair();
  a.add("p", { name: "v1" });
  a.baseDelays = [60]; // запись базы первой отправки медленная
  await a.sync();
  a.person("p")!.name = "v2";
  await a.sync();
  await sleep(120);
  assert.equal(a.base, JSON.stringify({ people: [{ id: "p", name: "v2" }], pages: [] }), "в базе должна остаться последняя отправленная версия");
});
test("10 восстановление из копии: перед сбросом сохраняется копия текущей книги; нет места для копии: книга не меняется, метка тоже", async () => {
  const [a] = pair();
  a.add("p", { name: "текущая" });
  await a.sync();
  const key = await a.deps().saveBackup("старая", JSON.stringify({ people: [{ id: "p", name: "старая" }], pages: [] }));
  a.backupFails = true;
  const metaBefore = JSON.stringify(a.meta);
  await assert.rejects(restoreLocalBackup(a.deps(), key));
  assert.equal(a.person("p")!.name, "текущая");
  assert.equal(JSON.stringify(a.meta), metaBefore);
  a.backupFails = false;
  assert.equal(await restoreLocalBackup(a.deps(), key), true);
  assert.ok([...a.backups.values()].some((x) => x.label.includes("до восстановления") && x.text.includes("текущая")));
  assert.equal(a.meta.hash, "");
});
test("11 возврат к предыдущей облачной версии: копия текущей книги сохраняется до замены; нет места: книга не меняется", async () => {
  const [a] = pair();
  a.add("p", { name: "v1" });
  await a.sync();
  a.person("p")!.name = "v2";
  await a.sync();
  a.backupFails = true;
  const out = await restorePreviousCloud(a.deps());
  assert.equal(out.kind, "error");
  assert.equal(a.person("p")!.name, "v2");
  a.backupFails = false;
  await restorePreviousCloud(a.deps());
  assert.ok([...a.backups.values()].some((x) => x.label.includes("до возврата") && x.text.includes("v2")));
  assert.equal(a.person("p")!.name, "v1");
});
test("12 открытие копии из файла: сначала копия текущей книги; если сохранить не удалось, файл не открывается и книга не меняется", async () => {
  const order: string[] = [];
  const deps = (backupOk: boolean) => ({
    backup: async () => { order.push("backup"); if (!backupOk) throw new Error("нет места"); },
    importFile: async () => { order.push("import"); },
    markImported: async () => { order.push("mark"); },
  });
  await openCopyFlow(deps(true));
  assert.deepEqual(order, ["backup", "import", "mark"]);
  order.length = 0;
  await assert.rejects(openCopyFlow(deps(false)), /не заменена/);
  assert.deepEqual(order, ["backup"]);
});


const smartUntilQuiet = async (d: Device, max = 4) => {
  const kinds: string[] = [];
  for (let i = 0; i < max; i += 1) {
    const out = await syncSmart(d.deps());
    kinds.push(out.kind);
    if (out.kind === "same") break;
  }
  return kinds;
};

test("13 отказ saveBase после успешной отправки: error, облако получило версию, метка и база прежней согласованной парой, поздняя правка цела", async () => {
  const [a] = pair();
  a.add("p", { name: "v1" });
  await a.sync();
  await sleep(10);
  const metaBefore = JSON.stringify(a.meta);
  const baseBefore = a.base;
  a.person("p")!.name = "v2";
  a.duringUpload = () => { a.person("p")!.note = NOTE; };
  a.baseFails = true;
  const out = await a.sync();
  assert.equal(out.kind, "error");
  assert.equal((out as { message: string }).message, STAMP_FAILED_MESSAGE);
  assert.equal((await cloudBook(a)).people[0].name, "v2", "облачная операция состоялась");
  assert.equal(JSON.stringify(a.meta), metaBefore, "метка не объявляет успеха");
  assert.equal(a.base, baseBefore, "база не менялась и не обнулялась");
  assert.equal(a.person("p")!.note, NOTE, "поздняя правка на устройстве");
});
test("14 после отказа saveBase без поздней правки: следующий цикл сам приводит метку и базу в порядок, конфликта нет", async () => {
  const [a] = pair();
  a.add("p", { name: "v1" });
  await a.sync();
  a.person("p")!.name = "v2";
  a.baseFails = true;
  assert.equal((await a.sync()).kind, "error");
  a.baseFails = false;
  assert.deepEqual(await smartUntilQuiet(a), ["same"]);
  await sleep(10);
  assert.equal(a.base, JSON.stringify(a.book));
  assert.equal(a.meta.hash, fingerprint(JSON.stringify(a.book)));
  assert.equal(a.meta.baseHash, fingerprint(a.base!));
});
test("15 после отказа saveBase с поздней правкой: цикл не зацикливается в конфликтах, поздняя правка доходит до облака и второго устройства", async () => {
  const [a, b] = pair();
  a.add("p", { name: "v1" });
  await a.sync();
  await b.sync();
  a.person("p")!.name = "v2";
  a.duringUpload = () => { a.person("p")!.note = NOTE; };
  a.baseFails = true;
  assert.equal((await a.sync()).kind, "error");
  a.baseFails = false;
  const kinds = await smartUntilQuiet(a);
  assert.equal(kinds.at(-1), "same", `цикл должен успокоиться: ${kinds.join(",")}`);
  assert.ok(!kinds.includes("conflict"), kinds.join(","));
  assert.equal((await cloudBook(a)).people[0].note, NOTE);
  await b.sync();
  assert.equal(b.person("p")!.note, NOTE);
  assert.equal(b.person("p")!.name, "v2");
});
test("16 отказ writeMeta после записи базы: error; новая база лежит в свободной ячейке, но метка прежняя и указывает на прежнюю согласованную базу, она и используется", async () => {
  const [a] = pair();
  a.add("p", { name: "v1" });
  await a.sync();
  await sleep(10);
  const metaBefore = JSON.stringify(a.meta);
  const baseV1 = a.base;
  a.person("p")!.name = "v2";
  a.metaFails = true;
  const out = await a.sync();
  assert.equal(out.kind, "error");
  assert.equal((out as { message: string }).message, STAMP_FAILED_MESSAGE);
  assert.equal((await cloudBook(a)).people[0].name, "v2");
  assert.equal(JSON.stringify(a.meta), metaBefore);
  assert.match([a.bases.a, a.bases.b].join("|"), /v2/, "новая база успела записаться в свободную ячейку");
  assert.equal(a.base, baseV1, "текущей остаётся прежняя база, которой соответствует метка");
  const trusted = await trustedBase(a.deps(), a.meta);
  assert.equal(JSON.stringify(trusted), baseV1, "для объединения используется только она");
});
test("17 после отказа writeMeta: без поздней правки метка восстанавливается сама, база снова достоверна", async () => {
  const [a] = pair();
  a.add("p", { name: "v1" });
  await a.sync();
  a.person("p")!.name = "v2";
  a.metaFails = true;
  assert.equal((await a.sync()).kind, "error");
  a.metaFails = false;
  assert.deepEqual(await smartUntilQuiet(a), ["same"]);
  assert.notEqual(await trustedBase(a.deps(), a.meta), null);
  assert.equal(a.meta.rev, (await a.send({ op: "head" })).data.rev);
});
test("18 после отказа writeMeta с поздней правкой и чужой правкой: поздняя правка сохраняется, цикл успокаивается без бесконечных конфликтов", async () => {
  const [a, b] = pair();
  a.add("p", { name: "v1" });
  a.add("r", { name: "Чужая" });
  await a.sync();
  await b.sync();
  a.person("p")!.name = "v2";
  a.duringUpload = () => { a.person("p")!.note = NOTE; };
  a.metaFails = true;
  assert.equal((await a.sync()).kind, "error");
  a.metaFails = false;
  b.person("r")!.year = "1999";
  await syncSmart(b.deps());
  const kinds = await smartUntilQuiet(a);
  assert.equal(kinds.at(-1), "same", kinds.join(","));
  await syncSmart(b.deps());
  for (const d of [a, b]) {
    assert.equal(d.person("p")!.note, NOTE, "поздняя правка");
    assert.equal(d.person("r")!.year, "1999", "чужая правка");
    assert.equal(d.person("p")!.name, "v2");
  }
  const cloud = await cloudBook(a);
  assert.equal(cloud.people.find((p) => p.id === "p")!.note, NOTE);
  assert.equal(cloud.people.find((p) => p.id === "r")!.year, "1999");
});
test("19 метка старой версии без baseHash: база доверяется, как раньше; с совпадающим отпечатком тоже; с несовпадающим или пустым нет", async () => {
  const [a] = pair();
  a.add("p");
  await a.sync();
  await sleep(10);
  const text = a.base!;
  assert.notEqual(await trustedBase(a.deps(), { rev: 1, hash: "x", at: "t" }), null, "поля нет: доверяем");
  assert.notEqual(await trustedBase(a.deps(), { rev: 1, hash: "x", at: "t", baseHash: fingerprint(text) }), null);
  assert.equal(await trustedBase(a.deps(), { rev: 1, hash: "x", at: "t", baseHash: fingerprint(text + " ") }), null);
  assert.equal(await trustedBase(a.deps(), { rev: 1, hash: "x", at: "t", baseHash: "" }), null);
});
test("20 восстановление из копии (версия облака та же): база остаётся достоверной для версии, метка hash пустая", async () => {
  const [a] = pair();
  a.add("p", { name: "до" });
  await a.sync();
  await sleep(10);
  const baseHash = a.meta.baseHash;
  const key = await a.deps().saveBackup("копия", JSON.stringify({ people: [{ id: "p", name: "другая" }], pages: [] }));
  await restoreLocalBackup(a.deps(), key);
  assert.equal(a.meta.hash, "");
  assert.equal(a.meta.baseHash, baseHash);
  assert.notEqual(await trustedBase(a.deps(), a.meta), null);
});
test("21 возврат к предыдущей облачной версии: если версия облака ушла вперёд относительно метки, старая база не считается достоверной", async () => {
  const [a, b] = pair();
  a.add("p", { name: "v1" });
  await a.sync();
  await b.sync();
  b.person("p")!.name = "v2";
  await b.sync(); // облако на версии 2, у a метка и база версии 1
  await sleep(10);
  assert.notEqual(await trustedBase(a.deps(), a.meta), null);
  a.intercept = (body) => (body.op === "push" ? { status: 500, data: { error: "сбой" } } : undefined); // дальнейшая отправка не нужна: смотрим состояние сразу после сброса
  await restorePreviousCloud(a.deps());
  a.intercept = undefined;
  assert.equal(a.meta.hash, "");
  // hash пустая, версия метки сменилась на текущую облачную: база версии 1 к ней не относится
  assert.equal(await trustedBase(a.deps(), a.meta), null);
});
test("22 открытие копии: облако ушло вперёд (выбор человека): метка той же версии, база достоверна; пустое облако: базы нет", async () => {
  const [a, b] = pair();
  a.add("p");
  await a.sync();
  await b.sync();
  await sleep(10);
  const keep = a.meta.baseHash;
  b.add("q");
  await b.sync();
  a.add("local");
  await afterOpenCopy(a.deps()); // облако ушло вперёд: версия метки не меняется
  assert.equal(a.meta.baseHash, keep);
  const [c] = pair();
  c.meta = { rev: 5, hash: "h", at: "t", baseHash: "1:abc" };
  c.base = "{}";
  c.intercept = (body) => (body.op === "push" ? { status: 500, data: { error: "сбой" } } : undefined);
  await afterOpenCopy(c.deps()); // в облаке пусто: версия 0, старая база не относится
  assert.equal(c.meta.baseHash, "");
});
test("23 заменяемая недостоверная база сначала сохраняется копией; нет места для копии: база и метка не меняются, статус error", async () => {
  const [a] = pair();
  a.add("p", { name: "v1" });
  await a.sync();
  await sleep(10);
  a.meta = { ...a.meta, baseHash: "" }; // база помечена недостоверной
  const old = a.bases.a;
  a.person("p")!.name = "v2";
  a.backupFails = true;
  const metaBefore = JSON.stringify(a.meta);
  assert.equal((await a.sync()).kind, "error");
  assert.equal(a.bases.a, old);
  assert.equal(JSON.stringify(a.meta), metaBefore);
  a.backupFails = false;
  a.person("p")!.name = "v3";
  const out = await syncSmart(a.deps());
  assert.ok(["uploaded", "same", "merged"].includes(out.kind), out.kind);
  assert.ok([...a.backups.values()].some((x) => x.label.includes("Служебная база") && x.text === old), "старая база сохранена копией до замены");
  assert.notEqual(a.base, old);
  assert.equal(a.meta.baseHash, fingerprint(a.base!));
});
test("24 достоверная база при обычной замене копий не плодит", async () => {
  const [a] = pair();
  a.add("p");
  await a.sync();
  for (let i = 0; i < 3; i += 1) {
    a.person("p")!.name = `v${i}`;
    await a.sync();
  }
  assert.equal([...a.backups.values()].filter((x) => x.label.includes("Служебная база")).length, 0);
});

// ——— две ячейки базы: совместимость, точки сбоя, повторное использование, нехватка места
const generations = (d: Device) => [d.bases.a, d.bases.b].map((t) => (t ? (JSON.parse(t) as Book).people[0]?.name : null));
const editAndSync = async (d: Device, name: string) => {
  d.person("p")!.name = name;
  return d.sync();
};
const state = (d: Device) => JSON.stringify({ meta: d.meta, a: d.bases.a, b: d.bases.b });

test("30 ключи хранения: ячейка «a» прежний ключ, «b» рядом; другой код их не трогает и не перечисляет", () => {
  const root = new URL(".", import.meta.url).pathname + "../../";
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = `${dir}/${name}`;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) files.push(full);
    }
  };
  walk(root);
  const using = files.filter((f) => readFileSync(f, "utf8").includes("kniga-sync-base"));
  assert.deepEqual(using.map((f) => f.split("/").pop()), ["sync.ts"], "ключи баз упоминаются только в sync.ts");
  const src = readFileSync(`${root}lib/rod/sync.ts`, "utf8");
  assert.match(src, /slot === "a" \? `kniga-sync-base:\$\{activeProjectId\(\)\}` : `kniga-sync-base-b:\$\{activeProjectId\(\)\}`/);
  const backup = readFileSync(`${root}lib/rod/sync-backup.ts`, "utf8");
  assert.match(backup, /const PREFIX = "kniga-backup:"/, "очистка копий по префиксу, который ключи баз не задевает");
  assert.equal("kniga-sync-base-b:main".startsWith("kniga-sync-base:"), false);
});
test("31 переход со старой версии: метка без baseHash, база только в «a»; первая отправка пишет в «b», «a» не меняется (старая версия её читает)", async () => {
  const [a] = pair();
  a.add("p", { name: "v1" });
  await a.sync();
  const legacyText = a.bases.a ?? a.bases.b;
  a.bases = { a: legacyText, b: null };
  a.meta = { rev: a.meta.rev, hash: a.meta.hash, at: a.meta.at, size: a.meta.size }; // метка старой версии
  await editAndSync(a, "v2");
  assert.equal(a.bases.a, legacyText, "прежняя ячейка не тронута");
  assert.match(a.bases.b!, /v2/);
  assert.equal(a.meta.baseHash, fingerprint(a.bases.b!));
});
test("32 возврат на старую версию и снова на новую: старая читает «a», пишет туда же и убирает baseHash; новая снова доверяет «a»", async () => {
  const [a] = pair();
  a.add("p", { name: "v1" });
  await a.sync();
  await editAndSync(a, "v2");
  await editAndSync(a, "v3"); // действующая база v3 лежит в одной ячейке, v2 в другой
  const cur = a.meta.baseHash === fingerprint(a.bases.a ?? "") ? "a" : "b";
  const other = cur === "a" ? "b" : "a";
  assert.match(a.bases[other]!, /v2/);
  // старая версия: читает «a» (может быть прежнее поколение: просто устаревшая, не испорченная), делает свою отправку v4
  const seenByOld = JSON.parse(a.bases.a!) as Book;
  assert.ok(["v2", "v3"].includes(seenByOld.people[0].name as string));
  // отправка v4 старой версией: в облако ушло то же, а локально она пишет базу всегда в «a» и метку без baseHash
  await editAndSync(a, "v4");
  const v4 = a.base!;
  a.bases.a = v4;
  a.meta = { rev: a.meta.rev, hash: a.meta.hash, at: a.meta.at, size: a.meta.size };
  assert.equal(JSON.stringify(await trustedBase(a.deps(), a.meta)), v4, "новая версия доверяет «a» по правилу старой метки");
  a.person("p")!.name = "v5";
  await a.sync();
  assert.match(a.base!, /v5/);
  assert.equal(a.meta.baseHash, fingerprint(a.base!));
});
test("33 сбой: сразу после записи новой базы, до записи метки (обрыв): действующая пара прежняя, новая база лежит в свободной ячейке", async () => {
  const [a] = pair();
  a.add("p", { name: "v1" });
  await a.sync();
  await editAndSync(a, "v2");
  const before = state(a);
  const curText = a.base;
  a.person("p")!.name = "v3";
  a.writeMetaThrows = true;
  assert.equal((await a.sync()).kind, "error");
  assert.equal(JSON.stringify(a.meta), JSON.parse(before).meta ? JSON.stringify(JSON.parse(before).meta) : "", "метка прежняя");
  assert.equal(a.base, curText, "действующая база прежняя");
  assert.equal(JSON.stringify(await trustedBase(a.deps(), a.meta)), curText);
  assert.ok([a.bases.a, a.bases.b].some((t) => t?.includes("v3")), "новая база в свободной ячейке");
  a.writeMetaThrows = false;
  assert.deepEqual(await smartUntilQuiet(a), ["same"]);
  assert.equal(a.base, JSON.stringify(a.book));
});
test("34 в момент, когда метка ещё не записана, действующая пара полностью цела (база новая уже лежит рядом)", async () => {
  const [a] = pair();
  a.add("p", { name: "v1" });
  await a.sync();
  await editAndSync(a, "v2");
  const metaBefore = JSON.stringify(a.meta);
  const curBefore = a.base;
  let seen: { meta: string; cur: string | null; cloudHasNew: boolean } | null = null;
  a.onWriteMeta = () => { seen = { meta: JSON.stringify(a.meta), cur: a.base, cloudHasNew: [a.bases.a, a.bases.b].some((t) => t?.includes("v3")) }; };
  await editAndSync(a, "v3");
  assert.deepEqual(seen, { meta: metaBefore, cur: curBefore, cloudHasNew: true });
});
test("35 метка записана, проверочное чтение упало: error, но пара уже новая и согласована; следующий цикл подтверждает «актуально»", async () => {
  const [a] = pair();
  a.add("p", { name: "v1" });
  await a.sync();
  a.person("p")!.name = "v2";
  a.failReadbackOnce = true;
  const out = await a.sync();
  assert.equal(out.kind, "error");
  assert.equal(a.meta.hash, fingerprint(JSON.stringify(a.book)));
  assert.equal(a.meta.baseHash, fingerprint(a.base!));
  assert.match(a.base!, /v2/);
  assert.deepEqual(await smartUntilQuiet(a), ["same"]);
});
test("36 много синхронизаций подряд: используются только две ячейки, они держат два последних поколения, действующая всегда достоверна", async () => {
  const [a] = pair();
  a.add("p", { name: "v0" });
  await a.sync();
  for (let i = 1; i <= 7; i += 1) {
    await editAndSync(a, `v${i}`);
    assert.equal(a.meta.baseHash, fingerprint(a.base!), `шаг ${i}: метка указывает на действующую базу`);
    assert.deepEqual(generations(a).sort(), [`v${i}`, `v${i - 1}`].sort(), `шаг ${i}: ровно два последних поколения`);
  }
  assert.deepEqual(Object.keys(a.bases).sort(), ["a", "b"]);
  assert.equal([...a.backups.values()].filter((x) => x.label.includes("Служебная база")).length, 0, "копии баз не копятся");
});
test("37 два сбоя подряд и затем успех: пара не портится, цикл успокаивается, поздняя правка доходит до облака", async () => {
  const [a] = pair();
  a.add("p", { name: "v1" });
  await a.sync();
  await editAndSync(a, "v2");
  const pairBefore = state(a);
  a.baseFails = true;
  assert.equal((await editAndSync(a, "v3")).kind, "error");
  assert.equal((await a.sync()).kind, "error");
  assert.equal(state(a), pairBefore, "после двух отказов пара и обе ячейки без изменений");
  a.baseFails = false;
  a.writeMetaThrows = true;
  assert.equal((await a.sync()).kind, "error");
  a.writeMetaThrows = false;
  assert.deepEqual(await smartUntilQuiet(a), ["same"]);
  assert.equal((await cloudBook(a)).people[0].name, "v3");
  assert.equal(a.base, JSON.stringify(a.book));
});
test("38 нехватка места при записи в свободную ячейку (обе ячейки заняты): действующая пара нетронута, понятная ошибка, после освобождения места всё работает", async () => {
  const [a] = pair();
  a.add("p", { name: "v1" });
  await a.sync();
  await editAndSync(a, "v2");
  await editAndSync(a, "v3"); // обе ячейки заняты
  const before = state(a);
  a.baseFails = true;
  const out = await editAndSync(a, "v4");
  assert.equal(out.kind, "error");
  assert.equal((out as { message: string }).message, STAMP_FAILED_MESSAGE);
  assert.equal(state(a), before, "метка и обе ячейки без изменений");
  assert.equal(JSON.stringify(await trustedBase(a.deps(), a.meta)), a.base);
  assert.equal(a.person("p")!.name, "v4", "правка на устройстве");
  a.baseFails = false;
  assert.deepEqual(await smartUntilQuiet(a), ["same"]);
  assert.match(a.base!, /v4/);
});
test("39 действующая ячейка временно не читается: пишем в другую, действующая остаётся цела и снова используется, когда читается", async () => {
  const [a] = pair();
  a.add("p", { name: "v1" });
  await a.sync();
  await editAndSync(a, "v2");
  const cur = a.meta.baseHash === fingerprint(a.bases.a ?? "") ? "a" : "b";
  const curText = a.bases[cur];
  a.readBaseFailsFor = cur;
  await editAndSync(a, "v3");
  assert.equal(a.bases[cur], curText, "ячейка, которую не удалось прочитать, не перезаписана");
  a.readBaseFailsFor = null;
  assert.equal(a.meta.baseHash, fingerprint(a.base!));
  assert.match(a.base!, /v3/);
});
