// Ссылка «посмотреть древо» на памяти вместо базы: `node test-share.mjs`
process.env.MEMORY_STORE = "1";
process.env.APP_ORIGINS = "https://app.example"; process.env.ACCESS_SECRET = "s".repeat(40);
const handler = (await import("./lib/routes/tree-share.js")).default;
const run = ({ method = "POST", url = "/api/tree-share", body } = {}) => new Promise((resolve) => {
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(t) { resolve({ status: this.statusCode, json: t ? JSON.parse(t) : {} }); } };
  handler({ method, url, body, headers: { host: "api.example", origin: "https://app.example" }, socket: { remoteAddress: "1.2.3.4" } }, res);
});
const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) process.exitCode = 1; };

const tree = {
  focusId: "a",
  people: [
    { id: "a", firstName: "Анна", lastName: "Иванова", gender: "f", birthYear: "1950", deathYear: "", birthPlace: "Тбилиси", note: "СЕКРЕТ", photo: "data:image/png;base64,AAAA" },
    { id: "b", firstName: "Борис", gender: "m", birthYear: "1948", deathYear: "" },
  ],
  unions: [{ id: "u1", partnerIds: ["a", "b", "ghost"], childIds: [], status: "married", startYear: "1970", endYear: "" }],
};
const made = await run({ body: { tree } });
ok("ссылка создана", made.status === 200 && /^[0-9a-f]{16}$/.test(made.json.id) && made.json.owner.length >= 20);
const view = await run({ method: "GET", url: `/api/tree-share?id=${made.json.id}` });
ok("снимок открывается", view.status === 200 && view.json.tree.people.length === 2);
ok("заметки и фото не сохраняются", view.json.tree.people[0].note === "" && view.json.tree.people[0].photo === "");
ok("место рождения сохраняется", view.json.tree.people[0].birthPlace === "Тбилиси");
ok("несуществующие люди в союзах отброшены", !view.json.tree.unions[0].partnerIds.includes("ghost"));
ok("чужой секрет не обновляет", (await run({ body: { id: made.json.id, owner: "x".repeat(24), tree } })).status === 403);
ok("владелец обновляет", (await run({ body: { id: made.json.id, owner: made.json.owner, tree: { ...tree, people: [tree.people[0]] } } })).status === 200);
ok("обновление применилось", (await run({ method: "GET", url: `/api/tree-share?id=${made.json.id}` })).json.tree.people.length === 1);
ok("кривой номер отклонён", (await run({ method: "GET", url: "/api/tree-share?id=zzz" })).status === 400);
ok("пустое древо отклонено", (await run({ body: { tree: { people: [], unions: [] } } })).status === 400);
ok("чужой не отзовёт", (await run({ body: { id: made.json.id, owner: "y".repeat(24), revoke: true } })).status === 403);
ok("владелец отзывает", (await run({ body: { id: made.json.id, owner: made.json.owner, revoke: true } })).status === 200);
ok("после отзыва 404", (await run({ method: "GET", url: `/api/tree-share?id=${made.json.id}` })).status === 404);
