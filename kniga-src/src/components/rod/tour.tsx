import { useEffect, useLayoutEffect, useState } from "react";
import { toast } from "sonner";
import { useNav } from "@/components/rod/chrome";
import { handOverGedFile } from "@/components/rod/ged-import";

const SEEN_KEY = "kniga-tour-seen";

type Step = {
  screen: "home" | "cards" | "stories" | "book";
  /** значение data-tour у подсвечиваемого элемента; без него карточка по центру */
  target?: string;
  title: string;
  text: string;
  /** "ged": в карточке кнопка выбора файла древа, файл сразу уходит на загрузку. */
  action?: "ged";
};

const STEPS: Step[] = [
  {
    screen: "home",
    title: "Добро пожаловать в Книгу рода",
    text: "Здесь из рассказов близких, фотографий и документов складывается семейная книга. За минуту покажу, где что лежит.",
  },
  {
    screen: "home",
    target: "hero",
    title: "С чего начать",
    text: "На этой плашке всегда следующий шаг: с чего начать или на чём вы остановились.",
  },
  {
    screen: "cards",
    target: "cards-intro",
    title: "Вопросы",
    text: "Передайте телефон бабушке или маме. Вопрос на карточке, отвечать можно голосом, ответ запишется сам. Потом из ответов собираются страницы книги.",
  },
  {
    screen: "book",
    target: "book-actions",
    title: "Книга",
    text: "Здесь книгу листают, собирают оглавление, оформляют обложку и готовят к печати. Страницы правят пальцем или Apple Pencil: двигают, увеличивают, меняют шрифты.",
  },
  {
    screen: "home",
    title: "Уже есть древо в другой программе?",
    text: "Загрузите файл прямо сейчас: GED, XML из «Древа Жизни» или таблицу CSV. Все люди добавятся за минуту, а перед загрузкой приложение само сохранит копию, и её можно будет отменить. Если файла пока нет, пропустите шаг.",
    action: "ged",
  },
  {
    screen: "home",
    title: "Готово",
    text: "Если что-то неудобно, непонятно или хочется иначе, напишите Дарине в личные сообщения. Важна любая мелочь. Экскурсию можно пройти снова: значок настроек на главной.",
  },
];

const seen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
};
const markSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* без памяти экскурсия просто покажется снова */
  }
};

/** Просит показать экскурсию ещё раз (из настроек). */
export function requestTour() {
  window.dispatchEvent(new Event("kniga-tour"));
}

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 6;
const MAX_W = 380;

