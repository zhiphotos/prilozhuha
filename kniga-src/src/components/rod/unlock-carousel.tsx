import { useEffect, useRef, useState } from "react";
import { ChevronDown, Play, ShoppingBag, Sparkles } from "lucide-react";
import { PROGRAM_PERKS } from "@/lib/rod/lesson-pitch";
import { Button, useNav } from "@/components/rod/chrome";
import { PaySheet } from "@/components/rod/lessons";

const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
const perk = (title: string) => PROGRAM_PERKS.find((item) => item.title === title)?.text ?? "";

type Slide = { kicker: string; title: string; text: string; image?: string; grid?: string[]; video?: { src: string; poster: string } };

const SLIDES: Slide[] = [
  {
    kicker: "Видео-уроки",
    title: "Вы не остаётесь с книгой один на один",
    text: "Все уроки записаны атмосферно, как тихий разговор за чаем. Проходить их удобно прямо в приложении: смотрите с телефона, ставьте на паузу и делайте вместе с Дариной шаг за шагом.",
    video: { src: "course/site/lesson-preview.mp4", poster: "course/site/lesson-preview.jpg" },
  },
  {
    kicker: "Шесть уроков",
    title: "Путь от первого вопроса до готовой книги",
    text: "Достаём то, что семья уже помнит, собираем первые страницы, оживляем старые фото, идём в архивы и верстаем книгу, которую можно держать в руках.",
    grid: [1, 2, 3, 4, 5, 6].map((n) => `course/site/lesson${n}.jpg`),
  },
  {
    kicker: "ИИ-помощник",
    title: "Помощник, который задаёт вопросы за вас",
    text: perk("Личный семейный исследователь"),
    image: "course/site/extra2.jpg",
  },
  {
    kicker: "Материалы",
    title: "Готовые промпты, вопросы и шаблоны",
    text: "150 готовых промптов: копируете, вставляете и получаете результат. Тетрадь на 300 вопросов для родственников, архивные базы и шаблоны для оформления и печати.",
    image: "course/site/materials.jpg",
  },
  {
    kicker: "Приложение",
    title: "Вся работа над книгой в одном месте",
    text: "Семейное древо, колоды вопросов с записью голоса, архив фото и историй, редактор страниц, листалка и печать. Всё хранится у вас в телефоне.",
    image: "course/site/extra4.jpg",
  },
  {
    kicker: "Шаблон книги",
    title: "Не придётся начинать с белого листа",
    text: "Готовая книга на 100 страниц: одна ветка рода по главам, и на каждой странице подсказка, что туда внести.",
    image: "course/site/extra1.jpg",
  },
  {
    kicker: "Сообщество",
    title: "Рядом те, кто делает то же самое",
    text: "Живой чат с Дариной и участницами: идеи, находки, поддержка. Доступ к чату навсегда.",
    image: "course/site/review1.jpg",
  },
  {
    kicker: "Что получится",
    title: "Настоящая книга, которую приятно держать в руках",
    text: "Первая свёрстанная страница, подготовка к печати и глава ваших мемуаров. Книгу можно подарить детям, внукам, всему роду.",
    image: "course/site/extra3.jpg",
  },
];

/** Что планируется: функции, которые позже могут стать платными. */
const COMING = [
  "Шаблоны для разных книг, в том числе свадебная книга для печати",
  "ИИ-генеалог прямо в приложении",
  "Расчёт по дате рождения и мандале, как в уроках",
  "Поиск по архивам: где искать и пошаговый план",
  "Расшифровка фамилии с сохранением в книгу",
  "ИИ знает историю вашей семьи и подсказывает, что искать дальше",
  "ИИ оформляет тексты глав и заполняет страницы",
  "Текст обтекает фото, стикеры и вставки по контуру",
  "Сканер детских рисунков и арт-бук по годам с забавными фразами ребёнка",
  "Новые стили оформления семейного древа",
  "Личная мандала прогресса: один лепесток это одна готовая страница, ею можно поделиться в сторис",
  "Совместный доступ для родственников",
  "Синхронизация книги между вашими устройствами",
];

/** Превью урока: нажали и играет сразу, без звука; повторное нажатие ставит на паузу, листание в сторону тоже. */
function PreviewVideo({ src, poster }: { src: string; poster: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = video.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry && entry.intersectionRatio < 0.5) el.pause();
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toggle = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setPlaying(false));
    else el.pause();
  };

  return (
    <button type="button" onClick={toggle} aria-label={playing ? "Поставить на паузу" : "Смотреть превью урока"} className="relative block size-full">
      <video
        ref={video}
        src={asset(src)}
        poster={asset(poster)}
        muted
        loop
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="size-full object-cover"
      />
      {!playing ? (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-14 place-items-center rounded-full bg-black/55 text-[#e6cf9c] ring-1 ring-[#c9ae74]/60 backdrop-blur-sm">
            <Play className="ml-0.5 size-6 fill-current" />
          </span>
        </span>
      ) : null}
    </button>
  );
}

