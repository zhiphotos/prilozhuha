import { useEffect, useRef, useState } from "react";
import { ChevronDown, Play, ShoppingBag, Sparkles, X } from "lucide-react";
import { Button, useNav } from "@/components/rod/chrome";
import { PaySheet } from "@/components/rod/lessons";
import { AI_NOTE } from "@/lib/rod/lesson-pitch";

const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

type Slide = { kicker: string; title: string; text: string; image?: string; grid?: string[]; video?: { src: string; poster: string }; price?: boolean; buy?: boolean; pos?: string; reviews?: boolean };

const SLIDES: Slide[] = [
  {
    kicker: "Первый урок",
    title: "Послушайте, как звучит программа",
    text: "Уроки записаны спокойно, как разговор за чаем. Нажмите на видео и посмотрите первую минуту: сразу станет понятно, ваше ли это.",
    video: { src: "course/site/lesson-preview.mp4", poster: "course/site/lesson-preview.jpg" },
  },
  {
    kicker: "Шесть уроков",
    title: "Шесть шагов от первого вопроса до книги",
    text: "Сначала достаём то, что семья уже помнит. Потом выбираем стиль, оживляем старые фото, идём в архивы и верстаем. Каждый урок можно смотреть с телефона.",
    grid: [1, 2, 3, 4, 5, 6].map((n) => `course/site/lesson${n}.jpg`),
  },
  {
    kicker: "ИИ-помощник",
    title: "О роде известно немного? Начните с вопросов",
    text: "ИИ-генеалог ведёт глубокое интервью: задаёт вопрос за вопросом и превращает ваши ответы в текст. В первом уроке из этого рождается предисловие вашей книги.",
    image: "course/site/memoirs-granny.jpg",
    pos: "50% 22%",
  },
  {
    kicker: "Материалы",
    title: "Запросы и вопросы уже готовы",
    text: "150 готовых промптов: копируете и вставляете. Тетрадь на 300 вопросов, которую можно распечатать и дать бабушке или маме. Архивные базы для поиска предков.",
    image: "course/site/materials.jpg",
  },
  {
    kicker: "Шаблон книги",
    title: "У книги уже есть каркас",
    text: "Шаблон на 100 страниц: одна ветка рода по главам, и на каждой странице подсказка, что сюда внести. Пустого листа перед вами не будет.",
    image: "course/site/extra1.jpg",
  },
  {
    kicker: "Приложение",
    title: "Страницы собираются в одном месте",
    text: "Древо, колоды вопросов с записью голоса, архив, редактор страниц, листалка и печать работают вместе. Фото, голоса и готовые страницы лежат в одном приложении. В шестом уроке есть и простая альтернатива InDesign. Все эти функции приложения открываются после оплаты и остаются с вами навсегда.",
    image: "course/site/extra4.jpg",
  },
  {
    kicker: "Свой темп",
    title: "У вас год и спокойный план",
    text: "Во втором уроке вы расписываете работу над книгой на год, а смотреть уроки можно в любой вечер. Доступ к урокам открыт на год.",
    image: "course/site/lesson2.jpg",
  },
  {
    kicker: "Сообщество",
    title: "Рядом те, кто идёт тем же путём",
    text: "Живой чат с Дариной и участницами: идеи, находки, поддержка. Доступ к чату остаётся с вами навсегда.",
    image: "course/site/review1.jpg",
    reviews: true,
  },
  {
    kicker: "Результат",
    title: "Книга, которую приятно держать в руках",
    text: "К концу программы у вас первая свёрстанная страница, подготовка к печати и первая глава ваших воспоминаний. Такую книгу можно подарить детям, внукам и всему роду.",
    image: "course/site/memoirs-book.jpg",
  },
  {
    kicker: "Цена",
    title: "Уроки и приложение за 2 026 ₽",
    text: "Единоразовая плата 2 026 ₽ вместо 4 000 ₽: платите один раз, и все функции приложения, какие есть сейчас, открываются сразу и остаются навсегда. Уроки открываются после оплаты, доступ к урокам на год. ИИ-функции, когда появятся, оплачиваются отдельно. Остальные новые функции появятся позже: часть останется с вами навсегда, часть подключается по подписке.",
    image: "course/site/memoirs-daria.jpg",
    pos: "50% 20%",
    price: true,
    buy: true,
  },
];

