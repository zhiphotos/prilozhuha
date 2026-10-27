import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, ChevronLeft, ExternalLink, FileText, Lock, Play, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { LESSONS, PROGRAM_OLD_PRICE, PROGRAM_PRICE, findLesson, type Lesson } from "@/lib/rod/content";
import { FREE_NOTE, PITCH, PROGRAM_PERKS, PROGRAM_SOON } from "@/lib/rod/lesson-pitch";
import { COURSE_COMMUNITY_URL } from "@/lib/rod/course-lessons";
import { INTRO_VIDEO, LESSON_VIDEO, PAY_URL, checkCode, dropboxLessonVideo, embedUrl } from "@/lib/rod/config";
import { LegalLinks } from "@/components/rod/legal";
import { serverStatus } from "@/lib/rod/server";
import { claimAccess, leaveLead, platformLogin, redeemCode, startCheckout } from "@/lib/rod/pay";
import { useRod } from "@/lib/rod/store";
import { cn } from "@/lib/cn";
import { Button, ScreenFrame, Sheet, TopBar, linkScreen, useNav } from "@/components/rod/chrome";

export function LessonsScreen() {
  const nav = useNav();
  const programOpen = useRod((state) => state.programOpen);
  const done = useRod((state) => state.doneLessons);
  const [pay, setPay] = useState(false);
  const [peek, setPeek] = useState<string | null>(null);
  const peeked = peek ? findLesson(peek) : null;
  useEffect(() => {
    try {
      if (sessionStorage.getItem("kr-scroll-program")) {
        sessionStorage.removeItem("kr-scroll-program");
        window.setTimeout(() => document.getElementById("program")?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
      }
    } catch {
      /* без прокрутки тоже работает */
    }
  }, []);

  return (
    <ScreenFrame>
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#c9ae74]">Программа</p>
        <h1 className="display-title mt-1 text-[2rem] leading-[1.1] text-paper">Книга рода</h1>
      </div>
      <p className="max-w-xl text-paper/70">Начните с бесплатного урока. Если зацепит, дальше целая программа: видео, ИИ-помощник и материалы для печати.</p>
      <a
        href="https://balanuca.vercel.app/learn"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[#c9ae74]/40 bg-[#c9ae74]/10 px-4 py-3 text-paper no-underline"
      >
        <span>
          <span className="block text-sm font-semibold">Смотреть платформу обучения Дарины</span>
          <span className="block text-xs text-paper/60">Уроки, курсы и вход в свой кабинет</span>
        </span>
        <span aria-hidden="true" className="text-lg text-[#c9ae74]">→</span>
      </a>
      {LESSONS.filter((lesson) => lesson.free).map((lesson) => {
        const passed = done.includes(lesson.id);
        return (
          <button key={lesson.id} type="button" onClick={() => nav.go({ id: "lesson", lessonId: lesson.id })} className="relative mt-5 block w-full overflow-hidden rounded-3xl text-left shadow-2xl">
            <img src={asset("course/site/free.jpg")} alt="" className="absolute inset-0 size-full scale-110 object-cover blur-md" draggable={false} />
            <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/20" />
            <span className="relative flex min-h-44 flex-col justify-end p-5">
              <span className="mb-3 w-fit rounded-full border border-paper/30 bg-paper/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-paper backdrop-blur-md">
                Бесплатный урок · {lesson.minutes} мин{passed ? " · пройден" : ""}
              </span>
              <span className="flex items-end gap-4 rounded-2xl border border-paper/25 bg-paper/15 p-4 backdrop-blur-xl">
                <span className="min-w-0 flex-1">
                  <span className="block text-[1.3rem] font-semibold leading-tight text-paper">{lesson.title}</span>
                  <span className="mt-1 block text-sm leading-snug text-paper/80">Смотрите первым: как создаётся Книга Рода с ИИ</span>
                </span>
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-paper/90 text-[#14160f]">{passed ? <Check className="size-5" /> : <Play className="size-5 translate-x-0.5" />}</span>
              </span>
            </span>
          </button>
        );
      })}

      <h2 id="program" className="display-title mt-10 scroll-mt-4 text-[1.35rem] text-paper">Программа «Книга Рода с ИИ»</h2>
      <p className="mt-1 text-sm text-paper/65">Нажмите на урок: увидите, что в нём будет. Откроется после оплаты.</p>
      <div className="mt-4 grid gap-3">
        <img src={asset("course/gc/ov-welcome.jpg")} alt="Добро пожаловать в Книгу Рода" className="w-full rounded-2xl" />
        {LESSONS.filter((lesson) => !lesson.free).map((lesson) => {
          const locked = !programOpen;
          const passed = done.includes(lesson.id);
          return (
            <button key={lesson.id} type="button" onClick={() => (locked ? setPeek(lesson.id) : nav.go({ id: "lesson", lessonId: lesson.id }))} className="relative block w-full overflow-hidden rounded-2xl text-left">
              <img src={asset(`course/gc/ov-${lesson.id}.jpg`)} alt={lesson.title} loading="lazy" className="w-full" />
              <span className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-paper/90 text-ink shadow">
                {passed ? <Check className="size-4" /> : <Play className="size-4 translate-x-px" />}
              </span>
              <span className="sr-only">{lesson.title}</span>
            </button>
          );
        })}
        <button type="button" onClick={() => (programOpen ? window.open(COURSE_COMMUNITY_URL, "_blank", "noopener") : setPay(true))} className="relative block w-full overflow-hidden rounded-2xl text-left">
          <img src={asset("course/gc/ov-community.jpg")} alt="Чат участников" loading="lazy" className="w-full" />
        </button>
      </div>
      <Reviews />

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
        <p className="mt-4 text-sm text-[#c9ae74]">Программа открыта на этом устройстве.</p>
      )}
      {peeked ? <LockedLesson widget lesson={peeked} onBack={() => setPeek(null)} onNext={setPeek} onBuy={() => setPay(true)} onMore={() => { setPeek(null); nav.go({ id: "lesson", lessonId: peeked.id }); }} /> : null}
      <LegalLinks dark />
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
        <LockedLesson lesson={lesson} onBack={nav.back} onBuy={() => setPay(true)} onNext={(id) => nav.replace({ id: "lesson", lessonId: id })} />
        {pay ? <PaySheet onClose={() => setPay(false)} /> : null}
      </>
    );
  }

  if (lesson.free) {
    return <FreeLesson lesson={lesson} passed={done.includes(lesson.id)} onDone={() => complete(lesson.id)} onBack={nav.back} onAll={() => { try { sessionStorage.setItem("kr-scroll-program", "1"); } catch { /* не страшно */ } nav.replace({ id: "lessons" }); }} onOpen={(to) => nav.go(linkScreen(to))} />;
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

/** Что откроется после покупки: список по пунктам, как страница Кики+. */
function IncludesList({ dark = false }: { dark?: boolean }) {
  const strong = dark ? "text-paper" : "text-ink";
  const soft = dark ? "text-paper/75" : "text-muted";
  return (
    <div className={dark ? "mt-4" : "mt-4 rounded-2xl bg-white/60 p-4"}>
      <p className={cn("text-[11px] font-semibold uppercase tracking-[0.16em]", dark ? "text-[#c9ae74]" : "text-muted")}>Что откроется после покупки</p>
      <ul className="mt-3 grid gap-2.5">
        {PROGRAM_PERKS.map((perk) => (
          <li key={perk.title} className="flex gap-3 text-sm">
            <Check className={cn("mt-0.5 size-4 shrink-0", dark ? "text-[#c9ae74]" : "text-moss")} />
            <span>
              <span className={cn("font-semibold", strong)}>{perk.title}. </span>
              <span className={soft}>{perk.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className={cn("mt-4 text-[11px] font-semibold uppercase tracking-[0.16em]", dark ? "text-[#c9ae74]" : "text-muted")}>Скоро в программе</p>
      <ul className={cn("mt-2 grid gap-1.5 text-sm", soft)}>
        {PROGRAM_SOON.map((item) => (
          <li key={item} className="flex gap-3">
            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-current opacity-60" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <p className={cn("mt-4 text-xs", soft)}>{FREE_NOTE}</p>
    </div>
  );
}

export function PaySheet({ onClose }: { onClose: () => void }) {
  const nav = useNav();
  const openProgram = useRod((state) => state.openProgram);
  const [mode, setMode] = useState<"buy" | "restore">("buy");
  const [email, setEmail] = useState("");
  const [terms, setTerms] = useState(false);
  const [pd, setPd] = useState(false);
  const [ads, setAds] = useState(false);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState("");
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);
  const [pEmail, setPEmail] = useState("");
  const [pPass, setPPass] = useState("");
  const [leadDone, setLeadDone] = useState(false);
  const [live, setLive] = useState(false);
  useEffect(() => {
    void serverStatus().then((status) => setLive(status.pay));
  }, []);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const doc = (id: string, label: string) => (
    <button type="button" className="inline text-left font-semibold underline" onClick={() => { onClose(); nav.go({ id: "legal", doc: id }); }}>
      {label}
    </button>
  );
  const check = "mt-0.5 size-5 shrink-0 accent-[#3f4a22]";

  const pay = async () => {
    setBusy(true);
    try {
      window.location.href = await startCheckout(email.trim(), ads);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не получилось открыть оплату.", { duration: 6000 });
      setBusy(false);
    }
  };
  const restore = async () => {
    setBusy(true);
    try {
      await claimAccess(order, email);
      toast("Программа открыта");
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Заказ не найден.", { duration: 6000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Программа «Книга рода»" onClose={onClose}>
      <PriceTag />
      <p className="mt-2 text-sm text-muted">Шесть уроков с видео, ИИ-помощник и шаблоны, полный шаблон книги на 100 страниц, материалы для печати. Платите один раз: единоразовая плата, доступ навсегда, без автоматических списаний.</p>
      <IncludesList />

      {live && mode === "buy" ? (
        <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); if (validEmail && terms && pd) void pay(); }}>
          <div>
            <label className="block text-sm font-medium text-ink" htmlFor="pay-email">Почта для чека</label>
            <input id="pay-email" type="email" inputMode="email" autoComplete="email" className="field mt-1.5" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@mail.ru" />
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-ink">
            <input type="checkbox" className={check} checked={terms} onChange={(event) => setTerms(event.target.checked)} />
            <span>Я принимаю {doc("offer", "публичную оферту")} и {doc("terms", "пользовательское соглашение")}, знакомлюсь с {doc("privacy", "политикой обработки данных")}</span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-ink">
            <input type="checkbox" className={check} checked={pd} onChange={(event) => setPd(event.target.checked)} />
            <span>Я даю {doc("consent-pd", "согласие на обработку персональных данных")}</span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-muted">
            <input type="checkbox" className={check} checked={ads} onChange={(event) => setAds(event.target.checked)} />
            <span>Хочу получать новости и предложения ({doc("consent-ads", "согласие на рассылку")}). Необязательно.</span>
          </label>
          <Button type="submit" disabled={busy || !validEmail || !terms || !pd} className="h-auto min-h-12 w-full whitespace-normal py-3">
            {busy ? "Открываю оплату…" : `Оплатить ${PROGRAM_PRICE}`}
          </Button>
          <p className="text-xs text-muted">Оплата на защищённой странице Альфа-Банка. Чек придёт на указанную почту.</p>
          <button type="button" className="text-left text-sm text-moss underline" onClick={() => setMode("restore")}>Уже оплатили? Вернуть доступ на этом устройстве</button>
        </form>
      ) : null}

      {live && mode === "restore" ? (
        <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); void restore(); }}>
          <p className="text-sm text-muted">Номер заказа и почту можно найти в чеке или в письме банка.</p>
          <input className="field" value={order} onChange={(event) => setOrder(event.target.value)} placeholder="Номер заказа, например kr-abc123-1a2b3c4d" autoComplete="off" />
          <input className="field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Почта из чека" />
          <Button type="submit" disabled={busy || !order.trim() || !validEmail}>{busy ? "Проверяю…" : "Вернуть доступ"}</Button>
          <button type="button" className="text-left text-sm text-moss underline" onClick={() => setMode("buy")}>Назад к оплате</button>
        </form>
      ) : null}

      {!live && PAY_URL ? (
        <div className="mt-4 grid gap-2">
          <a
            href={PAY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-moss px-4 py-3 text-center font-semibold text-paper no-underline"
          >
            Оплатить через Tribute
          </a>
          <p className="text-xs text-muted">Это временное решение: после оплаты Дарина откроет доступ вручную.</p>
        </div>
      ) : null}

      {!live && !PAY_URL ? (
        leadDone ? (
          <p className="mt-4 rounded-2xl bg-white/60 p-4 text-sm text-ink">Спасибо! Мы напишем на эту почту, когда откроется покупка.</p>
        ) : (
          <form
            className="mt-4 grid gap-3 rounded-2xl bg-white/60 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              void leaveLead(email).then((problem) => {
                setBusy(false);
                if (problem) toast(problem, { duration: 6000 });
                else setLeadDone(true);
              });
            }}
          >
            <p className="text-sm text-ink">Покупка откроется совсем скоро. Оставьте почту, и мы сразу напишем вам.</p>
            <input className="field" type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@mail.ru" />
            <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-ink">
              <input type="checkbox" className={check} checked={pd} onChange={(event) => setPd(event.target.checked)} />
              <span>Я даю {doc("consent-pd", "согласие на обработку персональных данных")}</span>
            </label>
            <Button type="submit" disabled={busy || !validEmail || !pd}>{busy ? "Отправляю…" : "Сообщите мне"}</Button>
          </form>
        )
      ) : null}

      <form
        className="mt-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (checkCode(code)) {
            openProgram();
            toast("Программа открыта");
            onClose();
            return;
          }
          setBusy(true);
          void redeemCode(code).then((problem) => {
            setBusy(false);
            if (!problem) {
              toast("Программа открыта");
              onClose();
            } else {
              setWrong(true);
              toast(problem, { duration: 8000 });
            }
          });
        }}
      >
        <label className="block text-sm font-medium text-ink" htmlFor="access-code">
          Есть код доступа?
        </label>
        <div className="mt-1.5 flex gap-2">
          <input id="access-code" className="field uppercase" value={code} onChange={(event) => { setCode(event.target.value); setWrong(false); }} placeholder="Введите код" autoComplete="off" />
          <Button type="submit" disabled={!code.trim() || busy}>
            Открыть
          </Button>
        </div>
        {wrong ? <p className="mt-2 text-sm text-rose-deep">Код не подошёл. Проверьте буквы или напишите Дарине.</p> : null}
      </form>

      <form
        className="mt-6 grid gap-2 border-t border-ink/10 pt-5"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void platformLogin(pEmail, pPass)
            .then(() => {
              toast("Программа открыта");
              onClose();
            })
            .catch((error) => toast(error instanceof Error ? error.message : "Не получилось войти.", { duration: 6000 }))
            .finally(() => setBusy(false));
        }}
      >
        <p className="text-sm font-medium text-ink">Учились на платформе balanuca? Войдите тем же аккаунтом</p>
        <input className="field" type="email" autoComplete="email" value={pEmail} onChange={(event) => setPEmail(event.target.value)} placeholder="Почта с платформы" />
        <input className="field" type="password" autoComplete="current-password" value={pPass} onChange={(event) => setPPass(event.target.value)} placeholder="Пароль" />
        <Button type="submit" disabled={busy || !pEmail.trim() || !pPass}>{busy ? "Проверяю…" : "Войти"}</Button>
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

