// Отправка вопроса родственнику: вопрос и ссылка в комнату родных уходят одним сообщением.
// Родственник отвечает по ссылке без регистрации, ответ приходит владельцу во входящие (lib/rod/family.ts).
import { copyText } from "@/lib/rod/invite";
import { createInterview, createRoom } from "@/lib/rod/family";
import { interviewLink, interviewMessage, questionLink, questionMessage, type Interview } from "@/lib/rod/ask-link";
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

async function roomForSend() {
  let room = useRod.getState().room;
  if (!room) {
    const dedicatee = useRod.getState().dedicatee.trim() || useRod.getState().collector.trim();
    await createRoom(dedicatee ? `Книга рода · ${dedicatee}` : "Книга рода");
    room = useRod.getState().room;
  }
  if (!room) throw new Error("Не получилось создать ссылку для родных.");
  return room;
}

async function shareOrCopy(text: string, title: string): Promise<"shared" | "copied" | "cancelled"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return "cancelled";
    }
  }
  await copyText(text);
  return "copied";
}

/** Отправляет интервью: подборку вопросов колоды или шаблон истории одной ссылкой. */
export async function sendInterview(iv: Interview, title: string, count: number): Promise<"shared" | "copied" | "cancelled"> {
  const room = await roomForSend();
  return shareOrCopy(interviewMessage(title, count, interviewLink(room, iv)), "Интервью для семейной книги");
}

/** Своё интервью: вопросы вписывает владелица, ссылка короткая. */
export async function sendCustomInterview(title: string, questions: string[]): Promise<"shared" | "copied" | "cancelled"> {
  const room = await roomForSend();
  const id = await createInterview(title, questions);
  const text = interviewMessage(title || "Интервью", questions.length, interviewLink(room, { kind: "custom", id, idx: [] }));
  return shareOrCopy(text, "Интервью для семейной книги");
}
