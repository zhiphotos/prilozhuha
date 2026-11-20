import assert from "node:assert/strict";
import test from "node:test";
import { helperRoundWith, publishIfChangedWith, signature, type AutoSession, type PollAnswer } from "./helper-auto.ts";
import { statusOfRound } from "./helper-status.ts";
import { dropOpen, markResent, mergeVerdicts, overview, type Verdict } from "./helper-verdicts.ts";
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
        const changes = makeChangeSet(session.sent ?? session.base, this.lists as unknown as Book);
        if (!changes.length) throw new Error("Правок пока нет.");
        this.server.submit(who, changes);
        this.session = { ...session, who, sent: clone(this.lists) as unknown as Book };
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
  assert.equal(await h.round(), "held"); // было "updated" и правка x молча пропадала
  assert.equal(names(h.lists.people), "a,c,x");
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

// ——— С-2: неотправленное и отклонённое не затирается
const year = (v: string) => ({ id: "a", name: "a", year: v });
const withYear = () => {
  const s = new Server();
  s.publish({ ...empty(), people: [year("1950")] } as unknown as Book);
  return s;
};
test("33 помощник исправил год, владелец отклонил и выложил другое: правка не пропала, есть статус", async () => {
  const s = withYear();
  const h = new Helper(s, "Мама");
  (h.lists.people[0] as unknown as { year: string }).year = "1951";
  await h.round();
  s.dismiss(s.inbox[0].id);
  s.publish({ ...empty(), people: [year("1950"), person("c")] } as unknown as Book);
  assert.equal(await h.round(), "held");
  assert.equal((h.lists.people[0] as unknown as { year: string }).year, "1951");
  assert.equal(names(h.lists.people), "a,c");
  assert.equal(statusOfRound("held")?.state, "waiting");
  assert.match(statusOfRound("held")?.text ?? "", /не принял/);
});
test("34 владелец принял: отметок нет, версия общая", async () => {
  const s = withYear();
  const h = new Helper(s, "Мама");
  (h.lists.people[0] as unknown as { year: string }).year = "1951";
  await h.round();
  const owner = clone(s.base);
  s.accept(owner, s.inbox[0].id);
  s.publish(owner as unknown as Book);
  assert.equal(await h.round(), "updated");
  assert.equal(h.session?.sent, undefined);
  assert.equal((h.lists.people[0] as unknown as { year: string }).year, "1951");
});
test("35 частично: принята одна правка, другая осталась у помощника", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  h.lists.people.push(person("x"), person("y"));
  await h.round();
  const owner = clone(s.base);
  owner.people.push(person("x")); // принят только x
  s.dismiss(s.inbox[0].id);
  s.publish(owner as unknown as Book);
  assert.equal(await h.round(), "held");
  assert.equal(names(h.lists.people), "a,x,y");
  assert.equal(makeChangeSet(h.session!.base, h.session!.sent!).map((c) => c.id).join(), "y"); // x принят, ждёт только y
});
test("36 после «не принято» два обхода подряд не шлют заново", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  h.lists.people.push(person("x"));
  await h.round();
  s.dismiss(s.inbox[0].id);
  s.publish({ ...empty(), people: [person("a"), person("c")] });
  await h.round();
  await h.round();
  await h.round();
  assert.equal(s.inbox.length, 0);
  assert.equal(names(h.lists.people), "a,c,x");
});
test("37 помощник сам решил отправить снова: уходит ровно один раз, без дубля", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  h.lists.people.push(person("x"));
  await h.round();
  s.dismiss(s.inbox[0].id);
  s.publish({ ...empty(), people: [person("a"), person("c")] });
  await h.round();
  h.session = { ...h.session!, sent: undefined }; // resendHeld
  await h.round();
  await h.round();
  assert.equal(s.inbox.length, 1);
  assert.equal(s.inbox[0].changes.length, 1);
});
test("38 старая сессия без поля sent читается как раньше", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  assert.equal(h.session?.sent, undefined);
  s.publish({ ...empty(), people: [person("a"), person("b")] });
  assert.equal(await h.round(), "updated");
  assert.equal(names(h.lists.people), "a,b");
});
test("39 отправленное остаётся ждать, пока владелец не разобрал: версия не меняется, правка цела", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  h.lists.people.push(person("x"));
  await h.round();
  assert.equal(await h.round(), "idle");
  assert.equal(names(h.lists.people), "a,x");
  assert.ok(h.session?.sent);
});

