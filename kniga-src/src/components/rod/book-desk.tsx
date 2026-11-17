import { useState, type ReactNode } from "react";
import { BookOpen, ListChecks, Palette, Printer, Sparkles, TreePine } from "lucide-react";
import { Hint } from "@/components/rod/hint";

type FolderId = string;

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

/** Верх «Книги»: три папки (закрыты, пока не нажмёшь) и полка с двумя книгами. Все прежние кнопки на месте. */
export function BookDesk(p: Props) {
  const [folder, setFolder] = useState<FolderId | null>(null);

  const row = (icon: ReactNode, text: string, onClick: () => void) => (
    <button type="button" className="kr-row" onClick={onClick}>
      {icon}
      <span>{text}</span>
    </button>
  );

  const panels: Record<"add" | "cover" | "print", ReactNode> = {
    add: (
      <>
        <Hint id="book-plan">{row(<ListChecks className="size-4" />, "Список страниц", p.onPlan)}</Hint>
        <Hint id="book-text-pages">
          {row(<Sparkles className="size-4" />, "Вставить длинный рассказ", p.onTextToPages)}
          <p className="kr-note">Длинную историю вставьте сюда, она сама разойдётся по страницам.</p>
        </Hint>
        {row(<TreePine className="size-4" />, "Семейное дерево на страницу", p.onTree)}
      </>
    ),
    cover: <Hint id="book-cover">{row(<Palette className="size-4" />, "Обложка и корешок", p.onCover)}</Hint>,
    print: <Hint id="book-print">{row(<Printer className="size-4" />, "Формат и печать", p.onPrint)}</Hint>,
  };
  const single = (go: () => void, text: string) => row(<BookOpen className="size-4" />, text, go);
  const list: { id: string; label: string; tone: string; body: ReactNode }[] = [
    { id: "add", label: "Страницы", tone: "moss", body: panels.add },
    { id: "cover", label: "Обложка", tone: "bordo", body: panels.cover },
    { id: "print", label: "Печать", tone: "olive", body: panels.print },
    { id: "flip", label: "Листать книгу", tone: "cream", body: single(p.onFlip, "Открыть книгу") },
    { id: "toc", label: p.planTotal ? `Содержание · ${p.planDone} из ${p.planTotal}` : "Содержание", tone: "bordo", body: single(p.onContents, "Открыть содержание") },
  ];

  return (
    <div data-tour="book-actions" className="kr-desk">
      {list.map((f, i) => {
        const on = folder === f.id;
        return (
          <section key={f.id} className="kr-f" data-tone={f.tone} data-open={on} style={{ "--o": i % 3 } as React.CSSProperties}>
            <button type="button" className="kr-ft" aria-expanded={on} onClick={() => setFolder(on ? null : f.id)}>
              {f.label}
            </button>
            {on ? <div className="kr-fb">{f.body}</div> : null}
          </section>
        );
      })}
    </div>
  );
}
