import { useState } from "react";
import { ArrowRight, BookCopy, BookOpen, Camera, Clock, GraduationCap, PenLine, Play, Search, Settings2, Users } from "lucide-react";
import { MovedBanner } from "@/components/rod/moved-banner";
import { OpenCopyButton } from "@/components/rod/open-copy";
import { requestTour } from "@/components/rod/tour";
import { Botanica, Cut, PAL_DARK, PAL_LIGHT, packBg } from "@/components/rod/botanica";
import { filledCount } from "@/components/rod/contents-sheet";
import { AUDIENCES, LESSONS, SITUATIONS, audienceTitle, reminder } from "@/lib/rod/content";
import { DeckLink, catOf } from "@/components/rod/cards";
import { LegalLinks } from "@/components/rod/legal";
import { RemindersCard } from "@/components/rod/reminders-card";
import { countsOf, isBookReady, nextStep, overallOf, partsOf, plural } from "@/lib/rod/progress";
import { useRod } from "@/lib/rod/store";
import type { Audience, Screen } from "@/lib/rod/types";
import { cn } from "@/lib/cn";
import { toast } from "sonner";
import { Button, Field, ScreenFrame, Sheet, lineStyle, useNav } from "@/components/rod/chrome";
import { changedSinceBackup, exportBook, lastBackupAt } from "@/lib/rod/backup";
import { ShareInvite } from "@/components/rod/share-invite";
import { InstallBanner, InstallCard, InstallSheet } from "@/components/rod/install-hint";
import { TransferCard } from "@/components/rod/transfer-card";
import { ProjectsSheet } from "@/components/rod/projects-sheet";
import { activeProjectId, listProjects } from "@/lib/rod/projects";

/** Мини-иконки разделов «Из чего складывается книга»: тонкая линия, цвет золотой. */
const PART_ICONS: Record<string, React.ReactNode> = {
  // Семья: двое взрослых и ребёнок.
  family: (
    <>
      <circle cx="8" cy="7" r="2.4" />
      <circle cx="16.5" cy="7.6" r="2.1" />
      <path d="M3.6 18.5c0-3.3 1.9-5.4 4.4-5.4s4.4 2.1 4.4 5.4" />
      <path d="M13.4 18.5c0-2.7 1.3-4.4 3.1-4.4s3.1 1.7 3.1 4.4" />
    </>
  ),
  // Места: метка на карте.
  places: (
    <>
      <path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  // Фотографии: рамка с горой и солнцем.
  photos: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4" />
    </>
  ),
  // Истории: раскрытая книга.
  stories: (
    <>
      <path d="M12 6.5C10 5 7 4.6 3.8 5.2v12.6c3.2-.6 6.2-.2 8.2 1.4 2-1.6 5-2 8.2-1.4V5.2C17 4.6 14 5 12 6.5Z" />
      <path d="M12 6.5v12.7" />
    </>
  ),
  // Документы: лист с загнутым углом и строками.
  docs: (
    <>
      <path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20V3.5Z" />
      <path d="M14 3.5v4h4M9 12h6M9 15.5h6" />
    </>
  ),
};

function PartIcon({ part }: { part: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0 text-gold-ink" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PART_ICONS[part]}
    </svg>
  );
}

