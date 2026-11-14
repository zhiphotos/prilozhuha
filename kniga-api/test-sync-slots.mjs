// Несколько книг в облаке одного доступа: `node test-sync-slots.mjs`
process.env.MEMORY_STORE = "1";
process.env.APP_ORIGINS = "https://app.example"; process.env.ACCESS_SECRET = "s".repeat(40);
const handler = (await import("./lib/routes/sync.js")).default;
const { makeToken } = await import("./lib/token.js");
const token = makeToken({ order: "kr-test", until: Date.now() + 86400000 });
const run = (body) => new Promise((resolve) => {
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(t) { resolve({ status: this.statusCode, json: t ? JSON.parse(t) : {} }); } };
  handler({ method: "POST", url: "/api/sync", body: { token, deviceId: "dev1", ...body }, headers: { host: "api.example", origin: "https://app.example" }, socket: { remoteAddress: "1.2.3.4" } }, res);
});
const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) process.exitCode = 1; };
const push = (slot, name, text, hash, baseRev = 0) => run({ op: "push", slot, name, baseRev, parts: 1, i: 0, data: text, hash });

ok("первая книга (main) пишется как раньше", (await push("main", "Моя книга", "AAA", "h1")).json.rev === 1);
ok("вторая книга пишется отдельно", (await push("aaaaaaaa", "Дед", "BBB", "h2")).json.rev === 1);
ok("третья книга пишется", (await push("bbbbbbbb", "Баба", "CCC", "h3")).json.rev === 1);
ok("четвёртая книга отклонена", (await push("cccccccc", "Лишняя", "DDD", "h4")).status === 403);
ok("плохой номер книги отклонён", (await run({ op: "head", slot: "../x" })).status === 400);
ok("у книг разные версии", (await run({ op: "head", slot: "aaaaaaaa" })).json.rev === 1 && (await run({ op: "head" })).json.rev === 1);
ok("содержимое не смешивается", (await run({ op: "part", slot: "aaaaaaaa", rev: 1, i: 0 })).json.data === "BBB" && (await run({ op: "part", rev: 1, i: 0 })).json.data === "AAA");
const list = await run({ op: "slots" });
ok("список книг без main", list.json.books.length === 2 && list.json.books.some((b) => b.slot === "aaaaaaaa" && b.name === "Дед"));
ok("обновление уже занятого слота можно", (await push("aaaaaaaa", "Дед и баба", "EEE", "h5", 1)).json.rev === 2);
// фото общие на весь доступ
await run({ op: "media-put", slot: "aaaaaaaa", ref: "media:0a1b2c3d-4e5f", n: 1, i: 0, data: "PHOTO" });
ok("фото видно из другой книги", (await run({ op: "media-has", slot: "bbbbbbbb", refs: ["media:0a1b2c3d-4e5f"] })).json.missing.length === 0);
ok("первую книгу удалить нельзя", (await run({ op: "drop", slot: "main" })).status === 400);
ok("вторую можно удалить", (await run({ op: "drop", slot: "aaaaaaaa" })).json.ok === true);
ok("после удаления версия 0 и место свободно", (await run({ op: "head", slot: "aaaaaaaa" })).json.rev === 0 && (await push("cccccccc", "Новая", "NNN", "h6")).json.rev === 1);
console.log(process.exitCode ? "ПРОВАЛ" : "Книги в облаке: всё в порядке");
