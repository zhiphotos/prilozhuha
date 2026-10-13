import { useState } from "react";
import { ArrowRight, BookCopy, BookOpen, Camera, Clock, Play, Search, Settings2, Users } from "lucide-react";
import { Botanica, Cut, PAL_DARK, PAL_LIGHT, packBg } from "@/components/rod/botanica";
import { filledCount } from "@/components/rod/contents-sheet";
import { AUDIENCES, LESSONS, audienceTitle, reminder } from "@/lib/rod/content";
import { countsOf, isBookReady, nextStep, overallOf, partsOf, plural } from "@/lib/rod/progress";
import { useRod } from "@/lib/rod/store";
import type { Audience, Screen } from "@/lib/rod/types";
import { cn } from "@/lib/cn";
import { toast } from "sonner";
import { Button, Field, ScreenFrame, Sheet, lineStyle, useNav } from "@/components/rod/chrome";
import { exportBook, importBook, lastBackupAt } from "@/lib/rod/backup";
import { InstallCard, InstallSheet } from "@/components/rod/install-hint";
import { ProjectsSheet } from "@/components/rod/projects-sheet";
import { activeProjectId, listProjects } from "@/lib/rod/projects";

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
  const last = worked[worked.length - 1];
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
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="sun-mark grid size-12 place-items-center rounded-full" aria-hidden>
            <Botanica id="sprout" pal={PAL_DARK} className="size-8" />
          </span>
          <div>
            <p className="display-title text-[1.1rem] leading-none text-gold-ink">{bookName ? `Книга ${bookName}` : "Книга рода"}</p>
            <p className="mt-1 text-lg font-semibold leading-tight text-ink">{who}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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

      <p className="mt-3 text-[15px] text-muted">{note}</p>

      <button
        type="button"
        onClick={heroGo}
        className="forest mt-1 block w-full rounded-2xl p-6 pb-24 text-left sm:pb-6 sm:pr-56"
        style={{ ["--forest-img" as string]: packBg("bg_8154") }}
      >
        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c9ae74]">{heroLabel}</span>
        <span className="mt-2 block max-w-[20ch] text-[1.75rem] font-semibold leading-[1.12] text-paper">{heroTitle}</span>
        <span className="mt-2 block max-w-[30ch] text-sm text-paper/75">{heroDetail}</span>
        <span className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-paper px-5 text-sm font-semibold text-ink">
          {mode === "going" ? "Открыть страницу" : "Приступить"} <ArrowRight className="size-4" />
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
            {parts.map((part, index) => (
              <li key={part.key} className="border-b border-ink/10">
                <button type="button" onClick={() => nav.go(partScreen(part.key))} className="flex min-h-14 w-full items-center gap-3 text-left active:bg-ink/5">
                  <span className="w-6 shrink-0 text-xs tabular-nums text-gold-ink">{String(index + 1).padStart(2, "0")}</span>
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
        <button type="button" onClick={() => nav.go({ id: "lesson", lessonId: free.id })} className="aurora mt-9 flex w-full items-center gap-4 rounded-2xl p-5 text-left">
          <span className="min-w-0 flex-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-ink">{freeDone ? "Урок пройден" : "Бесплатный урок"}</span>
            <span className="mt-1 block text-[1.35rem] font-semibold leading-[1.15] text-ink">{free.title}</span>
            <span className="mt-1 block text-sm text-ink/75">{free.minutes} минут</span>
          </span>
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-moss text-paper">
            <Play className="size-4 translate-x-px" />
          </span>
        </button>
      ) : null}

      <section className="mt-9">
        <h2 className="border-b border-ink/15 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Ещё в мастерской</h2>
        <ul>
          <Row icon={Search} title="Откуда моя фамилия?" text="Значение, написание, регионы" onClick={() => nav.go({ id: "surname" })} />
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

      <BackupCard hasData={total > 0 || data.pages.length > 1} />
      <InstallCard />

      <p className="mt-12 text-center text-sm text-muted">с любовью к роду</p>
      <Botanica id="sprout" pal={PAL_LIGHT} className="mx-auto mt-1 h-14 opacity-80" />

      {profile ? <ProfileSheet onClose={() => setProfile(false)} /> : null}
      {projects ? <ProjectsSheet onClose={() => setProjects(false)} /> : null}
    </ScreenFrame>
  );
}

function BackupCard({ hasData }: { hasData: boolean }) {
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(() => lastBackupAt());
  const old = last ? Date.now() - last.getTime() > 7 * 86400000 : hasData;
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
    <section className={cn("mt-9 rounded-2xl p-5", old && hasData ? "wash-blush" : "glass")}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Копия книги</h2>
      <p className="mt-1 text-[1.35rem] font-semibold leading-tight text-ink">
        {last ? `Последняя копия: ${last.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}` : hasData ? "Копии ещё нет" : "Здесь появится копия"}
      </p>
      <p className="mt-1 text-sm text-muted">Весь текст и все фото в одном файле. Его можно открыть на другом телефоне или сохранить в «Файлы», чтобы ничего не потерять.</p>
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
          <p className="font-semibold text-ink">Копия книги</p>
          <p className="mt-1 text-sm text-muted">Книга хранится только в этом браузере. Сохраняйте копию в файл – с ней книгу можно открыть на другом телефоне или iPad.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void exportBook().then((mode) => mode !== "cancelled" && toast(mode === "shared" ? "Копия готова: выберите «Сохранить в Файлы»" : "Копия сохранена в «Загрузки»")).catch(() => toast("Копия не сохранилась"))}>
              Сохранить копию
            </Button>
            <label className="glass inline-flex min-h-11 cursor-pointer items-center rounded-full px-5 text-sm font-semibold text-ink">
              Открыть копию
              <input
                type="file"
                accept=".kniga,application/json"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  void importBook(file)
                    .then(() => {
                      toast("Книга загружена из копии");
                      onClose();
                    })
                    .catch((error: unknown) => toast(error instanceof Error ? error.message : "Копия не открылась"));
                }}
              />
            </label>
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
