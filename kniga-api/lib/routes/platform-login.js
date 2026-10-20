import { bodyOf, cors, json } from "../config.js";
import { makeToken } from "../token.js";

// POST /api/platform-login { email, password }
// Один аккаунт на всё: человек входит данными с платформы balanuca (Supabase). Если у него там активный доступ
// к «Книге Рода», приложение открывается на год от даты выдачи. Пароль только пересылается в Supabase, нигде не хранится.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const url = process.env.PLATFORM_SUPABASE_URL;
  const anon = process.env.PLATFORM_SUPABASE_ANON_KEY;
  if (!url || !anon) return json(res, 503, { error: "Вход через платформу пока не подключён." });
  const { email, password } = bodyOf(req);
  const mail = String(email ?? "").trim().toLowerCase();
  if (!mail || !password) return json(res, 400, { error: "Введите почту и пароль." });
  try {
    const auth = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ email: mail, password: String(password) }) });
    const session = await auth.json().catch(() => ({}));
    if (!auth.ok || !session.access_token) return json(res, 401, { error: "Почта или пароль не подошли. Вход такой же, как на платформе balanuca." });
    const rows = await fetch(`${url}/rest/v1/enrollments?select=status,created_at,expires_at,courses(title)&status=eq.active`, { headers: { apikey: anon, Authorization: `Bearer ${session.access_token}` } });
    const list = (await rows.json().catch(() => [])) || [];
    const mine = (Array.isArray(list) ? list : []).filter((row) => /^книга\s*рода/i.test(row.courses?.title ?? ""));
    if (!mine.length) return json(res, 403, { error: "На этой почте нет курса «Книга Рода». Нужна именно та почта, на которую открыт доступ." });
    const until = Math.max(...mine.map((row) => (row.expires_at ? Date.parse(row.expires_at) : Date.parse(row.created_at) + 365 * 86400000)));
    if (until < Date.now()) return json(res, 403, { error: "Срок доступа закончился." });
    return json(res, 200, { token: makeToken({ order: `plat-${String(session.user?.id ?? "").slice(0, 8)}`, until }), until, order: "platform" });
  } catch (error) {
    console.error("[platform-login]", error instanceof Error ? error.message : error);
    return json(res, 502, { error: "Платформа не ответила. Попробуйте позже." });
  }
}
