import { bodyOf, cors, json } from "../config.js";
import { DEVICE_ERROR, claimDevice } from "../devices.js";
import { redis, redisConfigured } from "../redis.js";
import { readToken } from "../token.js";

// POST /api/sync { token, deviceId, op, ... }  – синхронизация книги между устройствами одного оплаченного доступа.
// Книга хранится кусками (не больше PART байт каждый, чтобы влезать в запрос к хранилищу), фото – отдельно по ссылке.
//   head                        → { rev, savedAt, parts } (rev 0: в облаке пусто)
//   part  { rev, i }            → { data } один кусок состояния
//   push  { baseRev, parts, i, data } → кусок новой версии; на последнем куске версия применяется. 409: в облаке новее.
//   media-has { refs }          → { missing: [...] } каких фото в облаке нет
//   media-put { ref, i, n, data } → кусок фото (base64)
//   media-get { ref, i }        → { data, n }
const PART = 700_000;
const MAX_PARTS = 24;
const MAX_MEDIA_CHUNKS = 24;
const REF = /^media:[0-9a-f-]{8,64}$/i;

const bookKey = (id) => `kr:sync:${id}`;
const partKey = (id, rev, i) => `kr:sync:${id}:p:${rev}:${i}`;
const mediaKey = (id) => `kr:syncm:${id}`;

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  if (!redisConfigured()) return json(res, 503, { error: "Хранилище не подключено." });
  const body = bodyOf(req);
  const access = readToken(String(body.token ?? ""));
  if (!access || Date.now() > access.until) return json(res, 401, { error: "Нужен действующий доступ." });
  const id = access.order;
  if (!(await claimDevice(id, body.deviceId))) return json(res, 403, { error: DEVICE_ERROR });

  try {
    switch (body.op) {
      case "head": {
        const [rev, savedAt, parts] = (await redis("HMGET", bookKey(id), "rev", "savedAt", "parts")) ?? [];
        return json(res, 200, { rev: Number(rev ?? 0), savedAt: savedAt ?? "", parts: Number(parts ?? 0) });
      }
      case "part": {
        const data = await redis("GET", partKey(id, Number(body.rev), Number(body.i)));
        return data == null ? json(res, 404, { error: "Кусок не найден." }) : json(res, 200, { data });
      }
      case "push": {
        const baseRev = Number(body.baseRev ?? 0);
        const parts = Number(body.parts);
        const i = Number(body.i);
        const data = String(body.data ?? "");
        if (!(parts >= 1 && parts <= MAX_PARTS) || !(i >= 0 && i < parts) || data.length > PART + 1000) return json(res, 400, { error: "Некорректная версия." });
        const current = Number((await redis("HGET", bookKey(id), "rev")) ?? 0);
        if (current !== baseRev) return json(res, 409, { error: "В облаке есть более новая версия.", rev: current });
        const next = baseRev + 1;
        await redis("SET", partKey(id, next, i), data, "EX", 7 * 86400);
        if (i < parts - 1) return json(res, 200, { ok: true, committed: false });
        // Последний кусок: проверяем, что все на месте, потом переключаем версию.
        for (let k = 0; k < parts; k += 1) if ((await redis("EXISTS", partKey(id, next, k))) !== 1) return json(res, 400, { error: "Не все части дошли." });
        await redis("HSET", bookKey(id), "rev", String(next), "savedAt", new Date().toISOString(), "parts", String(parts));
        for (let k = 0; k < MAX_PARTS; k += 1) await redis("DEL", partKey(id, baseRev, k)); // старую версию стираем
        return json(res, 200, { ok: true, committed: true, rev: next });
      }
      case "media-has": {
        const refs = Array.isArray(body.refs) ? body.refs.map(String).filter((r) => REF.test(r)).slice(0, 400) : [];
        const missing = [];
        for (const ref of refs) if ((await redis("HEXISTS", mediaKey(id), `${ref}#n`)) !== 1) missing.push(ref);
        return json(res, 200, { missing });
      }
      case "media-put": {
        const ref = String(body.ref ?? "");
        const n = Number(body.n);
        const i = Number(body.i);
        const data = String(body.data ?? "");
        if (!REF.test(ref) || !(n >= 1 && n <= MAX_MEDIA_CHUNKS) || !(i >= 0 && i < n) || data.length > PART + 1000) return json(res, 400, { error: "Некорректное фото." });
        await redis("HSET", mediaKey(id), `${ref}#${i}`, data);
        if (i === n - 1) await redis("HSET", mediaKey(id), `${ref}#n`, String(n)); // отметка «фото целиком» ставится последней
        return json(res, 200, { ok: true });
      }
      case "media-get": {
        const ref = String(body.ref ?? "");
        const i = Number(body.i);
        if (!REF.test(ref)) return json(res, 400, { error: "Некорректное фото." });
        const [n, data] = (await redis("HMGET", mediaKey(id), `${ref}#n`, `${ref}#${i}`)) ?? [];
        return data == null ? json(res, 404, { error: "Фото нет в облаке." }) : json(res, 200, { data, n: Number(n ?? 1) });
      }
      default:
        return json(res, 400, { error: "Неизвестная операция." });
    }
  } catch (error) {
    console.error("[sync]", error instanceof Error ? error.message : error);
    return json(res, 502, { error: "Облако не ответило. Попробуйте позже." });
  }
}
