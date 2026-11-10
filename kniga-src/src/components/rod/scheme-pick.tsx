import { useMemo, useState } from "react";
import { toast } from "sonner";
import { mediaDataUrl, saveMedia } from "@/lib/rod/media";
import { PAGE_H } from "@/lib/rod/ink";
import { useRod } from "@/lib/rod/store";
import { renderPosterCanvas } from "@/lib/tree/exportPoster";
import { displayName, yearsOf } from "@/lib/tree/kinship";
import { addRelatives, groups, pickSubset, type Reach } from "@/lib/tree/subset";
import type { Person, Union } from "@/lib/tree/types";
import type { TreeStyle } from "@/lib/tree/ui-store";

const REACH: { id: Reach; label: string }[] = [
  { id: "ancestors", label: "+ предки" },
  { id: "descendants", label: "+ потомки" },
  { id: "spouses", label: "+ супруги" },
  { id: "siblings", label: "+ братья и сёстры" },
];

const STYLE_NAME: Record<string, string> = { work: "рабочий", carved: "живое древо", taiga: "«Тайга»", boheme: "«Богема»", gzhel: "«Гжель»", cameo: "«Камея»" };

const canvasBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png"));

/**
 * Схема из выбранных людей: отметить нужных, остальных на схеме не будет.
 * Рисуется в том стиле, что выбран на древе, и ставится отдельной страницей в конец книги; там её можно двигать и менять размер, как любое фото.
 */
export function SchemePick({ people, unions, focusId, style, banner, flow, onClose }: { people: Person[]; unions: Union[]; focusId: string; style: TreeStyle; banner: string; flow: "down" | "up"; onClose: () => void }) {
  const insertPage = useRod((s) => s.insertPage);
  const pages = useRod((s) => s.pages);
  const real = useMemo(() => people.filter((p) => !p.id.startsWith("__")), [people]);
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState(banner);
  const [busy, setBusy] = useState(false);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? real.filter((p) => displayName(p, "full").toLowerCase().includes(q)) : real;
    return [...list].sort((a, b) => (a.birthYear || "9999").localeCompare(b.birthYear || "9999") || displayName(a).localeCompare(displayName(b), "ru"));
  }, [real, query]);
  const parts = useMemo(() => groups(real, unions, ids), [real, unions, ids]);
  const toggle = (id: string) =>
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const build = async () => {
    const sub = pickSubset(real, unions, ids);
    // Центр схемы: выбранный центр древа, если он среди отмеченных, иначе самый старший из группы.
    const center = ids.has(focusId) ? focusId : [...sub.people].sort((a, b) => (a.birthYear || "9999").localeCompare(b.birthYear || "9999"))[0]!.id;
    return renderPosterCanvas({ people: sub.people, unions: sub.unions, focusId: center }, style, title, "white", flow);
  };

  const toPage = async () => {
    if (ids.size < 1) return;
    setBusy(true);
    try {
      const blob = await canvasBlob(await build());
      const src = await saveMedia(blob);
      const probe = new Image();
      probe.src = await mediaDataUrl(src);
      await probe.decode();
      const ratio = probe.naturalHeight / probe.naturalWidth;
      const maxW = 90;
      const maxH = 88;
      let w = maxW;
      let h = ((w * ratio) / PAGE_H) * 100;
      if (h > maxH) {
        h = maxH;
        w = (h * PAGE_H) / 100 / ratio;
      }
      insertPage(
        { title: title.trim() || "Схема семьи", kind: "page", paper: "cream", strokes: [], blocks: [{ id: crypto.randomUUID().slice(0, 8), type: "photo", x: (100 - w) / 2, y: (100 - h) / 2, w, h, src, caption: "", frame: "none", shadow: false }] },
        pages.length,
      );
      toast("Схема стоит отдельной страницей в конце книги");
      onClose();
    } catch (error) {
      console.error("scheme-to-page", error);
      toast("Не получилось поставить схему на страницу");
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (ids.size < 1) return;
    setBusy(true);
    try {
      const blob = await canvasBlob(await build());
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "kniga-roda-skhema.png";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast("Не получилось собрать картинку");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-canvas/80 p-0 md:items-center md:p-6">
      <section className="sheet flex h-[92dvh] w-full max-w-xl flex-col rounded-t-3xl md:h-auto md:max-h-[92dvh] md:rounded-3xl" role="dialog" aria-label="Схема из выбранных людей">
        <header className="relative px-5 pt-4">
          <button type="button" aria-label="Закрыть" className="absolute right-3 top-3 grid size-10 place-items-center rounded-full text-xl text-muted" onClick={onClose}>
            ×
          </button>
          <p className="text-xs tracking-widest text-muted uppercase">Схема для страницы</p>
          <h2 className="font-serif text-3xl leading-none">Кого поставить на схему</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Отметьте людей, на схеме будут только они. Стиль: {STYLE_NAME[style] ?? style} (меняется на самом древе).
          </p>
        </header>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-5 pb-2">
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {REACH.map((r) => (
              <button key={r.id} type="button" disabled={ids.size === 0} className="min-h-10 shrink-0 rounded-full border border-line bg-white px-3 text-sm font-semibold whitespace-nowrap disabled:opacity-40" onClick={() => setIds((prev) => addRelatives(unions, prev, r.id))}>
                {r.label}
              </button>
            ))}
            <button type="button" disabled={ids.size === 0} className="min-h-10 shrink-0 rounded-full px-3 text-sm whitespace-nowrap text-muted underline disabled:opacity-40" onClick={() => setIds(new Set())}>
              Снять все
            </button>
          </div>
          <input className="mt-3 min-h-11 w-full rounded-2xl border border-line bg-white px-3" placeholder="Найти по имени" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Найти человека" />
          <ul className="mt-2">
            {shown.map((p) => (
              <li key={p.id}>
                <button type="button" aria-pressed={ids.has(p.id)} className={`my-1 flex min-h-12 w-full items-center gap-3 rounded-2xl border px-3 text-left ${ids.has(p.id) ? "border-ink bg-ink text-sheet" : "border-line bg-white"}`} onClick={() => toggle(p.id)}>
                  <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-md border text-sm ${ids.has(p.id) ? "border-sheet" : "border-line"}`}>{ids.has(p.id) ? "✓" : ""}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{displayName(p, "full") || "Без имени"}</span>
                    <span className={`block text-xs ${ids.has(p.id) ? "opacity-80" : "text-muted"}`}>{yearsOf(p)}</span>
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="py-4 text-sm text-muted">Никого не нашлось.</li>}
          </ul>
        </div>
        <footer className="grid gap-2 border-t border-line px-5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {ids.size > 0 && parts.length > 1 && <p className="text-sm text-muted">Выбранные люди не связаны друг с другом: схема будет из {parts.length} отдельных частей. Добавьте их общих родственников, и части соединятся.</p>}
          <input aria-label="Подпись на схеме" className="min-h-11 rounded-2xl border border-line bg-white px-3 text-base" value={title} placeholder="Подпись на схеме, например: Род по маме" onChange={(e) => setTitle(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" disabled={busy || ids.size === 0} className="min-h-12 flex-1 rounded-2xl bg-ink px-3 font-semibold whitespace-nowrap text-sheet disabled:opacity-40" onClick={() => void toPage()}>
              {busy ? "Рисуем…" : `На страницу (${ids.size})`}
            </button>
            <button type="button" disabled={busy || ids.size === 0} className="min-h-12 rounded-2xl border border-line bg-white px-3 font-semibold disabled:opacity-40" onClick={() => void download()}>
              Картинкой
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
