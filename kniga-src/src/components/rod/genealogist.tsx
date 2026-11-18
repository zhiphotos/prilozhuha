import { useEffect, useRef, useState, type ReactNode } from "react";
import { Archive, Compass, PenLine, Image as ImageIcon, LayoutTemplate, Mic, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { Button, ScreenFrame, TopBar, useNav } from "@/components/rod/chrome";
import { chatGenealogist, type AiDeps, type ChatMsg } from "@/lib/rod/ai-client";
import { AI_DEMOS, AiDemoSheet } from "@/components/rod/ai-demo";
import { API_BASE } from "@/lib/rod/config";
import { deviceId } from "@/lib/rod/pay";
import { useRod } from "@/lib/rod/store";

const STARTERS = ["Помоги найти предков в Бессарабии", "Расшифруй эту метрическую запись", "Где искать ревизские сказки?", "Как составить родословное дерево?"];
const KEY = "kniga-genealogist-chat";
type Turn = ChatMsg & { id: string; sources?: string[]; at: string };

/** Вкладка «ИИ»: сетка цветных папок, из которых торчат карточки. */
export function AiHubScreen() {
  const nav = useNav();
  const programOpen = useRod((s) => s.programOpen);
  const [demo, setDemo] = useState<string | null>(null);
  const list: { id: string; label: string; sub: string; tone: string; icon: ReactNode; go?: () => void }[] = [
    { id: "gen", label: "Генеалог", sub: "Ответы по справочникам", tone: "moss", icon: <Compass />, go: () => (programOpen ? nav.go({ id: "ai-genealogist" }) : setDemo("gen")) },
    { id: "ch", label: "Глава", sub: "Рассказ в стиле книги", tone: "sand", icon: <PenLine />, go: () => (programOpen ? nav.go({ id: "ai-chapter" }) : setDemo("ch")) },
    { id: "photo", label: "Старые фото", sub: "Скоро", tone: "sand", icon: <ImageIcon />, go: () => setDemo("photo") },
    { id: "iv", label: "Интервью", sub: "Запись в текст", tone: "bordo", icon: <Mic />, go: () => (programOpen ? nav.go({ id: "interviews" }) : setDemo("iv")) },
    { id: "lay", label: "Вёрстка страниц", sub: "Скоро", tone: "stone", icon: <LayoutTemplate />, go: () => setDemo("lay") },
    { id: "doc", label: "Старые документы", sub: "Скоро", tone: "moss", icon: <ScrollText />, go: () => setDemo("doc") },
    { id: "arc", label: "Поиск в архивах", sub: "В карточке человека", tone: "bordo", icon: <Archive />, go: () => (programOpen ? nav.go({ id: "archive", tab: "tree" }) : setDemo("arc")) },
  ];
  return (
    <ScreenFrame>
      <TopBar kicker="Помощник" title="ИИ" />
      {programOpen ? null : <p className="mb-3 rounded-2xl bg-white/60 p-3 text-base leading-snug">ИИ-помощники входят в платную программу. Здесь можно посмотреть, что они умеют.</p>}
      <div className="ai-grid">
        {list.map((f) => (
          <button key={f.id} type="button" className="ai-f" data-tone={f.tone} disabled={!f.go} onClick={f.go} aria-label={f.label}>
            <span className="ai-back" aria-hidden="true" />
            <span className="ai-peek" aria-hidden="true"><i /><i /></span>
            <span className="ai-front">
              <b>{f.label}</b>
              <small>{f.sub}</small>
              <span className="ai-ic" aria-hidden="true">{f.icon}</span>
            </span>
          </button>
        ))}
      </div>
      {demo && AI_DEMOS[demo] ? <AiDemoSheet demo={AI_DEMOS[demo]} onClose={() => setDemo(null)} /> : null}
    </ScreenFrame>
  );
}

const read = (): Turn[] => {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.slice(-30) : []; } catch { return []; }
};

/** Лёгкая разметка ответа: заголовки «#», жирный «**», списки. Без внешних библиотек и без вставки html. */
function Rich({ text }: { text: string }) {
  const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : part));
  return (
    <>
      {text.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="h-2" />;
        if (/^#{1,4}\s/.test(t)) return <p key={i} className="mt-2 font-semibold">{bold(t.replace(/^#{1,4}\s+/, ""))}</p>;
        if (/^[-*•]\s/.test(t)) return <p key={i} className="pl-4 -indent-3">• {bold(t.replace(/^[-*•]\s+/, ""))}</p>;
        return <p key={i}>{bold(t)}</p>;
      })}
    </>
  );
}

