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
import { describeRelations } from "./sync-merge.ts";
import { withoutPerson } from "../tree/auto-links.ts";
import { cloudCheckFrom, cloudCheckFor, cloudHistoryFrom } from "./cloud-check.ts";
import { parentsDiff, replacePolicy } from "../tree/second-parent.ts";

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

test("6в. конфликт в ОДНОЙ карточке: усыновление на A, заметка на B. Сохраняется и то и другое (связи сливаются отдельно от карточки), в отчёте «добавлено 1»", async () => {
  const { B } = await conflictOf(baseBook(), (b) => { b.people.find((p) => p.id === "ребёнок")!.adoptedBy = structuredClone(link.adoptedBy); }, (b) => { b.people.find((p) => p.id === "ребёнок")!.notes = "заметка на B"; });
  const r = await B.sync("merge");
  assert.equal(r.kind, "merged");
  assert.equal(B.person("ребёнок")?.notes, "заметка на B", "правка карточки на B сохранена");
  assert.deepEqual(B.person("ребёнок")?.adoptedBy, link.adoptedBy, "усыновление с A тоже в рабочей книге");
  assert.deepEqual(r.kind === "merged" && r.report.relations, { added: 1, removed: 0, toResolve: 0 });
  const cloudCopy = JSON.parse(B.backups.get(B.backupKey(/Облачная книга до объединения/)!)!.text) as Book;
  assert.deepEqual(cloudCopy.people.find((p) => p.id === "ребёнок")?.adoptedBy, link.adoptedBy, "и версия облака лежит в копии, как раньше");
});

const merged = async (d: Device) => { const x = await d.sync("merge"); assert.equal(x.kind, "merged"); return x.kind === "merged" ? x.report : (undefined as never); };
const kid = (b: Book) => b.people.find((p) => p.id === "ребёнок")! as Rec;
const ids = (v: unknown) => (v as { id: string }[] | undefined)?.map((x) => x.id).sort();
const withLink = () => { const b = baseBook(); (b.people[4] as Rec).adoptedBy = [{ id: "усыновитель", year: "1999" }]; return b; };

test("7а. разные усыновители, добавленные на двух устройствах, объединяются по id без дубликатов (с основой)", async () => {
  const { B } = await conflictOf(baseBook(), (b) => { kid(b).adoptedBy = [{ id: "усыновитель" }]; }, (b) => { kid(b).adoptedBy = [{ id: "опекунша" }]; });
  const rep = await merged(B);
  assert.deepEqual(ids(B.person("ребёнок")?.adoptedBy), ["опекунша", "усыновитель"]);
  assert.deepEqual(rep.relations, { added: 1, removed: 0, toResolve: 0 });
});

test("7б. один и тот же усыновитель добавлен на обоих устройствах: одна запись", async () => {
  const { B } = await conflictOf(baseBook(), (b) => { kid(b).adoptedBy = [{ id: "усыновитель", year: "1999" }]; }, (b) => { kid(b).adoptedBy = [{ id: "усыновитель", year: "1999" }]; kid(b).notes = "B"; });
  await merged(B);
  assert.deepEqual(B.person("ребёнок")?.adoptedBy, [{ id: "усыновитель", year: "1999" }]);
});

test("7в. опека сливается так же, как усыновление, и не смешивается с ним", async () => {
  const { B } = await conflictOf(baseBook(), (b) => { kid(b).caredBy = [{ id: "опекунша", role: "guardian" }]; }, (b) => { kid(b).adoptedBy = [{ id: "усыновитель" }]; kid(b).notes = "B"; });
  await merged(B);
  assert.deepEqual(B.person("ребёнок")?.caredBy, [{ id: "опекунша", role: "guardian" }]);
  assert.deepEqual(B.person("ребёнок")?.adoptedBy, [{ id: "усыновитель" }]);
  assert.equal(B.person("ребёнок")?.notes, "B");
});

