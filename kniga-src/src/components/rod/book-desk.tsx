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
  const timer = useRef<number | null>(null);

  const list: { id: string; label: string; tone: string; hint?: string; go: () => void }[] = [
    { id: "plan", label: "Список страниц", tone: "moss", hint: "book-plan", go: p.onPlan },
    { id: "text", label: "Вставить длинный рассказ", tone: "bordo", hint: "book-text-pages", go: p.onTextToPages },
    { id: "tree", label: "Семейное дерево на страницу", tone: "olive", go: p.onTree },
    { id: "cover", label: "Обложка и корешок", tone: "cream", hint: "book-cover", go: p.onCover },
    { id: "print", label: "Формат и печать", tone: "moss", hint: "book-print", go: p.onPrint },
    { id: "flip", label: "Листать книгу", tone: "bordo", go: p.onFlip },
    { id: "toc", label: p.planTotal ? `Содержание · ${p.planDone} из ${p.planTotal}` : "Содержание", tone: "olive", go: p.onContents },
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
        const tab = (
          <button type="button" className="kr-ft" onClick={() => press(f.id, f.go)}>
            {f.label}
          </button>
        );
        return (
          <section key={f.id} className="kr-f" data-tone={f.tone} data-up={up === f.id} style={{ "--o": i % 3 } as CSSProperties}>
            {f.hint ? <Hint id={f.hint}>{tab}</Hint> : tab}
          </section>
        );
      })}
    </div>
  );
}
