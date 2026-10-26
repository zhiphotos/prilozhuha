import { toast } from "sonner";
import { API_BASE } from "@/lib/rod/config";
import { LEGAL_VERSION } from "@/lib/rod/legal-docs";
import { useRod } from "@/lib/rod/store";

/** Устройство узнаём по случайному номеру, который лежит только в этом браузере: так сервер считает два устройства на один доступ. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem("kr-device");
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^0-9a-z-]/gi, "");
      localStorage.setItem("kr-device", id);
    }
    return id;
  } catch {
    return "";
  }
}

const post = async <T,>(path: string, body: unknown): Promise<T & { error?: string }> => {
  const response = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(body as object), deviceId: deviceId() }) });
  return (await response.json().catch(() => ({ error: "Сервер не ответил." }))) as T & { error?: string };
};

/** Адрес приложения без хвоста: сюда банк вернёт покупателя. */
const appAddress = () => `${window.location.origin}${window.location.pathname}`;

/** Открывает платёжную страницу банка. Чек придёт на указанную почту. */
export async function startCheckout(email: string, ads: boolean): Promise<string> {
  const answer = await post<{ url?: string }>("/api/checkout", { email, ads, legal: LEGAL_VERSION, app: appAddress() });
  if (!answer.url) throw new Error(answer.error || "Не получилось открыть оплату.");
  return answer.url;
}

/** Вернуть доступ на другом устройстве: номер заказа и почта из чека. */
export async function claimAccess(order: string, email: string): Promise<void> {
  const answer = await post<{ token?: string; until?: number }>("/api/claim", { order: order.trim(), email: email.trim() });
  if (!answer.token || !answer.until) throw new Error(answer.error || "Заказ не найден.");
  useRod.getState().grantAccess({ token: answer.token, until: answer.until, order: order.trim() });
}

/** Личный код действующей ученицы: сервер проверяет его и выдаёт подписанный доступ. */
export async function redeemCode(code: string): Promise<string | null> {
  try {
    const answer = await post<{ token?: string; until?: number; order?: string }>("/api/redeem", { code });
    if (!answer.token || !answer.until) return answer.error || "Код не подошёл.";
    useRod.getState().grantAccess({ token: answer.token, until: answer.until, order: answer.order ?? "grant" });
    return null;
  } catch {
    return "Не получилось проверить код. Проверьте интернет.";
  }
}

/** «Сообщите, когда откроется покупка»: оставить почту (с согласием). */
export async function leaveLead(email: string): Promise<string | null> {
  try {
    const answer = await post<{ ok?: boolean }>("/api/lead", { email: email.trim(), consent: true });
    return answer.ok ? null : answer.error || "Не получилось отправить.";
  } catch {
    return "Не получилось отправить. Проверьте интернет.";
  }
}

/** Один аккаунт: вход данными с платформы balanuca. Пароль уходит только на сервер и дальше в платформу. */
export async function platformLogin(email: string, password: string): Promise<void> {
  const answer = await post<{ token?: string; until?: number; order?: string }>("/api/platform-login", { email: email.trim(), password });
  if (!answer.token || !answer.until) throw new Error(answer.error || "Не получилось войти.");
  useRod.getState().grantAccess({ token: answer.token, until: answer.until, order: answer.order ?? "platform" });
}

/** Банк вернул человека в приложение: забираем токен из адреса и открываем программу. */
export function handlePaymentReturn(): void {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = hash.get("kr-access");
  const order = hash.get("order") ?? "";
  const paid = params.get("paid");
  if (!token && paid === null) return;
  try {
    window.history.replaceState(window.history.state, "", window.location.pathname);
  } catch {
    /* адрес можно не чистить */
  }
  if (token) {
    const parts = token.split(".");
    let until = Date.now() + 365 * 86400000;
    try {
      until = (JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as { x: number }).x;
    } catch {
      /* срок возьмёт сервер при проверке */
    }
    useRod.getState().grantAccess({ token, until, order });
    toast("Оплата прошла. Программа открыта", { description: order ? `Номер заказа: ${order}. Чек пришёл на почту.` : undefined, duration: 12000 });
  } else if (paid === "0") {
    toast("Оплата не прошла. Деньги не списаны. Попробуйте ещё раз.", { duration: 8000 });
  }
}

/** При запуске: срок вышел или платёж возвращён – закрываем программу. Нет связи – оставляем как есть. */
export async function verifyAccess(): Promise<void> {
  const { access, revokeAccess } = useRod.getState();
  if (!access) return;
  if (Date.now() > access.until) {
    revokeAccess();
    return;
  }
  if (!API_BASE) return;
  try {
    const answer = await post<{ valid?: boolean; reason?: string }>("/api/verify", { token: access.token });
    if (answer.valid === false) {
      revokeAccess();
      if (answer.reason === "devices") toast("Этот доступ уже открыт на двух других устройствах. Напишите Дарине, она освободит место.", { duration: 10000 });
    }
  } catch {
    /* без сети доступ сохраняется */
  }
}
