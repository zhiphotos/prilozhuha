import { API_BASE } from "@/lib/rod/config";
import { deviceId } from "@/lib/rod/pay";
import { useRod } from "@/lib/rod/store";
import type { Lead } from "@/lib/tree/ancestorSearch";

export type SeekAnswer = { ok: true; summary: string; leads: Lead[]; left: number } | { ok: false; limit: boolean; message: string };

/** Просит ИИ на сервере выбрать и расставить архивы для поиска предка. Ссылки он берёт только из нашего списка. */
export async function askAiSeek(input: { question: string; variants: string[]; place: string; leads: Lead[] }): Promise<SeekAnswer> {
  const token = useRod.getState().access?.token;
  if (!API_BASE || !token) return { ok: false, limit: false, message: "" };
  try {
    const response = await fetch(`${API_BASE}/api/seek`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ token, deviceId: deviceId(), ...input }),
    });
    const data = (await response.json().catch(() => ({}))) as { summary?: string; leads?: Lead[]; left?: number; error?: string };
    if (response.status === 429) return { ok: false, limit: true, message: data.error || "Лимит на этот месяц исчерпан." };
    if (!response.ok || !data.leads?.length) return { ok: false, limit: false, message: data.error || "" };
    return { ok: true, summary: data.summary ?? "", leads: data.leads, left: data.left ?? 0 };
  } catch {
    return { ok: false, limit: false, message: "" };
  }
}
