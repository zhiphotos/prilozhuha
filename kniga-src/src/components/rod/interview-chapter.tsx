import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/rod/chrome";
import { writeChapter, type AiDeps } from "@/lib/rod/ai-client";
import { API_BASE } from "@/lib/rod/config";
import { buildFragments } from "@/lib/rod/interview-chapter";
import { deviceId } from "@/lib/rod/pay";
import { useRod } from "@/lib/rod/store";
import type { Interview, InterviewFact } from "@/lib/rod/types";

const yearsOf = (years: string) => {
  const found = years.match(/\d{4}/g) ?? [];
  return { birthYear: found[0] ?? "", deathYear: found[1] };
};

/** «**жирное**» и ссылки на фрагменты [3] или [2, 5] (маленькими цифрами, смысл раскрывает список «Откуда»). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[\d+(?:[,\s]+\d+)*\])/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <b key={i}>{part.slice(2, -2)}</b>;
    if (/^\[\d/.test(part)) return <sup key={i} className="text-[11px] text-muted">{part}</sup>;
    return part;
  });
}

function ChapterText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return null;
        if (/^Глава:/i.test(t)) return <h2 key={i} className="mb-2 mt-1 font-serif text-2xl leading-tight">{t.replace(/^Глава:\s*/i, "")}</h2>;
        if (/^\*\*[^*]+\*\*$/.test(t) || /^#{1,4}\s/.test(t)) return <h3 key={i} className="mb-1 mt-4 text-[17px] font-semibold text-ink">{t.replace(/^#{1,4}\s+/, "").replace(/\*\*/g, "")}</h3>;
        if (/^[-*•]\s/.test(t)) return <p key={i} className="mb-1 pl-4 -indent-3 text-base leading-relaxed">• {inline(t.replace(/^[-*•]\s+/, ""))}</p>;
        return <p key={i} className="mb-2 text-base leading-relaxed">{inline(t)}</p>;
      })}
    </>
  );
}

