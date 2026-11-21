import { copyNote } from "@/lib/rod/copy-note";
import { cn } from "@/lib/cn";

/** Заметная пометка «Копия от помощника» рядом с названием страницы или истории; для обычных записей ничего не показывает. */
export function CopyBadge({ rec, className }: { rec: unknown; className?: string }) {
  const note = copyNote(rec);
  if (!note) return null;
  return <span className={cn("inline-block shrink-0 rounded-full bg-[#f6e7d0] px-2 py-0.5 text-[11px] font-semibold leading-tight text-ink", className)}>{note}</span>;
}