/** Что планируется: функции, которые позже могут стать платными. */
const COMING = [
  "Шаблоны для разных книг, в том числе свадебная книга для печати",
  "ИИ-генеалог прямо в приложении",
  "Расчёт по дате рождения и мандале, как в уроках",
  "ИИ в поиске по архивам: самые подходящие архивы под вашего предка",
  "Расшифровка фамилии с сохранением в книгу",
  "ИИ знает историю вашей семьи и подсказывает, что искать дальше",
  "ИИ оформляет тексты глав и заполняет страницы",
  "Текст обтекает фото, стикеры и вставки по контуру",
  "Сканер детских рисунков и арт-бук по годам с забавными фразами ребёнка",
  "Новые стили оформления семейного древа",
  "Личная мандала прогресса: один лепесток это одна готовая страница, ею можно поделиться в сторис",
  "Совместное оформление книги с родственниками: общая книга, куда пишут все",
  "Расшифровка рукописных страниц по фото с помощью ИИ",
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

/** Отзывы участниц крупно: листаются вниз, закрываются нажатием на фон или крестиком. */
function ReviewsPopup({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/95" role="dialog" aria-modal="true" aria-label="Отзывы участниц" onClick={onClose}>
      <div className="flex items-center justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="pl-1 text-sm font-semibold text-[#e6cf9c]">Что пишут участницы</p>
        <button type="button" aria-label="Закрыть" className="grid size-11 place-items-center rounded-full bg-paper/15 text-paper" onClick={onClose}>
          <X className="size-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto grid max-w-md gap-4" onClick={(event) => event.stopPropagation()}>
          {[1, 2, 3].map((n) => (
            <img key={n} src={asset(`course/site/review${n}.jpg`)} alt={`Отзыв участницы ${n}`} loading="lazy" draggable={false} className="w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Что откроется после покупки: листается пальцем внутри блока, страницы приложения не переключает. */
export function UnlockCarousel() {
  const nav = useNav();
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [pay, setPay] = useState(false);
  const [soon, setSoon] = useState(false);
  const [reviews, setReviews] = useState(false);

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
      <h2 className="mt-1 text-[1.3rem] font-semibold leading-tight text-ink">Мини-уроки и полный доступ в приложение</h2>
      <p className="mt-1 text-sm text-ink/70">Платите один раз: все функции приложения открываются навсегда, и вы получаете шесть видео-уроков. Листайте и смотрите, что внутри.</p>
      <div
        ref={track}
        className="-mx-5 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ overscrollBehaviorX: "contain", touchAction: "pan-x pan-y", WebkitOverflowScrolling: "touch" }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
      >
        {SLIDES.map((slide, i) => (
          <article
            key={`${slide.kicker}-${i}`}
            aria-roledescription="слайд"
            aria-label={`${i + 1} из ${SLIDES.length}`}
            className={`flex w-[84%] max-w-sm shrink-0 snap-center flex-col overflow-hidden rounded-[1.75rem] text-paper shadow-md ring-1 ring-[#c9ae74]/35 transition-opacity duration-300 motion-reduce:transition-none ${i === index ? "opacity-100" : "opacity-80"}`}
            style={{ background: "linear-gradient(180deg,#0d0c0a 0%,#1a1d0e 55%,#3f4a22 160%)" }}
          >
            <div className="relative aspect-[4/3] w-full bg-black">
              <span className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[11px] tracking-[0.14em] text-[#e6cf9c] ring-1 ring-[#c9ae74]/40">
                {String(i + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
              </span>
              {slide.video ? (
                <PreviewVideo src={slide.video.src} poster={slide.video.poster} />
              ) : slide.grid ? (
                <div className="grid size-full grid-cols-3 grid-rows-2 gap-1 p-1">
                  {slide.grid.map((src, n) => (
                    <img key={src} src={asset(src)} alt={`Урок ${n + 1}`} loading="lazy" draggable={false} className="size-full rounded-lg object-cover" />
                  ))}
                </div>
              ) : (
                <img src={asset(slide.image ?? "")} alt="" loading="lazy" draggable={false} className="size-full object-cover" style={slide.pos ? { objectPosition: slide.pos } : undefined} />
              )}
              {slide.reviews ? (
                <button type="button" onClick={() => setReviews(true)} aria-label="Читать отзывы" className="absolute inset-0 z-[5]">
                  <span className="absolute bottom-3 right-3 rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold text-[#e6cf9c] ring-1 ring-[#c9ae74]/50">Нажмите, чтобы прочитать</span>
                </button>
              ) : null}
              {slide.price ? (
                <span className="pointer-events-none absolute right-3 top-3 rounded-2xl bg-black/65 px-3 py-2 text-right ring-1 ring-[#c9ae74]/50 backdrop-blur-sm">
                  <span className="block text-2xl font-semibold leading-none text-[#e6cf9c]">2 026 ₽</span>
                  <span className="mt-1 block text-xs text-paper/60 line-through">4 000 ₽</span>
                </span>
              ) : null}
            </div>
            <div className="flex flex-1 flex-col border-t border-[#c9ae74]/40 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c9ae74]">{slide.kicker}</p>
              <h3 className="mt-1 text-[1.2rem] font-semibold leading-tight">{slide.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-paper/85">{slide.text}</p>
              {slide.buy ? (
                <Button className="mt-4 w-full" onClick={() => setPay(true)}>
                  <ShoppingBag className="size-4" /> Купить мини-уроки и полный доступ
                </Button>
              ) : null}
              <div className="mt-auto flex items-center gap-2 pt-5" aria-hidden="true">
                <span className="h-px flex-1 bg-[#c9ae74]/30" />
                <span className="size-1.5 rotate-45 bg-[#c9ae74]/70" />
                <span className="h-px w-6 bg-[#c9ae74]/30" />
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="flex justify-center" role="tablist" aria-label="Слайды">
        {SLIDES.map((slide, i) => (
          <button key={`${slide.kicker}-${i}`} type="button" role="tab" aria-selected={i === index} aria-label={`Слайд ${i + 1}`} onClick={() => go(i)} className="grid h-11 w-7 place-items-center">
            <span className={i === index ? "h-2 w-5 rounded-full bg-[#3f4a22]" : "size-2 rounded-full bg-ink/25"} />
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-ink/65">Единоразовая плата: все функции приложения открываются сразу после оплаты и остаются навсегда. Уроки можно смотреть с телефона, доступ к урокам на год.</p>
      <Button className="mt-3 w-full" onClick={() => setPay(true)}>
        <ShoppingBag className="size-4" /> Купить мини-уроки и полный доступ
      </Button>
      <Button variant="white" className="mt-2 w-full" onClick={() => nav.tab({ id: "lessons" })}>
        Посмотреть уроки
      </Button>

      <div className="glass mt-5 rounded-2xl p-4">
        <button type="button" aria-expanded={soon} onClick={() => setSoon((value) => !value)} className="flex min-h-11 w-full items-center gap-2 text-left text-ink">
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
            <p className="mt-3 rounded-xl bg-white/60 p-3 text-xs font-semibold text-ink">{AI_NOTE}</p>
            <p className="mt-2 rounded-xl bg-white/60 p-3 text-xs text-ink/75">Часть этих функций останется с вами навсегда после покупки мини-курса, а часть откроется по ежемесячной подписке на «Книгу рода», мы планируем до 300 ₽ в месяц. Какие функции подключать, вы сможете выбирать по ситуации.</p>
          </>
        ) : null}
      </div>
      {pay ? <PaySheet onClose={() => setPay(false)} /> : null}
      {reviews ? <ReviewsPopup onClose={() => setReviews(false)} /> : null}
    </section>
  );
}