/** Закрытый урок: окно «что здесь будет», кнопка «Купить» и переход к следующему уроку. */
function LockedLesson({ lesson, onBack, onBuy, onNext, onMore, widget = false }: { lesson: Lesson; onBack: () => void; onBuy: () => void; onNext: (id: string) => void; onMore?: () => void; widget?: boolean }) {
  const pitch = PITCH[lesson.id];
  const tile = TILES.find((item) => item.id === lesson.id);
  const paid = LESSONS.filter((item) => !item.free);
  const next = paid[paid.findIndex((item) => item.id === lesson.id) + 1];
  const body = (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-[#14160f]/95 px-3 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))] backdrop-blur">
        <button type="button" onClick={onBack} aria-label={widget ? "Закрыть" : "Назад к программе"} className="grid size-11 shrink-0 place-items-center rounded-full bg-paper/10 text-paper">
          {widget ? <X className="size-5" /> : <ChevronLeft className="size-5" />}
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-paper/85">{lesson.title}</p>
        <span className="mr-2 w-1" />
      </header>
      <div className="mx-auto max-w-2xl pb-[max(2rem,env(safe-area-inset-bottom))]">
        {tile ? <img src={asset(tile.src)} alt={tile.title} className="mx-auto block w-full" draggable={false} /> : null}
        <div className="grid gap-2.5 px-5 pt-5">
          {widget && onMore ? (
            <Button className="w-full" variant="white" onClick={onMore}>
              Читать подробнее
            </Button>
          ) : null}
          {next ? (
            <button type="button" onClick={() => onNext(next.id)} className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#c9ae74]/60 px-5 text-sm font-semibold text-[#c9ae74]">
              Что будет в следующем уроке <ArrowRight className="size-4" />
            </button>
          ) : null}
          <div className="mt-1">
            <GoldTicket onClick={onBuy}>Купить уроки и полный доступ в приложение за {PROGRAM_PRICE}</GoldTicket>
          </div>
        </div>
        {widget ? null : (
          <>
        {pitch ? (
          <div className="px-5 pt-8">
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
        <img src={asset("course/site/materials.jpg")} alt="Материалы программы" className="mt-8 block w-full" draggable={false} />
        <div className="px-5 pt-4">
          <IncludesList dark />
          <div className="mt-6 rounded-2xl bg-paper p-5 text-ink">
            <PriceTag />
            <p className="mt-1 text-sm text-muted">Все уроки и полный доступ в приложение. Одна покупка, не по одному уроку.</p>
            <div className="mt-4">
              <GoldTicket onClick={onBuy} cut="#f3f0e8">
                Купить уроки и полный доступ в приложение
              </GoldTicket>
            </div>
          </div>
        </div>
          </>
        )}
      </div>
    </>
  );
  if (!widget) return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#14160f] text-paper">{body}</div>;
  // Через портал: у экрана есть анимация, из-за неё fixed внутри считался бы от всей длины страницы.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onBack}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl bg-[#14160f] text-paper shadow-2xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        {body}
      </div>
    </div>,
    document.body,
  );
}

const TILES = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `l${n}`, src: `course/site/lesson${n}.jpg`, title: `Урок ${n}` }));
const REVIEWS = [1, 2, 3].map((n) => `course/site/review${n}.jpg`);

