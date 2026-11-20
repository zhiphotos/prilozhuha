import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, ScreenFrame, Sheet, TopBar, useNav } from "@/components/rod/chrome";
import { InterviewChapter } from "@/components/rod/interview-chapter";
import { TranscribeSheet } from "@/components/rod/transcribe-sheet";
import { FactsRunner } from "@/components/rod/facts-runner";
import { clock } from "@/lib/rod/audio-chunks";
import { KIND_ORDER, KIND_TITLE, foundLine } from "@/lib/rod/interview-facts";
import { plural } from "@/lib/rod/progress";
import { useRod } from "@/lib/rod/store";
import type { Interview, InterviewFact } from "@/lib/rod/types";
import { Linkified } from "@/components/rod/linkified";

const dateOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
};

/** «Папка интервью»: все расшифровки с найденными фактами. */
export function InterviewsScreen() {
  const nav = useNav();
  const interviews = useRod((s) => s.interviews);
  const programOpen = useRod((s) => s.programOpen);
  const [transcribe, setTranscribe] = useState(false);
  const [adding, setAdding] = useState(false);
  return (
    <ScreenFrame>
      <TopBar kicker="Архив семьи" title="Интервью" onBack={() => nav.go({ id: "stories" })} />
      <p className="mb-4 text-base leading-snug text-ink/80">
        {interviews.length ? "Каждая расшифровка лежит здесь со своими людьми, местами, датами и историями. К каждому факту приложены слова из записи." : "Здесь будут лежать расшифровки интервью. После расшифровки я найду в них людей, места, даты и истории и приложу слова из записи, чтобы можно было проверить."}
      </p>
      {programOpen ? <Button className="mb-4 w-full" onClick={() => setTranscribe(true)}>Расшифровать интервью</Button> : null}
      <Button variant="ghost" className="mb-4 w-full" onClick={() => setAdding(true)}>Добавить прежнюю расшифровку</Button>
      <ul className="grid gap-3">
        {interviews.map((iv) => (
          <li key={iv.id}>
            <button type="button" onClick={() => nav.go({ id: "interview", interviewId: iv.id })} className="story-saved w-full text-left">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gold-ink">{dateOf(iv.createdAt)}{iv.duration ? `, запись ${clock(iv.duration)}` : ""}</span>
                <span className="story-sheet-title mt-0.5 block">{iv.title}</span>
                <span className="story-sheet-lead block">{iv.facts.length ? foundLine(iv.facts) : "Главное ещё не искала"}</span>
              </span>
              <span aria-hidden className="shrink-0 text-2xl text-ink/60">›</span>
            </button>
          </li>
        ))}
      </ul>
      {transcribe ? <TranscribeSheet onClose={() => setTranscribe(false)} /> : null}
      {adding ? <AddOldSheet onClose={() => setAdding(false)} /> : null}
    </ScreenFrame>
  );
}

const CERT_STYLE: Record<InterviewFact["certainty"], string> = {
  ясно: "border-moss/50 text-moss",
  неясно: "border-gold-ink/60 text-gold-ink",
  проверить: "border-ink/40 text-ink",
};

const yearsOf = (years: string) => {
  const found = years.match(/\d{4}/g) ?? [];
  return { birthYear: found[0] ?? "", deathYear: found[1] };
};

