import assert from "node:assert/strict";
import test from "node:test";
import { helperRoundWith, publishIfChangedWith, signature, type AutoSession, type PollAnswer } from "./helper-auto.ts";
import { makeChangeSet, type Book, type Change } from "./helper-changes.ts";

type Rec = { id: string; name: string };
type Lists = { people: Rec[]; places: Rec[]; stories: Rec[]; notes: Rec[]; pages: Rec[]; photos: Rec[] };
const empty = (): Lists => ({ people: [], places: [], stories: [], notes: [], pages: [], photos: [] });
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const person = (id: string, name = id) => ({ id, name });

/** Сервер в памяти: те же правила, что в kniga-api/lib/routes/room-base.js и room-submit.js. */
class Server {
  base: Lists = empty();
  at = 0;
  inbox: { id: number; who: string; changes: Change[] }[] = [];
  n = 0;
  down = false;
  publish(base: Book) {
    this.base = clone(base) as Lists;
    this.at += 1;
  }
  poll(since: number, who: string): PollAnswer {
    if (this.down) throw new Error("сервер не отвечает");
    const waiting = who ? this.inbox.filter((i) => i.who === who).length : 0;
    if (since >= this.at) return { ok: true, same: true, at: this.at, waiting };
    return { ok: true, base: clone(this.base), at: this.at, waiting };
  }
  submit(who: string, changes: Change[]) {
    if (this.down) throw new Error("сервер не отвечает");
    this.inbox.push({ id: (this.n += 1), who, changes: clone(changes) });
  }
  /** Владелец принимает присланное: применяет к своей книге и разбирает входящее. */
  accept(owner: Lists, id: number) {
    const item = this.inbox.find((i) => i.id === id);
    assert.ok(item);
    for (const c of item.changes) {
      const list = owner[c.key as keyof Lists];
      const i = list.findIndex((r) => r.id === c.id);
      if (c.kind === "remove") {
        if (i >= 0) list.splice(i, 1);
      } else if (i >= 0) list[i] = clone(c.after as Rec);
      else list.push(clone(c.after as Rec));
    }
    this.inbox = this.inbox.filter((i) => i.id !== id);
  }
  dismiss(id: number) {
    this.inbox = this.inbox.filter((i) => i.id !== id);
  }
}

/** Устройство помощника. */
class Helper {
  lists: Lists;
  session: (AutoSession & { room: string }) | null;
  extras = { documents: ["scan1"] }; // то, что обмен трогать не должен
  media: string[] = [];
  failSend = false;
  failMedia = false;
  hook: (() => void) | null = null;
  server: Server;
  constructor(server: Server, who?: string, joined = true) {
    this.server = server;
    this.lists = clone(server.base);
    this.session = joined ? { room: "r", invite: "i", who, base: clone(server.base), baseAt: server.at } : null;
  }
  deps() {
    return {
      session: () => this.session,
      saveSession: (s: AutoSession & { room: string }) => {
        this.session = s;
      },
      lists: () => this.lists as unknown as Book,
      setLists: (patch: Record<string, unknown>) => {
        Object.assign(this.lists, clone(patch));
      },
      send: async (session: AutoSession & { room: string }, who: string) => {
        if (this.failSend) throw new Error("не отправилось");
        const changes = makeChangeSet(session.base, this.lists as unknown as Book);
        if (!changes.length) throw new Error("Правок пока нет.");
        this.server.submit(who, changes);
        this.session = { ...session, who, base: clone(this.lists) as unknown as Book };
      },
      poll: async (session: AutoSession & { room: string }) => this.server.poll(session.baseAt ?? 0, session.who ?? ""),
      downloadMedia: async () => {
        if (this.failMedia) throw new Error("фото не скачались");
        this.hook?.();
        this.media.push("m");
      },
    };
  }
  round() {
    return helperRoundWith(this.deps());
  }
}

const withBook = (people: string[]) => {
  const server = new Server();
  server.publish({ ...empty(), people: people.map((p) => person(p)) });
  return server;
};
const names = (l: Rec[]) => l.map((r) => r.id).join(",");

