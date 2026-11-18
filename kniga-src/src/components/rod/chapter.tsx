import { useState } from "react";
import { toast } from "sonner";
import { Button, ScreenFrame, TopBar, useNav } from "@/components/rod/chrome";
import { writeChapter, type AiDeps, type ChapterStyle } from "@/lib/rod/ai-client";
import { API_BASE } from "@/lib/rod/config";
import { deviceId } from "@/lib/rod/pay";
import { useRod } from "@/lib/rod/store";

const STYLES: { id: ChapterStyle; label: string; hint: string }[] = [
  { id: "family", label: "Тёплый семейный", hint: "Как рассказывают за столом" },
  { id: "classic", label: "Классическая проза", hint: "Сдержанно, в духе Чехова и Бунина" },
  { id: "memoir", label: "От первого лица", hint: "Воспоминание: «я помню»" },
  { id: "essay", label: "Документальный очерк", hint: "Ясно, по порядку, с датами" },
  { id: "skaz", label: "Сказ", hint: "Народная неторопливая речь" },
];
const KEY = "kniga-chapter-draft";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as { text?: string; chapter?: string }; } catch { return {}; } };

/** Папка «Глава»: человек присылает рассказ, выбирает стиль, ИИ пишет главу. Факты берёт только из рассказа. */
export function ChapterScreen() {
  const nav = useNav();
  const programOpen = useRod((s) => s.programOpen);
  const access = useRod((s) => s.access);
  const saved = load();
  const [text, setText] = useState(saved.text ?? "");
  const [style, setStyle] = useState<ChapterStyle>("family");
  const [wish, setWish] = useState("");
  const [chapter, setChapter] = useState(saved.chapter ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [left, setLeft] = useState<number | null>(null);
  const keep = (t: string, c: string) => { try { localStorage.setItem(KEY, JSON.stringify({ text: t, chapter: c })); } catch { /* память переполнена */ } };

  if (!programOpen) {
    return (
      <ScreenFrame>
        <TopBar kicker="ИИ" title="Глава" onBack={() => nav.go({ id: "ai" })} />
        <p className="mb-4 text-base leading-snug">Здесь ваш рассказ о предке превращается в главу книги в выбранном стиле. Это входит в платную программу.</p>
        <Button onClick={() => nav.tab({ id: "lessons" })}>Узнать о программе</Button>
      </ScreenFrame>
    );
  }

  const write = async () => {
    if (busy || text.trim().length < 120) return;
    setBusy(true);
    setNote("");
    const deps: AiDeps = { apiBase: API_BASE, token: access?.token ?? "", deviceId: deviceId() };
    const res = await writeChapter(deps, { text: text.trim(), style, wish: wish.trim() }, crypto.randomUUID());
    setBusy(false);
    if (res.ok) { setChapter(res.data.chapter); setLeft(res.data.left); keep(text, res.data.chapter); }
    else { setNote(res.message); toast(res.message); }
  };
  const paragraphs = chapter.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <ScreenFrame>
      <TopBar kicker="ИИ" title="Глава" onBack={() => nav.go({ id: "ai" })} />
      <p className="mb-3 text-base leading-snug">Вставьте рассказ о человеке или событии: факты, воспоминания, расшифровку записи. Я напишу из него главу. Имена, даты и события беру только из вашего текста.</p>
      <textarea value={text} onChange={(e) => { setText(e.target.value); keep(e.target.value, chapter); }} rows={8} maxLength={6000} placeholder="Моя бабушка Елена торговала платками на рынке…" className="mb-1 w-full rounded-xl border border-ink/20 bg-paper p-3 text-base" />
      <p className="mb-3 text-xs text-muted">{text.trim().length < 120 ? "Нужно хотя бы несколько предложений." : `${text.length} из 6000 знаков`}</p>
      <p className="mb-2 text-sm font-semibold">Стиль</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {STYLES.map((s) => (
          <button key={s.id} type="button" title={s.hint} className={`min-h-11 rounded-full px-3 text-sm font-semibold ${style === s.id ? "bg-ink text-sheet" : "border border-line bg-white"}`} onClick={() => setStyle(s.id)}>{s.label}</button>
        ))}
      </div>
      <p className="mb-3 text-sm text-muted">{STYLES.find((s) => s.id === style)?.hint}</p>
      <input value={wish} onChange={(e) => setWish(e.target.value)} maxLength={300} placeholder="Пожелание: например, чтобы глава заканчивалась тихо" className="mb-3 w-full rounded-xl border border-ink/20 bg-paper p-3 text-base" />
      <Button disabled={busy || text.trim().length < 120} onClick={() => void write()}>{busy ? "Пишу главу…" : chapter ? "Написать заново" : "Написать главу"}</Button>
      {note ? <p role="status" className="mt-2 text-sm text-ink">{note}</p> : left !== null ? <p className="mt-2 text-sm text-muted">Глав сегодня осталось: {left}</p> : null}
      {paragraphs.length > 0 && (
        <article className="mt-5 rounded-2xl bg-white/80 p-4">
          {paragraphs.map((p, i) => (i === 0 ? <h2 key={i} className="mb-3 display-title text-2xl leading-tight">{p}</h2> : <p key={i} className="mb-3 text-base leading-relaxed whitespace-pre-line">{p}</p>))}
          <Button variant="ghost" onClick={() => { void navigator.clipboard?.writeText(chapter).then(() => toast("Глава скопирована")).catch(() => toast("Не удалось скопировать")); }}>Скопировать главу</Button>
        </article>
      )}
      <div className="h-24" />
    </ScreenFrame>
  );
}
