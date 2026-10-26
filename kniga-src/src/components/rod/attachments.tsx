import { useRef } from "react";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import { importImage } from "@/lib/rod/image";
import { dropMedia, mediaBlob, saveMedia, useMedia } from "@/lib/rod/media";
import type { Attachment } from "@/lib/rod/types";

const MAX_FILE = 15 * 1024 * 1024;
const MAX_ITEMS = 30;

function Thumb({ item, onRemove }: { item: Attachment; onRemove: () => void }) {
  const src = useMedia(item.kind === "image" ? item.ref : undefined);
  const open = async () => {
    const blob = await mediaBlob(item.ref);
    if (!blob) return toast("Файл не найден на этом устройстве");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  return (
    <li className="glass relative flex w-24 flex-col items-center gap-1 rounded-2xl p-2 text-center">
      {item.kind === "image" ? (
        <img src={src} alt={item.name} className="h-20 w-20 rounded-xl object-cover" />
      ) : (
        <button type="button" onClick={open} className="flex h-20 w-20 items-center justify-center rounded-xl bg-ink/5">
          <Paperclip className="h-7 w-7 text-muted" />
        </button>
      )}
      <span className="line-clamp-2 w-full break-words text-[11px] leading-tight text-muted">{item.name}</span>
      <button type="button" aria-label="Убрать" onClick={onRemove} className="text-xs text-muted underline">
        Убрать
      </button>
    </li>
  );
}

/** Фото и файлы, прикреплённые к истории: видно, какие снимки к ней относятся. */
export function Attachments({ items, onChange }: { items: Attachment[]; onChange: (next: Attachment[]) => void }) {
  const input = useRef<HTMLInputElement>(null);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    let next = items;
    for (const file of Array.from(files)) {
      if (next.length >= MAX_ITEMS) {
        toast(`К одной истории можно прикрепить до ${MAX_ITEMS} файлов`);
        break;
      }
      try {
        const image = file.type.startsWith("image/");
        if (!image && file.size > MAX_FILE) {
          toast(`«${file.name}» больше 15 МБ, не прикреплён`);
          continue;
        }
        const ref = image ? await importImage(file) : await saveMedia(file);
        next = [...next, { id: crypto.randomUUID(), ref, name: file.name, kind: image ? "image" : "file" }];
        onChange(next);
      } catch {
        toast(`Не удалось прикрепить «${file.name}»`);
      }
    }
    if (input.current) input.current.value = "";
  };

  return (
    <section className="mt-4">
      <h3 className="font-sans text-base font-semibold text-ink">Фото и файлы к истории</h3>
      {items.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {items.map((item) => (
            <Thumb
              key={item.id}
              item={item}
              onRemove={() => {
                dropMedia(item.ref);
                onChange(items.filter((x) => x.id !== item.id));
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">Пока ничего. Прикрепите снимки, документы или записи, которые относятся к этой истории.</p>
      )}
      <input ref={input} type="file" multiple className="hidden" onChange={(event) => void add(event.target.files)} />
      <button type="button" className="mt-3 rounded-full border border-ink/20 px-4 py-2 text-sm text-ink" onClick={() => input.current?.click()}>
        + Прикрепить фото или файл
      </button>
    </section>
  );
}
