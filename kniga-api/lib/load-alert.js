// Письмо хозяйке, когда на сервере становится тесно: память Redis или диск заполнены больше чем на 70%. Не чаще раза в сутки по каждому поводу.
import { statfs } from "node:fs/promises";
import { redis, redisConfigured } from "./redis.js";
import { mailConfigured, sendMail } from "./mail.js";

const LIMIT = 0.7;
const TO = () => process.env.ALERT_MAIL || "darinazizina@gmail.com";

export async function loadReport() {
  const out = {};
  const info = String((await redis("INFO", "memory").catch(() => "")) ?? "");
  const used = Number(/used_memory:(\d+)/.exec(info)?.[1] ?? 0);
  const max = Number(/maxmemory:(\d+)/.exec(info)?.[1] ?? 0);
  if (used && max) out.memory = { used, max, share: used / max };
  const fs = await statfs(process.env.MEDIA_DIR || "/").catch(() => null);
  if (fs) out.disk = { free: fs.bavail * fs.bsize, total: fs.blocks * fs.bsize, share: 1 - fs.bavail / fs.blocks };
  return out;
}

const mb = (n) => `${Math.round(n / 1e6)} МБ`;
const gb = (n) => `${(n / 1e9).toFixed(1)} ГБ`;

export async function checkLoad(send = sendMail) {
  if (!redisConfigured() || !mailConfigured()) return [];
  const rep = await loadReport();
  const sent = [];
  const items = [
    ["memory", rep.memory, () => `Память сервера, где хранятся оплаты, доступы и коды входа, заполнена на ${Math.round(rep.memory.share * 100)}% (${mb(rep.memory.used)} из ${mb(rep.memory.max)}). Когда она заполнится, облако и вход перестанут работать. Напишите Claude: нужно поднять потолок памяти или перенести данные на диск.`],
    ["disk", rep.disk, () => `Диск сервера заполнен на ${Math.round(rep.disk.share * 100)}% (свободно ${gb(rep.disk.free)} из ${gb(rep.disk.total)}). Пора чистить или брать тариф побольше.`],
  ];
  for (const [kind, part, text] of items) {
    if (!part || part.share < LIMIT) continue;
    if ((await redis("SET", `kr:loadalert:${kind}`, "1", "EX", 86400, "NX")) !== "OK") continue;
    const body = text();
    await send({ to: TO(), subject: "Книга рода: на сервере становится тесно", html: `<p>${body}</p>`, text: body });
    sent.push(kind);
  }
  return sent;
}
