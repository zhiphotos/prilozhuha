import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { toast } from "sonner";
import { startDictation, type Dictation } from "@/lib/rod/dictate";
import { cn } from "@/lib/cn";

/** Кнопка «Сказать голосом»: речь превращается в текст и дописывается к ответу. Работает и в приложении на экране «Домой» на iPhone. */
export function DictateButton({ value, onChange, className }: { value: string; onChange: (text: string) => void; className?: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const live = useRef<Dictation | null>(null);
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => () => live.current?.stop(), []);

  const press = () => {
    if (live.current) {
      live.current.stop();
      return;
    }
    live.current = startDictation({
      onStatus: setStatus,
      onText: (said) => {
        const base = latest.current.trimEnd();
        const text = said.trim().replace(/^./, (c) => (base && !/[.!?]$/.test(base) ? c : c.toUpperCase()));
        onChange(`${base}${base ? " " : ""}${text}`);
      },
      onError: (message) => toast(message, { duration: 9000 }),
      onEnd: () => {
        live.current = null;
        setStatus(null);
      },
    });
    if (!live.current) setStatus(null);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <button type="button" onClick={press} className={cn("inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold", status ? "bg-rose-deep text-paper" : "glass text-ink")}>
        <Mic className="size-4" /> {status ? "Закончить" : "Сказать голосом"}
      </button>
      {status ? <span className="text-xs text-rose-deep">{status}</span> : <span className="text-xs text-muted">Расскажите, речь станет текстом. Потом можно поправить.</span>}
    </div>
  );
}
