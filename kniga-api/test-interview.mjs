// Проверка собственного интервью для родственника на памяти вместо базы: `node test-interview.mjs`
process.env.MEMORY_STORE = "1"; process.env.APP_ORIGINS = "https://app.example"; process.env.ACCESS_SECRET = "s".repeat(40);
const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) process.exitCode = 1; };
const run = (handler, body) => new Promise((resolve) => {
  const res = { statusCode: 200, setHeader() {}, end(t) { resolve({ status: this.statusCode, json: t ? JSON.parse(t) : null }); } };
  handler({ method: "POST", body, headers: { origin: "https://app.example" }, socket: { remoteAddress: "1.2.3.4" } }, res);
});
const { ROUTES } = await import("./lib/routes/index.js");
const { redis } = await import("./lib/redis.js");
const { sha } = await import("./lib/room.js");
const room = "abcdef123456", ownerKey = "owner-key-1", inviteKey = "invite-key-1";
await redis("SET", `kr:room:${room}`, JSON.stringify({ name: "Дарина", ownerHash: sha(ownerKey), inviteHash: sha(inviteKey) }));
const h = ROUTES["room-interview"];
ok("чужой ключ владельца отклонён", (await run(h, { room, ownerKey: "bad", questions: ["Как вас зовут?"] })).status === 404);
ok("пустое интервью отклонено", (await run(h, { room, ownerKey, questions: ["", "  ", "ы"] })).status === 400);
const made = await run(h, { room, ownerKey, title: "Про деда Ивана", questions: ["  Как дед   познакомился с бабушкой?  ", "Где вы жили в детстве?", "Что он любил готовить?"] });
ok("интервью создано, короткий номер", made.status === 200 && /^[0-9a-f]{10}$/.test(made.json.id));
const got = await run(h, { room, invite: inviteKey, id: made.json.id });
ok("родственник получает название и вопросы без лишних пробелов", got.status === 200 && got.json.title === "Про деда Ивана" && got.json.questions.length === 3 && got.json.questions[0] === "Как дед познакомился с бабушкой?");
ok("чужое приглашение отклонено", (await run(h, { room, invite: "bad", id: made.json.id })).status === 404);
ok("выдуманный номер не находится", (await run(h, { room, invite: inviteKey, id: "0000000000" })).status === 404);
ok("ограничение числа вопросов", (await run(h, { room, ownerKey, questions: Array.from({ length: 60 }, (_, i) => `Вопрос номер ${i}`) })).status === 200 && (await run(h, { room, invite: inviteKey, id: (await run(h, { room, ownerKey, questions: Array.from({ length: 60 }, (_, i) => `Вопрос номер ${i}`) })).json.id })).json.questions.length === 40);
