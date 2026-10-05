import { useRef, useState } from "react";
import { ClipboardPaste, ImagePlus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/rod/chrome";
import { imageFromTransfer, importFromLink, importImage } from "@/lib/rod/image";
import { useMedia } from "@/lib/rod/media";
import { useRod } from "@/lib/rod/store";
import { cn } from "@/lib/cn";

/** «Вайб» — выезжающая справа доска с картинками-ориентирами: цвета, настроение, вёрстка. В книгу не печатается. */
export function MoodBoard({ open, onToggle, onPlace }: { open: boolean; onToggle: () => void; onPlace: (ref: string) => void }) {
  const items = useRod((state) => state.moodboard);
  const addMood = useRod((state) => state.addMood);
  const removeMood = useRod((state) => state.removeMood);
  const fileRef = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);

  const run = (job: Promise<string | null>) => {
    const wait = toast.loading("Добавляю в вайб…");
    void job
      .then((ref) => {
        if (ref) addMood(ref);
        else toast("Тут нет картинки");
      })
      .catch((error: unknown) => toast(`Не добавилось: ${error instanceof Error ? error.message : "ошибка"}`))
      .finally(() => toast.dismiss(wait));
  };

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "toolbar-dark fixed right-0 top-1/2 z-[45] flex -translate-y-1/2 flex-col items-center gap-1 rounded-l-2xl px-2 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-paper transition",
          open && "opacity-0 pointer-events-none",
        )}
        style={{ writingMode: "vertical-rl" }}
        aria-label="Вайб — картинки-ориентиры"
      >
        ✦ Вайб
      </button>

      <aside
        className={cn(
          "glass-strong fixed bottom-24 right-2 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.4rem)] z-[46] flex w-[min(20rem,78vw)] flex-col rounded-[1.6rem] p-3 transition-transform duration-300",
          open ? "translate-x-0" : "pointer-events-none translate-x-[110%]",
          dropping && "ring-4 ring-rose/60",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDropping(false);
          run(imageFromTransfer(event.dataTransfer));
        }}
        onPaste={(event) => {
          event.preventDefault();
          event.stopPropagation();
          run(imageFromTransfer(event.clipboardData));
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="display-title text-xl text-ink">Вайб книги</p>
            <p className="text-xs text-muted">Что нравится по дизайну: цвета, шрифты, развороты. Смотрите сюда, пока оформляете. В печать не идёт.</p>
          </div>
          <button type="button" onClick={onToggle} className="grid size-8 shrink-0 place-items-center rounded-full bg-white/80" aria-label="Закрыть вайб">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <Button variant="white" className="min-h-10 px-2 text-xs" onClick={() => fileRef.current?.click()}>
            <ImagePlus className="size-4" /> Фото
          </Button>
          <Button
            variant="white"
            className="min-h-10 px-2 text-xs"
            onClick={() =>
              window.open("https://www.pinterest.com/search/pins/?q=" + encodeURIComponent("family album design"), "pinterest", "popup=yes,width=460,height=820")
            }
          >
            <Search className="size-4" /> Pinterest
          </Button>
        </div>
        <div
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Вставить в вайб"
          onInput={(event) => {
            (event.currentTarget as HTMLDivElement).textContent = "";
          }}
          className="mt-1.5 grid min-h-11 place-items-center rounded-2xl border-2 border-dashed border-rose/40 bg-white/50 px-2 text-center text-xs outline-none"
          data-placeholder="Удерживайте → «Вставить» или перетащите сюда"
        />
        <form
          className="mt-1.5 flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!link.trim()) return;
            run(importFromLink(link.trim()));
            setLink("");
          }}
        >
          <input className="field !min-h-10 !py-2 text-sm" value={link} onChange={(event) => setLink(event.target.value)} placeholder="ссылка на пин" />
          <Button type="submit" variant="white" className="min-h-10 px-3" disabled={!link.trim()} aria-label="Добавить по ссылке">
            <ClipboardPaste className="size-4" />
          </Button>
        </form>

        <div className="no-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-muted">Пока пусто. Сохраняйте сюда развороты, цвета и обложки, которые нравятся.</p>
          ) : (
            <ul className="columns-2 gap-1.5">
              {items.map((ref) => (
                <li key={ref} className="mb-1.5 break-inside-avoid">
                  <MoodItem refId={ref} onZoom={() => setZoom(ref)} onRemove={() => removeMood(ref)} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            files.slice(0, 12).forEach((file) => run(importImage(file)));
          }}
        />
      </aside>

      {zoom ? <MoodZoom refId={zoom} onClose={() => setZoom(null)} onPlace={() => { onPlace(zoom); setZoom(null); }} /> : null}
    </>
  );
}

function MoodItem({ refId, onZoom, onRemove }: { refId: string; onZoom: () => void; onRemove: () => void }) {
  const url = useMedia(refId);
  return (
    <div className="group relative overflow-hidden rounded-xl bg-white/50">
      <button type="button" onClick={onZoom} className="block w-full">
        {url ? <img src={url} alt="Ориентир" className="block w-full" /> : <div className="aspect-square animate-pulse" />}
      </button>
      <button type="button" onClick={onRemove} aria-label="Убрать из вайба" className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-night/70 text-paper">
        <X className="size-3" />
      </button>
    </div>
  );
}

function MoodZoom({ refId, onClose, onPlace }: { refId: string; onClose: () => void; onPlace: () => void }) {
  const url = useMedia(refId);
  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-3 bg-ink/70 p-4" onClick={onClose} role="dialog">
      {url ? <img src={url} alt="Ориентир" className="max-h-[78svh] max-w-full rounded-2xl shadow-2xl" /> : null}
      <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
        <Button variant="white" onClick={onPlace}>
          Положить на страницу
        </Button>
        <Button variant="soft" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </div>
  );
}
