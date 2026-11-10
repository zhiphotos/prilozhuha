import { useEffect, useState } from "react";
import { Check, Users } from "lucide-react";
import { toast } from "sonner";
import { defaultDecision, summarize, type Change, type Decision, type ReviewItem } from "@/lib/rod/helper-changes";
import { helperChanges, helperSession, joinAsHelper, leaveHelper, rememberWho, reviewIncoming, applyIncoming, sendChanges, type HelperSession } from "@/lib/rod/helper";
import { Button } from "@/components/rod/chrome";
import { useMedia } from "@/lib/rod/media";
import { cn } from "@/lib/cn";

function Thumb({ rec }: { rec?: Record<string, unknown> }) {
  const src = useMedia(typeof rec?.dataUrl === "string" ? rec.dataUrl : typeof rec?.photo === "string" ? rec.photo : undefined);
  return src ? <img src={src} alt="" className="mt-1.5 max-h-28 rounded-lg" /> : null;
}

const FIELD: Record<string, string> = { name: "имя", firstName: "имя", lastName: "фамилия", patronymic: "отчество", relation: "кем приходится", birthYear: "год рождения", deathYear: "год смерти", birthPlace: "место рождения", maidenName: "девичья фамилия", notes: "заметки", parents: "родители", spouse: "супруг", siblingOf: "брат или сестра", title: "название", narrative: "текст", answer: "ответ", years: "годы", note: "заметка", line: "линия", gender: "пол", treeRank: "порядок на древе", treeSide: "сторона на древе" };
const KEYS = { people: "Человек", places: "Место", stories: "История", notes: "Заметка", pages: "Страница", photos: "Фото" } as const;
const label = (rec?: Record<string, unknown>) => String(rec?.name || rec?.title || rec?.what || rec?.who || [rec?.firstName, rec?.lastName].filter(Boolean).join(" ") || rec?.question || "без названия");
const show = (value: unknown) => (value === undefined || value === "" || value === null ? "пусто" : typeof value === "string" ? value : JSON.stringify(value));

