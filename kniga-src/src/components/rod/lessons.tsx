import { useState } from "react";
import { Check, ChevronLeft, ExternalLink, FileText, Lock, Play, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { LESSONS, PROGRAM_OLD_PRICE, PROGRAM_PRICE, findLesson, type Lesson } from "@/lib/rod/content";
import { PITCH, PROGRAM_PERKS } from "@/lib/rod/lesson-pitch";
import { COURSE_COMMUNITY_URL } from "@/lib/rod/course-lessons";
import { LESSON_VIDEO, PAY_URL, checkCode, dropboxLessonVideo, embedUrl } from "@/lib/rod/config";
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
            <button key={lesson.id} type="button" onClick={() => nav.go({ id: "lesson", lessonId: lesson.id })} className="relative block w-full overflow-hidden rounded-2xl text-left">
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
      <>
        <LockedLesson lesson={lesson} onBack={nav.back} onBuy={() => setPay(true)} />
        {pay ? <PaySheet onClose={() => setPay(false)} /> : null}
      </>
    );
  }

  if (lesson.blocks) {
    return <BlocksLesson lesson={lesson} passed={done.includes(lesson.id)} onDone={() => complete(lesson.id)} onBack={nav.back} />;
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

function LessonVideo({ lessonId, flat = false }: { lessonId: string; flat?: boolean }) {
  const video = embedUrl(LESSON_VIDEO[lessonId] ?? "");
  const dropbox = dropboxLessonVideo(lessonId);
  const [failed, setFailed] = useState(false);
  if (!video && dropbox) {
    // Видео играет прямо в приложении, из общей папки Dropbox.
    return (
      <div className={cn("overflow-hidden bg-night", flat ? "" : "mb-4 rounded-2xl shadow-lg")}>
        {failed ? (
          <div className="grid aspect-video w-full place-items-center p-6 text-center text-paper">
            <p className="text-sm">Видео не загрузилось. Проверьте интернет и попробуйте ещё раз.</p>
            <Button variant="white" className="mt-3" onClick={() => setFailed(false)}>
              Ещё раз
            </Button>
          </div>
        ) : (
          <video src={dropbox.stream} controls playsInline preload="metadata" className="aspect-video w-full" onError={() => setFailed(true)} />
        )}
      </div>
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
function Rich({ text, dark = false }: { text: string; dark?: boolean }) {
  const bold = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, index) => (part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : <span key={index}>{part}</span>));
  return (
    <div className={cn("grid gap-3 text-base leading-relaxed", dark ? "text-paper/90" : "text-ink")}>
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

/** Тёмная «страница книги»: картинки на всю ширину встык, как будто урок разворачивается единым листом. */
function BlocksLesson({ lesson, passed, onDone, onBack }: { lesson: Lesson; passed: boolean; onDone: () => void; onBack: () => void }) {
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  let videoSeen = false;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#14160f] text-paper">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-[#14160f]/95 px-3 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))] backdrop-blur">
        <button type="button" onClick={onBack} aria-label="Назад к программе" className="grid size-11 shrink-0 place-items-center rounded-full bg-paper/10 text-paper">
          <ChevronLeft className="size-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-paper/85">{lesson.title}</p>
      </header>
      <div className="mx-auto max-w-2xl pb-[max(2rem,env(safe-area-inset-bottom))]">
        {(lesson.blocks ?? []).map((block, index) => {
          switch (block.type) {
            case "image":
              return block.url ? <img key={index} src={asset(block.url)} alt="" loading={index < 3 ? "eager" : "lazy"} className="block w-full" draggable={false} /> : null;
            case "video": {
              if (videoSeen) return null;
              videoSeen = true;
              return <LessonVideo key={index} lessonId={lesson.id} flat />;
            }
            case "heading":
              return (
                <h2 key={index} className="display-title px-5 pb-1 pt-6 text-[1.5rem] text-paper">
                  {block.text}
                </h2>
              );
            case "text":
              return block.text ? (
                <div key={index} className="px-5 py-3">
                  <Rich text={block.text} dark />
                </div>
              ) : null;
            case "file":
              return block.url ? (
                <div key={index} className="px-5 py-1.5">
                  <button type="button" onClick={() => setFile({ url: asset(block.url ?? ""), name: block.name || "Файл" })} className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-paper/15 bg-paper/10 px-4 py-3 text-left text-paper">
                    <FileText className="size-5 shrink-0 text-[#c9ae74]" />
                    <span className="min-w-0 flex-1 text-sm font-semibold">{block.name || "Файл"}</span>
                    <span className="text-xs text-paper/60">открыть</span>
                  </button>
                </div>
              ) : null;
            case "button":
              return block.url ? (
                <div key={index} className="px-5 py-1.5">
                  <a href={block.url} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#c9ae74] px-5 text-sm font-semibold text-[#14160f]">
                    {block.text || "Открыть"} <ExternalLink className="size-4" />
                  </a>
                </div>
              ) : null;
            case "divider":
              return <hr key={index} className="mx-5 my-3 border-paper/15" />;
            case "homework":
              return block.text ? (
                <div key={index} className="mx-5 my-4 rounded-2xl border border-[#c9ae74]/40 bg-paper/10 p-5">
                  <Rich text={block.text} dark />
                </div>
              ) : null;
            default:
              return null;
          }
        })}
        <div className="px-5 pt-4">
          <Button className="w-full" onClick={onDone} variant={passed ? "soft" : "white"}>
            {passed ? "Урок пройден" : "Отметить пройденным"}
          </Button>
        </div>
      </div>
      {file ? <FileViewer file={file} onClose={() => setFile(null)} /> : null}
    </div>
  );
}

/** Файл открывается поверх урока, а не вместо него: «К уроку» сразу возвращает назад. */
function FileViewer({ file, onClose }: { file: { url: string; name: string }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#14160f] text-paper">
      <header className="flex items-center gap-2 px-3 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} className="flex min-h-11 items-center gap-1.5 rounded-full bg-paper px-4 text-sm font-semibold text-[#14160f]">
          <ChevronLeft className="size-4" /> К уроку
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-sm text-paper/80">{file.name}</p>
        <a href={file.url} target="_blank" rel="noopener noreferrer" className="grid size-11 place-items-center rounded-full bg-paper/10" aria-label="Открыть отдельно">
          <ExternalLink className="size-4" />
        </a>
      </header>
      <iframe src={file.url} title={file.name} className="min-h-0 w-full flex-1 bg-paper" />
      <div className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <Button className="w-full" variant="white" onClick={onClose}>
          Вернуться к уроку
        </Button>
      </div>
    </div>
  );
}

/** Закрытый урок: что человек получит, если откроет программу. */
function LockedLesson({ lesson, onBack, onBuy }: { lesson: Lesson; onBack: () => void; onBuy: () => void }) {
  const pitch = PITCH[lesson.id];
  const banner = lesson.blocks?.find((block) => block.type === "image")?.url;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#14160f] text-paper">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-[#14160f]/95 px-3 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))] backdrop-blur">
        <button type="button" onClick={onBack} aria-label="Назад к программе" className="grid size-11 shrink-0 place-items-center rounded-full bg-paper/10 text-paper">
          <ChevronLeft className="size-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-paper/85">{lesson.title}</p>
        <Lock className="mr-2 size-4 text-[#c9ae74]" />
      </header>
      <div className="mx-auto max-w-2xl pb-[max(2rem,env(safe-area-inset-bottom))]">
        {banner ? <img src={asset(banner)} alt="" className="block w-full" draggable={false} /> : null}
        {pitch ? (
          <div className="px-5 pt-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c9ae74]">Что вы получите в этом уроке</p>
            <h2 className="display-title mt-2 text-[1.7rem] leading-tight text-paper">{pitch.hook}</h2>
            <p className="mt-3 text-base leading-relaxed text-paper/85">{pitch.promise}</p>
            <ul className="mt-5 grid gap-2.5">
              {pitch.inside.map((item) => (
                <li key={item.title} className="flex gap-3 rounded-2xl border border-paper/15 bg-paper/10 p-4">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-[#c9ae74]" />
                  <span>
                    <span className="block text-sm font-semibold text-paper">{item.title}</span>
                    <span className="mt-0.5 block text-sm leading-snug text-paper/75">{item.text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-5 rounded-2xl border border-[#c9ae74]/40 p-4 text-sm leading-relaxed text-paper/90">
              <span className="font-semibold text-[#c9ae74]">Итог урока. </span>
              {pitch.result}
            </p>
          </div>
        ) : null}
        <div className="px-5 pt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c9ae74]">И ещё вся программа</p>
          <ul className="mt-3 grid gap-2.5">
            {PROGRAM_PERKS.map((perk) => (
              <li key={perk.title} className="flex gap-3 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-[#c9ae74]" />
                <span>
                  <span className="font-semibold text-paper">{perk.title}. </span>
                  <span className="text-paper/75">{perk.text}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-2xl bg-paper p-5 text-ink">
            <PriceTag />
            <p className="mt-1 text-sm text-muted">Вся программа целиком, не по одному уроку.</p>
            <Button className="mt-4 w-full" onClick={onBuy}>
              Открыть программу
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


