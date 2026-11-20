import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Camera, Paperclip, ScanLine } from "lucide-react";
import { Scanner } from "@/components/rod/scanner";
import { importImage } from "@/lib/rod/image";
import { dropMedia, mediaBlob, saveMedia, useMedia } from "@/lib/rod/media";
import type { Attachment } from "@/lib/rod/types";

const MAX_FILE = 15 * 1024 * 1024;
const MAX_ITEMS = 30;

function Thumb({ item, images, onRemove, onCaption, onCaptionFor }: { item: Attachment; images: Attachment[]; onRemove: () => void; onCaption: (caption: string) => void; onCaptionFor?: (id: string, caption: string) => void }) {
  const src = useMedia(item.kind === "image" ? item.ref : undefined);
  const [big, setBig] = useState(false);
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
        <button type="button" onClick={() => setBig(true)} aria-label="Открыть фото крупно">
          <img src={src} alt={item.caption || item.name} className="h-20 w-20 rounded-xl object-cover" />
        </button>
      ) : (
        <button type="button" onClick={open} className="flex h-20 w-20 items-center justify-center rounded-xl bg-ink/5">
          <Paperclip className="h-7 w-7 text-muted" />
        </button>
      )}
      <span className="line-clamp-2 w-full break-words text-[11px] leading-tight text-muted">{item.caption || item.name}</span>
      <button type="button" aria-label="Убрать" onClick={onRemove} className="text-xs text-muted underline">
        Убрать
      </button>
      {big ? <PhotoViewer items={images} startId={item.id} onClose={() => setBig(false)} onCaption={onCaptionFor} /> : null}
    </li>
  );
}


/**
 * Просмотр фото на весь экран: рисуется в корне страницы (иначе карточка с размытием или сдвигом становится «рамкой» для fixed и фото центруется по всей её длине),
 * листается кнопками, стрелками клавиатуры и свайпом.
 */
