import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/rod/chrome";
import { writeStories, type AiDeps } from "@/lib/rod/ai-client";
import { clock } from "@/lib/rod/audio-chunks";
import { mentions, splitParts, type StoryPart } from "@/lib/rod/interview-stories";
import { API_BASE } from "@/lib/rod/config";
import { deviceId } from "@/lib/rod/pay";
import { useRod } from "@/lib/rod/store";
import type { Interview, InterviewFact, MiniStory } from "@/lib/rod/types";

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
        if (/^Глава:/i.test(t)) return <h2 key={i} className="mb-2 mt-1 display-title text-2xl leading-tight">{t.replace(/^Глава:\s*/i, "")}</h2>;
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
  const parts = useMemo(() => splitParts(interview), [interview]);
  const minis = interview.minis ?? [];
  const addStory = useRod((st) => st.addStory);
  const [busyPart, setBusyPart] = useState(0);

  const write = async (part: StoryPart) => {
    if (busyPart) return;
    setBusyPart(part.n);
    setNote("");
    const deps: AiDeps = { apiBase: API_BASE, token: access?.token ?? "", deviceId: deviceId() };
    const res = await writeStories(deps, { text: part.text, wish: interview.context ?? "" }, crypto.randomUUID());
    setBusyPart(0);
    if (res.ok) {
      const fresh: MiniStory[] = res.data.stories.map((x) => ({ ...x, id: crypto.randomUUID(), part: part.n }));
      update(interview.id, { minis: [...minis, ...fresh] });
      toast(`Написала рассказов: ${fresh.length}`);
    } else { setNote(res.message); toast(res.message); }
  };
  const saveMini = (m: MiniStory) => {
    addStory({ templateId: "free", title: m.title, answers: {}, narrative: m.text });
    update(interview.id, { minis: minis.map((x) => (x.id === m.id ? { ...x, saved: true } : x)) });
    toast("Рассказ добавлен в «Истории»");
  };
  const addOnePerson = (f: InterviewFact) => {
    const { birthYear, deathYear } = yearsOf(f.years);
    addPerson({ name: f.title, relation: f.relation, birthYear, maidenName: "", notes: [f.detail, `Из интервью: «${f.quote}»`].filter(Boolean).join("\n"), ...(deathYear ? { deathYear } : {}), ...(f.place ? { birthPlace: f.place } : {}) });
    patchFact(interview.id, f.id, { added: "person", review: "confirmed" });
    toast(`${f.title} добавлена в древо`);
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
        <summary className="flex min-h-11 cursor-pointer items-center justify-between text-[17px] font-semibold text-ink">Рассказы из записи{minis.length ? <span className="text-sm font-normal text-muted">{minis.length}</span> : null}</summary>
        <p className="mb-2 text-sm text-muted">Я напишу из записи небольшие рассказы про конкретные случаи: кто участвовал, где и когда это было. Запись делится на части, каждая часть стоит одну главу из дневного лимита.</p>
        {programOpen ? (
          <ul className="mb-3 grid gap-2">
            {parts.map((part) => (
              <li key={part.n} className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2">
                <span className="min-w-0 flex-1 text-sm leading-snug"><b className="text-ink">Часть {part.n}</b>{part.from !== undefined ? <span className="text-muted"> · {clock(part.from)}–{clock(part.to ?? part.from)}</span> : null}{minis.some((m) => m.part === part.n) ? <span className="text-moss"> · есть рассказы</span> : null}</span>
                <Button variant="soft" disabled={busyPart !== 0} onClick={() => void write(part)}>{busyPart === part.n ? "Пишу…" : minis.some((m) => m.part === part.n) ? "Ещё раз" : "Написать"}</Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-2 text-sm text-muted">Рассказы по записи входят в платную программу.</p>
        )}
        {note ? <p role="status" className="mb-2 text-sm text-ink">{note}</p> : null}
        <ul className="grid gap-3">
          {minis.map((m) => (
            <li key={m.id} className="rounded-2xl bg-white/80 p-4">
              <h3 className="display-title text-xl leading-tight">{m.title}</h3>
              {m.at !== undefined ? <p className="mb-2 mt-1 text-sm font-semibold text-gold-ink">В записи с {clock(m.at)}</p> : null}
              {m.text.split(/\n{2,}/).map((p, i) => <p key={i} className="mb-2 text-base leading-relaxed">{p}</p>)}
              {m.people.length ? <p className="mb-2 text-sm text-muted">Люди: {m.people.map((p) => (p.relation ? `${p.name} (${p.relation})` : p.name)).join(", ")}{m.places.length ? `. Места: ${m.places.join(", ")}` : ""}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="soft" disabled={m.saved} onClick={() => saveMini(m)}>{m.saved ? "Уже в историях" : "Добавить в истории"}</Button>
                <Button variant="ghost" onClick={() => { void navigator.clipboard?.writeText(`${m.title}\n\n${m.text}`).then(() => toast("Рассказ скопирован")).catch(() => toast("Не удалось скопировать")); }}>Скопировать</Button>
                <Button variant="ghost" onClick={() => update(interview.id, { minis: minis.filter((x) => x.id !== m.id) })}>Удалить</Button>
              </div>
            </li>
          ))}
        </ul>
      </details>

      {people.length ? (
        <details open className="rounded-2xl border border-line bg-paper/40 px-3 py-2">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between text-[17px] font-semibold text-ink">Люди из рассказа<span className="text-sm font-normal text-muted">{people.length}</span></summary>
          <p className="mb-2 text-sm text-muted">Кто есть в рассказе, когда родился и кем приходится. Нажмите на человека: увидите, где про него говорилось и на какой секунде, и добавьте в древо одного. Или всех сразу.</p>
          <ul className="mb-2 grid gap-1.5">
            {people.map((f) => {
              const seen = mentions(interview, f.title);
              return (
                <li key={f.id} className="rounded-xl bg-white/60 px-3 py-2 text-base leading-snug">
                  <details>
                    <summary className="flex min-h-11 cursor-pointer items-center"><span><b>{f.title}</b>{line(f) ? <span className="text-muted"> · {line(f)}</span> : null}{f.added ? <span className="ml-2 text-sm text-moss">уже в древе</span> : null}</span></summary>
                    <div className="pb-2 text-sm leading-snug text-muted">
                      {f.quote ? <p className="mb-1">В записи{f.at !== undefined ? ` на ${clock(f.at)}` : ""}: «{f.quote}»</p> : null}
                      {seen.length ? <p className="mb-1 mt-2 font-semibold text-ink">Где говорится про человека:</p> : null}
                      {seen.map((m, i) => <p key={i} className="mb-1">{m.at !== undefined ? <b className="text-gold-ink">{clock(m.at)} </b> : null}«{m.text}»</p>)}
                      {!f.added ? <Button className="mt-2" variant="soft" onClick={() => addOnePerson(f)}>Добавить в древо</Button> : null}
                    </div>
                  </details>
                </li>
              );
            })}
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