/** На экране интервью: рассказ-глава, отдельно люди (для древа) и отдельно места для изучения. Люди и места берутся из карточек, без лишних запросов к ИИ. */
export function InterviewChapter({ interview }: { interview: Interview }) {
  const access = useRod((s) => s.access);
  const programOpen = useRod((s) => s.programOpen);
  const update = useRod((s) => s.updateInterview);
  const patchFact = useRod((s) => s.patchFact);
  const addPerson = useRod((s) => s.addPerson);
  const addPlace = useRod((s) => s.addPlace);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const live = interview.facts.filter((f) => f.review !== "wrong");
  const people = live.filter((f) => f.kind === "people");
  const places = live.filter((f) => f.kind === "places");
  const fragments = useMemo(() => buildFragments(interview), [interview]);

  const write = async () => {
    if (busy || fragments.sources.length < 3) return;
    setBusy(true);
    setNote("");
    const deps: AiDeps = { apiBase: API_BASE, token: access?.token ?? "", deviceId: deviceId() };
    const res = await writeChapter(deps, { text: fragments.text, style: "interview", wish: interview.context ?? "" }, crypto.randomUUID());
    setBusy(false);
    if (res.ok) update(interview.id, { chapter: res.data.chapter, chapterSources: fragments.sources });
    else { setNote(res.message); toast(res.message); }
  };

  const addAllPeople = () => {
    const todo = people.filter((f) => !f.added);
    for (const f of todo) {
      const { birthYear, deathYear } = yearsOf(f.years);
      addPerson({ name: f.title, relation: f.relation, birthYear, maidenName: "", notes: [f.detail, `Из интервью: «${f.quote}»`].filter(Boolean).join("\n"), ...(deathYear ? { deathYear } : {}), ...(f.place ? { birthPlace: f.place } : {}) });
      patchFact(interview.id, f.id, { added: "person", review: "confirmed" });
    }
    toast(`Добавила в древо: ${todo.length}`);
  };
  const addAllPlaces = () => {
    const todo = places.filter((f) => !f.added);
    for (const f of todo) {
      addPlace({ name: f.title, years: "", note: [f.detail, `Из интервью: «${f.quote}»`].filter(Boolean).join("\n") });
      patchFact(interview.id, f.id, { added: "place", review: "confirmed" });
    }
    toast(`Добавила в места: ${todo.length}`);
  };
  const line = (f: InterviewFact) => [f.relation, f.years, f.place].filter(Boolean).join(" · ");

  return (
    <div className="mb-4 grid gap-3">
      <details open className="rounded-2xl border border-line bg-paper/40 px-3 py-2">
        <summary className="flex min-h-11 cursor-pointer items-center text-[17px] font-semibold text-ink">Рассказ: глава по интервью</summary>
        {interview.chapter ? (
          <article className="mb-2 mt-1"><ChapterText text={interview.chapter} /></article>
        ) : (
          <p className="mb-2 text-sm text-muted">{fragments.sources.length < 3 ? "Сначала найдите главное в интервью: глава собирается из найденного." : "ИИ соберёт из найденного связный рассказ: по темам, с цитатами и вопросами, что уточнить."}</p>
        )}
        {programOpen ? (
          <Button className="mb-2 w-full" disabled={busy || fragments.sources.length < 3} onClick={() => void write()}>{busy ? "Пишу главу…" : interview.chapter ? "Написать заново" : "Написать главу"}</Button>
        ) : (
          <p className="mb-2 text-sm text-muted">Глава по интервью входит в платную программу.</p>
        )}
        {note ? <p role="status" className="mb-2 text-sm text-ink">{note}</p> : <p className="mb-2 text-xs text-muted">Такая глава считается за две из дневного лимита глав.</p>}
        {interview.chapter && interview.chapterSources?.length ? (
          <details className="mb-2 rounded-xl bg-white/60 px-3 py-2">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-ink">Откуда: фрагменты записи</summary>
            <ol className="grid gap-1.5 pb-2 text-sm leading-snug text-muted">
              {interview.chapterSources.map((s) => <li key={s.n}><b className="text-ink">[{s.n}]</b> {s.label}{s.quote ? ` «${s.quote}»` : ""}</li>)}
            </ol>
          </details>
        ) : null}
        {interview.chapter ? <Button variant="ghost" onClick={() => { void navigator.clipboard?.writeText(interview.chapter ?? "").then(() => toast("Глава скопирована")).catch(() => toast("Не удалось скопировать")); }}>Скопировать главу</Button> : null}
      </details>

      {people.length ? (
        <details open className="rounded-2xl border border-line bg-paper/40 px-3 py-2">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between text-[17px] font-semibold text-ink">Люди из рассказа<span className="text-sm font-normal text-muted">{people.length}</span></summary>
          <p className="mb-2 text-sm text-muted">Кто есть в рассказе, когда родился и кем приходится. Можно добавить всех в древо сразу.</p>
          <ul className="mb-2 grid gap-1.5">
            {people.map((f) => (
              <li key={f.id} className="rounded-xl bg-white/60 px-3 py-2 text-base leading-snug">
                <b>{f.title}</b>{line(f) ? <span className="text-muted"> · {line(f)}</span> : null}
                {f.added ? <span className="ml-2 text-sm text-moss">уже в древе</span> : null}
              </li>
            ))}
          </ul>
          {people.some((f) => !f.added) ? <Button className="mb-2 w-full" variant="soft" onClick={addAllPeople}>Добавить всех в древо</Button> : null}
        </details>
      ) : null}

      {places.length ? (
        <details open className="rounded-2xl border border-line bg-paper/40 px-3 py-2">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between text-[17px] font-semibold text-ink">Места, которые стоит изучить<span className="text-sm font-normal text-muted">{places.length}</span></summary>
          <p className="mb-2 text-sm text-muted">Для каждого места узнайте, в какой области и уезде оно было раньше, и поищите там метрические книги. Это можно сделать в поиске по архивам.</p>
          <ul className="mb-2 grid gap-1.5">
            {places.map((f) => (
              <li key={f.id} className="rounded-xl bg-white/60 px-3 py-2 text-base leading-snug">
                <b>{f.title}</b>{f.detail ? <span className="text-muted"> · {f.detail}</span> : null}
                {f.added ? <span className="ml-2 text-sm text-moss">уже в местах</span> : null}
              </li>
            ))}
          </ul>
          {places.some((f) => !f.added) ? <Button className="mb-2 w-full" variant="soft" onClick={addAllPlaces}>Добавить все в места</Button> : null}
        </details>
      ) : null}
    </div>
  );
}
