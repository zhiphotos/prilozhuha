/** Делит текст на куски: обычный текст и ссылки (http, https и «www.»). Другие схемы (javascript:, data:) ссылками не становятся. */
export type TextPart = { text: string; href?: string };

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAIL = /[.,;:!?)\]»”…]+$/;

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    let url = m[0];
    // Знаки в конце («см. сайт.») к ссылке не относятся; закрывающую скобку оставляем, если открывающая внутри ссылки.
    let tail = "";
    for (;;) {
      const t = TRAIL.exec(url)?.[0];
      if (!t) break;
      let cut = t;
      if (t[0] === ")" && (url.match(/\(/g)?.length ?? 0) >= (url.match(/\)/g)?.length ?? 0)) break;
      if (cut.length > 1 && cut.startsWith(")") && (url.match(/\(/g)?.length ?? 0) >= (url.match(/\)/g)?.length ?? 0)) cut = cut.slice(1);
      url = url.slice(0, url.length - cut.length);
      tail = cut + tail;
      if (cut === t) break;
    }
    if (url.replace(/^(https?:\/\/|www\.)/i, "").length < 3) continue;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: url, href: /^www\./i.test(url) ? `https://${url}` : url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts.length ? parts : [{ text }];
}
