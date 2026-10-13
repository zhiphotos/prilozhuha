import { useState } from "react";
import { toast } from "sonner";
import { Button, Sheet } from "@/components/rod/chrome";
import { useRod } from "@/lib/rod/store";
import type { BookPage, PageBlock } from "@/lib/rod/types";

const EXAMPLE = `Мамина линия – 6
Папина линия – 6
Дом детства – 4
Рецепты семьи – 8
Письма и документы – 3
Мои слова будущим – 2`;

type Row = { title: string; count: number };

/** Строка вида «Дом детства – 4», «Дом детства (4 стр.)», «Дом детства 4» → название и число страниц (без числа одна). */
export function parsePlan(text: string): Row[] {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-–•*]|\d+[.)])\s+/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)[\s\-–:(]*(\d{1,2})\s*(?:стр\.?|страниц\w*|с\.)?\)?\s*$/i);
      const title = (m ? m[1] : line).replace(/[\s\-–:(]+$/, "").trim() || line;
      const count = m ? Math.max(1, Math.min(40, Number(m[2]))) : 1;
      return { title, count };
    });
}

const id = () => crypto.randomUUID();

function pagesFor(row: Row, sectionNo: number, chapterId: string): Omit<BookPage, "id">[] {
  return Array.from({ length: row.count }, (_, i) => {
    const first = i === 0;
    const blocks: PageBlock[] = [
      first
        ? { id: id(), type: "text", x: 8, y: 6, w: 84, text: row.title, font: "script", size: "lg" }
        : { id: id(), type: "text", x: 8, y: 6, w: 84, text: `${row.title}, продолжение`, font: "sans", size: "md" },
      { id: id(), type: "text", x: 8, y: 16, w: 60, text: "", font: "script", size: "sm", placeholder: first ? `Раздел ${sectionNo}: что здесь будет` : "Что ещё добавить" },
    ];
    return { chapterId, title: first ? row.title : `${row.title} · ${i + 1}`, kind: "page" as const, paper: "cream" as const, strokes: [], blocks };
  });
}

/** Оглавление текстом → заготовки страниц по порядку. */
export function PlanSheet({ onClose }: { onClose: () => void }) {
  const pages = useRod((state) => state.pages);
  const insertPage = useRod((state) => state.insertPage);
  const plan = useRod((state) => state.plan);
  const setPlan = useRod((state) => state.setPlan);
  const [text, setText] = useState("");
  const rows = parsePlan(text);
  const total = rows.reduce((a, r) => a + r.count, 0);

  const build = () => {
    let at = pages.length;
    const chapters = rows.map((row) => ({ id: id(), title: row.title, planned: row.count, done: false }));
    setPlan([...plan, ...chapters]);
    rows.forEach((row, n) => {
      for (const page of pagesFor(row, plan.length + n + 1, chapters[n].id)) {
        insertPage(page, at);
        at += 1;
      }
    });
    toast(`Оглавление и страницы готовы: ${total}. Откройте «Содержание», чтобы переходить по главам.`);
    onClose();
  };

  return (
    <Sheet title="План книги списком" onClose={onClose} className="max-w-xl">
      <p className="text-sm text-muted">Напишите оглавление: в каждой строке раздел и, через тире, сколько страниц на него примерно. Приложение сделает заготовки по порядку: на каждой название и подсказка, остальное вы оформите сами. Страницы встанут в конец книги.</p>
      <textarea className="field mt-3 min-h-40" value={text} placeholder={EXAMPLE} onChange={(event) => setText(event.target.value)} />
      {rows.length ? (
        <ol className="mt-3 grid gap-1 text-sm text-ink">
          {rows.map((row, i) => (
            <li key={i} className="flex justify-between rounded-xl bg-white/70 px-3 py-1.5">
              <span>{row.title}</span>
              <span className="text-muted">{row.count} стр.</span>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Button className="flex-1" disabled={!rows.length} onClick={build}>
          Создать {total ? `${total} стр.` : "страницы"}
        </Button>
        <Button variant="soft" onClick={() => setText(EXAMPLE)}>
          Пример
        </Button>
      </div>
    </Sheet>
  );
}