export function HomeScreen() {
  const nav = useNav();
  const data = useRod();
  const snapshot = { ...data };
  const parts = partsOf(snapshot);
  const overall = overallOf(parts);
  const counts = countsOf(snapshot);
  const step = nextStep(snapshot, overall);
  const ready = isBookReady(snapshot, overall);
  const [profile, setProfile] = useState(false);
  const [projects, setProjects] = useState(false);
  const bookName = listProjects().length > 1 ? listProjects().find((item) => item.id === activeProjectId())?.name : null;
  const free = LESSONS.find((lesson) => lesson.free);
  const freeDone = free ? data.doneLessons.includes(free.id) : false;
  const who = data.dedicatee.trim() || audienceTitle(data.audience).replace(/^Для /, "для ");
  const partScreen = (key: string): Screen =>
    key === "family" ? { id: "archive", tab: "people" } : key === "places" ? { id: "archive", tab: "places" } : key === "photos" ? { id: "archive", tab: "photos" } : key === "stories" ? { id: "stories" } : { id: "archive", tab: "docs" };

  const total = counts.people + counts.places + counts.photos + counts.stories + counts.docs + counts.notes;
  const worked = data.pages.filter((page) => page.kind !== "cover" && filledCount(page) > 0);
  const last = worked.reduce<(typeof worked)[number] | undefined>((best, page) => (!best || (page.editedAt ?? 0) >= (best.editedAt ?? 0) ? page : best), undefined);
  const mode: "new" | "started" | "going" = last && (worked.length >= 3 || ready) ? "going" : total > 0 || data.pages.length > 1 ? "started" : "new";
  const facts = [
    counts.people ? plural(counts.people, "человек", "человека", "человек") : "",
    counts.photos ? plural(counts.photos, "фото", "фото", "фото") : "",
    counts.stories ? plural(counts.stories, "история", "истории", "историй") : "",
    counts.notes ? plural(counts.notes, "ответ", "ответа", "ответов") : "",
  ].filter(Boolean);
  const heading = mode === "new" ? "Начнём с имени" : mode === "going" ? "Продолжим книгу" : "Книга началась";
  const note = mode === "new" ? "Первый шаг совсем небольшой." : mode === "going" ? "Здесь мы остановились." : "Шаг за шагом.";
  const heroLabel = mode === "going" ? "Продолжить" : "Следующий шаг";
  const heroTitle = mode === "going" && last ? last.title || "Страница" : step.title;
  const heroDetail = mode === "going" ? "Вернуться туда, где остановились" : step.detail;
  const heroGo = () => (mode === "going" && last ? nav.go({ id: "editor", pageId: last.id }) : nav.go(step.screen));

  return (
    <ScreenFrame>
      <MovedBanner />
      <InstallBanner />
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="sun-mark grid size-12 place-items-center rounded-full" aria-hidden>
            <Botanica id="sprout" pal={PAL_DARK} className="size-8" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-none text-gold-ink">{bookName ? `Книга ${bookName}` : "Книга рода"}</p>
            <p className="mt-1 text-lg font-semibold leading-tight text-ink">{who}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ShareInvite />
          <button type="button" onClick={() => setProjects(true)} className="glass grid size-11 place-items-center rounded-full text-ink" aria-label="Мои книги">
            <BookCopy className="size-5" />
          </button>
          <button type="button" onClick={() => setProfile(true)} className="glass grid size-11 place-items-center rounded-full text-ink" aria-label="Настройки">
            <Settings2 className="size-5" />
          </button>
        </div>
      </div>

      <h1 className="display-title one-line leading-[1.1] text-ink [--max:2.8rem]" style={lineStyle(heading)}>{heading}</h1>
      {facts.length && mode !== "new" ? <p className="mt-2 text-[15px] text-muted">{facts.slice(0, 3).join(", ")}</p> : null}

      <p className="hand mt-1 text-[1.6rem] leading-none text-gold-ink">{note}</p>

      <button
        type="button"
        onClick={heroGo}
        data-tour="hero"
        className="forest mt-5 block w-full rounded-2xl p-6 pb-24 text-left sm:pb-6 sm:pr-56"
        style={{ ["--forest-img" as string]: packBg("bg_8154") }}
      >
        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c9ae74]">{heroLabel}</span>
        <span className="mt-2 block max-w-[20ch] text-[1.75rem] font-semibold leading-[1.12] text-paper">{heroTitle}</span>
        <span className="mt-2 block max-w-[30ch] text-sm text-paper/75">{heroDetail}</span>
        <span className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-paper px-5 text-sm font-semibold text-ink">
          {mode === "going" ? "Открыть страницу" : "Начать"} <ArrowRight className="size-4" />
        </span>
        <Cut id={mode === "going" ? "moss_book_open" : "moss_book_closed"} className="pointer-events-none absolute -bottom-3 -right-4 -z-10 w-40 rotate-[7deg] sm:w-52" />
      </button>

      {mode !== "new" ? (
        <section className="mt-9">
          <div className="flex items-baseline justify-between border-b border-ink/15 pb-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Из чего складывается книга</h2>
            <span className="text-xs tabular-nums text-muted">{overall}%</span>
          </div>
          <ul>
            {parts.map((part) => (
              <li key={part.key} className="border-b border-ink/10">
                <button type="button" onClick={() => nav.go(partScreen(part.key))} className="flex min-h-14 w-full items-center gap-3 text-left active:bg-ink/5">
                  <PartIcon part={part.key} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink">{part.label.replace(/^[^\p{L}]+/u, "")}</span>
                    <span className="mt-1.5 block h-[2px] w-full bg-ink/10">
                      <span className="block h-full bg-gold" style={{ width: `${Math.max(part.value, 2)}%` }} />
                    </span>
                  </span>
                  <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted">{part.value}%</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {free && mode !== "going" ? (
        <button type="button" onClick={() => nav.go({ id: "lesson", lessonId: free.id })} className="relative mt-9 block w-full overflow-hidden rounded-3xl text-left shadow-2xl">
          <img src={`${import.meta.env.BASE_URL}course/site/free.jpg`} alt="" className="absolute inset-0 size-full scale-110 object-cover blur-md" draggable={false} />
          <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/20" />
          <span className="relative flex min-h-44 flex-col justify-end p-5">
            <span className="mb-3 w-fit rounded-full border border-paper/30 bg-paper/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-paper backdrop-blur-md">
              {freeDone ? "Урок пройден" : "Бесплатный урок"} · {free.minutes} мин
            </span>
            <span className="flex items-end gap-4 rounded-2xl border border-paper/25 bg-paper/15 p-4 backdrop-blur-xl">
              <span className="min-w-0 flex-1">
                <span className="block text-[1.3rem] font-semibold leading-tight text-paper">{free.title}</span>
                <span className="mt-1 block text-sm leading-snug text-paper/80">Смотрите первым: как создаётся Книга Рода с ИИ</span>
              </span>
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-paper/90 text-[#14160f]">
                <Play className="size-5 translate-x-0.5" />
              </span>
            </span>
          </span>
        </button>
      ) : null}

      <section className="mt-9">
        <div className="flex items-baseline justify-between border-b border-ink/15 pb-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Вопросы для семьи</h2>
          <button type="button" className="text-xs font-semibold text-moss underline" onClick={() => nav.tab({ id: "cards" })}>
            Все колоды
          </button>
        </div>
        {/* Карточки листаются вбок, как в Кики. */}
        <ul className="no-scrollbar -mx-5 mt-1 flex snap-x snap-mandatory scroll-pl-5 gap-9 overflow-x-auto px-11 py-9">
          {SITUATIONS.map((item, i) => (
            <li key={item.id} className={cn("relative w-[min(16rem,72vw)] shrink-0 snap-start", i === 0 && "mr-6", i === SITUATIONS.length - 1 && "ml-3 mr-6")}>
              {/* Мшистая рамка вокруг первой и последней колоды: поверх карточки не лезет на текст, края плашки подчёркивает. */}
              {i === 0 || i === SITUATIONS.length - 1 ? (
                <img
                  src={`${import.meta.env.BASE_URL}stickers/pack/moss_frame.webp`}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="pointer-events-none absolute z-20 select-none"
                  style={{ left: "-6.8%", top: "-9.7%", width: "116.8%", height: "123.1%", maxWidth: "none" }}
                />
              ) : null}
              <DeckLink item={item} saved={data.notes.filter((note) => note.situationId === item.id).length} onOpen={() => nav.go({ id: "deck", situationId: item.id })} liftCut={i === 0 || i === SITUATIONS.length - 1} />
              {/* Картинка колоды поверх мха и с тенью. */}
              {i === 0 || i === SITUATIONS.length - 1 ? <Cut id={catOf(item.id).cut} className="pointer-events-none absolute -bottom-2 -right-4 z-30 w-[5.8rem]" style={{ transform: `rotate(${catOf(item.id).tilt}deg)`, filter: "drop-shadow(0 6px 8px rgba(0,0,0,0.45))" }} /> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-9">
        <h2 className="border-b border-ink/15 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Ещё в мастерской</h2>
        <ul>
          <Row icon={PenLine} title="Расскажи историю" text="Первая любовь, дом детства, праздник: приложение задаёт вопросы и собирает черновик главы" onClick={() => nav.tab({ id: "stories" })} />
          {free ? <Row icon={GraduationCap} title="Бесплатный урок" text={`«${free.title}»: ${free.minutes} минут`} onClick={() => nav.go({ id: "lesson", lessonId: free.id })} /> : null}
          <Row icon={Camera} title="Оцифровать фотографию" text="Кто, где, какой год" onClick={() => nav.go({ id: "photo-new" })} />
          <Row icon={Clock} title="Лента времени" text={counts.events ? plural(counts.events, "событие", "события", "событий") : "Годы рядом друг с другом"} onClick={() => nav.go({ id: "archive", tab: "time" })} />
          <Row icon={Users} title="Семейный архив" text={counts.people ? plural(counts.people, "человек", "человека", "человек") : "Люди, места, бумаги"} onClick={() => nav.go({ id: "archive", tab: "people" })} />
        </ul>
      </section>

      {counts.people > 0 ? (
        <p className="mt-9 max-w-[30ch] text-[1.2rem] leading-snug text-ink/80">{reminder(data.audience, data.dedicatee)}</p>
      ) : null}

      <section className="mt-9 flex flex-wrap gap-2">
        <Button onClick={() => nav.tab({ id: "book" })}>
          <BookOpen className="size-4" /> {data.pages.length > 1 ? "Открыть книгу" : "Создать книгу"}
        </Button>
        {ready ? (
          <Button variant="soft" onClick={() => nav.tab({ id: "lessons" })}>
            Программа «Книга рода»
          </Button>
        ) : null}
      </section>

      <RemindersCard />
      <BackupCard hasData={total > 0 || data.pages.length > 1} />
      {data.programOpen ? <TransferCard hasData={total > 0 || data.pages.length > 1} /> : null}
      <InstallCard />

      <LegalLinks />

      <p className="hand mt-12 text-center text-[1.9rem] text-gold-ink">с любовью к роду</p>
      <Botanica id="sprout" pal={PAL_LIGHT} className="mx-auto mt-1 h-14 opacity-80" />

      {profile ? <ProfileSheet onClose={() => setProfile(false)} /> : null}
      {projects ? <ProjectsSheet onClose={() => setProjects(false)} /> : null}
    </ScreenFrame>
  );
}

function BackupCard({ hasData }: { hasData: boolean }) {
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(() => lastBackupAt());
  const old = last ? Date.now() - last.getTime() > 7 * 86400000 || changedSinceBackup() : hasData;
  const save = () => {
    setBusy(true);
    void exportBook()
      .then((mode) => {
        if (mode === "cancelled") return;
        setLast(lastBackupAt());
        toast(mode === "shared" ? "Копия готова: выберите «Сохранить в Файлы»" : "Копия сохранена в «Загрузки»");
      })
      .catch(() => toast("Копия не сохранилась"))
      .finally(() => setBusy(false));
  };
  return (
    <section data-tour="backup" className={cn("mt-9 rounded-2xl p-5", old && hasData ? "wash-blush" : "glass")}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Копия книги</h2>
      <p className="mt-1 text-[1.35rem] font-semibold leading-tight text-ink">
        {last ? `Последняя копия: ${last.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}` : hasData ? "Копии ещё нет" : "Здесь появится копия"}
      </p>
      <p className="mt-1 text-sm text-muted">Книга хранится только в этом телефоне или браузере, ни в каком аккаунте её нет. Сохраняйте копию после каждой работы: весь текст и все фото в одном файле. Его можно открыть на другом устройстве или положить в «Файлы».</p>
      <Button className="mt-4" onClick={save} disabled={busy || !hasData}>
        {busy ? "Собираю…" : "Скачать копию всей книги"}
      </Button>
    </section>
  );
}

function Row({ icon: Icon, title, text, onClick }: { icon: typeof Search; title: string; text: string; onClick: () => void }) {
  return (
    <li className="border-b border-ink/10">
      <button type="button" onClick={onClick} className="flex min-h-16 w-full items-center gap-4 text-left active:bg-ink/5">
        <Icon className="size-5 shrink-0 text-moss" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">{title}</span>
          <span className="block text-sm text-muted">{text}</span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted" />
      </button>
    </li>
  );
}

function ProfileSheet({ onClose }: { onClose: () => void }) {
  const audience = useRod((state) => state.audience);
  const dedicatee = useRod((state) => state.dedicatee);
  const collector = useRod((state) => state.collector);
  const update = useRod((state) => state.updateProfile);
  const resetAll = useRod((state) => state.resetAll);
  const [nextAudience, setNextAudience] = useState<Audience>(audience ?? "family");
  const [name, setName] = useState(dedicatee);
  const [mine, setMine] = useState(collector);
  const [confirmReset, setConfirmReset] = useState(false);
  const [install, setInstall] = useState(false);

  return (
    <Sheet title="Для кого эта книга" onClose={onClose}>
        <div className="grid gap-2">
          {AUDIENCES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setNextAudience(item.id)}
              className={cn(
                "rounded-2xl border px-4 py-3 text-left text-sm",
                nextAudience === item.id ? "border-night bg-white font-semibold" : "border-white/70 bg-white/40",
              )}
            >
              {item.title}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3">
          <Field label="Имя того, для кого собираете">
            <input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Марк" />
          </Field>
          <Field label="Ваше имя на обложке">
            <input className="field" value={mine} onChange={(event) => setMine(event.target.value)} />
          </Field>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              update({ audience: nextAudience, dedicatee: name, collector: mine });
              onClose();
            }}
          >
            Сохранить
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
        <div className="mt-6 rounded-3xl bg-white/60 p-4">
          <p className="font-semibold text-ink">Знакомство с приложением</p>
          <p className="mt-1 text-sm text-muted">Короткая экскурсия по разделам: что где лежит.</p>
          <Button variant="soft" className="mt-3" onClick={() => { onClose(); window.setTimeout(requestTour, 200); }}>
            Показать экскурсию
          </Button>
        </div>
        <div className="mt-6 rounded-3xl bg-white/60 p-4">
          <p className="font-semibold text-ink">Копия книги</p>
          <p className="mt-1 text-sm text-muted">Книга хранится только в этом браузере. Сохраняйте копию в файл – с ней книгу можно открыть на другом телефоне или iPad.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void exportBook().then((mode) => mode !== "cancelled" && toast(mode === "shared" ? "Копия готова: выберите «Сохранить в Файлы»" : "Копия сохранена в «Загрузки»")).catch(() => toast("Копия не сохранилась"))}>
              Сохранить копию
            </Button>
            <OpenCopyButton onDone={onClose} />
          </div>
        </div>
        <div className="mt-4">
          <Button variant="soft" onClick={() => setInstall(true)}>
            Значок на экране «Домой»
          </Button>
        </div>
        {install ? <InstallSheet onClose={() => setInstall(false)} /> : null}
        <div className="mt-4 border-t border-white/60 pt-4">
          {confirmReset ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="night"
                onClick={() => {
                  resetAll();
                  onClose();
                }}
              >
                Да, стереть всё на этом устройстве
              </Button>
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                Отмена
              </Button>
            </div>
          ) : (
            <button type="button" className="text-sm text-muted underline" onClick={() => setConfirmReset(true)}>
              Начать книгу заново
            </button>
          )}
        </div>
    </Sheet>
  );
}
