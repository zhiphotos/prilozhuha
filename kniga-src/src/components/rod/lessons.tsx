import { useState } from "react";
import { Check, Lock, Play } from "lucide-react";
import { LESSONS, PROGRAM_PRICE, findLesson } from "@/lib/rod/content";
import { useRod } from "@/lib/rod/store";
import { cn } from "@/lib/cn";
import { Button, ScreenFrame, TopBar, linkScreen, useNav } from "@/components/rod/chrome";

export function LessonsScreen() {
  const nav = useNav();
  const programOpen = useRod((state) => state.programOpen);
  const done = useRod((state) => state.doneLessons);
  const [pay, setPay] = useState(false);

  return (
    <ScreenFrame>
      <TopBar kicker="Программа" title="Книга рода" />
      <p className="max-w-xl text-muted">
        Сначала бесплатный урок и живой сбор. Платная часть — когда захочется превратить материалы в настоящую историю, а не в папку.
      </p>
      <ul className="mt-5 grid gap-3">
        {LESSONS.map((lesson, index) => {
          const locked = !lesson.free && !programOpen;
          const passed = done.includes(lesson.id);
          return (
            <li key={lesson.id}>
              <button
                type="button"
                onClick={() => (locked ? setPay(true) : nav.go({ id: "lesson", lessonId: lesson.id }))}
                className={cn("flex w-full items-start gap-4 rounded-4xl p-5 text-left", lesson.free ? "glass-dark" : "glass")}
              >
                <span
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-full",
                    lesson.free ? "bg-paper text-ink" : "bg-blush text-rose-deep",
                  )}
                >
                  {locked ? <Lock className="size-4" /> : passed ? <Check className="size-4" /> : <Play className="size-4" />}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-sm", lesson.free ? "text-blush" : "text-muted")}>
                    {lesson.free ? "Бесплатно" : `Урок ${index}`} · {lesson.minutes} мин
                    {passed ? " · пройден" : ""}
                  </span>
                  <span className={cn("mt-1 block font-display text-2xl", lesson.free ? "text-paper" : "text-ink")}>{lesson.title}</span>
                  <span className={cn("mt-1 block text-sm", lesson.free ? "text-paper/80" : "text-muted")}>{lesson.lead}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!programOpen ? (
        <div className="wash-blush mt-3 rounded-4xl p-5">
          <p className="text-sm text-rose-deep">Шесть уроков программы</p>
          <p className="mt-1 font-display text-4xl text-ink">{PROGRAM_PRICE}</p>
          <p className="mt-2 text-sm text-muted">Интервью, девичьи фамилии, фотографии, места, главы и сборка книги.</p>
          <Button className="mt-4" onClick={() => setPay(true)}>
            Открыть программу
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-sage">Программа открыта на этом устройстве.</p>
      )}
      {pay ? <PaySheet onClose={() => setPay(false)} /> : null}
    </ScreenFrame>
  );
}

export function LessonScreen({ lessonId }: { lessonId: string }) {
  const nav = useNav();
  const lesson = findLesson(lessonId);
  const programOpen = useRod((state) => state.programOpen);
  const done = useRod((state) => state.doneLessons);
  const complete = useRod((state) => state.completeLesson);
  const [step, setStep] = useState(0);
  const [pay, setPay] = useState(false);

  if (!lesson) {
    return (
      <ScreenFrame>
        <TopBar title="Урок не найден" onBack={nav.back} />
      </ScreenFrame>
    );
  }

  const locked = !lesson.free && !programOpen;
  if (locked) {
    return (
      <ScreenFrame>
        <TopBar title={lesson.title} kicker="Закрытый урок" onBack={nav.back} />
        <div className="glass rounded-4xl p-5">
          <Lock className="size-5 text-rose-deep" />
          <p className="mt-3 text-muted">{lesson.lead}</p>
          <Button className="mt-4" onClick={() => setPay(true)}>
            Открыть программу · {PROGRAM_PRICE}
          </Button>
        </div>
        {pay ? <PaySheet onClose={() => setPay(false)} /> : null}
      </ScreenFrame>
    );
  }

  const section = lesson.sections[step];
  const last = step === lesson.sections.length - 1;
  const passed = done.includes(lesson.id);
  if (!section) return null;

  return (
    <ScreenFrame>
      <TopBar title={lesson.title} kicker={`${lesson.free ? "Бесплатный урок" : "Программа"} · ${lesson.minutes} мин`} onBack={nav.back} />
      <div className="mb-4 flex gap-1.5" aria-hidden>
        {lesson.sections.map((item, index) => (
          <span key={item.heading} className={cn("h-1 flex-1 rounded-full", index <= step ? "bg-rose" : "bg-line")} />
        ))}
      </div>
      <article className="glass rounded-4xl p-5 sm:p-7">
        <p className="text-sm text-muted">
          {step + 1} / {lesson.sections.length}
        </p>
        <h2 className="mt-2 font-display text-3xl text-ink">{section.heading}</h2>
        <div className="mt-4 grid gap-3 text-base leading-relaxed text-ink">
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </article>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>
          Назад
        </Button>
        {last ? (
          <Button
            onClick={() => {
              complete(lesson.id);
            }}
            variant={passed ? "soft" : "primary"}
          >
            {passed ? "Урок пройден" : "Отметить пройденным"}
          </Button>
        ) : (
          <Button onClick={() => setStep((value) => value + 1)}>Дальше</Button>
        )}
        {last && lesson.related ? (
          <Button variant="soft" onClick={() => nav.go(linkScreen(lesson.related?.to ?? "people"))}>
            {lesson.related.label}
          </Button>
        ) : null}
      </div>
    </ScreenFrame>
  );
}

function PaySheet({ onClose }: { onClose: () => void }) {
  const openProgram = useRod((state) => state.openProgram);
  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-ink/40 p-3 sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="pay-title">
      <div className="glass w-full max-w-md rounded-4xl p-6">
        <p className="text-sm text-rose-deep">Программа</p>
        <h2 id="pay-title" className="mt-1 font-display text-3xl text-ink">
          Книга рода
        </h2>
        <p className="mt-2 font-display text-4xl text-ink">{PROGRAM_PRICE}</p>
        <p className="mt-3 text-sm text-muted">
          Шесть уроков откроются здесь же: интервью, девичья фамилия, фотография, места, глава и сборка книги. Доступ сохранится на этом устройстве.
        </p>
        <p className="mt-3 text-sm text-ink">
          Это учебная версия: карта не спрашивается и деньги не списываются. Кнопка просто открывает уроки, чтобы их можно было смотреть.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              openProgram();
              onClose();
            }}
          >
            Открыть доступ
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Не сейчас
          </Button>
        </div>
      </div>
    </div>
  );
}
