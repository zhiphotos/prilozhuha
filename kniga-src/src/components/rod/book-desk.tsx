import { useState, type ReactNode } from "react";
import { BookOpen, ListChecks, Palette, Printer, Sparkles, TreePine, X } from "lucide-react";
import { Hint } from "@/components/rod/hint";

type FolderId = "add" | "cover" | "print";
type Lifted = "flip" | "toc" | null;

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
  const [lifted, setLifted] = useState<Lifted>(null);

  const row = (icon: ReactNode, text: string, onClick: () => void) => (
    <button type="button" className="kr-row" onClick={onClick}>
      {icon}
      <span>{text}</span>
    </button>
  );

  const panels: Record<FolderId, ReactNode> = {
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
  const tabs: { id: FolderId; label: string }[] = [
    { id: "add", label: "Страницы" },
    { id: "cover", label: "Обложка" },
    { id: "print", label: "Печать" },
  ];

  return (
    <div data-tour="book-actions" className="kr-desk">
      <div className="kr-tabs" role="tablist" aria-label="Что сделать с книгой">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={folder === t.id}
            data-tone={i}
            className="kr-tab"
            onClick={() => setFolder(folder === t.id ? null : t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {folder ? (
        <div className="kr-folder" key={folder} data-tone={tabs.findIndex((t) => t.id === folder)}>
          {panels[folder]}
        </div>
      ) : null}

      <div className="kr-shelf" role="group" aria-label="Сама книга">
        <button type="button" className="kr-book kr-moss" aria-expanded={lifted === "flip"} data-up={lifted === "flip"} onClick={() => setLifted(lifted === "flip" ? null : "flip")}>
          <span>Листать</span>
        </button>
        <button type="button" className="kr-book kr-bordo" aria-expanded={lifted === "toc"} data-up={lifted === "toc"} onClick={() => setLifted(lifted === "toc" ? null : "toc")}>
          <span>Содержание</span>
        </button>
        {lifted ? (
          <div className="kr-pop" key={lifted}>
            <button type="button" className="kr-pop-x" aria-label="Закрыть" onClick={() => setLifted(null)}>
              <X className="size-4" />
            </button>
            <button
              type="button"
              className="kr-pop-go"
              onClick={() => {
                const go = lifted === "flip" ? p.onFlip : p.onContents;
                setLifted(null);
                go();
              }}
            >
              <BookOpen className="size-4" />
              {lifted === "flip" ? "Открыть книгу" : `Содержание${p.planTotal ? ` · ${p.planDone} из ${p.planTotal}` : ""}`}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
