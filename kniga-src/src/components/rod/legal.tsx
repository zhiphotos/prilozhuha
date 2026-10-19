import { useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { LEGAL_DOCS, findDoc, type LegalBlock } from "@/lib/rod/legal-docs";
import { ScreenFrame, TopBar, useNav } from "@/components/rod/chrome";

/** Документы читаются прямо в приложении. Адрес вида #/legal/offer открывает документ сразу (для банка и ссылок). */
export function LegalScreen({ doc }: { doc?: string }) {
  const nav = useNav();
  const current = doc ? findDoc(doc) : undefined;
  useEffect(() => {
    try {
      const hash = current ? `#/legal/${current.id}` : "#/legal";
      if (window.location.hash !== hash) window.history.replaceState(window.history.state, "", hash);
    } catch {
      /* адрес не обязателен */
    }
    return () => {
      try {
        if (window.location.hash.startsWith("#/legal")) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      } catch {
        /* ничего */
      }
    };
  }, [current]);

  if (!current) {
    return (
      <ScreenFrame>
        <TopBar kicker="Документы" title="Правила и оплата" onBack={nav.back} />
        <ul className="grid gap-2">
          {LEGAL_DOCS.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => nav.go({ id: "legal", doc: item.id })} className="glass flex min-h-16 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-ink">{item.title}</span>
                  <span className="block text-sm text-muted">{item.short}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      </ScreenFrame>
    );
  }
  return (
    <ScreenFrame>
      <TopBar kicker="Документ" title={current.title} onBack={nav.back} />
      <article className="grid gap-3 pb-6 text-[15px] leading-relaxed text-ink/90">
        {current.blocks.map((block, index) => (
          <Block key={index} block={block} />
        ))}
      </article>
    </ScreenFrame>
  );
}

function Block({ block }: { block: LegalBlock }) {
  const [kind, text] = block;
  if (kind === "title") return <h2 className="display-title text-[1.4rem] text-ink">{text}</h2>;
  if (kind === "h") return <h3 className="mt-3 text-[1.1rem] font-semibold text-ink">{text}</h3>;
  if (kind === "li") return <p className="pl-5 -indent-3 before:mr-2 before:content-['•']">{text}</p>;
  return <p>{text}</p>;
}

/** Короткие ссылки на документы: внизу главного экрана и вкладки «Уроки». */
export function LegalLinks({ dark = false }: { dark?: boolean }) {
  const nav = useNav();
  const items = ["about", "offer", "terms", "privacy", "cookies"].map((id) => findDoc(id)).filter((doc): doc is NonNullable<typeof doc> => Boolean(doc));
  return (
    <nav aria-label="Документы" className={`mt-10 flex flex-wrap gap-x-4 gap-y-2 text-xs ${dark ? "text-paper/60" : "text-muted"}`}>
      {items.map((doc) => (
        <button key={doc.id} type="button" className="underline underline-offset-2" onClick={() => nav.go({ id: "legal", doc: doc.id })}>
          {doc.id === "about" ? "Оплата и возврат" : doc.title}
        </button>
      ))}
    </nav>
  );
}