/** Владелец: правки помощника по одной, с понятными пометками. Решать нужно только про спорное. */
export function ChangesCard({ changes, who, onDone }: { changes: Change[]; who: string; onDone: () => void }) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  useEffect(() => {
    void reviewIncoming(changes).then(setItems).catch(() => setItems([]));
  }, [changes]);
  const [choice, setChoice] = useState<Record<string, Decision>>({});
  const id = (i: ReviewItem) => `${i.key}:${i.id}`;
  const get = (i: ReviewItem) => choice[id(i)] ?? defaultDecision(i);
  if (!items) return <p className="text-sm text-muted">Получаю фото и сверяю с вашей книгой…</p>;
  const total = summarize(items);
  const open = items.filter((i) => i.state !== "already");
  const apply = () => {
    applyIncoming(items, choice, who);
    toast("Правки применены");
    onDone();
  };
  return (
    <div>
      <p className="text-sm text-ink/85">
        {total.added ? `Добавлено: ${total.added}. ` : ""}
        {total.edited ? `Исправлено: ${total.edited}. ` : ""}
        {total.removed ? `Предлагают убрать: ${total.removed}. ` : ""}
        {total.conflicts ? `Нужно решить самой: ${total.conflicts}.` : "Спорного нет."}
      </p>
      <ul className="mt-3 grid gap-2">
        {open.map((i) => (
          <li key={id(i)} className={cn("rounded-xl p-3 text-sm", i.state === "conflict" ? "bg-[#f6e7d0]" : "bg-white")}>
            <p className="font-semibold text-ink">
              {i.kind === "add" ? "Новое" : i.kind === "remove" ? "Убрать" : "Исправлено"}: {KEYS[i.key]} «{label((i.theirs ?? i.mine) as Record<string, unknown>)}»
            </p>
            {i.kind === "add" ? <Thumb rec={i.theirs as Record<string, unknown>} /> : null}
            {i.kind === "edit" && i.state !== "conflict" && i.touched.length ? <p className="mt-0.5 text-xs text-muted">{i.touched.map((f) => FIELD[f] ?? f).join(", ")}</p> : null}
            {i.state === "gone" ? <p className="mt-0.5 text-xs text-muted">Вы эту запись уже убрали, помощник её правил. Можно вернуть с его правкой.</p> : null}
            {i.state === "conflict" ? (
              <div className="mt-1.5 grid gap-1 text-xs">
                {i.fields.map((f) => (
                  <p key={f}>
                    <b>{FIELD[f] ?? f}:</b> у вас «{show(i.mine?.[f])}», у помощника «{show(i.theirs?.[f])}»
                  </p>
                ))}
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(i.state === "conflict" ? ([["reject", "Оставить моё"], ["theirs", "Взять помощника"], ...(i.key === "pages" || i.key === "stories" ? [["copy", "Обе, помощника копией"]] : [])] as [Decision, string][]) : i.state === "remove" ? ([["reject", "Оставить"], ["accept", "Убрать"]] as [Decision, string][]) : ([["accept", "Принять"], ["reject", "Не надо"]] as [Decision, string][])).map(([d, text]) => {
                const on = get(i) === d || (d === "theirs" && get(i) === "accept");
                return (
                  <button key={d} type="button" onClick={() => setChoice((c) => ({ ...c, [id(i)]: d }))} className={cn("min-h-9 rounded-full border px-3 text-xs font-semibold", on ? "border-moss bg-moss text-paper" : "border-ink/15 bg-white text-ink")}>
                    {on ? <Check className="mr-1 inline size-3" /> : null}
                    {text}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Button onClick={apply}>Применить выбранное</Button>
        <Button variant="ghost" onClick={onDone}>Не нужно</Button>
      </div>
    </div>
  );
}

/** Помощник: на странице приглашения. */
export function HelperJoin({ room, invite }: { room: string; invite: string }) {
  const [busy, setBusy] = useState("");
  const [ready, setReady] = useState(Boolean(helperSession()?.room === room));
  const start = async () => {
    setBusy("Открываю…");
    try {
      await joinAsHelper(room, invite, setBusy);
      setReady(true);
      toast("Книга открыта. Правьте древо, потом нажмите «Отправить правки».", { duration: 6000 });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не получилось.", { duration: 8000 });
    } finally {
      setBusy("");
    }
  };
  return (
    <section className="mt-6 rounded-2xl bg-white/70 p-5">
      <p className="flex items-center gap-2 font-semibold text-ink"><Users className="size-5 text-moss" /> Хотите править семейное древо?</p>
      <p className="mt-1 text-sm text-ink/80">Вы получите копию книги: древо, страницы и фото. Добавите людей, поправите ошибки, сделаете новые страницы. Хозяйка книги увидит, что вы изменили, и сама решит, что принять. Её книга от этого не сломается.</p>
      <Button className="mt-3 w-full" variant="soft" disabled={Boolean(busy)} onClick={() => void start()}>
        {busy ? busy : ready ? "Копия уже открыта" : "Открыть древо для правок"}
      </Button>
      {ready ? <p className="mt-2 text-xs text-muted">Если у вас уже есть своя книга, копия откроется отдельной книгой и ваша останется как была. Плашка «Отправить» внизу экрана.</p> : null}
    </section>
  );
}

/** Помощник: плашка с отправкой правок. Видна только тому, кто открыл книгу по ссылке помощника. */
export function HelperBar() {
  const [session, setSession] = useState<HelperSession | null>(() => helperSession());
  const [busy, setBusy] = useState("");
  const [asking, setAsking] = useState(false);
  const [who, setWho] = useState(() => helperSession()?.who ?? "");
  if (!session) return null;
  const count = helperChanges(session).length;
  const send = async () => {
    if (!who.trim()) return;
    setBusy("Отправляю…");
    try {
      rememberWho(who.trim());
      const n = await sendChanges(helperSession() ?? session, who.trim(), (d, t) => setBusy(`Фото ${d} из ${t}…`));
      setSession(helperSession());
      setAsking(false);
      toast(`Отправлено правок: ${n}. Хозяйка книги их посмотрит.`, { duration: 6000 });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не получилось отправить.", { duration: 6000 });
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-md rounded-2xl bg-[#14160f] p-3 pl-4 text-sm text-paper shadow-lg">
      <div className="flex items-center gap-2">
        <span className="flex-1 leading-tight">Вы помощник: {session.name}. {count ? `Правок: ${count}` : "Пока без правок"}</span>
        {asking ? null : <Button disabled={!count} onClick={() => (who.trim() ? void send() : setAsking(true))}>Отправить</Button>}
        <button type="button" aria-label="Закрыть режим помощника" className="px-2 text-paper/60" onClick={() => { leaveHelper(); setSession(null); }}>×</button>
      </div>
      {asking || (busy && !who.trim()) ? (
        <div className="mt-2 flex gap-2">
          <input autoFocus className="field min-h-11 flex-1 !bg-white/95 !text-ink" value={who} onChange={(event) => setWho(event.target.value)} placeholder="Как вас подписать? Например, Мама" />
          <Button disabled={!who.trim() || Boolean(busy)} onClick={() => void send()}>{busy || "Готово"}</Button>
        </div>
      ) : busy ? <p className="mt-1 text-xs text-paper/70">{busy}</p> : null}
      {who.trim() && !asking ? <button type="button" className="mt-1 text-xs text-paper/60 underline" onClick={() => setAsking(true)}>Подпись: {who}. Изменить</button> : null}
    </div>
  );
}
