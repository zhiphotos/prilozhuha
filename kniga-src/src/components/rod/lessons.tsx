import { useState } from "react";
import { Check, Lock, Play } from "lucide-react";
import { toast } from "sonner";
import { LESSONS, PROGRAM_PRICE, findLesson } from "@/lib/rod/content";
import { LESSON_VIDEO, PAY_URL, checkCode, embedUrl } from "@/lib/rod/config";
import { useRod } from "@/lib/rod/store";
import { cn } from "@/lib/cn";
import { Button, ScreenFrame, Sheet, TopBar, linkScreen, useNav } from "@/components/rod/chrome";

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
                className={cn("flex w-full items-start gap-4 rounded-[2rem] p-5 text-left", lesson.free ? "aurora" : "glass")}
              >
                <span
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-full",
                    lesson.free ? "bg-white text-ink" : "bg-blush text-rose-deep",
                  )}
                >
                  {locked ? <Lock className="size-4" /> : passed ? <Check className="size-4" /> : <Play className="size-4" />}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-sm", lesson.free ? "font-semibold text-ink/70" : "text-muted")}>
                    {lesson.free ? "Бесплатно" : `Урок ${index}`} · {lesson.minutes} мин
                    {passed ? " · пройден" : ""}
                  </span>
                  <span className={cn("mt-1 block display-title text-2xl", "text-ink")}>{lesson.title}</span>
                  <span className={cn("mt-1 block text-sm", lesson.free ? "text-ink/70" : "text-muted")}>{lesson.lead}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!programOpen ? (
        <div className="wash-blush mt-3 rounded-[2rem] p-5">
          <p className="text-sm text-rose-deep">Шесть уроков программы</p>
          <p className="mt-1 display-title text-4xl text-ink">{PROGRAM_PRICE}</p>
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
        <div className="glass rounded-[2rem] p-5">
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
      {step === 0 ? <LessonVideo lessonId={lesson.id} /> : null}
      <div className="mb-4 flex gap-1.5" aria-hidden>
        {lesson.sections.map((item, index) => (
          <span key={item.heading} className={cn("h-1 flex-1 rounded-full", index <= step ? "bg-rose" : "bg-line")} />
        ))}
      </div>
      <article className="glass rounded-[2rem] p-5 sm:p-7">
        <p className="text-sm text-muted">
          {step + 1} / {lesson.sections.length}
        </p>
        <h2 className="mt-2 display-title text-3xl text-ink">{section.heading}</h2>
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

function LessonVideo({ lessonId }: { lessonId: string }) {
  const video = embedUrl(LESSON_VIDEO[lessonId] ?? "");
  if (!video) {
    return (
      <div className="aurora mb-4 grid aspect-video w-full place-items-center rounded-[2rem] text-center">
        <div>
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-white text-ink shadow">
            <Play className="size-6 translate-x-0.5" />
          </span>
          <p className="mt-3 text-sm font-medium text-ink/70">Здесь будет видео урока</p>
        </div>
      </div>
    );
  }
  return (
    <div className="mb-4 overflow-hidden rounded-[2rem] bg-night shadow-lg">
      {video.kind === "iframe" ? (
        <iframe src={video.src} title="Видео урока" className="aspect-video w-full" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen />
      ) : (
        <video src={video.src} controls playsInline className="aspect-video w-full" />
      )}
    </div>
  );
}

function PaySheet({ onClose }: { onClose: () => void }) {
  const openProgram = useRod((state) => state.openProgram);
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);
  return (
    <Sheet title="Программа «Книга рода»" onClose={onClose}>
      <p className="display-title text-4xl text-ink">{PROGRAM_PRICE}</p>
      <p className="mt-2 text-sm text-muted">Шесть уроков откроются здесь же: интервью, девичья фамилия, фотография, места, глава и сборка книги.</p>
      {PAY_URL ? (
        <Button className="mt-4 w-full" onClick={() => window.open(PAY_URL, "_blank", "noopener")}>
          Оплатить
        </Button>
      ) : null}
      <form
        className="mt-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (checkCode(code)) {
            openProgram();
            toast("Программа открыта");
            onClose();
          } else setWrong(true);
        }}
      >
        <label className="block text-sm font-medium text-ink" htmlFor="access-code">
          {PAY_URL ? "После оплаты придёт код доступа" : "Код доступа"}
        </label>
        <div className="mt-1.5 flex gap-2">
          <input id="access-code" className="field uppercase" value={code} onChange={(event) => { setCode(event.target.value); setWrong(false); }} placeholder="Введите код" autoComplete="off" />
          <Button type="submit" disabled={!code.trim()}>
            Открыть
          </Button>
        </div>
        {wrong ? <p className="mt-2 text-sm text-rose-deep">Код не подошёл. Проверьте буквы или напишите Дарине.</p> : null}
      </form>
    </Sheet>
  );
}