function FactCard({ interview, fact }: { interview: Interview; fact: InterviewFact }) {
  const patch = useRod((s) => s.patchFact);
  const addPerson = useRod((s) => s.addPerson);
  const addPlace = useRod((s) => s.addPlace);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState({ title: fact.title, detail: fact.detail, relation: fact.relation, years: fact.years, place: fact.place });
  const meta = [fact.relation, fact.years, fact.place].filter(Boolean).join(" · ");
  const field = (key: keyof typeof draft, label: string) => (
    <label className="grid gap-1 text-sm text-muted">
      {label}
      <input className="field w-full" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
    </label>
  );
  return (
    <li className={`rounded-2xl border bg-paper/70 p-3.5 ${fact.review === "wrong" ? "border-dashed border-ink/30 opacity-70" : "border-line"}`} data-review={fact.review}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold leading-tight text-ink">{fact.title}</p>
          {meta ? <p className="mt-0.5 text-sm text-muted">{meta}</p> : null}
        </div>
        {fact.review === "confirmed" ? <span className="shrink-0 rounded-full border border-moss/50 px-2 py-0.5 text-xs font-semibold text-moss">подтверждено</span> : <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${CERT_STYLE[fact.certainty]}`}>{fact.certainty}</span>}
      </div>
      {fact.detail ? <p className="mt-1.5 text-[15px] leading-snug text-ink">{fact.detail}</p> : null}
      <blockquote className="mt-2 border-l-2 border-gold/60 pl-3 text-[15px] leading-snug text-ink/85">«{fact.quote}»</blockquote>
      {fact.note ? <p className="mt-1.5 text-sm text-gold-ink"><Linkified text={fact.note} /></p> : null}
      {fact.at !== undefined ? <p className="mt-2 text-sm font-semibold text-gold-ink">Послушайте запись на {clock(fact.at)}</p> : null}
      {edit ? (
        <div className="mt-3 grid gap-2">
          {field("title", "Название")}
          {fact.kind === "people" ? <>{field("relation", "Кем приходится")}{field("years", "Годы жизни")}{field("place", "Место")}</> : null}
          {field("detail", "Пояснение")}
          <div className="flex gap-2">
            <Button onClick={() => { patch(interview.id, fact.id, { ...draft, review: "confirmed" }); setEdit(false); }}>Сохранить</Button>
            <Button variant="soft" onClick={() => setEdit(false)}>Отмена</Button>
          </div>
        </div>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {fact.review === "wrong" ? (
            <Button variant="soft" onClick={() => patch(interview.id, fact.id, { review: "new" })}>Вернуть</Button>
          ) : (
            <>
              <Button variant={fact.review === "confirmed" ? "soft" : "primary"} onClick={() => patch(interview.id, fact.id, { review: fact.review === "confirmed" ? "new" : "confirmed" })}>{fact.review === "confirmed" ? "Снять отметку" : "Подтверждаю"}</Button>
              <Button variant="soft" onClick={() => patch(interview.id, fact.id, { review: "wrong" })}>Неверно</Button>
              <Button variant="ghost" onClick={() => { setDraft({ title: fact.title, detail: fact.detail, relation: fact.relation, years: fact.years, place: fact.place }); setEdit(true); }}>Править</Button>
              {fact.kind === "people" && !fact.added ? (
                <Button
                  variant="soft"
                  onClick={() => {
                    const { birthYear, deathYear } = yearsOf(fact.years);
                    addPerson({ name: fact.title, relation: fact.relation, birthYear, maidenName: "", notes: [fact.detail, `Из интервью: «${fact.quote}»`].filter(Boolean).join("\n"), ...(deathYear ? { deathYear } : {}), ...(fact.place ? { birthPlace: fact.place } : {}) });
                    patch(interview.id, fact.id, { added: "person", review: "confirmed" });
                    toast("Добавила в древо");
                  }}
                >
                  Добавить в древо
                </Button>
              ) : null}
              {fact.kind === "places" && !fact.added ? (
                <Button
                  variant="soft"
                  onClick={() => {
                    addPlace({ name: fact.title, years: "", note: [fact.detail, `Из интервью: «${fact.quote}»`].filter(Boolean).join("\n") });
                    patch(interview.id, fact.id, { added: "place", review: "confirmed" });
                    toast("Добавила в места");
                  }}
                >
                  Добавить в места
                </Button>
              ) : null}
              {fact.added ? <span className="grid min-h-11 place-items-center px-2 text-sm text-moss">{fact.added === "person" ? "Уже в древе" : "Уже в местах"}</span> : null}
            </>
          )}
        </div>
      )}
    </li>
  );
}

/** Внутри папки: разделы с карточками фактов, проигрыватель момента и полный текст. */
export function InterviewScreen({ interviewId }: { interviewId: string }) {
  const nav = useNav();
  const interview = useRod((s) => s.interviews.find((i) => i.id === interviewId));
  const update = useRod((s) => s.updateInterview);
  const remove = useRod((s) => s.removeInterview);
  const [showHidden, setShowHidden] = useState(false);
  const sections = useMemo(() => KIND_ORDER.map((kind) => ({ kind, list: (interview?.facts ?? []).filter((f) => f.kind === kind) })).filter((s) => s.list.length), [interview?.facts]);
  if (!interview) {
    return (
      <ScreenFrame>
        <TopBar title="Интервью не найдено" onBack={() => nav.go({ id: "interviews" })} />
      </ScreenFrame>
    );
  }
  const hidden = interview.facts.filter((f) => f.review === "wrong").length;
  return (
    <ScreenFrame>
      <TopBar kicker={`${dateOf(interview.createdAt)}${interview.duration ? `, запись ${clock(interview.duration)}` : ""}`} title={interview.title} onBack={() => nav.go({ id: "interviews" })} />
      <p className="mb-3 rounded-2xl bg-ink/5 px-3 py-2 text-sm text-ink">{interview.facts.length ? foundLine(interview.facts) : "Главное в этом интервью ещё не искала."}</p>
      <p className="mb-3 text-sm text-muted">Саму запись приложение не хранит. У каждого факта указано время в вашем файле: откройте запись и послушайте это место.</p>
      <div className="mb-4"><FactsRunner interviewId={interview.id} /></div>
      {interview.facts.length ? <InterviewChapter interview={interview} /> : null}
      {sections.map(({ kind, list }) => {
        const shown = list.filter((f) => showHidden || f.review !== "wrong");
        if (!shown.length) return null;
        return (
          <details key={kind} open={kind === "people" || kind === "unclear"} className="mb-3 rounded-2xl border border-line bg-paper/40 px-3 py-2">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between text-[17px] font-semibold text-ink">
              {KIND_TITLE[kind]}
              <span className="text-sm font-normal text-muted">{shown.length}</span>
            </summary>
            <ul className="mb-2 mt-2 grid gap-2.5">
              {shown.map((fact) => (
                <FactCard key={fact.id} interview={interview} fact={fact} />
              ))}
            </ul>
          </details>
        );
      })}
      {hidden ? (
        <button type="button" className="mb-4 min-h-11 text-sm text-ink underline" onClick={() => setShowHidden((v) => !v)}>
          {showHidden ? "Скрыть отмеченное как неверное" : `Показать скрытое: ${hidden}`}
        </button>
      ) : null}
      <details className="mb-4 rounded-2xl border border-line bg-paper/40 px-3 py-2">
        <summary className="flex min-h-11 cursor-pointer items-center text-[17px] font-semibold text-ink">Полный текст</summary>
        <textarea className="field mb-2 min-h-64 w-full text-[15px] leading-snug" value={interview.text} onChange={(e) => update(interview.id, { text: e.target.value })} aria-label="Текст интервью" />
        <p className="mb-2 text-xs text-muted">Если поправите текст, нажмите «Найти заново»: карточки с уже отмеченным останутся.</p>
      </details>
      <button
        type="button"
        className="mb-8 min-h-11 text-sm text-ink/70 underline"
        onClick={() => {
          if (window.confirm(`Удалить интервью «${interview.title}» со всеми карточками? Это нельзя отменить.`)) {
            remove(interview.id);
            nav.go({ id: "interviews" });
          }
        }}
      >
        Удалить интервью
      </button>
    </ScreenFrame>
  );
}

/** Расшифровки, сделанные до появления папки: берём из «Историй» или вставляем текст. Таймкодов у них нет, цитаты всё равно сверяются с текстом. */
function AddOldSheet({ onClose }: { onClose: () => void }) {
  const nav = useNav();
  const stories = useRod((s) => s.stories);
  const interviews = useRod((s) => s.interviews);
  const addInterview = useRod((s) => s.addInterview);
  const [text, setText] = useState("");
  const old = useMemo(() => stories.filter((st) => st.templateId === "free" && st.narrative.trim().length >= 200 && !interviews.some((iv) => iv.text === st.narrative.trim())), [stories, interviews]);
  const create = (title: string, body: string) => {
    const plain = body.trim();
    if (plain.length < 200) return toast.error("Текст слишком короткий: нужно хотя бы несколько предложений.");
    const id = addInterview({ title: title || "Интервью", text: plain, segments: [], duration: 0 });
    onClose();
    nav.go({ id: "interview", interviewId: id });
  };
  return (
    <Sheet title="Прежняя расшифровка" onClose={onClose}>
      <p className="mb-3 text-base leading-snug text-ink/80">Выберите расшифровку, которая уже лежит у вас в «Историях», или вставьте текст. Потом нажмите «Найти главное в интервью». Времени в записи тут не будет, но слова из текста я приложу.</p>
      {old.length ? (
        <ul className="mb-4 grid gap-2">
          {old.map((st) => (
            <li key={st.id}>
              <button type="button" onClick={() => create(st.title, st.narrative)} className="story-saved w-full text-left">
                <span className="min-w-0 flex-1">
                  <span className="story-sheet-title block">{st.title}</span>
                  <span className="story-sheet-lead block">{st.narrative.trim().slice(0, 90)}…</span>
                </span>
                <span aria-hidden className="shrink-0 text-2xl text-ink/60">›</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <label className="mb-1 block text-sm font-semibold">Или вставьте текст</label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="mb-3 w-full rounded-xl border border-ink/20 bg-paper p-3 text-base" placeholder="Вставьте расшифровку сюда" />
      <Button className="w-full" onClick={() => create("Интервью", text)}>Добавить в папку</Button>
    </Sheet>
  );
}
