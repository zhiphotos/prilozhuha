import { useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { importBook } from "@/lib/rod/backup";

/** Что сказать человеку, если копия не открылась. */
function reason(error: unknown): string {
  if (error instanceof SyntaxError) return "Файл повреждён или скачался не до конца. Сохраните копию ещё раз.";
  if (error instanceof DOMException && error.name === "QuotaExceededError") return "На устройстве не хватает места для этой книги.";
  if (error instanceof Error && error.message) return error.message;
  return "Копия не открылась.";
}

/** Кнопка «Открыть копию»: берёт любой файл, проверяет внутри и показывает, что происходит. */
export function OpenCopyButton({ className, onDone }: { className?: string; onDone?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    const note = toast.loading("Загружаю копию…");
    void importBook(file)
      .then(() => {
        toast.success("Книга загружена из копии", { id: note });
        onDone?.();
      })
      .catch((error: unknown) => toast.error(reason(error), { id: note, duration: 8000 }))
      .finally(() => {
        setBusy(false);
        if (input.current) input.current.value = "";
      });
  };
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className={cn("glass inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold text-ink disabled:opacity-60", className)}
      >
        {busy ? "Загружаю…" : "Открыть копию"}
      </button>
      <input ref={input} type="file" className="sr-only" tabIndex={-1} onChange={(event) => pick(event.target.files?.[0])} />
    </>
  );
}
