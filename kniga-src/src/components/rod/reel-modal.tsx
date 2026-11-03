import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Play, X } from "lucide-react";

const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
const REEL = "course/site/memoirs-reel.mp4";
const POSTER = "course/site/memoirs-reel.jpg";

/** Ролик Дарины про шаблон «Мемуары любви»: открывается крупно, со звуком, с кнопками управления. Не скачивается, пока человек не нажал. */
export function ReelModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/95" role="dialog" aria-modal="true" aria-label="Ролик про шаблон «Мемуары любви»" onClick={onClose}>
      <div className="flex items-center justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="pl-1 text-sm font-semibold text-[#e6cf9c]">Шаблон «Мемуары любви»</p>
        <button type="button" aria-label="Закрыть" className="grid size-11 place-items-center rounded-full bg-paper/15 text-paper" onClick={onClose}>
          <X className="size-5" />
        </button>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <video src={asset(REEL)} poster={asset(POSTER)} controls autoPlay playsInline preload="auto" className="max-w-full rounded-2xl" style={{ maxHeight: "calc(100dvh - 11rem)" }} onClick={(event) => event.stopPropagation()} />
      </div>
    </div>,
    document.body,
  );
}

/** Обложка ролика с кнопкой «смотреть»: нажатие открывает ReelModal. */
export function ReelButton({ label = "Посмотреть ролик: как выглядит эта книга", className = "" }: { label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`relative block overflow-hidden rounded-2xl text-left ${className}`} aria-label={label}>
        <img src={asset(POSTER)} alt="" loading="lazy" draggable={false} className="aspect-[9/10] w-full object-cover" />
        <span className="absolute inset-0 grid place-items-center bg-black/25">
          <span className="grid size-14 place-items-center rounded-full bg-black/55 text-[#e6cf9c] ring-1 ring-[#c9ae74]/60 backdrop-blur-sm">
            <Play className="ml-0.5 size-6 fill-current" />
          </span>
        </span>
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-sm font-medium text-paper">{label}</span>
      </button>
      {open ? <ReelModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}
