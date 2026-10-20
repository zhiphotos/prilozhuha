import { bodyOf, cors, json } from "../config.js";
import { redis, redisConfigured } from "../redis.js";
import { makeToken } from "../token.js";

/** Активные доступы к «Книге Рода» по токену пользователя платформы: до какого срока открыто (0 = нет доступа). */
export async function platformUntil(accessToken) {
  const url = process.env.PLATFORM_SUPABASE_URL;
  const anon = process.env.PLATFORM_SUPABASE_ANON_KEY;
  const rows = await fetch(`${url}/rest/v1/enrollments?select=status,created_at,expires_at,courses(title)&status=eq.active`, { headers: { apikey: anon, Authorization: `Bearer ${accessToken}` } });
  const list = (await rows.json().catch(() => [])) || [];
  const mine = (Array.isArray(list) ? list : []).filter((row) => /^книга\s*рода/i.test(row.courses?.title ?? ""));
  if (!mine.length) return 0;
  return Math.max(...mine.map((row) => (row.expires_at ? Date.parse(row.expires_at) : Date.parse(row.created_at) + 365 * 86400000)));
}

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
    const until = await platformUntil(session.access_token);
    if (!until) return json(res, 403, { error: "На этой почте нет курса «Книга Рода». Нужна именно та почта, на которую открыт доступ." });
    if (until < Date.now()) return json(res, 403, { error: "Срок доступа закончился." });
    const uid = String(session.user?.id ?? "");
    // Запоминаем «ключ продления» на сервере: так при возврате денег и снятии доступа на платформе приложение закроется само.
    if (redisConfigured() && session.refresh_token) await redis("HSET", "kr:plat", uid, JSON.stringify({ rt: session.refresh_token, email: mail, at: Date.now() }));
    return json(res, 200, { token: makeToken({ order: `plat-${uid}`, until }), until, order: "platform" });
  } catch (error) {
    console.error("[platform-login]", error instanceof Error ? error.message : error);
    return json(res, 502, { error: "Платформа не ответила. Попробуйте позже." });
  }
}
