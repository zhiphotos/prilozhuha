import { API_BASE } from "@/lib/rod/config";
import { saveMedia } from "@/lib/rod/media";
import { useRod } from "@/lib/rod/store";

export type Incoming = {
  id: string;
  kind: "story" | "answer" | "photo";
  at: number;
  from: { name: string; relation: string };
  title: string;
  question: string;
  text: string;
  photo?: string;
};

const post = async <T,>(path: string, body: unknown): Promise<T & { error?: string }> => {
  const response = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await response.json().catch(() => ({ error: "Сервер не ответил." }))) as T & { error?: string };
};

const appAddress = () => `${window.location.origin}${window.location.pathname}`;
export const inviteLink = (room: { id: string; inviteKey: string }) => `${appAddress()}#/join/${room.id}.${room.inviteKey}`;

export async function createRoom(name: string): Promise<void> {
  const token = useRod.getState().access?.token;
  const answer = await post<{ room?: string; ownerKey?: string; inviteKey?: string }>("/api/room-create", { name, token });
  if (!answer.room || !answer.ownerKey || !answer.inviteKey) throw new Error(answer.error || "Не получилось создать ссылку.");
  useRod.getState().setRoom({ id: answer.room, ownerKey: answer.ownerKey, inviteKey: answer.inviteKey, name });
}

export async function fetchInbox(): Promise<Incoming[]> {
  const room = useRod.getState().room;
  if (!room) return [];
  const answer = await post<{ items?: Incoming[] }>("/api/room-inbox", { room: room.id, ownerKey: room.ownerKey });
  return answer.items ?? [];
}

export async function dismiss(ids: string[]): Promise<void> {
  const room = useRod.getState().room;
  if (room && ids.length) await post("/api/room-ack", { room: room.id, ownerKey: room.ownerKey, ids });
}

/** Новая ссылка: старая перестаёт работать (если ссылка попала не тем людям). */
export async function rotateInvite(): Promise<void> {
  const room = useRod.getState().room;
  if (!room) return;
  const answer = await post<{ inviteKey?: string }>("/api/room-ack", { room: room.id, ownerKey: room.ownerKey, rotate: true });
  if (!answer.inviteKey) throw new Error(answer.error || "Не получилось обновить ссылку.");
  useRod.getState().setRoom({ ...room, inviteKey: answer.inviteKey });
}

/** Присланное попадает в семейный архив: рассказ в «Истории», ответ в «Вопросы», фото в «Фото». */
export async function accept(item: Incoming): Promise<void> {
  const state = useRod.getState();
  const who = [item.from.name, item.from.relation].filter(Boolean).join(", ");
  if (item.kind === "photo" && item.photo) {
    const ref = await saveMedia(item.photo);
    state.addPhoto({ dataUrl: ref, who: item.from.relation ? `${item.from.name} (${item.from.relation})` : item.from.name, where: "", year: "", what: item.text, photographer: item.from.name, personId: "" });
  } else if (item.kind === "answer") {
    state.addNote({ situationId: "family", situationTitle: `От родственников: ${who}`, question: item.question || "Воспоминание", answer: item.text });
  } else {
    state.addStory({ templateId: "family", title: item.title || `Рассказ: ${item.from.name}`, answers: {}, narrative: `${item.text}\n\n– ${who}` });
  }
}

/** Родственник: что за приглашение. */
export async function roomInfo(room: string, invite: string): Promise<{ ok: boolean; name?: string; error?: string }> {
  return await post("/api/room-info", { room, invite });
}

export async function sendToRoom(room: string, invite: string, payload: Record<string, unknown>): Promise<void> {
  const answer = await post<{ ok?: boolean }>("/api/room-submit", { room, invite, ...payload });
  if (!answer.ok) throw new Error(answer.error || "Не получилось отправить.");
}

/** Уменьшает фото до разумного размера, чтобы оно ушло быстро и влезло в лимит (около 450 КБ). */
export async function compressPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  for (const [side, quality] of [[1400, 0.8], [1100, 0.72], [900, 0.65], [700, 0.6]] as const) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", quality);
    if (data.length < 560000) return data;
  }
  throw new Error("Фото слишком большое.");
}
