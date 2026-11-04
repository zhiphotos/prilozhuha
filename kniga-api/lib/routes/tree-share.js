import { createHash, randomBytes } from "node:crypto";
import { bodyOf, cors, json } from "../config.js";
import { redis, redisConfigured } from "../redis.js";
import { throttled } from "../throttle.js";

/**
 * Ссылка «посмотреть древо» для родных (только просмотр):
 *   POST /api/tree-share { tree }                        создать ссылку: { id, owner }
 *   POST /api/tree-share { id, owner, tree }             обновить снимок по той же ссылке
 *   POST /api/tree-share { id, owner, revoke: true }     отозвать ссылку
 *   GET  /api/tree-share?id=<id>                         получить снимок для просмотра
 * Хранится урезанный снимок: имена, даты, место рождения, связи. Заметки, фото и истории не сохраняются.
 * Секрет владельца на сервере только в виде хеша, ссылка действует год с последнего обновления.
 */
const KEEP_DAYS = 365;
const MAX_PEOPLE = 3000;
const sha = (text) => createHash("sha256").update(text).digest("hex");
const str = (v, n = 120) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const ids = (v) => (Array.isArray(v) ? v.map((x) => str(x, 64)).filter(Boolean).slice(0, 60) : []);

export function cleanTree(tree) {
  const rawPeople = Array.isArray(tree?.people) ? tree.people.slice(0, MAX_PEOPLE) : [];
  const people = rawPeople
    .map((p) => ({
      id: str(p?.id, 64),
      firstName: str(p?.firstName, 60),
      patronymic: str(p?.patronymic, 60),
      lastName: str(p?.lastName, 60),
      gender: ["m", "f"].includes(p?.gender) ? p.gender : "u",
      birthYear: str(p?.birthYear, 30),
      deathYear: str(p?.deathYear, 30),
      maidenName: str(p?.maidenName, 60) || undefined,
      birthPlace: str(p?.birthPlace, 80) || undefined,
      side: p?.side === "left" || p?.side === "right" ? p.side : undefined,
      rank: Number.isFinite(Number(p?.rank)) ? Number(p.rank) : undefined,
      photo: "",
      note: "",
    }))
    .filter((p) => p.id);
  const known = new Set(people.map((p) => p.id));
  const unions = (Array.isArray(tree?.unions) ? tree.unions : [])
    .slice(0, MAX_PEOPLE * 2)
    .map((u) => ({
      id: str(u?.id, 64),
      partnerIds: ids(u?.partnerIds).filter((id) => known.has(id)),
      childIds: ids(u?.childIds).filter((id) => known.has(id)),
      status: ["married", "divorced", "widowed", "partner"].includes(u?.status) ? u.status : "married",
      startYear: str(u?.startYear, 30),
      endYear: str(u?.endYear, 30),
    }))
    .filter((u) => u.id && (u.partnerIds.length || u.childIds.length));
  const focusId = known.has(str(tree?.focusId, 64)) ? str(tree.focusId, 64) : people[0]?.id ?? "";
  return { people, unions, focusId };
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!redisConfigured()) return json(res, 503, { error: "Ссылки на просмотр ещё не подключены." });

  if (req.method === "GET") {
    if (await throttled(req, res, "tree-view", 600)) return;
    const url = new URL(req.url, `https://${req.headers.host}`);
    const id = url.searchParams.get("id") ?? "";
    if (!/^[0-9a-f]{16}$/.test(id)) return json(res, 400, { error: "Ссылка не подошла." });
    const raw = await redis("GET", `kr:share:${id}`).catch(() => null);
    if (!raw) return json(res, 404, { error: "Ссылка больше не действует: владелец её отозвал или она устарела." });
    const record = JSON.parse(raw);
    return json(res, 200, { tree: record.tree, at: record.at });
  }

  if (req.method !== "POST") return json(res, 405, { error: "method" });
  if (await throttled(req, res, "tree-share", 60)) return;
  const body = bodyOf(req);
  const id = str(body.id, 32);
  const owner = str(body.owner, 80);

  if (id) {
    if (!/^[0-9a-f]{16}$/.test(id) || !owner) return json(res, 400, { error: "Ссылка не подошла." });
    const raw = await redis("GET", `kr:share:${id}`).catch(() => null);
    const record = raw ? JSON.parse(raw) : null;
    if (!record || record.h !== sha(owner)) return json(res, 403, { error: "Эту ссылку нельзя изменить с этого устройства." });
    if (body.revoke === true) {
      await redis("DEL", `kr:share:${id}`);
      return json(res, 200, { ok: true });
    }
    const tree = cleanTree(body.tree);
    if (!tree.people.length) return json(res, 400, { error: "В древе пока никого нет." });
    await redis("SET", `kr:share:${id}`, JSON.stringify({ h: record.h, tree, at: Date.now() }), "EX", KEEP_DAYS * 86400);
    return json(res, 200, { ok: true, id });
  }

  const tree = cleanTree(body.tree);
  if (!tree.people.length) return json(res, 400, { error: "В древе пока никого нет." });
  const newId = randomBytes(8).toString("hex");
  const secret = randomBytes(18).toString("base64url");
  await redis("SET", `kr:share:${newId}`, JSON.stringify({ h: sha(secret), tree, at: Date.now() }), "EX", KEEP_DAYS * 86400);
  return json(res, 200, { ok: true, id: newId, owner: secret });
}
