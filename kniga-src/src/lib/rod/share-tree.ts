// Ссылка «посмотреть древо» для родных: на сервере лежит урезанный снимок (без заметок и фото), по ссылке его можно только смотреть.
import { API_BASE } from "@/lib/rod/config";
import { mediaDataUrl } from "@/lib/rod/media";
import type { TreeData } from "@/lib/tree/types";

const KEY = "kr-tree-share";
export type ShareRecord = { id: string; owner: string };

export const readShare = (): ShareRecord | null => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null") as ShareRecord | null;
    return raw?.id && raw.owner ? raw : null;
  } catch {
    return null;
  }
};
const writeShare = (record: ShareRecord | null) => {
  try {
    if (record) localStorage.setItem(KEY, JSON.stringify(record));
    else localStorage.removeItem(KEY);
  } catch {
    /* без хранилища ссылку нельзя будет обновить с этого устройства */
  }
};

/** Что уходит на сервер: без заметок и фото. */
export const snapshotOf = (tree: Pick<TreeData, "people" | "unions" | "focusId">) => ({
  focusId: tree.focusId,
  unions: tree.unions,
  people: tree.people.map((p) => ({ ...p, note: "", photo: "" })),
});

export const viewUrl = (id: string) => `${window.location.origin}${window.location.pathname}#/view/${id}`;

const call = async (init: RequestInit, query = "") => {
  const response = await fetch(`${API_BASE}/api/tree-share${query}`, { headers: { "Content-Type": "application/json" }, ...init });
  const data = (await response.json().catch(() => ({}))) as { error?: string; ok?: boolean; id?: string; owner?: string; tree?: TreeData };
  if (!response.ok) throw new Error(response.status === 404 && !data.error ? "Ссылки на просмотр заработают после переезда на новый адрес." : data.error || "Не получилось.");
  return data;
};


const AVATAR_SIDE = 128;
const AVATAR_LIMIT = 300;
const BATCH = 8;

/** Маленькая квадратная миниатюра для просмотра по ссылке: полноразмерные фото не уходят. */
async function avatarThumb(photo: string): Promise<string> {
  const source = await mediaDataUrl(photo);
  if (!source) return "";
  const image = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = source;
  });
  if (!image || !image.naturalWidth) return "";
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIDE;
  canvas.height = AVATAR_SIDE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, AVATAR_SIDE, AVATAR_SIDE);
  return canvas.toDataURL("image/jpeg", 0.72);
}

/** Отправляет аватарки порциями. Не получилось с фото: ссылка всё равно работает, просто без картинок. Возвращает, сколько ушло. */
async function uploadAvatars(link: ShareRecord, people: TreeData["people"]): Promise<number> {
  const withPhoto = people.filter((p) => p.photo).slice(0, AVATAR_LIMIT);
  let sent = 0;
  for (let i = 0; i < withPhoto.length; i += BATCH) {
    const photos: Record<string, string> = {};
    for (const person of withPhoto.slice(i, i + BATCH)) {
      const thumb = await avatarThumb(person.photo).catch(() => "");
      if (thumb) photos[person.id] = thumb;
    }
    if (!Object.keys(photos).length) continue;
    try {
      await call({ method: "POST", body: JSON.stringify({ id: link.id, owner: link.owner, photos }) });
      sent += Object.keys(photos).length;
    } catch {
      return sent;
    }
  }
  return sent;
}

/** Создаёт ссылку или обновляет снимок по прежней ссылке. */
export async function publishShare(tree: Pick<TreeData, "people" | "unions" | "focusId">): Promise<string> {
  if (!API_BASE) throw new Error("Ссылки на просмотр появятся, когда подключится сервер приложения.");
  const current = readShare();
  if (current) {
    try {
      await call({ method: "POST", body: JSON.stringify({ id: current.id, owner: current.owner, tree: snapshotOf(tree) }) });
      await uploadAvatars(current, tree.people);
      return viewUrl(current.id);
    } catch {
      // ссылка отозвана или устарела: заводим новую
      writeShare(null);
    }
  }
  const made = await call({ method: "POST", body: JSON.stringify({ tree: snapshotOf(tree) }) });
  if (!made.id || !made.owner) throw new Error("Не получилось создать ссылку.");
  writeShare({ id: made.id, owner: made.owner });
  await uploadAvatars({ id: made.id, owner: made.owner }, tree.people);
  return viewUrl(made.id);
}

export async function revokeShare(): Promise<void> {
  const current = readShare();
  if (!current) return;
  await call({ method: "POST", body: JSON.stringify({ id: current.id, owner: current.owner, revoke: true }) });
  writeShare(null);
}

export async function loadShared(id: string): Promise<TreeData> {
  const data = await call({ method: "GET" }, `?id=${encodeURIComponent(id)}`);
  if (!data.tree) throw new Error("Древо не открылось.");
  // Аватарки приходят отдельно: если не пришли, показываем древо без картинок.
  const extra = await call({ method: "GET" }, `?id=${encodeURIComponent(id)}&photos=1`).then((r) => (r as { photos?: Record<string, string> }).photos ?? {}).catch(() => ({}) as Record<string, string>);
  return { ...data.tree, people: data.tree.people.map((p) => (extra[p.id] ? { ...p, photo: extra[p.id]! } : p)) };
}
