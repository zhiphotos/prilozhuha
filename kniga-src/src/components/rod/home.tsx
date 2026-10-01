import { useState } from "react";
import { BookOpen, Camera, Clock, Quote, Search, Sparkles, Users } from "lucide-react";
import { AUDIENCES, audienceTitle, reminder } from "@/lib/rod/content";
import { countsOf, isBookReady, nextStep, overallOf, partsOf, plural } from "@/lib/rod/progress";
import { useRod } from "@/lib/rod/store";
import type { Audience } from "@/lib/rod/types";
import { cn } from "@/lib/cn";
import { Button, Field, ScreenFrame, useNav } from "@/components/rod/chrome";

export function HomeScreen() {
  const nav = useNav();
  const data = useRod();
  const snapshot = {
    people: data.people,
    places: data.places,
    photos: data.photos,
    stories: data.stories,
    documents: data.documents,
    notes: data.notes,
    events: data.events,
    audience: data.audience,
    dedicatee: data.dedicatee,
  };
  const parts = partsOf(snapshot);
  const overall = overallOf(parts);
  const counts = countsOf(snapshot);
  const step = nextStep(snapshot, overall);
  const ready = isBookReady(snapshot, overall);
  const [profile, setProfile] = useState(false);
  const who = data.dedicatee.trim() || audienceTitle(data.audience).replace(/^Для /, "для ");

  return (
    <ScreenFrame>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-night text-paper">
            <BookOpen className="size-5" />
          </span>
          <div>
            <p className="text-sm text-muted">Книга рода</p>
            <p className="font-display text-2xl leading-tight text-ink">{who}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setProfile(true)}
          className="glass rounded-full px-4 py-2 text-sm font-medium text-ink"
        >
          Для кого
        </button>
      </div>

      <section className="glass rounded-4xl p-5 sm:p-6">
        <p className="text-sm text-muted">Что ты уже знаешь о своей семье</p>
        <h2 className="mt-2 max-w-md font-display text-3xl leading-tight text-ink sm:text-4xl">
          Твоя семейная история заполнена на <span className="tabular-nums">{overall}%</span>
        </h2>
        <ul className="mt-5 grid gap-3">
          {parts.map((part) => (
            <li key={part.key}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="font-medium text-ink">{part.label}</span>
                <span className="tabular-nums text-muted">{part.value}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-rose" style={{ width: `${part.value}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        onClick={() => nav.go(step.screen)}
        className="wash-sage mt-3 w-full rounded-4xl p-5 text-left"
      >
        <p className="text-sm font-semibold text-ink">Следующий шаг</p>
        <p className="mt-1 font-display text-2xl text-ink">{step.title}</p>
        <p className="mt-1 text-sm text-muted">{step.detail}</p>
      </button>

      <section className="glass-dark mt-3 rounded-4xl p-5">
        <Quote className="size-5 text-blush" />
        <p className="mt-3 font-display text-2xl leading-snug text-paper">{reminder(data.audience, data.dedicatee)}</p>
      </section>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Action
          icon={Search}
          title="Откуда моя фамилия?"
          text="Происхождение, варианты написания и что проверить. Не обещание предков."
          onClick={() => nav.go({ id: "surname" })}
        />
        <Action
          icon={Sparkles}
          title="Расскажи историю"
          text="Пять вопросов — и черновик главы, который можно поправить."
          onClick={() => nav.tab({ id: "stories" })}
        />
        <Action
          icon={Camera}
          title="Оцифруй фотографию"
          text="Снимок останется с людьми, местом и годом, а не в безымянной папке."
          onClick={() => nav.go({ id: "photo-new" })}
        />
        <Action
          icon={Clock}
          title="Семейная лента"
          text={
            counts.events
              ? plural(counts.events, "событие уже стоит на линии", "события уже стоят на линии", "событий уже стоят на линии")
              : "Годы рядом друг с другом меняют масштаб собственной жизни."
          }
          onClick={() => nav.go({ id: "archive", tab: "time" })}
        />
      </div>

      <section className={cn("mt-3 rounded-4xl p-5", ready ? "wash-blush" : "glass")}>
        <Users className="size-5 text-rose-deep" />
        <h2 className="mt-3 font-display text-3xl text-ink">
          {ready ? "Ты собрал достаточно материала для своей первой книги рода." : "Книга собирается из того, что уже лежит здесь"}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {plural(counts.photos, "фотография", "фотографии", "фотографий")} · {plural(counts.people, "родственник", "родственника", "родственников")} ·{" "}
          {plural(counts.stories, "история", "истории", "историй")} · {plural(counts.places, "место", "места", "мест")} ·{" "}
          {plural(counts.notes, "разговор", "разговора", "разговоров")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => nav.go({ id: "book" })}>Создать книгу</Button>
          <Button variant="ghost" onClick={() => nav.go({ id: "lessons" })}>
            Программа «Книга рода»
          </Button>
        </div>
      </section>

      {profile ? <ProfileSheet onClose={() => setProfile(false)} /> : null}
    </ScreenFrame>
  );
}

function Action({
  icon: Icon,
  title,
  text,
  onClick,
}: {
  icon: typeof Search;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="glass rounded-4xl p-5 text-left">
      <Icon className="size-5 text-rose-deep" />
      <p className="mt-3 font-display text-2xl text-ink">{title}</p>
      <p className="mt-1 text-sm text-muted">{text}</p>
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
    <div className="fixed inset-0 z-40 grid place-items-end bg-ink/40 p-3 sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <div className="glass max-h-[90vh] w-full max-w-lg overflow-auto rounded-4xl p-5">
        <h2 id="profile-title" className="font-display text-3xl text-ink">
          Для кого эта книга
        </h2>
        <div className="mt-4 grid gap-2">
          {AUDIENCES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setNextAudience(item.id)}
              className={cn(
                "rounded-2xl border px-4 py-3 text-left text-sm",
                nextAudience === item.id ? "border-rose bg-blush/70 font-semibold" : "border-line",
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
        <div className="mt-6 border-t border-line pt-4">
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
      </div>
    </div>
  );
}
