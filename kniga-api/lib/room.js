import { createHash, randomBytes } from "node:crypto";
import { redis } from "./redis.js";

export const sha = (value) => createHash("sha256").update(String(value)).digest("hex");
export const newKey = (bytes) => randomBytes(bytes).toString("base64url");
export const newRoomId = () => randomBytes(6).toString("hex");

export async function getRoom(id) {
  if (!/^[0-9a-f]{12}$/.test(String(id))) return null;
  const raw = await redis("GET", `kr:room:${id}`);
  return raw ? JSON.parse(raw) : null;
}

export const isOwner = (room, ownerKey) => Boolean(room && ownerKey && sha(ownerKey) === room.ownerHash);
export const isInvited = (room, inviteKey) => Boolean(room && inviteKey && sha(inviteKey) === room.inviteHash);

/** Не больше N обращений с одного адреса в сутки (адрес хранится только в виде хеша). */
export async function limited(req, bucket, max) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  const key = `kr:rl:${bucket}:${sha(ip).slice(0, 16)}:${new Date().toISOString().slice(0, 10)}`;
  const n = Number(await redis("INCR", key));
  if (n === 1) await redis("EXPIRE", key, 86400);
  return n > max;
}