test("7г. связь снята на одном устройстве, на другом правили заметку: снятие учтено (с основой), заметка сохранена", async () => {
  const { B } = await conflictOf(withLink(), (b) => { kid(b).adoptedBy = undefined; }, (b) => { kid(b).notes = "B"; });
  const rep = await merged(B);
  assert.equal(B.person("ребёнок")?.adoptedBy, undefined, "снятая на A связь не вернулась");
  assert.equal(B.person("ребёнок")?.notes, "B");
  assert.deepEqual(rep.relations, { added: 0, removed: 1, toResolve: 0 });
});

test("7д. связь снята здесь, а в облаке её изменили (год): остаётся, случай уходит в «нужно проверить»", async () => {
  const { B } = await conflictOf(withLink(), (b) => { kid(b).adoptedBy = [{ id: "усыновитель", year: "2005" }]; kid(b).notes = "A"; }, (b) => { kid(b).adoptedBy = undefined; kid(b).notes = "B"; });
  const rep = await merged(B);
  assert.deepEqual(B.person("ребёнок")?.adoptedBy, [{ id: "усыновитель", year: "2005" }], "изменённая в облаке связь не пропала молча");
  assert.equal(rep.relations?.toResolve, 1);
});

test("7е. основы нет: понять, снята связь или добавлена, нельзя. Сохраняются обе версии, случай явно в отчёте, молча ничего не возвращается и не пропадает", async () => {
  const { B } = await conflictOf(withLink(), (b) => { kid(b).notes = "A"; }, (b) => { kid(b).adoptedBy = undefined; kid(b).notes = "B"; });
  B.base = null; // основа потеряна
  const rep = await merged(B);
  assert.deepEqual(B.person("ребёнок")?.adoptedBy, [{ id: "усыновитель", year: "1999" }], "связь сохранена: отличить намеренное снятие нельзя");
  assert.equal(rep.relations?.toResolve, 1, "случай показан в отчёте");
  assert.match(describeRelations(rep), /Нужно проверить связей усыновления и опеки: 1/);
  const cloudCopy = JSON.parse(B.backups.get(B.backupKey(/Облачная книга до объединения/)!)!.text) as Book;
  assert.deepEqual(kid(cloudCopy)?.adoptedBy, [{ id: "усыновитель", year: "1999" }]);
  const mineCopy = JSON.parse(B.backups.get(B.backupKey(/Книга на этом устройстве до объединения/)!)!.text) as Book;
  assert.equal(kid(mineCopy)?.adoptedBy, undefined, "и версия устройства (без связи) лежит в своей копии");
});

test("7ж. возвращение удалённого человека из облака отражено в отчёте", async () => {
  const { B } = await conflictOf(withLink(), (b) => { b.people.find((p) => p.id === "другой")!.notes = "A"; }, (b) => { b.people = withoutPerson(b.people as never, "усыновитель") as never; });
  const rep = await merged(B);
  assert.ok(B.person("усыновитель"), "человек вернулся");
  assert.deepEqual(rep.returned, { people: 1 });
  assert.match(describeRelations(rep), /Вернулись из облака люди, удалённые на этом устройстве: 1/);
});