export function GenealogistScreen() {
  const nav = useNav();
  const programOpen = useRod((s) => s.programOpen);
  const access = useRod((s) => s.access);
  const stored = useRod((st) => st.aiChat);
  const addAiTurns = useRod((st) => st.addAiTurns);
  const clearAiChat = useRod((st) => st.clearAiChat);
  const [pending, setPending] = useState<Turn | null>(null);
  const sorted = [...stored].sort((a, b) => a.at.localeCompare(b.at));
  const turns: Turn[] = pending ? [...sorted, pending] : sorted;
  // Переписка раньше жила только в памяти браузера: переносим её в книгу один раз, чтобы она ушла в облако.
  useEffect(() => {
    const old = read();
    if (old.length && useRod.getState().aiChat.length === 0) addAiTurns(old.map((m, i) => ({ id: crypto.randomUUID(), role: m.role, text: m.text, sources: m.sources, at: new Date(Date.now() - (old.length - i) * 1000).toISOString() })));
    try { localStorage.removeItem(KEY); } catch { /* не страшно */ }
  }, [addAiTurns]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [left, setLeft] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [turns.length]);

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    const mine: Turn = { id: crypto.randomUUID(), role: "user", text: q, at: new Date().toISOString() };
    const next: Turn[] = [...sorted, mine].slice(-30);
    setPending(mine);
    setText("");
    setBusy(true);
    setNote("");
    const deps: AiDeps = { apiBase: API_BASE, token: access?.token ?? "", deviceId: deviceId() };
    const res = await chatGenealogist(deps, next.map(({ role, text: t }) => ({ role, text: t })), crypto.randomUUID());
    setBusy(false);
    setPending(null);
    if (res.ok) { addAiTurns([mine, { id: crypto.randomUUID(), role: "assistant", text: res.data.reply, sources: res.data.sources, at: new Date().toISOString() }]); setLeft(res.data.left); }
    else { setText(q); setNote(res.message); toast(res.message); }
  };

  if (!programOpen) {
    return (
      <ScreenFrame>
        <TopBar kicker="ИИ" title="Генеалог" onBack={() => nav.go({ id: "ai" })} />
        <p className="mb-4 text-base leading-snug">Генеалог отвечает по справочникам и помогает читать старые документы. Он входит в платную программу.</p>
        <Button onClick={() => nav.tab({ id: "lessons" })}>Узнать о программе</Button>
      </ScreenFrame>
    );
  }
  return (
    <ScreenFrame>
      <TopBar kicker="ИИ" title="Генеалог" onBack={() => nav.go({ id: "ai" })} />
      {turns.length === 0 ? (
        <div className="mb-4 grid gap-2">
          <p className="text-base leading-snug">Я помогу найти предков, найду, где лежат документы, и объясню старые записи. Спросите своё или начните с готового вопроса.</p>
          {STARTERS.map((s) => (
            <button key={s} type="button" onClick={() => void send(s)} className="story-saved w-full text-left"><span className="story-sheet-title block">{s}</span></button>
          ))}
        </div>
      ) : (
        <ul className="mb-3 grid gap-3">
          {turns.map((m, i) => (
            <li key={m.id} className={m.role === "user" ? "ml-8 rounded-2xl bg-moss px-4 py-3 text-paper" : "mr-4 rounded-2xl bg-white/80 px-4 py-3 text-ink"}>
              <div className="text-base leading-snug"><Rich text={m.text} /></div>
              {m.sources?.length ? <p className="mt-2 text-xs text-muted">Источник: {m.sources.join("; ")}</p> : m.role === "assistant" ? <p className="mt-2 text-xs text-muted">Из общих знаний, проверьте по документам.</p> : null}
            </li>
          ))}
          {busy ? <li className="mr-4 rounded-2xl bg-white/80 px-4 py-3 text-base text-muted">Думаю…</li> : null}
        </ul>
      )}
      {note ? <p role="status" className="mb-2 text-sm text-ink">{note}</p> : left !== null ? <p className="mb-2 text-sm text-muted">Вопросов сегодня осталось: {left}</p> : null}
      <div className="sticky bottom-24 z-10 mt-4 grid gap-2 rounded-2xl bg-paper/95 p-2 backdrop-blur">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder="Ваш вопрос генеалогу" className="w-full rounded-xl border border-ink/20 bg-paper p-3 text-base" />
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy || !text.trim()} onClick={() => void send(text)}>Спросить</Button>
          {turns.length ? <Button variant="ghost" onClick={() => { clearAiChat(); setNote(""); }}>Начать заново</Button> : null}
        </div>
      </div>
      <div ref={end} className="h-6" />
    </ScreenFrame>
  );
}
