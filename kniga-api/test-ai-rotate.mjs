// Проверка переключения аккаунтов Cloudflare при исчерпанной квоте: `node test-ai-rotate.mjs`
const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) process.exitCode = 1; };
const { cloudflareText, QuotaError, cfAccounts, resetSpentAccounts } = await import("./lib/ai/providers.js");
const env = { CF_ACCOUNT_ID: "A", CF_API_TOKEN: "ta", CF_EXTRA_ACCOUNTS: JSON.stringify([{ id: "B", token: "tb" }, { id: "C", token: "tc" }]) };
ok("запасные аккаунты читаются", cfAccounts(env).length === 3 && cfAccounts({ CF_ACCOUNT_ID: "A", CF_API_TOKEN: "t" }).length === 1 && cfAccounts({ CF_ACCOUNT_ID: "A", CF_API_TOKEN: "t", CF_EXTRA_ACCOUNTS: "мусор" }).length === 1);
const used = [];
let exhausted = new Set(["A"]);
globalThis.fetch = async (url) => {
  const id = String(url).split("/accounts/")[1].split("/")[0]; used.push(id);
  if (exhausted.has(id)) return { status: 429, ok: false, json: async () => ({ success: false, errors: [{ code: 4006 }] }) };
  return { status: 200, ok: true, json: async () => ({ success: true, result: { response: `ответ ${id}` } }) };
};
let r = await cloudflareText.run({ system: "s", user: "u" }, env);
ok("основной кончился: ответил второй", r.text === "ответ B" && used.join() === "A,B");
used.length = 0;
r = await cloudflareText.run({ system: "s", user: "u" }, env);
ok("исчерпанный основной больше не пробуется до обновления квоты", used.join() === "B");
exhausted = new Set(["A", "B", "C"]); used.length = 0;
let err = null; try { await cloudflareText.run({ system: "s", user: "u" }, env); } catch (e) { err = e; }
ok("все кончились: QuotaError", err instanceof QuotaError);
resetSpentAccounts(); exhausted = new Set(); used.length = 0;
r = await cloudflareText.run({ system: "s", user: "u" }, { CF_ACCOUNT_ID: "A", CF_API_TOKEN: "ta" });
ok("без запасных всё как раньше", r.text === "ответ A" && used.join() === "A");
console.log(process.exitCode ? "ЕСТЬ ОШИБКИ" : "ВСЁ ПРОШЛО");
