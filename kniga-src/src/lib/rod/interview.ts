// Вопросы интервью из ссылки: колода (по номерам карточек) или шаблон истории.
import { findSituation, findTemplate } from "@/lib/rod/content";
import type { Interview } from "@/lib/rod/ask-link";

export type InterviewQuestions = { title: string; questions: { key: string; text: string; hint?: string }[] };

export function interviewQuestions(iv: Interview): InterviewQuestions | null {
  if (iv.kind === "tpl") {
    const tpl = findTemplate(iv.id);
    return tpl ? { title: tpl.title, questions: tpl.questions.map((q) => ({ key: q.id, text: q.text, hint: q.placeholder })) } : null;
  }
  const deck = findSituation(iv.id);
  if (!deck) return null;
  const questions = iv.idx.filter((n) => n < deck.questions.length).map((n) => ({ key: `${deck.id}:${n}`, text: deck.questions[n]! }));
  return questions.length ? { title: deck.title, questions } : null;
}
