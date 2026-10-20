import { DEVICE_ERROR, claimDevice } from "../devices.js";
import { bodyOf, cors, json } from "../config.js";
import { redis, redisConfigured } from "../redis.js";
import { makeToken } from "../token.js";

export const GRANT_DAYS = 365;
export const normCode = (value) => String(value ?? "").toUpperCase().replace(/[^0-9A-ZА-ЯЁ]/g, "");

// POST /api/redeem { code }  – личный код действующей ученицы (выдаёт Дарина, хранится в Redis, можно отозвать).
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  if (!redisConfigured()) return json(res, 503, { error: "Сервер доступа не подключён." });
  const code = normCode(bodyOf(req).code);
  if (code.length < 6) return json(res, 404, { error: "Код не подошёл." });
  const raw = await redis("HGET", "kr:grants", code);
  if (!raw) return json(res, 404, { error: "Код не подошёл." });
  const given = JSON.parse(raw);
  const until = Number(given.at || Date.now()) + GRANT_DAYS * 86400000;
  if (until < Date.now()) return json(res, 404, { error: "Срок кода закончился." });
  if (!(await claimDevice(`grant-${code}`, bodyOf(req).deviceId))) return json(res, 403, { error: DEVICE_ERROR });
  return json(res, 200, { token: makeToken({ order: `grant-${code}`, until }), until, order: `grant-${code}` });
}
