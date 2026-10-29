import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button, Sheet } from "@/components/rod/chrome";
import { useRod } from "@/lib/rod/store";
import type { Person } from "@/lib/rod/types";
import { buildDiagnostics, buildTreeFile, parseTreeFile, planImport, type ImportPlan, type TreeFile } from "@/lib/tree/treeFile";
import { useTree } from "@/lib/tree/ui-store";

const build = () => document.querySelector<HTMLScriptElement>("script[src*='assets/index-']")?.src.match(/index-([^./]+)\.js/)?.[1] ?? "";

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const stamp = () => new Date().toISOString().slice(0, 10);
const view = () => {
  const s = useTree.getState();
  return { theme: s.theme, flow: s.flow, scope: s.scope, spread: s.spread };
};

/** «Файл древа»: скачать всё дерево в собственном формате, загрузить обратно, скачать файл для диагностики. Ничего не отправляется на сервер. */
export function TreeFileButton() {
  const [open, setOpen] = useState(false);
  const [incoming, setIncoming] = useState<{ file: TreeFile; warnings: string[]; plan: ImportPlan } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const people = useRod((s) => s.people);

  const saveTree = () => {
    download(`kniga-roda-${stamp()}.tree`, JSON.stringify(buildTreeFile(people, build(), view()), null, 1));
    toast("Файл древа сохранён. В нём имена и данные родственников: храните его так же бережно, как саму книгу. Фото в файл не входят.", { duration: 9000 });
  };
  const diag = (anonymize: boolean) => {
    download(`kniga-roda-diagnostika${anonymize ? "-obezlichennaya" : ""}-${stamp()}.json`, JSON.stringify(buildDiagnostics(people, { anonymize, build: build(), view: view() }), null, 1));
    toast(anonymize ? "Обезличенный файл сохранён: имена, даты и заметки убраны, но структура семьи осталась, поэтому полной анонимности он не гарантирует." : "Полный файл для диагностики сохранён: в нём имена и данные родственников.", { duration: 9000 });
  };
  const pick = (file: File | undefined) => {
    if (!file) return;
    void file.text().then((text) => {
      const parsed = parseTreeFile(text);
      if (!parsed.ok) return toast(parsed.error, { duration: 9000 });
      setIncoming({ file: parsed.file, warnings: parsed.warnings, plan: planImport(useRod.getState().people, parsed.file.people) });
    });
    if (input.current) input.current.value = "";
  };
  /** Только добавляет людей, которых ещё нет по id. Совпадающие и отличающиеся записи не трогаем. */
  const addMissing = () => {
    if (!incoming) return;
    const have = useRod.getState().people;
    useRod.setState({ people: [...incoming.plan.add, ...have] });
    toast(`Добавлено людей: ${incoming.plan.add.length}. Остальные записи остались как были.`);
    setIncoming(null);
    setOpen(false);
  };
  /** Полная замена: сначала сохраняется копия текущего дерева, потом подтверждение. */
  const replaceAll = () => {
    if (!incoming) return;
    if (!window.confirm(`Заменить текущее дерево (${people.length} чел.) деревом из файла (${incoming.file.people.length} чел.)? Сначала скачается копия текущего.`)) return;
    download(`kniga-roda-kopiya-pered-zamenoj-${stamp()}.tree`, JSON.stringify(buildTreeFile(useRod.getState().people, build(), view()), null, 1));
    useRod.setState({ people: incoming.file.people });
    toast("Дерево заменено деревом из файла. Копия прежнего скачана.", { duration: 9000 });
    setIncoming(null);
    setOpen(false);
  };

  return (
    <>
      <button type="button" className="chip" onClick={() => setOpen(true)}>
        Файл древа
      </button>
      <input ref={input} type="file" accept=".tree,application/json" className="hidden" onChange={(event) => pick(event.target.files?.[0])} />
      {open ? (
        <Sheet title="Файл древа" onClose={() => { setOpen(false); setIncoming(null); }}>
          <div className="grid gap-3 text-sm text-ink">
            <p className="rounded-xl bg-white/70 p-3 text-muted">Файлы сохраняются только на ваше устройство и никуда не отправляются. Полный файл содержит имена и данные родственников, передавайте его только тем, кому доверяете.</p>
            {incoming ? (
              <div className="grid gap-2 rounded-xl border border-ink/15 p-3">
                <p>
                  В файле: людей {incoming.file.people.length}, связей {incoming.file.counts.links}. Новых: <b>{incoming.plan.add.length}</b>, совпадают: {incoming.plan.identical.length}, отличаются: <b>{incoming.plan.conflicts.length}</b>.
                </p>
                {incoming.plan.conflicts.length ? <p className="text-muted">Отличаются: {incoming.plan.conflicts.slice(0, 5).map((c) => c.name).join(", ")}{incoming.plan.conflicts.length > 5 ? "…" : ""}. При «Добавить недостающих» они не заменяются.</p> : null}
                {incoming.warnings.length ? <p className="text-muted">Замечания: {incoming.warnings.slice(0, 3).join(" ")}</p> : null}
                <Button onClick={addMissing} disabled={!incoming.plan.add.length}>Добавить недостающих</Button>
                <button type="button" className="min-h-11 rounded-xl border border-ink/20 px-3 text-rose-deep" onClick={replaceAll}>Заменить всё деревом из файла…</button>
              </div>
            ) : null}
            <Button onClick={saveTree}>Скачать файл древа (.tree)</Button>
            <button type="button" className="min-h-11 rounded-xl border border-ink/20 px-3" onClick={() => input.current?.click()}>Загрузить файл древа…</button>
            <p className="pt-1 font-semibold">Для диагностики</p>
            <p className="text-muted">Если схема выглядит неправильно, скачайте файл и передайте разработчице. Обезличенный убирает имена, даты, заметки и фото, но структура семьи остаётся и по ней иногда можно узнать семью.</p>
            <button type="button" className="min-h-11 rounded-xl border border-ink/20 px-3" onClick={() => diag(true)}>Скачать обезличенный файл</button>
            <button type="button" className="min-h-11 rounded-xl border border-ink/20 px-3" onClick={() => diag(false)}>Скачать полный файл для диагностики</button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

export type { Person };