// ——— Помощник: получение свежей версии
test("01 нет сессии помощника: ничего не происходит", async () => {
  const h = new Helper(withBook(["a"]), undefined, false);
  assert.equal(await h.round(), "no-session");
});
test("02 версия не менялась: ничего не скачивается", async () => {
  const h = new Helper(withBook(["a"]));
  assert.equal(await h.round(), "idle");
  assert.equal(h.media.length, 0);
});
test("03 владелец выложил новое, у помощника нет правок: версия обновляется", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s);
  s.publish({ ...empty(), people: [person("a"), person("b")] });
  assert.equal(await h.round(), "updated");
  assert.equal(names(h.lists.people), "a,b");
  assert.equal(h.session?.baseAt, s.at);
});
test("04 после обновления у помощника нет «своих» правок", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s);
  s.publish({ ...empty(), people: [person("a"), person("b")] });
  await h.round();
  assert.equal(makeChangeSet(h.session!.base, h.lists as unknown as Book).length, 0);
});
test("05 обмен не трогает документы и прочее вне списка", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s);
  s.publish({ ...empty(), people: [person("b")] });
  await h.round();
  assert.deepEqual(h.extras, { documents: ["scan1"] });
});
test("06 у владельца пустые списки: у помощника они тоже становятся пустыми", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s);
  s.publish(empty());
  await h.round();
  assert.deepEqual(h.lists, empty());
});
test("07 старая сессия без baseAt: версия берётся один раз", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s);
  h.session = { ...h.session!, baseAt: undefined };
  assert.equal(await h.round(), "updated");
  assert.equal(await h.round(), "idle");
});
test("08 повторные обходы без изменений ничего не отправляют и не меняют", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s);
  for (let i = 0; i < 5; i += 1) assert.equal(await h.round(), "idle");
  assert.equal(s.inbox.length, 0);
});
test("09 сервер вернул версию старее той, что у помощника: ничего не меняется", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s);
  h.session = { ...h.session!, baseAt: s.at + 10 };
  assert.equal(await h.round(), "idle");
});

// ——— Помощник: свои правки
test("10 правки есть, подписи нет: не отправляем и не затираем", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s);
  h.lists.people.push(person("x"));
  s.publish({ ...empty(), people: [person("a"), person("b")] });
  assert.equal(await h.round(), "no-who");
  assert.equal(names(h.lists.people), "a,x");
  assert.equal(s.inbox.length, 0);
});
test("11 правки есть, подпись есть: отправляются сами", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  h.lists.people.push(person("x"));
  await h.round();
  assert.equal(s.inbox.length, 1);
  assert.equal(s.inbox[0].who, "Мама");
});
test("12 отправленное лежит у владельца: свою версию поверх не кладём", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  h.lists.people.push(person("x"));
  s.publish({ ...empty(), people: [person("a"), person("b")] }); // владелец что-то выложил по другому поводу
  assert.equal(await h.round(), "waiting");
  assert.equal(names(h.lists.people), "a,x");
});
test("13 владелец принял правку и выложил: у помощника она есть в общей версии", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  h.lists.people.push(person("x"));
  await h.round();
  const owner = clone(s.base);
  s.accept(owner, s.inbox[0].id);
  s.publish(owner as unknown as Book);
  assert.equal(await h.round(), "updated");
  assert.equal(names(h.lists.people), "a,x");
});
test("14 владелец отклонил правку: у помощника остаётся общая версия", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  h.lists.people.push(person("x"));
  await h.round();
  s.dismiss(s.inbox[0].id);
  s.publish({ ...empty(), people: [person("a"), person("c")] });
  assert.equal(await h.round(), "updated");
  assert.equal(names(h.lists.people), "a,c");
});
test("15 отправка не удалась: правки у помощника целы, версия не подменяется", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  h.lists.people.push(person("x"));
  h.failSend = true;
  s.publish({ ...empty(), people: [person("a"), person("b")] });
  await assert.rejects(h.round());
  assert.equal(names(h.lists.people), "a,x");
});
test("16 после отправки повторный обход не шлёт то же второй раз", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  h.lists.people.push(person("x"));
  await h.round();
  await h.round();
  await h.round();
  assert.equal(s.inbox.length, 1);
});
test("17 новая правка после отправки уходит отдельно", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  h.lists.people.push(person("x"));
  await h.round();
  h.lists.people.push(person("y"));
  await h.round();
  assert.equal(s.inbox.length, 2);
  assert.deepEqual(s.inbox[1].changes.map((c) => c.id), ["y"]);
});
test("18 исправление существующего человека уходит как «изменено»", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  h.lists.people[0] = person("a", "Анна");
  await h.round();
  assert.equal(s.inbox[0].changes[0].kind, "edit");
});
test("19 удаление уходит как предложение «убрать», а не сразу", async () => {
  const s = withBook(["a", "b"]);
  const h = new Helper(s, "Мама");
  h.lists.people = h.lists.people.filter((p) => p.id !== "b");
  await h.round();
  assert.equal(s.inbox[0].changes[0].kind, "remove");
  assert.equal(names(s.base.people), "a,b"); // у владельца человек на месте
});
test("20 правки в разных разделах (места, истории, заметки) уходят вместе", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  h.lists.places.push(person("p"));
  h.lists.stories.push(person("st"));
  h.lists.notes.push(person("n"));
  await h.round();
  assert.deepEqual(s.inbox[0].changes.map((c) => c.key).sort(), ["notes", "places", "stories"]);
});