/** Картинка на весь экран целиком, без обрезки. */
function ImageZoom({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/95" onClick={onClose}>
      <div className="flex justify-end p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" aria-label="Закрыть" className="grid size-11 place-items-center rounded-full bg-paper/15 text-paper" onClick={onClose}>
          <X className="size-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <img src={asset(src)} alt="" className="max-h-full max-w-full object-contain" />
      </div>
    </div>
  );
}

/** Отзывы участниц с сайта. */
function Reviews() {
  const [zoom, setZoom] = useState<string | null>(null);
  return (
    <section className="mt-9">
      <h2 className="display-title text-[1.35rem] text-paper">Что говорят в сообществе</h2>
      <ul className="no-scrollbar -mx-5 mt-3 flex snap-x snap-mandatory scroll-pl-5 gap-3 overflow-x-auto px-5 pb-2">
        {REVIEWS.map((src) => (
          <li key={src} className="w-[78%] max-w-80 shrink-0 snap-start">
            <button type="button" onClick={() => setZoom(src)} className="block w-full overflow-hidden rounded-2xl bg-black" aria-label="Отзыв">
              <img src={asset(src)} alt="Отзыв участницы" loading="lazy" className="w-full" />
            </button>
          </li>
        ))}
      </ul>
      {zoom ? <ImageZoom src={zoom} onClose={() => setZoom(null)} /> : null}
    </section>
  );
}

