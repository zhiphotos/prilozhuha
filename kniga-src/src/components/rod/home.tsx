import { useState } from "react";
import { ArrowRight, BookOpen, Camera, Clock, MessageCircle, Play, Quote, Search, Settings2, Sparkles, Users } from "lucide-react";
import { AUDIENCES, LESSONS, audienceTitle, reminder } from "@/lib/rod/content";
import { countsOf, isBookReady, nextStep, overallOf, partsOf, plural } from "@/lib/rod/progress";
import { useRod } from "@/lib/rod/store";
import type { Audience, Screen } from "@/lib/rod/types";
import { cn } from "@/lib/cn";
import { toast } from "sonner";
import { Button, Field, ScreenFrame, Sheet, useNav } from "@/components/rod/chrome";
import { exportBook, importBook } from "@/lib/rod/backup";

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
  const free = LESSONS.find((lesson) => lesson.free);
  const freeDone = free ? data.doneLessons.includes(free.id) : false;
  const who = data.dedicatee.trim() || audienceTitle(data.audience).replace(/^Для /, "для ");
  const partScreen = (key: string): Screen =>
    key === "family" ? { id: "archive", tab: "people" } : key === "places" ? { id: "archive", tab: "places" } : key === "photos" ? { id: "archive", tab: "photos" } : key === "stories" ? { id: "stories" } : { id: "archive", tab: "docs" };

  return (
    <ScreenFrame>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="sun-mark grid size-12 place-items-center rounded-full" aria-hidden />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/50">Книга рода</p>
            <p className="display-title text-2xl leading-tight text-ink">{who}</p>
          </div>
        </div>
        <button type="button" onClick={() => setProfile(true)} className="glass grid size-11 place-items-center rounded-full text-ink" aria-label="Настройки">
          <Settings2 className="size-5" />
        </button>
      </div>

      <h1 className="display-title text-[2.6rem] leading-[1.02] text-ink sm:text-6xl">
        Твоя история
        <br />
        заполнена на <span className="tabular-nums text-rose-deep">{overall}%</span>
      </h1>

      <section className="glass mt-5 rounded-[2rem] p-2">
        <ul className="grid">
          {parts.map((part) => (
            <li key={part.key}>
              <button type="button" onClick={() => nav.go(partScreen(part.key))} className="flex w-full items-center gap-3 rounded-[1.4rem] px-3 py-2.5 text-left active:bg-white/50">
                <span className="w-32 shrink-0 text-sm font-medium text-ink">{part.label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
                  <span className="block h-full rounded-full bg-gradient-to-r from-rose to-[#e2a35f]" style={{ width: `${Math.max(part.value, 3)}%` }} />
                </span>
                <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted">{part.value}%</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <button type="button" onClick={() => nav.go(step.screen)} className="glass-dark mt-3 flex w-full items-center gap-4 rounded-[2rem] p-5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-blush/80">Следующий шаг</span>
          <span className="display-title mt-1 block text-2xl text-paper">{step.title}</span>
          <span className="mt-1 block text-sm text-paper/70">{step.detail}</span>
        </span>
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-ink">
          <ArrowRight className="size-5" />
        </span>
      </button>

      {free ? (
        <button type="button" onClick={() => nav.go({ id: "lesson", lessonId: free.id })} className="aurora mt-3 block w-full overflow-hidden rounded-[2rem] p-5 text-left">
          <span className="flex items-center justify-between">
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-ink">{freeDone ? "Урок пройден" : "Бесплатный урок"}</span>
            <span className="grid size-11 place-items-center rounded-full bg-white text-ink shadow">
              <Play className="size-4 translate-x-px" />
            </span>
          </span>
          <span className="display-title mt-6 block text-[2rem] leading-[1.05] text-ink">{free.title}</span>
          <span className="mt-2 block text-sm text-ink/70">{free.minutes} минут · {free.lead}</span>
        </button>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Tile icon={Search} title="Откуда моя фамилия?" text="Значение, написание, регионы" tone="rose" onClick={() => nav.go({ id: "surname" })} />
        <Tile icon={MessageCircle} title="Карточки вопросов" text="С мамой, с папой, за столом" tone="sage" onClick={() => nav.tab({ id: "cards" })} />
        <Tile icon={Sparkles} title="Расскажи историю" text="11 шаблонов, 5–7 вопросов" onClick={() => nav.tab({ id: "stories" })} />
        <Tile icon={Camera} title="Оцифруй фото" text="Кто, где, какой год" onClick={() => nav.go({ id: "photo-new" })} />
        <Tile
          icon={Clock}
          title="Лента времени"
          text={counts.events ? plural(counts.events, "событие", "события", "событий") : "Годы рядом друг с другом"}
          onClick={() => nav.go({ id: "archive", tab: "time" })}
        />
        <Tile icon={Users} title="Семья" text={counts.people ? plural(counts.people, "человек", "человека", "человек") : "Начните с одного имени"} onClick={() => nav.go({ id: "archive", tab: "people" })} />
      </div>

      <section className="glass mt-3 rounded-[2rem] p-5">
        <Quote className="size-5 text-rose" />
        <p className="display-title mt-2 text-2xl leading-snug text-ink">{reminder(data.audience, data.dedicatee)}</p>
      </section>

      <section className={cn("mt-3 rounded-[2rem] p-5", ready ? "aurora" : "glass")}>
        <BookOpen className="size-5 text-rose-deep" />
        <h2 className="display-title mt-2 text-[1.7rem] leading-tight text-ink">
          {ready ? "Ты собрал(а) достаточно материала для своей первой книги рода" : "Книга собирается из того, что уже лежит здесь"}
        </h2>
        <p className="mt-2 text-sm text-ink/70">
          📸 {counts.photos} · 👨‍👩‍👧 {counts.people} · 📖 {counts.stories} · 📍 {counts.places} · 🎙️ {counts.notes}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => nav.tab({ id: "book" })}>📖 Создать книгу</Button>
          {ready ? (
            <Button variant="white" onClick={() => nav.tab({ id: "lessons" })}>
              Программа «Книга рода»
            </Button>
          ) : null}
        </div>
      </section>

      {profile ? <ProfileSheet onClose={() => setProfile(false)} /> : null}
    </ScreenFrame>
  );
}

function Tile({ icon: Icon, title, text, onClick, tone }: { icon: typeof Search; title: string; text: string; onClick: () => void; tone?: "rose" | "sage" }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex min-h-36 flex-col justify-between rounded-[1.8rem] p-4 text-left active:scale-[0.98]", tone === "rose" ? "wash-blush" : tone === "sage" ? "wash-sage" : "glass")}>
      <span className="grid size-10 place-items-center rounded-full bg-white/80 text-ink">
        <Icon className="size-[18px]" />
      </span>
      <span>
        <span className="block text-[15px] font-semibold leading-tight text-ink">{title}</span>
        <span className="mt-1 block text-xs text-ink/60">{text}</span>
      </span>
    </button>
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
          <p className="mt-1 text-sm text-muted">Книга хранится только в этом браузере. Сохраняйте копию в файл — с ней книгу можно открыть на другом телефоне или iPad.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void exportBook().then(() => toast("Копия сохранена в «Загрузки»")).catch(() => toast("Копия не сохранилась"))}>
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
