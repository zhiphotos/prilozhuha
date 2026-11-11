import { useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/rod/chrome";
import { exportBook } from "@/lib/rod/backup";
import { MOVED_TO } from "@/lib/rod/config";
import { movedBase, movedHost } from "@/lib/rod/move";

const DONE_KEY = "kniga-move-done";
const doneAlready = () => {
  try {
    return window.localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
};
const markDone = () => {
  try {
    window.localStorage.setItem(DONE_KEY, "1");
  } catch {
    // без записи окно просто покажется ещё раз
  }
};

const LAST = 5;

/** Пошаговое окно переезда. Появляется при каждом открытии старого адреса, пока человек не нажмёт «Я переехала». */
function MoveTour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const base = movedBase(MOVED_TO);
  const host = movedHost(MOVED_TO);
  const save = () => {
    setBusy(true);
    void exportBook()
      .then((mode) => {
        if (mode === "cancelled") return;
        setSaved(true);
        toast(mode === "shared" ? "Файл готов: сохраните его, он понадобится на новом адресе" : "Файл сохранён в «Загрузки»: он понадобится на новом адресе");
      })
      .catch(() => toast("Не получилось собрать файл"))
      .finally(() => setBusy(false));
  };
  const finish = () => {
    markDone();
    onClose();
  };
  const canNext = step !== 1 || saved;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Переезд Книги рода" className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-paper p-5 text-ink shadow-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-ink">Переезд · шаг {step + 1} из {LAST + 1}</p>
        {step === 0 ? (
          <>
            <h2 className="mt-2 text-[1.35rem] font-semibold leading-tight">Этот адрес закроется примерно через месяц</h2>
            <p className="mt-3 text-sm text-ink/80">Книга рода переезжает на свой адрес <b>{host}</b>. Всё, что хранится на этом адресе, на новом сразу не появится: книгу нужно один раз перенести. Это займёт около пяти минут, пройдём по шагам вместе.</p>
            <p className="mt-2 text-sm text-ink/80">После закрытия старого адреса книга, которую не успели перенести, будет потеряна.</p>
          </>
        ) : null}
        {step === 1 ? (
          <>
            <h2 className="mt-2 text-[1.2rem] font-semibold leading-tight">Шаг 1. Сохраните книгу файлом</h2>
            <p className="mt-3 text-sm text-ink/80">В файл войдут все страницы, фото, люди и места. Сохраните его туда, где он не потеряется (в «Файлы» на iPhone или в «Загрузки»), и не удаляйте, пока не убедитесь, что на новом адресе всё открылось.</p>
            <Button className="mt-4 w-full" onClick={save} disabled={busy}>
              <Download className="size-4" /> {busy ? "Собираю файл…" : saved ? "Сохранить файл ещё раз" : "Сохранить книгу файлом"}
            </Button>
            {saved ? <p className="mt-2 text-sm font-semibold text-moss">Файл готов, можно идти дальше.</p> : null}
          </>
        ) : null}
        {step === 2 ? (
          <>
            <h2 className="mt-2 text-[1.2rem] font-semibold leading-tight">Шаг 2. Откройте новый адрес</h2>
            <p className="mt-3 text-sm text-ink/80">Откройте его в том же браузере и на том же телефоне, где сохранили файл. Адрес можно набрать самим: <b>{host}</b>.</p>
            <a href={base} rel="noopener" className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-moss px-4 text-sm font-semibold text-white">
              Открыть {host} <ArrowRight className="size-4" />
            </a>
          </>
        ) : null}
        {step === 3 ? (
          <>
            <h2 className="mt-2 text-[1.2rem] font-semibold leading-tight">Шаг 3. Загрузите файл в книгу</h2>
            <p className="mt-3 text-sm text-ink/80">На новом адресе на первом экране нажмите «Открыть копию» и выберите файл, который сохранили на шаге 1. Если книга уже открыта, зайдите в настройки (значок вверху главного экрана): там блок «Копия книги» и кнопка «Открыть копию». Когда страницы появятся, всё перенеслось.</p>
          </>
        ) : null}
        {step === 4 ? (
          <>
            <h2 className="mt-2 text-[1.2rem] font-semibold leading-tight">Шаг 4. Поставьте книгу на экран телефона</h2>
            <p className="mt-3 text-sm text-ink/80">iPhone: откройте новый адрес в Safari, нажмите «Поделиться» (квадрат со стрелкой), затем «На экран «Домой»».</p>
            <p className="mt-2 text-sm text-ink/80">Android: в Chrome меню (три точки), затем «Установить приложение» или «Добавить на главный экран».</p>
            <p className="mt-2 text-sm text-ink/80">Старый значок с этого адреса после переезда можно удалить.</p>
          </>
        ) : null}
        {step === 5 ? (
          <>
            <h2 className="mt-2 text-[1.2rem] font-semibold leading-tight">Шаг 5. Доступ и напоминания</h2>
            <p className="mt-3 text-sm text-ink/80"><b>Если вы покупали расширение:</b> на новом адресе откройте вкладку «Уроки», нажмите «Есть код доступа?» и введите свой код. Если кода под рукой нет, откройте бота @ded_privratnik_kniga_bot, нажмите «Старт» и назовите свою почту: так же, как после оплаты.</p>
            <p className="mt-2 text-sm text-ink/80"><b>Напоминания:</b> на новом адресе включите их заново в настройках, на старом адресе они работать перестанут.</p>
            <p className="mt-2 text-sm text-ink/80"><b>Если вы помогаете родственнику вести книгу:</b> попросите у него новую ссылку-приглашение. Старая ссылка с этого адреса тоже откроет новый адрес сама.</p>
          </>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {step > 0 ? (
            <Button variant="soft" onClick={() => setStep(step - 1)}>
              Назад
            </Button>
          ) : null}
          {step < LAST ? (
            <Button className="flex-1" onClick={() => setStep(step + 1)} disabled={!canNext}>
              {step === 0 ? "Начать переезд" : canNext ? "Дальше" : "Сначала сохраните файл"}
            </Button>
          ) : (
            <Button className="flex-1" onClick={finish}>
              Я переехала, больше не показывать
            </Button>
          )}
        </div>
        <button type="button" className="mt-3 w-full text-center text-sm text-muted underline" onClick={onClose}>
          Позже
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** Баннер «Книга рода переезжает»: на старом адресе открывает пошаговое окно переезда. На новом адресе (VITE_MOVED_TO пуст) ничего не показывает. */
export function MovedBanner() {
  const [open, setOpen] = useState(() => Boolean(MOVED_TO) && !doneAlready());
  if (!MOVED_TO) return null;
  const host = movedHost(MOVED_TO);
  return (
    <>
      <section className="aurora mb-5 rounded-2xl p-5" aria-label="Книга рода переехала на новый адрес">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-ink">Важно</p>
        <h2 className="mt-1 text-[1.25rem] font-semibold leading-tight text-ink">Этот адрес закроется примерно через месяц</h2>
        <p className="mt-2 text-sm text-ink/75">
          Книга рода переезжает на <b>{host}</b>. Данные сами не переносятся: сохраните книгу файлом и загрузите её на новом адресе. Пройдём по шагам, это пять минут.
        </p>
        <div className="mt-3">
          <Button onClick={() => setOpen(true)}>Переехать по шагам</Button>
        </div>
      </section>
      {open ? <MoveTour onClose={() => setOpen(false)} /> : null}
    </>
  );
}
