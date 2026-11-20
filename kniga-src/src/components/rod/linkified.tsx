import { splitLinks } from "@/lib/rod/linkify";

/** Текст с кликабельными ссылками: открываются в новой вкладке, без передачи адреса приложения сайту. */
export function Linkified({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((part, i) =>
        part.href ? (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-gold-ink underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
