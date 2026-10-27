import { useState } from "react";
import { BookCopy, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Sheet, useNav } from "@/components/rod/chrome";
import { switchBook } from "@/lib/rod/boot";
import { activeProjectId, addProjectMeta, listProjects, removeProjectMeta, renameProjectMeta } from "@/lib/rod/projects";
import { dropProjectData } from "@/lib/rod/store";
import { PaySheet } from "@/components/rod/lessons";
import { useRod } from "@/lib/rod/store";
import { cn } from "@/lib/cn";

/** Несколько книг в одном приложении: у каждой свои страницы, архив и обложка. */
export function ProjectsSheet({ onClose }: { onClose: () => void }) {
  const nav = useNav();
  const [list, setList] = useState(listProjects);
  const [active, setActive] = useState(activeProjectId);
  const [name, setName] = useState("");
  const [dedicatee, setDedicatee] = useState("");
  const [collector, setCollector] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const programOpen = useRod((state) => state.programOpen);
  const [pay, setPay] = useState(false);
  const refresh = () => {
    setList(listProjects());
    setActive(activeProjectId());
  };

  const open = async (id: string) => {
    if (id === active) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await switchBook(id);
      refresh();
      nav.tab({ id: "home" });
      onClose();
      toast("Книга открыта");
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    // Первая книга бесплатна, вторая и следующие (у каждой своё древо) открываются платным тарифом.
    if (!programOpen && list.length >= 1) {
      setPay(true);
      return;
    }
    const meta = addProjectMeta(name);
    setBusy(true);
    try {
      await switchBook(meta.id, { onboarded: true, audience: "family", dedicatee: dedicatee.trim(), collector: collector.trim() });
      refresh();
      nav.tab({ id: "home" });
      onClose();
      toast(`Новая книга «${meta.name}» создана`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Мои книги" onClose={onClose}>
      <p className="text-sm text-muted">У каждой книги свои страницы, семейный архив, корзина и обложка. Фотографии общие, поэтому ничего не пропадёт при переключении.</p>
      <ul className="mt-3 grid gap-2">
        {list.map((item) => (
          <li key={item.id} className={cn("flex items-center gap-2 rounded-2xl bg-white/70 p-2", item.id === active && "ring-2 ring-night")}>
            {renaming === item.id ? (
              <input
                autoFocus
                className="field !min-h-10 flex-1"
                defaultValue={item.name}
                onBlur={(event) => {
                  renameProjectMeta(item.id, event.target.value);
                  setRenaming(null);
                  refresh();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                }}
              />
            ) : (
              <button type="button" disabled={busy} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left" onClick={() => void open(item.id)}>
                <BookCopy className="size-5 shrink-0 text-rose-deep" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{item.name}</span>
                  <span className="block text-xs text-muted">{item.id === active ? "открыта сейчас" : "нажмите, чтобы открыть"}</span>
                </span>
                {item.id === active ? <Check className="ml-auto size-4 shrink-0 text-night" /> : null}
              </button>
            )}
            <button type="button" aria-label="Переименовать" className="grid size-9 place-items-center rounded-full" onClick={() => setRenaming(item.id)}>
              <Pencil className="size-4" />
            </button>
            {list.length > 1 && item.id !== active ? (
              <button
                type="button"
                aria-label="Удалить книгу"
                className="grid size-9 place-items-center rounded-full text-rose-deep"
                onClick={() => {
                  if (!window.confirm(`Удалить книгу «${item.name}» со всеми страницами? Это нельзя вернуть.`)) return;
                  removeProjectMeta(item.id);
                  void dropProjectData(item.id).finally(refresh);
                }}
              >
                <Trash2 className="size-4" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="mt-5 rounded-3xl bg-white/60 p-4">
        <p className="font-semibold text-ink">Новая книга</p>
        {!programOpen && list.length >= 1 ? (
          <p className="mt-1 text-sm text-muted">Первая книга бесплатна. Ещё одна книга со своим древом, страницами и архивом открывается платным тарифом: оплата единоразовая.</p>
        ) : null}
        <div className="mt-2 grid gap-2">
          <input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Название, например: Книга бабушки" />
          <input className="field" value={dedicatee} onChange={(event) => setDedicatee(event.target.value)} placeholder="Для кого (появится на обложке)" />
          <input className="field" value={collector} onChange={(event) => setCollector(event.target.value)} placeholder="Ваше имя на обложке" />
        </div>
        <Button className="mt-3 w-full" disabled={busy} onClick={() => void create()}>
          <Plus className="size-4" /> {!programOpen && list.length >= 1 ? "Открыть доступ" : "Создать и открыть"}
        </Button>
      </div>
      {pay ? <PaySheet onClose={() => setPay(false)} /> : null}
    </Sheet>
  );
}