// ——— С-2б: статусы решений владельца, переживающие перезапуск
const owner = (s: Server) => clone(s.base);
const view = (h: Helper) => overview(h.session as never, h.lists as unknown as Book);
const restart = (h: Helper) => {
  h.session = JSON.parse(JSON.stringify(h.session));
  h.lists = JSON.parse(JSON.stringify(h.lists));
};
const edit = (h: Helper, id: string, name: string) => {
  h.lists.people.find((p) => p.id === id)!.name = name;
};

test("40 отправлено и ждёт решения: видно как «ждёт», не как «без правок»", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  edit(h, "a", "A1");
  await h.round();
  const v = view(h);
  assert.equal(v.fresh, 0);
  assert.equal(v.waiting.length, 1);
  assert.equal(v.rejected.length + v.conflicts.length + v.accepted.length, 0);
});
test("41 принято: статус «принято» остаётся после перезапуска", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  edit(h, "a", "A1");
  await h.round();
  s.accept(owner(s), s.inbox[0].id); // владелец разобрал присланное
  s.publish({ ...empty(), people: [person("a", "A1")] });
  assert.equal(await h.round(), "updated");
  restart(h);
  const v = view(h);
  assert.equal(v.accepted.length, 1);
  assert.equal(v.waiting.length, 0);
  assert.equal(v.rejected.length, 0);
});
test("42 не принято: счётчик и статус сохраняются после перезапуска, правка цела", async () => {
  const s = withBook(["a", "b"]);
  const h = new Helper(s, "Мама");
  edit(h, "a", "A1");
  await h.round();
  s.dismiss(s.inbox[0].id);
  s.publish({ ...empty(), people: [person("a"), person("b"), person("c")] });
  assert.equal(await h.round(), "held");
  restart(h);
  const v = view(h);
  assert.equal(v.rejected.length, 1);
  assert.equal(v.conflicts.length, 0);
  assert.equal(v.waiting.length, 0);
  assert.equal(h.lists.people.find((p) => p.id === "a")?.name, "A1");
});
test("43 владелец сам изменил то же поле: конфликт с двумя значениями, правка помощника не затёрта", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  edit(h, "a", "Мамина версия");
  await h.round();
  s.dismiss(s.inbox[0].id);
  s.publish({ ...empty(), people: [person("a", "Версия владельца")] });
  assert.equal(await h.round(), "held");
  restart(h);
  const v = view(h);
  assert.equal(v.conflicts.length, 1);
  assert.equal(v.rejected.length, 0);
  assert.deepEqual(v.conflicts[0].fields, ["name"]);
  assert.equal((v.conflicts[0].mine as Rec).name, "Мамина версия");
  assert.equal((v.conflicts[0].theirs as Rec).name, "Версия владельца");
  assert.equal(h.lists.people[0].name, "Мамина версия");
  await h.round();
  await h.round();
  assert.equal(s.inbox.length, 0); // сама заново не уходит
});
test("44 владелец изменил другое поле той же записи: это «не принято», а не конфликт", async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  edit(h, "a", "A1");
  await h.round();
  s.dismiss(s.inbox[0].id);
  s.publish({ ...empty(), people: [{ id: "a", name: "a", extra: 1 } as Rec] });
  await h.round();
  assert.equal(view(h).conflicts.length, 0); // имя владелец не менял
  assert.equal(view(h).rejected.length, 1);
});
test("45 часть принята, часть нет: принятое и не принятое считаются отдельно", async () => {
  const s = withBook(["a", "b"]);
  const h = new Helper(s, "Мама");
  edit(h, "a", "A1");
  edit(h, "b", "B1");
  await h.round();
  s.accept(owner(s), s.inbox[0].id); // разобрано: ящик пуст
  s.publish({ ...empty(), people: [person("a", "A1"), person("b")] });
  await h.round();
  const v = view(h);
  assert.equal(v.accepted.length, 1);
  assert.equal(v.rejected.length, 1);
  assert.equal(h.lists.people.find((p) => p.id === "b")?.name, "B1");
});
test("46 «Отправить снова»: не принятое уходит один раз, принятое остаётся принятым", async () => {
  const s = withBook(["a", "b"]);
  const h = new Helper(s, "Мама");
  edit(h, "a", "A1");
  edit(h, "b", "B1");
  await h.round();
  s.dismiss(s.inbox[0].id);
  s.publish({ ...empty(), people: [person("a", "A1"), person("b")] });
  await h.round();
  h.session = { ...h.session!, sent: undefined, verdicts: markResent(h.session!.verdicts, makeChangeSet(h.session!.base, h.lists as unknown as Book)) }; // resendHeld
  await h.round();
  await h.round();
  assert.equal(s.inbox.length, 1);
  const v = view(h);
  assert.equal(v.rejected.length, 0);
  assert.equal(v.waiting.length, 1);
  assert.equal(v.accepted.length, 0); // идёт новая отправка: старое «принято» не показывается рядом с ней
  assert.equal(v.history.length, 1); // но в истории остаётся
});
test("47 сброс: не принятые правки убраны, статусы «принято» остались", async () => {
  const s = withBook(["a", "b"]);
  const h = new Helper(s, "Мама");
  edit(h, "a", "A1");
  edit(h, "b", "B1");
  await h.round();
  s.dismiss(s.inbox[0].id);
  s.publish({ ...empty(), people: [person("a", "A1"), person("b")] });
  await h.round();
  h.lists = clone(h.session!.base) as unknown as Lists; // discardHeld
  h.session = { ...h.session!, sent: undefined, verdicts: dropOpen(h.session!.verdicts) };
  const v = view(h);
  assert.equal(v.fresh + v.waiting.length + v.rejected.length + v.conflicts.length, 0);
  assert.equal(v.accepted.length, 1);
});
test("48 старая сессия без verdicts и sent: сводка пустая, ничего не ломается", async () => {
  const h = new Helper(withBook(["a"]), "Мама");
  assert.equal(h.session?.verdicts, undefined);
  const v = view(h);
  assert.equal(v.fresh + v.waiting.length + v.accepted.length + v.rejected.length + v.conflicts.length, 0);
});

