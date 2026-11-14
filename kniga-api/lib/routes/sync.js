import { bodyOf, cors, json } from "../config.js";
import { DEVICE_ERROR, claimDevice } from "../devices.js";
import { redis, redisConfigured } from "../redis.js";
import { readToken } from "../token.js";
import { getChunk, hasMedia, putChunk } from "../media-store.js";

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
const PART_TTL = 400 * 86400; // срок хранения частей книги в облаке, секунды
const MAX_MEDIA_CHUNKS = 24;
const REF = /^media:[0-9a-f-]{8,64}$/i;
const SLOT = /^[0-9a-f]{8}$/;
const MAX_EXTRA_BOOKS = 2; // кроме первой книги

const bookKey = (id) => `kr:sync:${id}`;
const partKey = (id, rev, i) => `kr:sync:${id}:p:${rev}:${i}`;

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  if (!redisConfigured()) return json(res, 503, { error: "Хранилище не подключено." });
  const body = bodyOf(req);
  const access = readToken(String(body.token ?? ""));
  if (!access || Date.now() > access.until) return json(res, 401, { error: "Нужен действующий доступ." });
  const account = access.order;
  if (!(await claimDevice(account, body.deviceId))) return json(res, 403, { error: DEVICE_ERROR });
  // Книг на один доступ до трёх: у каждой свой слот в облаке (main – первая, как было раньше), фото общие на весь доступ.
  const slot = String(body.slot ?? "main");
  if (slot !== "main" && !SLOT.test(slot)) return json(res, 400, { error: "Некорректная книга." });
  const id = slot === "main" ? account : `${account}~${slot}`;
  const slotsKey = `kr:slots:${account}`;

  try {
    switch (body.op) {
      case "head": {
        const [rev, savedAt, parts, hash, prevRev, prevParts, ttlAt] = (await redis("HMGET", bookKey(id), "rev", "savedAt", "parts", "hash", "prevRev", "prevParts", "ttlAt")) ?? [];
        // Части книги живут 400 дней с последнего обращения: раз в неделю продлеваем срок текущей и запасной версии, чтобы книга, которой пользуются, не исчезла.
        if (Number(rev ?? 0) > 0 && Date.now() - Number(ttlAt ?? 0) > 7 * 86400000) {
          for (let k = 0; k < Number(parts ?? 0); k += 1) await redis("EXPIRE", partKey(id, Number(rev), k), PART_TTL);
          for (let k = 0; k < Number(prevParts ?? 0); k += 1) if (Number(prevRev ?? 0) > 0) await redis("EXPIRE", partKey(id, Number(prevRev), k), PART_TTL);
          await redis("HSET", bookKey(id), "ttlAt", String(Date.now()));
        }
        return json(res, 200, { rev: Number(rev ?? 0), savedAt: savedAt ?? "", parts: Number(parts ?? 0), hash: hash ?? "", prevRev: Number(prevRev ?? 0), prevParts: Number(prevParts ?? 0) });
      }
      case "slots": {
        const all = (await redis("HGETALL", slotsKey)) ?? [];
        const books = [];
        for (let i = 0; i + 1 < all.length; i += 2) if (all[i] !== "main") books.push({ slot: all[i], name: String(all[i + 1] || "Новая книга") });
        return json(res, 200, { books });
      }
      case "drop": {
        // Удалить книгу из облака вместе с местом в списке (первую книгу удалить нельзя).
        if (slot === "main") return json(res, 400, { error: "Первую книгу удалить нельзя." });
        const [rev, parts, prevRev, prevParts] = (await redis("HMGET", bookKey(id), "rev", "parts", "prevRev", "prevParts")) ?? [];
        for (const [r, n] of [[rev, parts], [prevRev, prevParts]]) for (let k = 0; k < Math.min(Number(n ?? 0), MAX_PARTS); k += 1) if (Number(r ?? 0) > 0) await redis("DEL", partKey(id, Number(r), k));
        await redis("DEL", bookKey(id));
        await redis("HDEL", slotsKey, slot);
        return json(res, 200, { ok: true });
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
        const hash = String(body.hash ?? "").slice(0, 64);
        const [curRaw, curHash] = (await redis("HMGET", bookKey(id), "rev", "hash")) ?? [];
        const current = Number(curRaw ?? 0);
        // Повтор уже принятой версии (ответ потерялся по дороге): не считаем конфликтом и не записываем второй раз.
        if (current === baseRev + 1 && hash && curHash === hash) return json(res, 200, { ok: true, committed: true, rev: current, duplicate: true });
        if (current !== baseRev) return json(res, 409, { error: "В облаке есть более новая версия.", rev: current });
        if (slot !== "main" && baseRev === 0 && (await redis("HEXISTS", slotsKey, slot)) !== 1) {
          const known = ((await redis("HLEN", slotsKey)) ?? 0) - ((await redis("HEXISTS", slotsKey, "main")) === 1 ? 1 : 0);
          if (known >= MAX_EXTRA_BOOKS) return json(res, 403, { error: "В облаке можно хранить до трёх книг." });
        }
        const next = baseRev + 1;
        await redis("SET", partKey(id, next, i), data, "EX", PART_TTL); // раньше было 7 дней: через неделю без правок книга пропадала из облака
        if (i < parts - 1) return json(res, 200, { ok: true, committed: false });
        // Последний кусок: проверяем, что все на месте, потом переключаем версию.
        for (let k = 0; k < parts; k += 1) if ((await redis("EXISTS", partKey(id, next, k))) !== 1) return json(res, 400, { error: "Не все части дошли." });
        const oldParts = Number((await redis("HGET", bookKey(id), "parts")) ?? 0);
        await redis("HSET", bookKey(id), "rev", String(next), "savedAt", new Date().toISOString(), "parts", String(parts), "hash", hash, "prevRev", String(baseRev), "prevParts", String(oldParts));
        // Предыдущую версию оставляем как запасную (её можно забрать операцией part), стираем ту, что до неё.
        if (baseRev >= 2) for (let k = 0; k < MAX_PARTS; k += 1) await redis("DEL", partKey(id, baseRev - 1, k));
        await redis("HSET", slotsKey, slot, String(body.name ?? "").slice(0, 60));
        return json(res, 200, { ok: true, committed: true, rev: next });
      }
      case "media-has": {
        const refs = Array.isArray(body.refs) ? body.refs.map(String).filter((r) => REF.test(r)).slice(0, 400) : [];
        const missing = [];
        for (const ref of refs) if (!(await hasMedia(account, ref))) missing.push(ref);
        return json(res, 200, { missing });
      }
      case "media-put": {
        const ref = String(body.ref ?? "");
        const n = Number(body.n);
        const i = Number(body.i);
        const data = String(body.data ?? "");
        if (!REF.test(ref) || !(n >= 1 && n <= MAX_MEDIA_CHUNKS) || !(i >= 0 && i < n) || data.length > PART + 1000) return json(res, 400, { error: "Некорректное фото." });
        await putChunk(account, ref, i, n, data);
        return json(res, 200, { ok: true });
      }
      case "media-get": {
        const ref = String(body.ref ?? "");
        const i = Number(body.i);
        if (!REF.test(ref)) return json(res, 400, { error: "Некорректное фото." });
        const got = await getChunk(account, ref, i);
        return got ? json(res, 200, got) : json(res, 404, { error: "Фото нет в облаке." });
      }
      default:
        return json(res, 400, { error: "Неизвестная операция." });
    }
  } catch (error) {
    console.error("[sync]", error instanceof Error ? error.message : error);
    return json(res, 502, { error: "Облако не ответило. Попробуйте позже." });
  }
}
