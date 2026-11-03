import type { AiResult } from "@/lib/rod/ai-client";

/** Быстрые вопросы: текст, который уходит ИИ, и короткая подпись на кнопке. */
export const QUICK_QUESTIONS: { label: string; question: string }[] = [
  { label: "Кого не хватает в древе", question: "Кого не хватает в моём древе? Назови, у кого нет родителей, супруга или детей, но они, скорее всего, были." },
  { label: "Где пробелы в датах", question: "У кого в книге не указаны даты рождения или смерти, и где даты выглядят странно или противоречат друг другу?" },
  { label: "Вопросы для интервью с бабушкой", question: "Составь список вопросов для интервью с бабушкой, опираясь на то, что уже есть в книге, и на то, чего не хватает." },
  { label: "Что известно о моей семье", question: "Расскажи коротко, что известно о моей семье по записям в книге, и что пока не подтверждено." },
];

export type Failure = { kind: "soft" | "limit" | "access" | "offline" | "error"; title: string; text: string; resetAt?: string };

/** Дата обновления лимита по-человечески: «завтра» или «4 ноября». */
export function resetWords(resetAt: string | undefined, now = new Date()): string {
  if (!resetAt) return "";
  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return "";
  const hours = (date.getTime() - now.getTime()) / 3600000;
  if (hours <= 0) return "скоро";
  if (hours < 36) return "завтра";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
}

/** Понятный человеку ответ на отказ. Страшных технических слов нет, лимит всегда с датой. */
export function describeFailure(result: Extract<AiResult<unknown>, { ok: false }>, now = new Date()): Failure {
  const when = resetWords(result.resetAt, now);
  if (result.code === "no_access" || result.status === 401)
    return { kind: "access", title: "Нужен доступ к программе", text: "ИИ-помощник входит в программу. Войдите по личному коду или аккаунту платформы, и он откроется." };
  if (result.code === "disabled" || result.code === "not_configured")
    return { kind: "soft", title: "ИИ-помощник скоро появится", text: "Он уже готовится. Пока можно пользоваться остальной книгой, а когда помощник заработает, он появится здесь сам." };
  if (result.code === "user_quota") return { kind: "limit", title: "Вопросы на сегодня закончились", text: `Лимит обновляется сам${when ? `: ${when}` : ""}. Полученные ответы остаются на этом экране, пока он открыт.`, resetAt: result.resetAt };
  if (result.code === "global_quota" || result.code === "provider_quota")
    return { kind: "limit", title: "Бесплатный запас ИИ на сегодня закончился", text: `Он общий для всех и обновляется сам${when ? `: ${when}` : ""}. Ваши личные вопросы не потрачены.`, resetAt: result.resetAt };
  if (result.code === "duplicate") return { kind: "soft", title: "Этот вопрос уже отправлен", text: "Подождите ответ, повторять не нужно." };
  if (result.code === "network") return { kind: "offline", title: "Нет связи", text: result.message };
  if (result.status === 403) return { kind: "access", title: "Доступ открыт на других устройствах", text: result.message };
  return { kind: "error", title: "ИИ сейчас не отвечает", text: "Лимит при этом не потрачен. Попробуйте чуть позже." };
}

/** Новый номер вопроса: сервер принимает один и тот же номер один раз, поэтому двойное нажатие не тратит лимит дважды. */
export function newRequestId(): string {
  try {
    return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^0-9a-z-]/gi, "");
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
