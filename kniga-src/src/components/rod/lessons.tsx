import { useState } from "react";
import { Check, ExternalLink, FileText, Lock, Play } from "lucide-react";
import { toast } from "sonner";
import { LESSONS, PROGRAM_OLD_PRICE, PROGRAM_PRICE, findLesson } from "@/lib/rod/content";
import { COURSE_COMMUNITY_URL, type CourseBlock } from "@/lib/rod/course-lessons";
import { LESSON_VIDEO, PAY_URL, checkCode, dropboxLessonUrl, embedUrl } from "@/lib/rod/config";
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
        Сначала бесплатный урок и живой сбор. Платная часть нужна, когда захочется превратить собранное в связный рассказ.
      </p>
      {LESSONS.filter((lesson) => lesson.free).map((lesson) => {
        const passed = done.includes(lesson.id);
        return (
          <button key={lesson.id} type="button" onClick={() => nav.go({ id: "lesson", lessonId: lesson.id })} className="aurora mt-5 flex w-full items-start gap-4 rounded-2xl p-5 text-left">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-ink">{passed ? <Check className="size-4" /> : <Play className="size-4" />}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink/70">
                Бесплатный урок · {lesson.minutes} мин{passed ? " · пройден" : ""}
              </span>
              <span className="mt-1 block text-[1.15rem] font-semibold leading-snug text-ink">{lesson.title}</span>
              <span className="mt-1 block text-sm text-ink/70">{lesson.lead}</span>
            </span>
          </button>
        );
      })}

      <h2 className="display-title mt-9 text-[1.35rem] text-ink">Программа «Книга Рода с ИИ»</h2>
      <p className="mt-1 text-sm text-muted">Шесть уроков с видео, файлами и домашними заданиями. Открываются после оплаты.</p>
      <div className="mt-4 grid gap-3">
        <img src={asset("course/gc/ov-welcome.jpg")} alt="Добро пожаловать в Книгу Рода" className="w-full rounded-2xl" />
        {LESSONS.filter((lesson) => !lesson.free).map((lesson) => {
          const locked = !programOpen;
          const passed = done.includes(lesson.id);
          return (
            <button key={lesson.id} type="button" onClick={() => (locked ? setPay(true) : nav.go({ id: "lesson", lessonId: lesson.id }))} className="relative block w-full overflow-hidden rounded-2xl text-left">
              <img src={asset(`course/gc/ov-${lesson.id}.jpg`)} alt={lesson.title} loading="lazy" className="w-full" />
              <span className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-paper/90 text-ink shadow">
                {locked ? <Lock className="size-4" /> : passed ? <Check className="size-4" /> : <Play className="size-4" />}
              </span>
              <span className="sr-only">{lesson.title}</span>
            </button>
          );
        })}
        <button type="button" onClick={() => (programOpen ? window.open(COURSE_COMMUNITY_URL, "_blank", "noopener") : setPay(true))} className="relative block w-full overflow-hidden rounded-2xl text-left">
          <img src={asset("course/gc/ov-community.jpg")} alt="Чат участников" loading="lazy" className="w-full" />
          {!programOpen ? (
            <span className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-paper/90 text-ink shadow">
              <Lock className="size-4" />
            </span>
          ) : null}
        </button>
      </div>
      {!programOpen ? (
        <div className="wash-blush mt-3 rounded-2xl p-5">
          <p className="text-sm text-rose-deep">Вся программа, шесть уроков</p>
          <div className="mt-1">
            <PriceTag big />
          </div>
          <p className="mt-2 text-sm text-muted">Интервью, визуал, родовое древо, исследование рода, архивы, вёрстка и мемуары. И полный шаблон Книги рода на 100 страниц.</p>
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
        <div className="glass rounded-2xl p-5">
          <Lock className="size-5 text-rose-deep" />
          <p className="mt-3 text-muted">{lesson.lead}</p>
          <Button className="mt-4" onClick={() => setPay(true)}>
            Открыть программу · {PROGRAM_PRICE} вместо {PROGRAM_OLD_PRICE}
          </Button>
        </div>
        {pay ? <PaySheet onClose={() => setPay(false)} /> : null}
      </ScreenFrame>
    );
  }

  if (lesson.blocks) {
    const passedBlocks = done.includes(lesson.id);
    return (
      <ScreenFrame>
        <TopBar title={lesson.title} kicker="Программа «Книга рода»" onBack={nav.back} />
        <BlocksLesson lessonId={lesson.id} blocks={lesson.blocks} />
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => complete(lesson.id)} variant={passedBlocks ? "soft" : "primary"}>
            {passedBlocks ? "Урок пройден" : "Отметить пройденным"}
          </Button>
        </div>
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
      <article className="glass rounded-2xl p-5 sm:p-7">
        <p className="text-sm text-muted">
          {step + 1} / {lesson.sections.length}
        </p>
        <h2 className="mt-2 text-[1.5rem] font-semibold leading-tight text-ink">{section.heading}</h2>
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
  const dropbox = dropboxLessonUrl(lessonId);
  if (!video && dropbox) {
    return (
      <a href={dropbox} target="_blank" rel="noopener noreferrer" className="aurora mb-4 grid aspect-video w-full place-items-center rounded-2xl text-center">
        <div>
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-white text-ink shadow">
            <Play className="size-6 translate-x-0.5" />
          </span>
          <p className="mt-3 text-sm font-semibold text-ink">Смотреть видео урока</p>
          <p className="text-xs text-ink/60">Откроется в Dropbox</p>
        </div>
      </a>
    );
  }
  if (!video) {
    return (
      <div className="aurora mb-4 grid aspect-video w-full place-items-center rounded-2xl text-center">
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
    <div className="mb-4 overflow-hidden rounded-2xl bg-night shadow-lg">
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
      <PriceTag />
      <p className="mt-2 text-sm text-muted">Шесть уроков откроются здесь же: интервью, визуал, родовое древо, исследование рода, архивы, вёрстка и мемуары. И полный шаблон Книги рода на 100 страниц.</p>
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

/** Файлы курса лежат в public/course: путь считаем от адреса приложения. */
const asset = (url: string) => (/^(https?:)?\/\//.test(url) ? url : `${import.meta.env.BASE_URL}${url}`);

function PriceTag({ big = false }: { big?: boolean }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className={cn("font-semibold leading-tight text-ink", big ? "text-[2.1rem]" : "text-[1.9rem]")}>{PROGRAM_PRICE}</span>
      <span className="text-lg text-muted line-through decoration-rose-deep/70">{PROGRAM_OLD_PRICE}</span>
      <span className="rounded-full bg-rose-deep px-2.5 py-0.5 text-xs font-semibold text-paper">скидка</span>
    </p>
  );
}

/** Простая разметка из платформы: **жирное**, абзацы, списки через «- ». */
function Rich({ text }: { text: string }) {
  const bold = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, index) => (part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : <span key={index}>{part}</span>));
  return (
    <div className="grid gap-3 text-base leading-relaxed text-ink">
      {text.split(/\n{2,}/).map((chunk, index) => {
        const lines = chunk.split("\n");
        if (lines.every((line) => /^\s*[-•]\s+/.test(line))) {
          return (
            <ul key={index} className="grid list-disc gap-1 pl-5">
              {lines.map((line, i) => (
                <li key={i}>{bold(line.replace(/^\s*[-•]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index}>
            {lines.map((line, i) => (
              <span key={i}>
                {i ? <br /> : null}
                {bold(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** Урок программы: те же блоки, что на платформе (баннеры, видео, файлы, кнопки, домашнее задание). */
function BlocksLesson({ lessonId, blocks }: { lessonId: string; blocks: CourseBlock[] }) {
  let videoSeen = false;
  return (
    <div className="grid gap-4">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "image":
            return block.url ? <img key={index} src={asset(block.url)} alt="" loading="lazy" className="w-full rounded-2xl" /> : null;
          case "video": {
            if (videoSeen) return null;
            videoSeen = true;
            return <LessonVideo key={index} lessonId={lessonId} />;
          }
          case "heading":
            return (
              <h2 key={index} className="display-title text-[1.5rem] text-ink">
                {block.text}
              </h2>
            );
          case "text":
            return block.text ? <Rich key={index} text={block.text} /> : null;
          case "file":
            return block.url ? (
              <a key={index} href={asset(block.url)} target="_blank" rel="noopener noreferrer" className="glass flex min-h-14 items-center gap-3 rounded-2xl px-4 py-3 text-ink">
                <FileText className="size-5 shrink-0 text-rose-deep" />
                <span className="min-w-0 flex-1 text-sm font-semibold">{block.name || "Файл"}</span>
                <span className="text-xs text-muted">PDF</span>
              </a>
            ) : null;
          case "button":
            return block.url ? (
              <a key={index} href={block.url} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-moss px-5 text-sm font-semibold text-paper">
                {block.text || "Открыть"} <ExternalLink className="size-4" />
              </a>
            ) : null;
          case "divider":
            return <hr key={index} className="border-ink/15" />;
          case "homework":
            return block.text ? (
              <div key={index} className="wash-sage rounded-2xl p-5">
                <Rich text={block.text} />
              </div>
            ) : null;
          default:
            return null;
        }
      })}
    </div>
  );
}
