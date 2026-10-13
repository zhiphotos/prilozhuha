import { useState } from "react";
import { Plus, Share } from "lucide-react";
import { Button, Sheet } from "@/components/rod/chrome";

const KEY = "kniga-install-dismissed";

/** Открыто как приложение с экрана «Домой»: подсказка не нужна. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isApple(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function InstallSheet({ onClose }: { onClose: () => void }) {
  const apple = isApple();
  return (
    <Sheet title="Значок на экране «Домой»" onClose={onClose}>
      <div className="flex items-center gap-4">
        <img src="icons/icon-180.png" alt="" className="size-20 shrink-0 rounded-[1.1rem] shadow-[var(--shadow-soft)]" />
        <p className="text-sm text-muted">Книга откроется с экрана телефона как обычное приложение, без адресной строки.</p>
      </div>
      {apple ? (
        <ol className="mt-5 grid gap-3 text-[15px] text-ink">
          <li className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-moss text-sm font-semibold text-paper">1</span>
            <span>Откройте эту страницу в Safari и нажмите <Share className="mx-0.5 inline size-4 align-text-bottom" /> «Поделиться» внизу экрана.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-moss text-sm font-semibold text-paper">2</span>
            <span>Пролистайте меню и выберите <Plus className="mx-0.5 inline size-4 align-text-bottom" /> «На экран «Домой»».</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-moss text-sm font-semibold text-paper">3</span>
            <span>Нажмите «Добавить». Значок с мох-книгой появится на рабочем столе.</span>
          </li>
        </ol>
      ) : (
        <p className="mt-5 text-[15px] text-ink">В меню браузера выберите «Установить приложение» или «Добавить на главный экран».</p>
      )}
      <Button className="mt-6 w-full" onClick={onClose}>
        Понятно
      </Button>
    </Sheet>
  );
}

/** Карточка на Главной: показывается, пока книга открыта в браузере, а не с экрана «Домой». */
export function InstallCard() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  if (hidden || isStandalone()) return null;
  return (
    <>
      <section className="glass mt-9 flex items-center gap-4 rounded-2xl p-4">
        <img src="icons/icon-180.png" alt="" className="size-14 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink">Поставьте книгу на экран телефона</p>
          <div className="mt-1 flex flex-wrap gap-x-4">
            <button type="button" onClick={() => setOpen(true)} className="min-h-9 text-sm font-semibold text-moss underline">
              Как это сделать
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.setItem(KEY, "1");
                } catch {
                  /* подсказка просто появится снова */
                }
                setHidden(true);
              }}
              className="min-h-9 text-sm text-muted"
            >
              Не сейчас
            </button>
          </div>
        </div>
      </section>
      {open ? <InstallSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}
