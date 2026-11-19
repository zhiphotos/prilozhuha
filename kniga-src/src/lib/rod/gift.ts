/** Адрес приложения без хвоста: сюда ведут ссылки на подарок и намёк. */
const appAddress = () => `${window.location.origin}${window.location.pathname}`;

/** Четыре оформления открытки. Цвета из палитры приложения: тёмный лес, слоновая кость, бордо и ночь. */
export type GiftCardId = "ivory" | "forest" | "rose" | "night";
export type GiftCardLook = { id: GiftCardId; name: string; bg: string; edge: string; ink: string; accent: string; rim: string };

export const GIFT_CARDS: GiftCardLook[] = [
  { id: "ivory", name: "Слоновая кость", bg: "linear-gradient(135deg,#faf5e8 0%,#efe6cf 45%,#ddcca2 100%)", edge: "#b99a5b", ink: "#2a2210", accent: "#8a6a2c", rim: "#b8a172" },
  { id: "forest", name: "Тёмный лес", bg: "linear-gradient(135deg,#34503c 0%,#1d3024 45%,#0f1912 100%)", edge: "#e6cf9c", ink: "#f3f0e8", accent: "#e6cf9c", rim: "#0a110c" },
  { id: "rose", name: "Бордо", bg: "linear-gradient(135deg,#9a3a53 0%,#6a2234 50%,#3b111e 100%)", edge: "#e8c9a0", ink: "#fbeee6", accent: "#ecd1a6", rim: "#2c0c16" },
  { id: "night", name: "Ночь", bg: "linear-gradient(135deg,#2e3549 0%,#181c2c 50%,#0a0c15 100%)", edge: "#d9c9a3", ink: "#f1ede2", accent: "#dccca6", rim: "#07080e" },
];

export const lookOf = (id?: string): GiftCardLook => GIFT_CARDS.find((card) => card.id === id) ?? GIFT_CARDS[0]!;

/** deliverAt: когда отправить письмо получателю (миллисекунды), 0 – сразу после оплаты. recipientEmail пуст, если даритель отправит ссылку сам. */
export type GiftDraft = { from: string; to: string; message: string; card: GiftCardId; recipientEmail: string; deliverAt: number };
export type GiftInfo = { status: "unpaid" | "refunded" | "paid" | "opened"; from?: string; to?: string; message?: string; card?: GiftCardId };

/** Подсказки для послания: можно выбрать и поправить. */
export const MESSAGE_IDEAS = [
  "Хочу, чтобы истории нашей семьи не потерялись. Давай соберём их в книгу.",
  "С днём рождения! Пусть эта книга будет про тех, кого ты любишь.",
  "Просто так, от всего сердца. Ты хранишь столько семейных историй.",
];

export const giftLink = (id: string) => `${appAddress()}#/gift/${id}`;

/** «Намёк»: текст лежит прямо в ссылке, серверу ничего не нужно. */
export type Wish = { to: string; from: string; message: string };

const toBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromBase64Url = (value: string) => {
  const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export const wishLink = (wish: Wish) => `${appAddress()}#/wish/${toBase64Url(JSON.stringify({ t: wish.to.slice(0, 40), f: wish.from.slice(0, 40), m: wish.message.slice(0, 400) }))}`;

export function readWish(payload: string): Wish | null {
  try {
    const raw = JSON.parse(fromBase64Url(payload)) as { t?: unknown; f?: unknown; m?: unknown };
    return { to: String(raw.t ?? "").slice(0, 40), from: String(raw.f ?? "").slice(0, 40), message: String(raw.m ?? "").slice(0, 400) };
  } catch {
    return null;
  }
}
