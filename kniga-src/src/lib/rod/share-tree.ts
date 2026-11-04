// Ссылка «посмотреть древо» для родных: на сервере лежит урезанный снимок (без заметок и фото), по ссылке его можно только смотреть.
import { API_BASE } from "@/lib/rod/config";
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

/** Создаёт ссылку или обновляет снимок по прежней ссылке. */
export async function publishShare(tree: Pick<TreeData, "people" | "unions" | "focusId">): Promise<string> {
  if (!API_BASE) throw new Error("Ссылки на просмотр появятся, когда подключится сервер приложения.");
  const current = readShare();
  if (current) {
    try {
      await call({ method: "POST", body: JSON.stringify({ id: current.id, owner: current.owner, tree: snapshotOf(tree) }) });
      return viewUrl(current.id);
    } catch {
      // ссылка отозвана или устарела: заводим новую
      writeShare(null);
    }
  }
  const made = await call({ method: "POST", body: JSON.stringify({ tree: snapshotOf(tree) }) });
  if (!made.id || !made.owner) throw new Error("Не получилось создать ссылку.");
  writeShare({ id: made.id, owner: made.owner });
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
  return data.tree;
}
