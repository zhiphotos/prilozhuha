import { useState } from "react";
import { Plus, Share } from "lucide-react";
import { Button, Sheet } from "@/components/rod/chrome";

const KEY = "kniga-install-dismissed";

type InstallPrompt = Event & { prompt: () => Promise<void> };
let deferred: InstallPrompt | null = null;
// Chrome и Android разрешают установить приложение одной кнопкой: запоминаем момент, когда браузер это предложил.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPrompt;
  });
}

/** Открыто как приложение с экрана «Домой»: подсказка не нужна. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isApple(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function InstallSheet({ onClose, first = false }: { onClose: () => void; first?: boolean }) {
  const apple = isApple();
  return (
    <Sheet title={first ? "Сначала поставьте книгу на экран" : "Значок на экране «Домой»"} onClose={onClose}>
      {first ? (
        <p className="mb-4 rounded-xl bg-gold/15 p-3 text-sm text-ink">
          {apple
            ? "Книга хранится на вашем устройстве. Safari и значок на экране «Домой» хранят её по отдельности: то, что вы запишете в браузере, в значке не появится. Поэтому поставьте значок сейчас, до того как начнёте, и работайте уже в нём."
            : "Книга хранится на вашем устройстве, а не на сервере. Поставьте значок сейчас, до того как начнёте: так приложение открывается как обычное, быстрее запускается, и браузер реже чистит его данные."}
        </p>
      ) : null}
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
        <>
          <ol className="mt-5 grid gap-3 text-[15px] text-ink">
            <li className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-moss text-sm font-semibold text-paper">1</span>
              <span>Откройте эту страницу в Chrome и нажмите три точки <span aria-hidden>⋮</span> справа вверху.</span>
            </li>
            <li className="flex items-start gap-3 text-sm text-muted">
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-ink/20 text-sm">!</span>
              <span>Если кнопка установки ничего не делает, выключите VPN и попробуйте снова.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-moss text-sm font-semibold text-paper">2</span>
              <span>Выберите «Установить приложение» или «Добавить на главный экран».</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-moss text-sm font-semibold text-paper">3</span>
              <span>Подтвердите. Значок с мох-книгой появится среди приложений и на экране.</span>
            </li>
          </ol>
          {deferred ? (
            <Button
              className="mt-4 w-full"
              onClick={() => {
                void deferred?.prompt();
                deferred = null;
                onClose();
              }}
            >
              Установить сейчас
            </Button>
          ) : null}
        </>
      )}
      <Button variant={first ? "soft" : "primary"} className="mt-6 w-full" onClick={onClose}>
        {first ? "Продолжить в браузере" : "Понятно"}
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