export function PhotoViewer({ items, startId, onClose, onCaption }: { items: Attachment[]; startId: string; onClose: () => void; onCaption?: (id: string, caption: string) => void }) {
  const [index, setIndex] = useState(() => Math.max(0, items.findIndex((x) => x.id === startId)));
  const current = items[Math.min(index, items.length - 1)];
  const src = useMedia(current?.ref);
  const touchX = useRef<number | null>(null);
  const go = (delta: number) => setIndex((i) => Math.min(items.length - 1, Math.max(0, i + delta)));
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);
  if (!current || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3 bg-black/90 p-4"
      onClick={onClose}
      onTouchStart={(event) => { touchX.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        const start = touchX.current;
        touchX.current = null;
        const end = event.changedTouches[0]?.clientX;
        if (start == null || end == null || Math.abs(end - start) < 50) return;
        go(end < start ? 1 : -1);
      }}
    >
      <img src={src} alt={current.caption || current.name} className="max-h-[72svh] max-w-full rounded-xl object-contain" onClick={(event) => event.stopPropagation()} />
      {onCaption ? (
        <input className="field w-full max-w-md text-center" value={current.caption ?? ""} placeholder="Подпись к фото" maxLength={200} onClick={(event) => event.stopPropagation()} onChange={(event) => onCaption(current.id, event.target.value)} />
      ) : current.caption ? (
        <p className="max-w-md text-center text-sm text-white/90">{current.caption}</p>
      ) : null}
      <div className="flex items-center gap-3" onClick={(event) => event.stopPropagation()}>
        <button type="button" aria-label="Предыдущее фото" disabled={index <= 0} className="grid size-11 place-items-center rounded-full bg-white/90 text-xl text-ink disabled:opacity-30" onClick={() => go(-1)}>
          ‹
        </button>
        <span className="min-w-14 text-center text-sm text-white">{items.length > 1 ? `${index + 1} из ${items.length}` : ""}</span>
        <button type="button" aria-label="Следующее фото" disabled={index >= items.length - 1} className="grid size-11 place-items-center rounded-full bg-white/90 text-xl text-ink disabled:opacity-30" onClick={() => go(1)}>
          ›
        </button>
        <button type="button" className="rounded-full bg-white/90 px-6 py-2 text-sm text-ink" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** Только просмотр: фото и файлы человека в его карточке на древе. */
export function AttachmentGallery({ items, title = "Фото и документы" }: { items: Attachment[]; title?: string }) {
  const images = items.filter((x) => x.kind === "image");
  const [open, setOpen] = useState<string | null>(null);
  if (!items.length) return null;
  return (
    <section className="mt-4">
      <h3 className="font-sans text-base font-semibold text-ink">{title}</h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <GalleryThumb key={item.id} item={item} onOpen={() => (item.kind === "image" ? setOpen(item.id) : void openFile(item))} />
        ))}
      </ul>
      {open ? <PhotoViewer items={images} startId={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

async function openFile(item: Attachment) {
  const blob = await mediaBlob(item.ref);
  if (!blob) return toast("Файл не найден на этом устройстве");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = item.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function GalleryThumb({ item, onOpen }: { item: Attachment; onOpen: () => void }) {
  const src = useMedia(item.kind === "image" ? item.ref : undefined);
  return (
    <li className="flex w-20 flex-col items-center gap-1 text-center">
      <button type="button" onClick={onOpen} aria-label={item.kind === "image" ? "Открыть фото крупно" : `Открыть файл ${item.name}`} className="grid size-20 place-items-center overflow-hidden rounded-xl bg-ink/5">
        {item.kind === "image" ? <img src={src} alt={item.caption || item.name} className="size-20 object-cover" /> : <Paperclip className="size-7 text-muted" />}
      </button>
      <span className="line-clamp-2 w-full break-words text-[11px] leading-tight text-muted">{item.caption || item.name}</span>
    </li>
  );
}

/** Фото и файлы, прикреплённые к истории: видно, какие снимки к ней относятся. */
export function Attachments({ items, onChange, title = "Фото и файлы к истории", empty = "Пока ничего. Прикрепите снимки, документы или записи, которые относятся к этой истории.", limitText = "К одной истории", scan = false }: { scan?: boolean; items: Attachment[]; onChange: (next: Attachment[]) => void; title?: string; empty?: string; limitText?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const addScanned = (ref: string) => {
    if (items.length >= MAX_ITEMS) return toast(`${limitText} можно прикрепить до ${MAX_ITEMS} файлов`);
    onChange([...items, { id: crypto.randomUUID(), ref, name: `Скан ${items.length + 1}`, kind: "image" }]);
  };

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    let next = items;
    for (const file of Array.from(files)) {
      if (next.length >= MAX_ITEMS) {
        toast(`${limitText} можно прикрепить до ${MAX_ITEMS} файлов`);
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
      <h3 className="font-sans text-base font-semibold text-ink">{title}</h3>
      {items.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {items.map((item) => (
            <Thumb
              key={item.id}
              item={item}
              images={items.filter((x) => x.kind === "image")}
              onCaptionFor={(id, caption) => onChange(items.map((x) => (x.id === id ? { ...x, caption } : x)))}
              onCaption={(caption) => onChange(items.map((x) => (x.id === item.id ? { ...x, caption } : x)))}
              onRemove={() => {
                dropMedia(item.ref);
                onChange(items.filter((x) => x.id !== item.id));
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">{empty}</p>
      )}
      <input ref={input} type="file" multiple className="hidden" onChange={(event) => void add(event.target.files)} />
      <button type="button" className="mt-3 rounded-full border border-ink/20 px-4 py-2 text-sm text-ink" onClick={() => input.current?.click()}>
        + Прикрепить фото или файл
      </button>
      {scan ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void add(event.target.files)} />
          <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 px-4 py-2 text-sm text-ink" onClick={() => camera.current?.click()}>
            <Camera className="size-4" /> Снять камерой
          </button>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 px-4 py-2 text-sm text-ink" onClick={() => setScanning(true)}>
            <ScanLine className="size-4" /> Сканер
          </button>
        </div>
      ) : null}
      {scanning ? <Scanner onClose={() => setScanning(false)} onDone={(ref) => { addScanned(ref); setScanning(false); }} /> : null}
    </section>
  );
}
