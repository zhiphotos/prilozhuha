// Фото облака книг. На своём сервере лежат файлами на диске (MEDIA_DIR), в памяти Redis их держать дорого.
// Без MEDIA_DIR (Vercel, проверки) работает как раньше, через Redis. Старые фото, что ещё в Redis, читаются оттуда.
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { redis } from "./redis.js";

const dir = () => process.env.MEDIA_DIR || "";
const rkey = (id) => `kr:syncm:${id}`;
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 40);
const folder = (id) => join(dir(), sha(id));
const file = (id, ref, suffix) => join(folder(id), `${ref.slice(6).replace(/[^0-9a-f-]/gi, "")}.${suffix}`);
const exists = (p) => stat(p).then(() => true, () => false);

export const mediaOnDisk = () => Boolean(dir());

export async function hasMedia(id, ref) {
  if (dir() && (await exists(file(id, ref, "n")))) return true;
  return (await redis("HEXISTS", rkey(id), `${ref}#n`)) === 1;
}

export async function putChunk(id, ref, i, n, data) {
  if (!dir()) {
    await redis("HSET", rkey(id), `${ref}#${i}`, data);
    if (i === n - 1) await redis("HSET", rkey(id), `${ref}#n`, String(n));
    return;
  }
  await mkdir(folder(id), { recursive: true });
  const tmp = file(id, ref, `${i}.tmp`);
  await writeFile(tmp, data);
  await rename(tmp, file(id, ref, String(i)));
  if (i === n - 1) await writeFile(file(id, ref, "n"), String(n)); // отметка «фото целиком» последней
}

/** { data, n } или null, если такого куска нет. */
export async function getChunk(id, ref, i) {
  if (dir() && (await exists(file(id, ref, "n")))) {
    const n = Number(await readFile(file(id, ref, "n"), "utf8"));
    const data = await readFile(file(id, ref, String(i)), "utf8").catch(() => null);
    return data == null ? null : { data, n };
  }
  const [n, data] = (await redis("HMGET", rkey(id), `${ref}#n`, `${ref}#${i}`)) ?? [];
  return data == null ? null : { data, n: Number(n ?? 1) };
}

/** Перенос фото одного доступа из Redis на диск; после успеха ключ в Redis удаляется. Возвращает число перенесённых фото. */
export async function moveToDisk(id) {
  if (!dir()) return 0;
  const all = (await redis("HGETALL", rkey(id))) ?? [];
  const map = {};
  for (let i = 0; i + 1 < all.length; i += 2) map[all[i]] = all[i + 1];
  let photos = 0;
  for (const k of Object.keys(map)) {
    if (!k.endsWith("#n")) continue;
    const ref = k.slice(0, -2);
    const n = Number(map[k]);
    for (let i = 0; i < n; i += 1) if (map[`${ref}#${i}`] == null) throw new Error(`нет куска ${ref}#${i}`);
    await mkdir(folder(id), { recursive: true });
    for (let i = 0; i < n; i += 1) await writeFile(file(id, ref, String(i)), map[`${ref}#${i}`]);
    await writeFile(file(id, ref, "n"), String(n));
    photos += 1;
  }
  // Проверяем, что всё записано, и только потом стираем из памяти.
  for (const k of Object.keys(map)) if (k.endsWith("#n") && !(await exists(file(id, k.slice(0, -2), "n")))) throw new Error("не записалось");
  await redis("DEL", rkey(id));
  return photos;
}
export const removeFolder = (id) => rm(folder(id), { recursive: true, force: true });
