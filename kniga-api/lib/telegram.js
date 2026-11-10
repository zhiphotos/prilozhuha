const API = (method) => `https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/${method}`;

export async function tg(method, body) {
  if (!process.env.TG_BOT_TOKEN) return null;
  try {
    const response = await fetch(API(method), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}

export const say = (chatId, text) => tg("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
export const tellAdmin = (text) => (process.env.TG_ADMIN_CHAT_ID ? say(process.env.TG_ADMIN_CHAT_ID, text) : null);
