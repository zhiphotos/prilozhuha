import { useRef, useState, type ReactNode } from "react";
import { Button, Sheet } from "@/components/rod/chrome";
import { PaySheet } from "@/components/rod/lessons";
import { HINTS } from "@/lib/rod/hints";
import { useRod } from "@/lib/rod/store";

const LONG_PRESS_MS = 450;
const HOVER_MS = 500;

/**
 * Оборачивает кнопку: долгое нажатие (телефон) или наведение (компьютер) показывает окно «как это работает».
 * Обычное короткое нажатие работает как раньше.
 */
export function Hint({ id, children }: { id: string; children: ReactNode }) {
  const hint = HINTS[id];
  const programOpen = useRod((s) => s.programOpen);
  const [open, setOpen] = useState(false);
  const [pay, setPay] = useState(false);
  const timer = useRef<number | null>(null);
  const cancel = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const start = (ms: number) => {
    cancel();
    timer.current = window.setTimeout(() => setOpen(true), ms);
  };
  if (!hint) return <>{children}</>;
  return (
    <>
      <span
        className="contents"
        onPointerDown={(e) => start(e.pointerType === "mouse" ? HOVER_MS : LONG_PRESS_MS)}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </span>
      {open ? (
        <Sheet title={hint.title} onClose={() => setOpen(false)}>
          <div className="grid gap-4">
            <HintDemo />
            <p className="text-base leading-relaxed text-ink">{hint.text}</p>
            {hint.paid && !programOpen ? (
              <Button onClick={() => setPay(true)}>Открыть доступ</Button>
            ) : (
              <Button variant="soft" onClick={() => setOpen(false)}>Понятно</Button>
            )}
          </div>
        </Sheet>
      ) : null}
      {pay ? <PaySheet onClose={() => setPay(false)} /> : null}
    </>
  );
}

/** Короткая анимация: палец касается кнопки, кнопка подсвечивается. Без видео, чтобы не тяжелить. */
function HintDemo() {
  return (
    <div className="relative mx-auto h-24 w-56 overflow-hidden rounded-2xl bg-white/70">
      <style>{`
        @keyframes hint-tap { 0%,100% { transform: scale(1); opacity: .9 } 50% { transform: scale(.75); opacity: 1 } }
        @keyframes hint-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(63,74,34,.0) } 50% { box-shadow: 0 0 0 6px rgba(63,74,34,.35) } }
        @media (prefers-reduced-motion: reduce) { .hint-tap, .hint-glow { animation: none !important } }
      `}</style>
      <div className="hint-glow absolute left-1/2 top-1/2 flex h-10 w-40 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-moss text-sm font-semibold text-paper" style={{ animation: "hint-glow 1.6s ease-in-out infinite" }}>
        Кнопка
      </div>
      <div className="hint-tap absolute left-[62%] top-[62%] size-8 rounded-full bg-gold/80" style={{ animation: "hint-tap 1.6s ease-in-out infinite" }} />
    </div>
  );
}
