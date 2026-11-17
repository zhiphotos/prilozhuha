// Отправка вопроса родственнику: вопрос и ссылка в комнату родных уходят одним сообщением.
// Родственник отвечает по ссылке без регистрации, ответ приходит владельцу во входящие (lib/rod/family.ts).
import { copyText } from "@/lib/rod/invite";
import { createRoom } from "@/lib/rod/family";
import { questionLink, questionMessage } from "@/lib/rod/ask-link";
import { useRod } from "@/lib/rod/store";

/** Отправляет вопрос: меню «Поделиться» на телефоне, а если его нет, текст копируется. Возвращает, что получилось. */
export async function sendQuestion(question: string): Promise<"shared" | "copied" | "cancelled"> {
  let room = useRod.getState().room;
  if (!room) {
    const dedicatee = useRod.getState().dedicatee.trim() || useRod.getState().collector.trim();
    await createRoom(dedicatee ? `Книга рода · ${dedicatee}` : "Книга рода");
    room = useRod.getState().room;
  }
  if (!room) throw new Error("Не получилось создать ссылку для родных.");
  const text = questionMessage(question, questionLink(room, question));
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Вопрос из семейной книги", text });
      return "shared";
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return "cancelled";
    }
  }
  await copyText(text);
  return "copied";
}