/** Что откроется после покупки: листается пальцем внутри блока, страницы приложения не переключает. */
export function UnlockCarousel() {
  const nav = useNav();
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [pay, setPay] = useState(false);
  const [soon, setSoon] = useState(false);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => {
      const card = el.firstElementChild as HTMLElement | null;
      if (!card) return;
      setIndex(Math.round(el.scrollLeft / (card.offsetWidth + 12)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const go = (to: number) => {
    const el = track.current;
    const card = el?.children[to] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: "smooth" });
  };

  return (
    <section className="mb-6" aria-label="Что откроется после покупки">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/75">Программа «Книга рода»</p>
      <h2 className="mt-1 text-[1.3rem] font-semibold leading-tight text-ink">Мини-уроки и полный доступ к приложению</h2>
      <p className="mt-1 text-sm text-ink/70">Единоразовая плата, и открывается всё. Листайте, чтобы увидеть, что вы получите.</p>
      <div
        ref={track}
        className="-mx-5 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ overscrollBehaviorX: "contain", touchAction: "pan-x pan-y", WebkitOverflowScrolling: "touch" }}
      >
        {SLIDES.map((slide, i) => (
          <article
            key={slide.kicker}
            aria-roledescription="слайд"
            aria-label={`${i + 1} из ${SLIDES.length}`}
            className="flex w-[84%] max-w-sm shrink-0 snap-center flex-col overflow-hidden rounded-3xl text-paper shadow-sm ring-1 ring-[#c9ae74]/25"
            style={{ background: "#0d0c0a" }}
          >
            <div className="relative aspect-[4/3] w-full bg-black">
              {slide.video ? (
                <PreviewVideo src={slide.video.src} poster={slide.video.poster} />
              ) : slide.grid ? (
                <div className="grid size-full grid-cols-3 grid-rows-2 gap-1 p-1">
                  {slide.grid.map((src, n) => (
                    <img key={src} src={asset(src)} alt={`Урок ${n + 1}`} loading="lazy" draggable={false} className="size-full rounded-lg object-cover" />
                  ))}
                </div>
              ) : (
                <img src={asset(slide.image ?? "")} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
              )}
            </div>
            <div className="flex flex-1 flex-col p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c9ae74]">{slide.kicker}</p>
              <h3 className="mt-1 text-[1.2rem] font-semibold leading-tight">{slide.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-paper/80">{slide.text}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-1 flex justify-center gap-1.5" role="tablist" aria-label="Слайды">
        {SLIDES.map((slide, i) => (
          <button key={slide.kicker} type="button" role="tab" aria-selected={i === index} aria-label={`Слайд ${i + 1}`} onClick={() => go(i)} className="grid size-6 place-items-center">
            <span className={i === index ? "h-2 w-5 rounded-full bg-moss" : "size-2 rounded-full bg-ink/25"} />
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-ink/65">Единоразовая плата. Уроки открываются сразу после оплаты, смотреть можно с телефона. Доступ к урокам на год, к чату навсегда.</p>
      <Button className="mt-3 w-full" onClick={() => setPay(true)}>
        <ShoppingBag className="size-4" /> Купить мини-уроки и полный доступ
      </Button>
      <Button variant="white" className="mt-2 w-full" onClick={() => nav.tab({ id: "lessons" })}>
        Посмотреть уроки
      </Button>

      <div className="glass mt-5 rounded-2xl p-4">
        <button type="button" aria-expanded={soon} onClick={() => setSoon((value) => !value)} className="flex w-full items-center gap-2 text-left text-ink">
          <Sparkles className="size-4 shrink-0 text-rose-deep" />
          <span className="flex-1 font-semibold">Скоро в приложении: {COMING.length} новых функций</span>
          <span className="flex items-center gap-1 text-xs font-medium text-muted">
            {soon ? "Свернуть" : "Развернуть"}
            <ChevronDown className={soon ? "size-4 rotate-180 transition-transform" : "size-4 transition-transform"} />
          </span>
        </button>
        {soon ? (
          <>
            <ul className="mt-3 grid gap-2 text-sm text-ink/85">
              {COMING.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#c9ae74]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 rounded-xl bg-white/60 p-3 text-xs text-ink/75">Это то, что мы планируем. Позже за такие функции может появиться отдельная оплата раз в месяц, до 300 ₽.</p>
          </>
        ) : null}
      </div>
      {pay ? <PaySheet onClose={() => setPay(false)} /> : null}
    </section>
  );
}
