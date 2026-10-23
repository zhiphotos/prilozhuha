import { useEffect, useRef, useState } from "react";
import { Archive, Bot, GraduationCap, Layers, LibraryBig, ShoppingBag, MessageCircleQuestion, Users, Wand2, type LucideIcon } from "lucide-react";
import { PITCH, PROGRAM_PERKS } from "@/lib/rod/lesson-pitch";
import { Button, useNav } from "@/components/rod/chrome";
import { PaySheet } from "@/components/rod/lessons";

type Slide = { icon: LucideIcon; kicker: string; title: string; text: string; list?: string[] };

const perk = (title: string) => PROGRAM_PERKS.find((item) => item.title === title)?.text ?? "";

const SLIDES: Slide[] = [
  {
    icon: GraduationCap,
    kicker: "Шесть уроков",
    title: "От первых вопросов до книги в руках",
    text: "Вы идёте по порядку, и на каждом шаге есть что сделать уже сегодня:",
    list: ["l1", "l2", "l3", "l4", "l5", "l6"].map((id) => PITCH[id].hook),
  },
  {
    icon: MessageCircleQuestion,
    kicker: "300 вопросов",
    title: "Родные сами расскажут то, что вы не успели спросить",
    text: "Тетрадь на 300 вопросов можно распечатать и подарить бабушке, маме, тёте. А в приложении колоды вопросов помогают записать разговор голосом, пока человек рядом.",
  },
  {
    icon: Bot,
    kicker: "Личный исследователь",
    title: "Помощник, который задаёт вопросы за вас",
    text: perk("Личный семейный исследователь"),
  },
  {
    icon: Wand2,
    kicker: "150 готовых промптов",
    title: "Копируете, вставляете, получаете результат",
    text: "Для интервью, текстов, стилей, оживления фото и поиска предков. Ничего не нужно придумывать самой.",
  },
  {
    icon: Archive,
    kicker: "Архивы и шаблоны",
    title: "Всё, чтобы найти предков и красиво оформить книгу",
    text: perk("Архивные базы и шаблоны"),
  },
  {
    icon: Layers,
    kicker: "Шаблон книги",
    title: "Не придётся начинать с белого листа",
    text: "Готовая книга на 100 страниц: одна ветка рода по главам, и на каждой странице подсказка, что туда внести.",
  },
  {
    icon: Users,
    kicker: "Своё сообщество",
    title: "Рядом те, кто делает то же самое",
    text: perk("Чат с Дариной и участниками"),
  },
  {
    icon: LibraryBig,
    kicker: "Что получится",
    title: "Настоящая книга, которую приятно держать в руках",
    text: PITCH.l6.result + " Её можно подарить детям, внукам, всему роду.",
  },
];

/** Что откроется после покупки: листается пальцем внутри блока, страницы приложения не переключает. */
export function UnlockCarousel() {
  const nav = useNav();
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [pay, setPay] = useState(false);

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
        {SLIDES.map((slide, i) => {
          const Icon = slide.icon;
          return (
            <article
              key={slide.kicker}
              aria-roledescription="слайд"
              aria-label={`${i + 1} из ${SLIDES.length}`}
              className="relative flex min-h-[19rem] w-[82%] max-w-sm shrink-0 snap-center flex-col rounded-3xl p-5 text-paper shadow-sm"
              style={{ background: "linear-gradient(160deg,#47552a 0%,#2a3219 100%)" }}
            >
              <span className="grid size-10 place-items-center rounded-full bg-white/10 text-[#c9ae74]">
                <Icon className="size-5" />
              </span>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c9ae74]">{slide.kicker}</p>
              <h3 className="mt-1 text-[1.25rem] font-semibold leading-tight">{slide.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-paper/85">{slide.text}</p>
              {slide.list ? (
                <ol className="mt-3 grid gap-1.5 text-sm text-paper/90">
                  {slide.list.map((item, n) => (
                    <li key={item} className="flex gap-2">
                      <span className="w-4 shrink-0 tabular-nums text-[#c9ae74]">{n + 1}</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </article>
          );
        })}
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
      {pay ? <PaySheet onClose={() => setPay(false)} /> : null}
    </section>
  );
}