// ——— Сбои и гонки
test("21 сервер недоступен: у помощника всё цело", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  h.lists.people.push(person("x"));
  s.down = true;
  await assert.rejects(h.round());
  assert.equal(names(h.lists.people), "a,x");
});
test("22 фото не скачались: версия не подменяется и baseAt не двигается", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s);
  const before = h.session!.baseAt;
  s.publish({ ...empty(), people: [person("a"), person("b")] });
  h.failMedia = true;
  await assert.rejects(h.round());
  assert.equal(names(h.lists.people), "a");
  assert.equal(h.session!.baseAt, before);
  h.failMedia = false;
  assert.equal(await h.round(), "updated"); // в следующий раз получилось
});
test("23 пока качались фото, помощник что-то добавил: его правка не пропадает", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  s.publish({ ...empty(), people: [person("a"), person("b")] });
  h.hook = () => h.lists.people.push(person("z"));
  assert.equal(await h.round(), "skipped");
  assert.equal(names(h.lists.people), "a,z");
  h.hook = null;
  await h.round(); // следующий обход отправит правку
  assert.equal(s.inbox.length, 1);
});
test("24 помощник вышел из книги во время загрузки: ничего не применяется", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s);
  s.publish({ ...empty(), people: [person("a"), person("b")] });
  h.hook = () => {
    h.session = null;
  };
  assert.equal(await h.round(), "skipped");
  assert.equal(names(h.lists.people), "a");
});
test("25 ждущие правки другого помощника не мешают обновиться", async () => {
  const s = withBook(["a"]);
  s.inbox.push({ id: 99, who: "Тётя", changes: [] });
  const h = new Helper(s, "Мама");
  s.publish({ ...empty(), people: [person("a"), person("b")] });
  assert.equal(await h.round(), "updated");
});
test("26 два помощника: у того, чьи правки ждут, версия не меняется, у другого меняется", async () => {
  const s = withBook(["a"]);
  const mama = new Helper(s, "Мама");
  const tetya = new Helper(s, "Тётя");
  mama.lists.people.push(person("m"));
  await mama.round();
  s.publish({ ...empty(), people: [person("a"), person("b")] });
  assert.equal(await mama.round(), "waiting");
  assert.equal(await tetya.round(), "updated");
  assert.equal(names(mama.lists.people), "a,m");
  assert.equal(names(tetya.lists.people), "a,b");
});

// ——— Владелец
test("27 у владельца нет комнаты или он ни разу не открывал книгу для правок: не выкладываем", async () => {
  let calls = 0;
  const base = { hasRoom: () => true, lastSignature: () => null, lists: () => empty() as unknown as Book, publish: async () => void (calls += 1) };
  assert.equal(await publishIfChangedWith(base), false);
  assert.equal(await publishIfChangedWith({ ...base, hasRoom: () => false, lastSignature: () => signature(empty()) }), false);
  assert.equal(calls, 0);
});
test("28 книга не менялась с выкладки: не выкладываем", async () => {
  let calls = 0;
  const lists = empty();
  assert.equal(await publishIfChangedWith({ hasRoom: () => true, lastSignature: () => signature(lists), lists: () => lists as unknown as Book, publish: async () => void (calls += 1) }), false);
  assert.equal(calls, 0);
});
test("29 книга изменилась: выкладываем один раз, потом тишина", async () => {
  const s = new Server();
  const lists = empty();
  let last = signature(lists);
  let calls = 0;
  const deps = {
    hasRoom: () => true,
    lastSignature: () => last,
    lists: () => lists as unknown as Book,
    publish: async () => {
      calls += 1;
      s.publish(lists as unknown as Book);
      last = signature(lists);
    },
  };
  lists.people.push(person("a"));
  assert.equal(await publishIfChangedWith(deps), true);
  assert.equal(await publishIfChangedWith(deps), false);
  lists.stories.push(person("s"));
  assert.equal(await publishIfChangedWith(deps), true);
  assert.equal(calls, 2);
});
test("30 выкладка не удалась: подпись не обновилась, при следующем обходе попробуем снова", async () => {
  const lists = empty();
  lists.people.push(person("a"));
  const last = signature(empty());
  let calls = 0;
  const deps = { hasRoom: () => true, lastSignature: () => last, lists: () => lists as unknown as Book, publish: async () => { calls += 1; throw new Error("сети нет"); } };
  await assert.rejects(publishIfChangedWith(deps));
  await assert.rejects(publishIfChangedWith(deps));
  assert.equal(calls, 2);
});

// ——— Целиком: владелец и два помощника, несколько кругов
test("31 полный круг: помощник добавил, владелец принял, второй помощник получил", async () => {
  const s = withBook(["a"]);
  const mama = new Helper(s, "Мама");
  const tetya = new Helper(s, "Тётя");
  mama.lists.people.push(person("m"));
  await mama.round();
  const owner = clone(s.base);
  s.accept(owner, s.inbox[0].id);
  s.publish(owner as unknown as Book);
  await mama.round();
  await tetya.round();
  assert.equal(names(mama.lists.people), "a,m");
  assert.equal(names(tetya.lists.people), "a,m");
  assert.equal(s.inbox.length, 0);
});
test("32 подпись книги меняется от любого изменения и стабильна без него", () => {
  const a = empty();
  const b = clone(a);
  assert.equal(signature(a), signature(b));
  b.people.push(person("x"));
  assert.notEqual(signature(a), signature(b));
  b.people[0].name = "другое";
  assert.notEqual(signature(a), signature({ ...a, people: [person("x")] }));
});
