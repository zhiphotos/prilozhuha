import { LEGAL_VERSION } from "@/lib/rod/legal-docs";
import { appAddress, post, redeemCode } from "@/lib/rod/pay";
import type { GiftDraft, GiftInfo } from "@/lib/rod/gift";

/** Оплата подарка: банк вернёт дарителя на экран «Отправьте ссылку». */
export async function startGiftCheckout(draft: GiftDraft, email: string, ads: boolean): Promise<string> {
  const answer = await post<{ url?: string }>("/api/gift-checkout", { ...draft, email, ads, legal: LEGAL_VERSION, app: appAddress() });
  if (!answer.url) throw new Error(answer.error || "Не получилось открыть оплату.");
  return answer.url;
}

export async function fetchGift(id: string): Promise<GiftInfo> {
  const answer = await post<GiftInfo>("/api/gift-info", { id });
  if (!answer.status) throw new Error(answer.error || "Подарок не найден.");
  return answer;
}

/** Получатель распаковал подарок: сервер выдаёт код, приложение сразу открывает доступ. Возвращает текст ошибки или null. */
export async function openGift(id: string, email: string): Promise<string | null> {
  try {
    const answer = await post<{ code?: string }>("/api/gift-open", { id, email: email.trim() });
    if (!answer.code) return answer.error || "Не получилось открыть подарок.";
    return await redeemCode(answer.code);
  } catch {
    return "Не получилось открыть подарок. Проверьте интернет.";
  }
}