test("7з. без связей усыновления и опеки отчёт не получает новых строк", async () => {
  const { B } = await conflictOf(baseBook(), (b) => { b.people.find((p) => p.id === "другой")!.notes = "A"; }, (b) => { b.people.find((p) => p.id === "другой")!.notes = "B"; });
  const rep = await merged(B);
  assert.equal(rep.relations, undefined);
  assert.equal(rep.returned, undefined);
  assert.equal(describeRelations(rep), "");
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

// Удаление человека (усыновителя) на одном устройстве, ссылка на него на другом. Удаление делаем настоящей функцией приложения withoutPerson.
const delBase = () => ({ people: [man("мать"), man("усыновитель"), man("ребёнок", { parents: ["мать"], adoptedBy: [{ id: "усыновитель" }] }), man("другой", { notes: "" })] });
const noDup = (d: Device) => { const ids = d.book.people.map((p) => p.id); assert.equal(new Set(ids).size, ids.length, "дубликатов людей нет"); };
const delOn = (b: Book) => { b.people = withoutPerson(b.people as never, "усыновитель") as never; };

test("6д-1. удалили на A (ссылка снялась у ребёнка), на B менялся другой человек: после объединения у B человек и ссылка так, как решает общая логика, без дубликатов и битых ссылок", async () => {
  const { A, B } = await conflictOf(delBase(), delOn, (b) => { b.people.find((p) => p.id === "другой")!.notes = "правка B"; });
  const r = await B.sync("merge");
  assert.equal(r.kind, "merged");
  noDup(B);
  assert.deepEqual(relationRefProblems(B.book.people as never), [], "битых ссылок нет");
  assert.ok(B.person("усыновитель"), "удаление не переносится: человек остаётся, пока он есть на этом устройстве");
  assert.equal(B.person("ребёнок")?.adoptedBy, undefined, "снятая на A ссылка не возвращается: ребёнок на B не менялся, берётся версия A");
  assert.equal(B.person("другой")?.notes, "правка B");
  const cloud = await cloudBook(A);
  assert.equal(new Set(cloud.people.map((p) => p.id)).size, cloud.people.length, "в облаке дубликатов нет");
});

test("6д-2. удалили на B, на A менялся другой человек: человек ВОЗВРАЩАЕТСЯ из облака без дубликата, ссылка остаётся снятой (так её снял сам B)", async () => {
  const { B } = await conflictOf(delBase(), (b) => { b.people.find((p) => p.id === "другой")!.notes = "правка A"; }, delOn);
  const r = await B.sync("merge");
  assert.equal(r.kind, "merged");
  noDup(B);
  assert.ok(B.person("усыновитель"), "человек вернулся (защита от потери данных)");
  assert.equal(B.person("ребёнок")?.adoptedBy, undefined, "ребёнок менялся на B (ссылка снята удалением), версия B остаётся");
  assert.equal(B.person("другой")?.notes, "правка A");
  assert.deepEqual(relationRefProblems(B.book.people as never), []);
  assert.equal(B.book.people.length, 4, "людей столько же, сколько было: ничего не продублировано и не потеряно");
});

test("6д-3. удалили на B, а у ребёнка на A правка в той же карточке: остаётся карточка B, версия A с ссылкой лежит в копии, человек возвращается, без дубликатов", async () => {
  const { B } = await conflictOf(delBase(), (b) => { b.people.find((p) => p.id === "ребёнок")!.notes = "заметка A"; }, delOn);
  await B.sync("merge");
  noDup(B);
  assert.ok(B.person("усыновитель"));
  assert.deepEqual(relationRefProblems(B.book.people as never), []);
  const copy = JSON.parse(B.backups.get(B.backupKey(/Облачная книга до объединения/)!)!.text) as Book;
  assert.deepEqual(copy.people.find((p) => p.id === "ребёнок")?.adoptedBy, [{ id: "усыновитель" }], "ссылка не потеряна безвозвратно: она в копии облака");
});

test("6д-4. ссылка есть на A, а человека на B удалили НЕ снимая ссылку у ребёнка в карточке A: после объединения ссылка указывает на существующего человека", async () => {
  const { B } = await conflictOf(delBase(), (b) => { b.people.find((p) => p.id === "ребёнок")!.notes = "заметка A"; }, (b) => { b.people = b.people.filter((p) => p.id !== "усыновитель"); });
  await B.sync("merge");
  noDup(B);
  assert.ok(B.person("усыновитель"), "человек вернулся, поэтому ссылка из карточки A не повисла");
  assert.deepEqual(relationRefProblems(B.book.people as never), []);
});

test("8. отметка «общий ребёнок» едет на второе устройство вместе с родителями; при конфликте в одной карточке они остаются вместе", async () => {
  const order = `kr-co-${++seq}-12345678`;
  const A = new Device(order, "dev-aaaaaaaa");
  const B = new Device(order, "dev-bbbbbbbb");
  A.book = { pages: [], photos: [], places: [], people: [man("М"), man("Д"), man("К", { parents: ["М", "Д"], parentsUnmarried: true })] } as Book;
  assert.equal((await A.sync()).kind, "uploaded");
  assert.equal((await B.sync()).kind, "downloaded");
  assert.equal(B.person("К")?.parentsUnmarried, true);
  assert.deepEqual(B.person("К")?.parents, ["М", "Д"]);
  // конфликт в одной карточке: целиком выбирается одна версия, родители и отметка не расходятся
  const { B: B2 } = await conflictOf({ people: [man("М"), man("Д"), man("Е"), man("К", { parents: ["М"] })] }, (b) => { const k = b.people.find((p) => p.id === "К")!; k.parents = ["М", "Д"]; k.parentsUnmarried = true; }, (b) => { b.people.find((p) => p.id === "К")!.notes = "заметка B"; });
  await B2.sync("merge");
  const k = B2.person("К")!;
  assert.equal(Boolean(k.parentsUnmarried), (k.parents as string[]).length === 2, "отметка есть тогда и только тогда, когда записан второй родитель");
});

test("9а. проверка облака перед правкой связей: итоги checked, conflict, failed, timeout, busy", async () => {
  const idle = () => false;
  assert.equal(await cloudCheckFrom(async () => ({ kind: "same" }), idle), "checked");
  assert.equal(await cloudCheckFrom(async () => ({ kind: "downloaded", rev: 2 }), idle), "checked");
  assert.equal(await cloudCheckFrom(async () => ({ kind: "conflict", reason: "both-changed" }), idle), "conflict");
  assert.equal(await cloudCheckFrom(async () => ({ kind: "error", message: "нет сети" }), idle), "failed");
  assert.equal(await cloudCheckFrom(async () => { throw new Error("сеть оборвалась"); }, idle), "failed");
  assert.equal(await cloudCheckFrom(() => new Promise(() => {}), idle, 120), "timeout");
  assert.equal(await cloudCheckFrom(async () => ({ kind: "same" }), () => true, 160), "busy");
});

test("9б. настоящий движок: второе устройство сменило родителей, первое получает их проверкой облака", async () => {
  const order = `kr-chk-${++seq}-12345678`;
  const A = new Device(order, "dev-aaaaaaaa");
  const B = new Device(order, "dev-bbbbbbbb");
  A.book = { pages: [], photos: [], places: [], ...structuredClone(baseBook()) } as Book;
  assert.equal((await A.sync()).kind, "uploaded");
  assert.equal((await B.sync()).kind, "downloaded");
  B.person("ребёнок")!.parents = ["мать", "друг"];
  assert.equal((await B.sync()).kind, "uploaded");
  assert.deepEqual(A.person("ребёнок")?.parents, ["мать", "отец"], "до проверки на A старые родители");
  assert.equal(await cloudCheckFrom(() => A.sync("auto"), () => false), "checked");
  assert.deepEqual(A.person("ребёнок")?.parents, ["мать", "друг"], "после проверки A видит свежее состояние, экран строится по нему");
});

test("9в. настоящий движок: обе копии менялись, проверка возвращает conflict и замена блокируется", async () => {
  const { B } = await conflictOf(baseBook(), (b) => { b.people.find((p) => p.id === "ребёнок")!.parents = ["мать", "друг"]; }, (b) => { b.people.find((p) => p.id === "ребёнок")!.parents = ["мать", "усыновитель"]; });
  const cloud = await cloudCheckFrom(() => B.sync("auto"), () => false);
  assert.equal(cloud, "conflict");
  const diff = parentsDiff(["мать", "отец"], ["мать", "усыновитель"]);
  assert.equal(replacePolicy(diff, cloud).allowed, false, "замена и снятие блокируются");
  assert.equal(replacePolicy(parentsDiff(["мать"], ["мать", "усыновитель"]), cloud).allowed, true, "добавление разрешено");
});

test("9г. ограничение слияния (фиксируем как есть): parents на двух устройствах, остаётся одна версия, обе лежат в копиях, какие именно родители различались, не показывается", async () => {
  const { B } = await conflictOf(baseBook(), (b) => { b.people.find((p) => p.id === "ребёнок")!.parents = ["мать", "друг"]; }, (b) => { b.people.find((p) => p.id === "ребёнок")!.parents = ["мать", "усыновитель"]; });
  const r = await B.sync("merge");
  assert.equal(r.kind, "merged");
  const kept = JSON.stringify(B.person("ребёнок")?.parents);
  assert.ok(kept === JSON.stringify(["мать", "друг"]) || kept === JSON.stringify(["мать", "усыновитель"]), "в итоге одна из двух версий целиком");
  const texts = [...B.backups.values()].map((b) => b.text).join("\n");
  assert.ok(texts.includes("друг") && texts.includes("усыновитель"), "обе версии сохранены резервными копиями");
  if (r.kind === "merged") assert.equal(JSON.stringify(r.report).includes("parents"), false, "в отчёте нет сведений о том, какие родители различались");
});

const ALL_CLOUD = ["checked", "no-cloud", "signed-out", "unknown", "failed", "conflict", "busy", "timeout"] as const;
const REPLACE = parentsDiff(["мать", "отец"], ["мать", "друг"]);
const ADD = parentsDiff(["мать"], ["мать", "друг"]);
const never = { meta: () => null, base: async () => null };
const localOnly = () => true; // явный признак: книга создана на этом устройстве и ни разу не синхронизировалась

test("10а. книга никогда не синхронизировалась и токена нет: облачной копии нет, замена разрешена", async () => {
  assert.equal(await cloudHistoryFrom(never.meta, never.base, localOnly), "never");
  assert.equal(await cloudHistoryFrom(never.meta, never.base), "unknown", "без явного признака пустые отметки ничего не доказывают");
  let called = 0;
  const cloud = await cloudCheckFor({ authorized: false, history: () => cloudHistoryFrom(never.meta, never.base, localOnly), run: async () => { called++; return { kind: "same" }; }, isBusy: () => false });
  assert.equal(cloud, "no-cloud");
  assert.equal(called, 0, "без входа сеть не трогаем");
  assert.equal(replacePolicy(REPLACE, cloud).allowed, true);
});

test("10б. книга раньше синхронизировалась, затем вышли из аккаунта: проверка невозможна, замена запрещена", async () => {
  const cases: [string, () => string | null, () => Promise<string | null>][] = [
    ["отметка с версией", () => JSON.stringify({ rev: 3, hash: "h", at: "t" }), async () => null],
    ["отметка только со временем", () => JSON.stringify({ rev: 0, hash: "", at: "2026-11-01T10:00:00Z" }), async () => null],
    ["только база последней синхронизации", () => null, async () => "{}"],
  ];
  for (const [name, meta, base] of cases) {
    assert.equal(await cloudHistoryFrom(meta, base), "synced", name);
    let called = 0;
    const cloud = await cloudCheckFor({ authorized: false, history: () => cloudHistoryFrom(meta, base), run: async () => { called++; return { kind: "same" }; }, isBusy: () => false });
    assert.equal(cloud, "signed-out", name);
    assert.equal(called, 0, "без входа сеть не трогаем");
    assert.equal(replacePolicy(REPLACE, cloud).allowed, false, name);
  }
});

test("10б2. настоящий движок: книга выгружена в облако, отметки остались после выхода, замена запрещена", async () => {
  const A = new Device(`kr-out-${++seq}-12345678`, "dev-aaaaaaaa");
  A.book = { pages: [], photos: [], places: [], ...structuredClone(baseBook()) } as Book;
  assert.equal((await A.sync()).kind, "uploaded");
  const cloud = await cloudCheckFor({ authorized: false, history: () => cloudHistoryFrom(() => JSON.stringify(A.meta), async () => A.base), run: async () => ({ kind: "same" }), isBusy: () => false });
  assert.equal(cloud, "signed-out");
  assert.equal(replacePolicy(REPLACE, cloud).allowed, false);
});

test("10в. вошёл, но облако недоступно или синхронизация не удалась: замена запрещена", async () => {
  const runs: [string, () => Promise<never | { kind: "error"; message: string } | { kind: "conflict"; reason: "both-changed" }>][] = [
    ["ошибка", async () => ({ kind: "error", message: "нет сети" })],
    ["исключение", async () => { throw new Error("сеть оборвалась"); }],
    ["конфликт", async () => ({ kind: "conflict", reason: "both-changed" })],
  ];
  for (const [name, run] of runs) {
    const cloud = await cloudCheckFor({ authorized: true, history: () => cloudHistoryFrom(never.meta, never.base), run: run as never, isBusy: () => false });
    assert.notEqual(cloud, "no-cloud", `${name}: недоступное облако не считается отсутствием копии`);
    assert.equal(replacePolicy(REPLACE, cloud).allowed, false, name);
  }
  const timeout = await cloudCheckFor({ authorized: true, history: async () => "never", run: () => new Promise(() => {}), isBusy: () => false, timeoutMs: 100 });
  assert.equal(timeout, "timeout");
  assert.equal(replacePolicy(REPLACE, timeout).allowed, false);
  const busy = await cloudCheckFor({ authorized: true, history: async () => "never", run: async () => ({ kind: "same" }), isBusy: () => true, timeoutMs: 120 });
  assert.equal(busy, "busy");
  assert.equal(replacePolicy(REPLACE, busy).allowed, false);
});

test("10в2. вошёл и синхронизация удалась: замена разрешена; вошёл при пустой истории всё равно делает настоящую проверку", async () => {
  let called = 0;
  const cloud = await cloudCheckFor({ authorized: true, history: async () => "never", run: async () => { called++; return { kind: "same" }; }, isBusy: () => false });
  assert.equal(cloud, "checked");
  assert.equal(called, 1);
  assert.equal(replacePolicy(REPLACE, cloud).allowed, true);
});

test("10г. нельзя достоверно определить историю: считаем, что облачная копия может быть, замена запрещена", async () => {
  const cases: [string, () => string | null, () => Promise<string | null>][] = [
    ["испорченная отметка", () => "{не json", async () => null],
    ["отметка есть, но пустая", () => JSON.stringify({ rev: 0, hash: "", at: "" }), async () => null],
    ["хранилище не читается", () => { throw new Error("доступ закрыт"); }, async () => null],
    ["база не читается", () => null, async () => { throw new Error("IndexedDB недоступна"); }],
  ];
  for (const [name, meta, base] of cases) {
    assert.equal(await cloudHistoryFrom(meta, base), "unknown", name);
    const cloud = await cloudCheckFor({ authorized: false, history: () => cloudHistoryFrom(meta, base), run: async () => ({ kind: "same" }), isBusy: () => false });
    assert.equal(cloud, "unknown", name);
    assert.equal(replacePolicy(REPLACE, cloud).allowed, false, name);
  }
  const thrown = await cloudCheckFor({ authorized: false, history: async () => { throw new Error("сбой"); }, run: async () => ({ kind: "same" }), isBusy: () => false });
  assert.equal(thrown, "unknown", "сбой чтения истории не равен «облака нет»");
});

test("10д. добавление без удаления существующих родителей разрешено во всех ситуациях", () => {
  for (const cloud of ALL_CLOUD) assert.equal(replacePolicy(ADD, cloud).allowed, true, cloud);
  const only = ALL_CLOUD.filter((cloud) => replacePolicy(REPLACE, cloud).allowed);
  assert.deepEqual([...only], ["checked", "no-cloud"], "замену разрешают только эти два итога");
});