/** Бесплатный урок играет из файла самого приложения: без входа в YouTube и без чужих роликов. */
function OwnVideo({ src, poster, fallbackUrl }: { src: string; poster: string; fallbackUrl: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      {failed ? (
        <div className="grid size-full place-items-center p-6 text-center text-paper">
          <div>
            <p className="text-sm">Видео не загрузилось. Проверьте интернет и попробуйте ещё раз.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button variant="white" onClick={() => setFailed(false)}>
                Ещё раз
              </Button>
              <a href={fallbackUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-paper/40 px-4 text-sm text-paper">
                Открыть на YouTube
              </a>
            </div>
          </div>
        </div>
      ) : (
        <video src={src} poster={poster} controls playsInline preload="metadata" className="size-full" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

/** Бесплатный урок: тёмная страница, видео и описание, от которого хочется смотреть. */
function FreeLesson({ lesson, passed, onDone, onBack, onAll, onOpen }: { lesson: Lesson; passed: boolean; onDone: () => void; onBack: () => void; onAll: () => void; onOpen: (to: NonNullable<Lesson["related"]>["to"]) => void }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#14160f] text-paper">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-[#14160f]/95 px-3 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))] backdrop-blur">
        <button type="button" onClick={onBack} aria-label="Назад" className="grid size-11 shrink-0 place-items-center rounded-full bg-paper/10 text-paper">
          <ChevronLeft className="size-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-paper/85">Бесплатный урок</p>
      </header>
      <div className="mx-auto max-w-2xl pb-[max(2rem,env(safe-area-inset-bottom))]">
        <OwnVideo src={asset("course/site/free-lesson.mp4")} poster={asset("course/site/free-lesson.jpg")} fallbackUrl={INTRO_VIDEO} />
        <div className="px-5 pt-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c9ae74]">12 минут · бесплатно</p>
          <h1 className="display-title mt-2 text-[2rem] leading-[1.05] text-paper">Книга Рода – это до слёз и смеха</h1>
          <p className="mt-4 text-[1.15rem] font-semibold leading-snug text-[#c9ae74]">Это способ узнать себя. Это новое хобби, от которого тепло внутри.</p>
          <p className="mt-4 text-base leading-relaxed text-paper/85">
            Вы не пишете книгу «ради книги». Вы возвращаетесь к себе: к своим корням, к своим реакциям и талантам. А по дороге получаете то, ради чего люди и садятся за такие книги. Я покажу, как создаю её с ИИ: без архивов и без «я не умею писать». Нужны только вы, телефон и тихий вечер.
          </p>
          <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c9ae74]">Что вы получите, пока делаете книгу</p>
          <ul className="mt-3 grid gap-3.5">
            {[
              ["Опору", "поймёте, откуда вы и на кого можете опереться, даже если спросить уже некого"],
              ["Открытия о себе", "почему вы реагируете именно так, откуда ваши страхи, таланты и привычки"],
              ["Тёплые вечера", "тихое хобби, после которого хочется улыбаться, а не отдыхать от него"],
              ["Радость находок", "старое фото, забытая история, фраза бабушки: каждый вечер что-то находится"],
              ["Красивую вещь на века", "книга, которую приятно держать в руках, дарить и перечитывать. И детям достанется огромная польза"],
              ["Помощника, который делает всё с вами", "ИИ задаёт вопросы, ищет, пишет и оформляет, а вам остаётся только вспоминать"],
            ].map(([title, text]) => (
              <li key={title} className="flex gap-3">
                <span className="mt-2 size-2 shrink-0 rotate-45 bg-[#c9ae74]" />
                <span>
                  <span className="block text-[1.05rem] font-semibold text-paper">{title}</span>
                  <span className="block text-sm leading-snug text-paper/70">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-7 text-[1.25rem] font-semibold leading-snug text-paper">Жмите на видео и вдохновляйтесь!</p>
        </div>

        <img src={asset("course/site/materials.jpg")} alt="" className="mt-8 block w-full" draggable={false} />

        <div className="px-5 pt-6">
          <details className="group rounded-2xl border border-paper/15 bg-paper/5">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold text-paper">
              Конспект урока
              <span className="text-[#c9ae74] transition group-open:rotate-45">+</span>
            </summary>
            <div className="grid gap-3 px-4 pb-4">
              {lesson.sections.map((section) => (
                <article key={section.heading}>
                  <h2 className="text-[1.05rem] font-semibold leading-tight text-paper">{section.heading}</h2>
                  <div className="mt-1.5 grid gap-2 text-[15px] leading-relaxed text-paper/75">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </details>
          <div className="mt-5 grid gap-2.5">
            <Button className="w-full" variant="white" onClick={onAll}>
              Посмотреть все уроки
            </Button>
            {lesson.related ? (
              <Button variant="soft" className="w-full" onClick={() => onOpen(lesson.related!.to)}>
                {lesson.related.label}
              </Button>
            ) : null}
            <Button className="w-full" variant="soft" onClick={onDone}>
              {passed ? "Урок пройден" : "Отметить пройденным"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Золотой билет: главная кнопка покупки, всегда ниже остальных. */
function GoldTicket({ children, onClick, cut }: { children: React.ReactNode; onClick: () => void; cut?: string }) {
  return (
    <button type="button" onClick={onClick} className="gold-ticket" style={cut ? ({ ["--ticket-cut" as string]: cut } as React.CSSProperties) : undefined}>
      <span className="shine" aria-hidden />
      <span className="relative">{children}</span>
    </button>
  );
}