// ——— С-2б, исправления по браузерной проверке
const conflictSetup = async () => {
  const s = withBook(["a"]);
  const h = new Helper(s, "Мама");
  edit(h, "a", "Мамина версия");
  await h.round();
  s.dismiss(s.inbox[0].id);
  s.publish({ ...empty(), people: [person("a", "Версия владельца")] });
  await h.round();
  return { s, h };
};
const resend = (h: Helper) => {
  h.session = { ...h.session!, sent: undefined, verdicts: markResent(h.session!.verdicts, makeChangeSet(h.session!.base, h.lists as unknown as Book)) };
};

test("49 конфликт после «Отправить снова» остаётся конфликтом с обоими значениями и переживает перезапуск", async () => {
  const { s, h } = await conflictSetup();
  resend(h);
  await h.round(); // ушло второй раз
  assert.equal(s.inbox.length, 1);
  s.dismiss(s.inbox[0].id);
  s.publish({ ...empty(), people: [person("a", "Версия владельца")], places: [] }); // владелец ничего не менял заново
  await h.round();
  restart(h);
  const v = view(h);
  assert.equal(v.conflicts.length, 1);
  assert.equal(v.rejected.length, 0);
  assert.equal((v.conflicts[0].mine as Rec).name, "Мамина версия");
  assert.equal((v.conflicts[0].theirs as Rec).name, "Версия владельца");
  assert.deepEqual(v.conflicts[0].fields, ["name"]);
  assert.equal(h.lists.people[0].name, "Мамина версия");
});
test("50 пока конфликт отправлен снова и ждёт, он помечен как отправленный ещё раз и не считается дважды", async () => {
  const { h } = await conflictSetup();
  resend(h);
  await h.round();
  const v = view(h);
  assert.equal(v.conflicts.length, 1);
  assert.equal(v.conflicts[0].resent, true);
  assert.equal(v.waiting.length, 0);
  assert.equal(v.accepted.length, 0); // отправлено снова: «принято» рядом не показываем
});
test("51 когда владелец принял спорную правку, конфликт заменяется на «принято»", async () => {
  const { s, h } = await conflictSetup();
  resend(h);
  await h.round();
  s.dismiss(s.inbox[0].id);
  s.publish({ ...empty(), people: [person("a", "Мамина версия")] });
  await h.round();
  const v = view(h);
  assert.equal(v.conflicts.length, 0);
  assert.equal(v.history.length, 1);
});
test("52 «Принято» показывается только пока нет новой работы; история остаётся", async () => {
  const s = withBook(["a", "b"]);
  const h = new Helper(s, "Мама");
  edit(h, "a", "A1");
  await h.round();
  s.accept(owner(s), s.inbox[0].id);
  s.publish({ ...empty(), people: [person("a", "A1"), person("b")] });
  await h.round();
  assert.equal(view(h).accepted.length, 1);
  edit(h, "b", "B1"); // новая правка
  let v = view(h);
  assert.equal(v.accepted.length, 0);
  assert.equal(v.history.length, 1);
  assert.equal(v.fresh, 1);
  await h.round(); // и новая отправка
  v = view(h);
  assert.equal(v.accepted.length, 0);
  assert.equal(v.waiting.length, 1);
  assert.equal(v.history.length, 1);
});
test("53 после нового решения владельца «Принято» показывает только новое решение, прежнее уходит в историю", async () => {
  const s = withBook(["a", "b"]);
  const h = new Helper(s, "Мама");
  edit(h, "a", "A1");
  await h.round();
  s.accept(owner(s), s.inbox[0].id);
  s.publish({ ...empty(), people: [person("a", "A1"), person("b")] });
  await h.round();
  edit(h, "b", "B1");
  await h.round();
  s.accept(owner(s), s.inbox[0].id);
  s.publish({ ...empty(), people: [person("a", "A1"), person("b", "B1")] });
  await h.round();
  restart(h);
  const v = view(h);
  assert.equal(v.accepted.length, 1);
  assert.equal(v.accepted[0].id, "b");
  assert.equal(v.history.length, 2);
});
test("54 счётчик «Не отправлено» считается сразу от текущей книги, без обхода и перехода", async () => {
  const h = new Helper(withBook(["a", "b"]), "Мама");
  assert.equal(view(h).fresh, 0);
  edit(h, "a", "A1");
  assert.equal(view(h).fresh, 1);
  edit(h, "b", "B1");
  assert.equal(view(h).fresh, 2);
  edit(h, "a", "a"); // вернула как было
  assert.equal(view(h).fresh, 1);
});
test("55 история решений ограничена, старые записи отбрасываются, не принятое не теряется", () => {
  const acc = (i: number): Verdict => ({ key: "people", id: `p${i}`, kind: "edit", state: "accepted", at: i });
  const open: Verdict = { key: "people", id: "z", kind: "edit", state: "rejected", at: 1 };
  let list: Verdict[] = [open];
  for (let i = 0; i < 60; i += 1) list = mergeVerdicts(list, [acc(i)]);
  assert.equal(list.filter((v) => v.state === "accepted").length, 50);
  assert.ok(list.some((v) => v.id === "z"));
});
test("56 принятая правка заново не отправляется ни после «Отправить снова», ни после перезапуска", async () => {
  const s = withBook(["a", "b"]);
  const h = new Helper(s, "Мама");
  edit(h, "a", "A1");
  edit(h, "b", "B1");
  await h.round();
  s.accept(owner(s), s.inbox[0].id);
  s.publish({ ...empty(), people: [person("a", "A1"), person("b")] });
  await h.round();
  restart(h);
  resend(h);
  await h.round();
  await h.round();
  assert.equal(s.inbox.length, 1);
  assert.deepEqual(s.inbox[0].changes.map((c) => c.id), ["b"]);
});
test("57 старая сессия с verdicts из прежней версии (без resent и history) читается без ошибок", () => {
  const h = new Helper(withBook(["a"]), "Мама");
  h.session = { ...h.session!, verdicts: [{ key: "people", id: "a", kind: "edit", state: "accepted", at: 1 }] } as never;
  const v = view(h);
  assert.equal(v.history.length, 1);
  assert.equal(v.accepted.length, 1);
});
