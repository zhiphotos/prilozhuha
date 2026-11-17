import { useRef, useState, type CSSProperties } from "react";
import { Hint } from "@/components/rod/hint";

type Props = {
  planDone: number;
  planTotal: number;
  onPrint: () => void;
  onPlan: () => void;
  onTextToPages: () => void;
  onTree: () => void;
  onCover: () => void;
  onFlip: () => void;
  onContents: () => void;
};

/** Верх «Книги»: стопка папок. Каждая папка и есть кнопка: нажал, папка приподнялась и открылись настройки. */
export function BookDesk(p: Props) {
  const [up, setUp] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [lift, setLift] = useState(0);
  const timer = useRef<number | null>(null);

  const list: { id: string; label: string; tone: string; hint?: string; go: () => void; note?: string; cta?: string }[] = [
    { id: "plan", label: "Создать план книги", tone: "moss", hint: "book-plan", go: p.onPlan },
    { id: "text", label: "Вставить длинный рассказ", tone: "bordo", hint: "book-text-pages", go: p.onTextToPages, note: "Длинную историю вставьте сюда, она сама разойдётся по страницам.", cta: "Вставить рассказ" },
    { id: "tree", label: "Семейное дерево на страницу", tone: "cream", go: p.onTree, note: "Поместите отдельных людей из семейного древа на страницу своей книги.", cta: "Открыть древо" },
    { id: "cover", label: "Обложка и корешок", tone: "moss", hint: "book-cover", go: p.onCover },
    { id: "print", label: "Формат и печать", tone: "cream", hint: "book-print", go: p.onPrint },
    { id: "flip", label: "Листать книгу", tone: "bordo", go: p.onFlip },
    { id: "toc", label: p.planTotal ? `Содержание книги рода · ${p.planDone} из ${p.planTotal}` : "Содержание книги рода", tone: "moss", go: p.onContents },
  ];

  const press = (id: string, go: () => void) => {
    setUp(id);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setUp(null);
      go();
    }, 220);
  };

  return (
    <div data-tour="book-actions" className="kr-desk">
      {list.map((f, i) => {
        const on = open === f.id;
        const tab = (
          <button type="button" className="kr-fbtn" aria-expanded={f.note ? on : undefined} onClick={(e) => {
              if (!f.note) return press(f.id, f.go);
              if (!on) {
                const sec = e.currentTarget.closest("section");
                const first = sec?.parentElement?.firstElementChild as HTMLElement | null;
                setLift(sec && first ? (sec as HTMLElement).offsetTop - first.offsetTop : 0);
              }
              setOpen(on ? null : f.id);
            }}>
            <span className="kr-ft">{f.label}</span>
            <span className="kr-fbody" aria-hidden="true" />
          </button>
        );
        return (
          <section key={f.id} className="kr-f" data-tone={f.tone} data-up={up === f.id} data-open={on} style={{ "--o": i % 5, "--lift": `${on ? lift : 0}px`, zIndex: i + 1 } as CSSProperties}>
            {f.hint ? <Hint id={f.hint}>{tab}</Hint> : tab}
            {on && f.note ? (
              <div className="kr-fnote">
                <p>{f.note}</p>
                <button type="button" className="kr-fgo" onClick={() => press(f.id, f.go)}>
                  {f.cta}
                </button>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
