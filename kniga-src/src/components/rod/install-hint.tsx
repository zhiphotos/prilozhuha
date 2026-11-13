import { useState } from "react";
import { Plus, Share } from "lucide-react";
import { Button, Sheet } from "@/components/rod/chrome";
import { useRod } from "@/lib/rod/store";

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

/** Компьютер: есть мышь и это не телефон и не планшет. Для него подсказки про закладку и установку, а не про экран «Домой». */
export function isDesktop(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return false;
  return window.matchMedia("(pointer: fine)").matches;
}

const isMac = () => typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

export function isApple(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function DesktopSheet({ onClose, first }: { onClose: () => void; first: boolean }) {
  const key = isMac() ? "⌘ + D" : "Ctrl + D";
  const step = (n: number, text: React.ReactNode) => (
    <li className="flex items-start gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-moss text-sm font-semibold text-paper">{n}</span>
      <span>{text}</span>
    </li>
  );
  return (
    <Sheet title={first ? "Чтобы книга не потерялась на компьютере" : "Как сохранить книгу на компьютере"} onClose={onClose}>
      <p className="mb-4 rounded-xl bg-gold/15 p-3 text-sm text-ink">
        Книга хранится в этом браузере на этом компьютере, а не на сервере. Если открыть ссылку в другом браузере, в режиме инкогнито или на другом компьютере, книга там будет пустой: ваши записи остались в первом месте. Поэтому открывайте её всегда там, где начали.
      </p>
      <ol className="grid gap-3 text-[15px] text-ink">
        {step(1, <>Добавьте страницу в закладки: нажмите <b>{key}</b>. Так вы всегда откроете тот же адрес.</>)}
        {step(2, <>Лучше установите книгу как приложение: в Chrome и Edge справа в адресной строке есть значок установки (монитор со стрелкой) или меню ⋮ → «Установить Книгу рода». Она откроется в своём окне, как обычная программа.</>)}
        {step(3, <>В Safari на Mac: меню «Файл» → «Добавить в Dock».</>)}
        {step(4, <>Если вы уже оплатили программу, книга сохраняется в облаке: на другом компьютере нажмите «Войти по почте», и она появится сама. Без оплаты сохраняйте копию файлом: ⚙ на главной → «Копия книги».</>)}
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
          Установить как приложение
        </Button>
      ) : null}
      <Button variant={first ? "soft" : "primary"} className="mt-4 w-full" onClick={onClose}>
        {first ? "Продолжить в браузере" : "Понятно"}
      </Button>
    </Sheet>
  );
}

export function InstallSheet({ onClose, first = false }: { onClose: () => void; first?: boolean }) {
  const apple = isApple();
  if (isDesktop()) return <DesktopSheet onClose={onClose} first={first} />;
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
  if (hidden || isStandalone() || bannerVisible()) return null;
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

const SNOOZE_KEY = "kniga-install-banner-snooze";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Заметная плашка вверху главной, пока приложение открыто в браузере, а не с иконки «Домой».
 * Браузер может стереть данные сайта (на iPhone, например, после недели без захода), а книга у бесплатных пользователей хранится только на телефоне.
 * «Напомнить позже» откладывает плашку на три дня, а не навсегда.
 */
/** Отложена ли плашка. Метка из будущего (часы телефона ушли вперёд) не считается: плашка не должна пропадать на месяцы из-за неверных часов. */
function bannerSnoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    const age = Date.now() - at;
    return at > 0 && age >= 0 && age < SNOOZE_MS;
  } catch {
    return false;
  }
}

/** Плашка сейчас на экране: тогда прежняя карточка внизу главной не показывается, чтобы не дублировать подсказку. */
export function bannerVisible(): boolean {
  return !isStandalone() && !bannerSnoozed();
}

export function InstallBanner() {
  const [open, setOpen] = useState(false);
  const [snoozed, setSnoozed] = useState(bannerSnoozed);
  const paid = useRod((state) => Boolean(state.access?.token));
  const desktop = isDesktop();
  if (snoozed || isStandalone()) return null;
  const title = paid ? "Книга сохраняется в облаке" : desktop ? "Книга хранится в этом браузере" : "Книга открыта в браузере";
  const text = paid
    ? "Ваша книга копируется в облако сама. На другом телефоне или компьютере откройте сайт, нажмите «Войти по почте» и впишите почту оплаты: книга появится там."
    : desktop
      ? "Она сохранена на этом компьютере. Откройте её в другом браузере или на другом компьютере, и там будет пусто. Добавьте страницу в закладки или установите как приложение."
      : "Чтобы книга хранилась надёжно, поставьте значок на экран «Домой» и открывайте её с него.";
  return (
    <>
      <section role="note" className="mb-5 rounded-2xl border border-gold/60 bg-gold/15 p-4">
        <p className="text-[15px] font-semibold text-ink">{title}</p>
        <p className="mt-1 text-sm text-ink/80">{text}</p>
        <div className="mt-2 flex flex-wrap gap-x-4">
          <button type="button" onClick={() => setOpen(true)} className="min-h-10 text-sm font-semibold text-moss underline">
            {paid ? "Подробнее" : desktop ? "Как сохранить" : "Как это сделать"}
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem(SNOOZE_KEY, String(Date.now()));
              } catch {
                /* плашка просто покажется снова */
              }
              setSnoozed(true);
            }}
            className="min-h-10 text-sm text-muted"
          >
            Напомнить позже
          </button>
        </div>
      </section>
      {open ? <InstallSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}