const visibleTarget = (name: string): HTMLElement | null => {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`));
  return all.find((el) => el.getBoundingClientRect().width > 0) ?? null;
};

export function AppTour() {
  const nav = useNav();
  const [running, setRunning] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vp, setVp] = useState({ w: 375, h: 700 });
  const [missed, setMissed] = useState(false);
  const step = STEPS[Math.min(i, STEPS.length - 1)]!;

  // Первый вход: экскурсия сама, один раз.
  useEffect(() => {
    if (seen() || nav.screen.id === "join" || /^#\/join\//.test(window.location.hash)) return; // по ссылке-приглашению экскурсия не уводит человека на главную
    const timer = window.setTimeout(() => setRunning(true), 900);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.screen.id]);
  useEffect(() => {
    const start = () => {
      setI(0);
      setRunning(true);
    };
    window.addEventListener("kniga-tour", start);
    return () => window.removeEventListener("kniga-tour", start);
  }, []);

  const onScreen = nav.screen.id === step.screen;
  useEffect(() => {
    if (running && !onScreen) nav.tab({ id: step.screen });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, i, onScreen]);

  useLayoutEffect(() => {
    setRect(null);
    setMissed(false);
  }, [i]);

  useEffect(() => {
    if (!running || !step.target) return;
    const timer = window.setTimeout(() => setMissed(true), 2500);
    return () => window.clearTimeout(timer);
  }, [running, i, step.target]);

  useEffect(() => {
    if (!running || !step.target || !onScreen) return;
    let scrolled = false;
    const measure = () => {
      setVp({ w: window.innerWidth, h: window.innerHeight });
      const el = visibleTarget(step.target!);
      if (!el) return;
      if (!scrolled) {
        scrolled = true;
        el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
      }
      const r = el.getBoundingClientRect();
      setRect((prev) =>
        prev && Math.abs(prev.top - r.top) < 0.5 && Math.abs(prev.left - r.left) < 0.5 && Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5
          ? prev
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      );
    };
    measure();
    const timer = window.setInterval(measure, 150);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [running, i, onScreen, step.target]);

  if (!running) return null;

  const last = i === STEPS.length - 1;
  const spot = step.target && rect && onScreen ? rect : null;
  const waiting = Boolean(step.target) && !spot && !missed;

  const finish = () => {
    toast("Подсказки можно вернуть: Главная, затем настройки, «Показать экскурсию»");
    markSeen();
    setRunning(false);
    setI(0);
    if (nav.screen.id !== "home") nav.tab({ id: "home" });
  };

  const cardW = Math.min(MAX_W, vp.w - 32);
  const cardLeft = (vp.w - cardW) / 2;
  const below = spot ? spot.top + spot.height / 2 < vp.h / 2 : false;
  const cardStyle: React.CSSProperties = spot
    ? below
      ? { top: Math.min(spot.top + spot.height + PAD + 16, vp.h - 230), left: cardLeft, width: cardW }
      : { bottom: Math.max(vp.h - spot.top + PAD + 16, 16), left: cardLeft, width: cardW }
    : { top: "50%", left: cardLeft, width: cardW, transform: "translateY(-50%)" };
  const arrowX = spot ? Math.min(Math.max(spot.left + spot.width / 2 - cardLeft, 28), cardW - 28) : 0;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Знакомство с приложением">
      <div className="absolute inset-0" />
      {spot ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-2xl border-2 border-[#c9ae74]"
          style={{ top: spot.top - PAD, left: spot.left - PAD, width: spot.width + PAD * 2, height: spot.height + PAD * 2, boxShadow: "0 0 0 9999px rgba(20, 22, 15, 0.78)" }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-[rgba(20,22,15,0.78)]" />
      )}
      {waiting ? null : (
        <div className="absolute rounded-3xl bg-paper p-5 text-ink shadow-2xl" style={cardStyle}>
          {spot ? <span aria-hidden="true" className="absolute size-4 rotate-45 bg-paper" style={below ? { top: -8, left: arrowX - 8 } : { bottom: -8, left: arrowX - 8 }} /> : null}
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-ink">
            Шаг {i + 1} из {STEPS.length}
          </p>
          <h3 className="mt-1 text-[1.25rem] font-semibold leading-tight">{step.title}</h3>
          <p className="mt-2 text-[15px] leading-snug text-ink/85">{step.text}</p>
          {step.action === "ged" ? (
            <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-gold px-4 text-sm font-semibold text-ink">
              Выбрать файл древа
              <input
                type="file"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  // Экскурсия закрывается, файл передаётся кнопке загрузки на экране древа.
                  handOverGedFile(file);
                  markSeen();
                  setRunning(false);
                  setI(0);
                  nav.go({ id: "archive", tab: "tree" });
                }}
              />
            </label>
          ) : null}
          <div className="mt-4 flex items-center gap-2">
            {last ? null : (
              <button type="button" onClick={finish} className="min-h-11 px-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                Пропустить
              </button>
            )}
            <span className="flex-1" />
            {i > 0 && !last ? (
              <button type="button" onClick={() => setI(i - 1)} className="min-h-11 rounded-full bg-ink/5 px-4 text-sm font-semibold text-ink">
                Назад
              </button>
            ) : null}
            <button type="button" onClick={() => (last ? finish() : setI(i + 1))} className="min-h-11 rounded-full bg-moss px-5 text-sm font-semibold text-paper">
              {last ? "Начать" : "Далее"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
