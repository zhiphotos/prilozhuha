import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Users } from "lucide-react";
import { toast } from "sonner";
import { defaultDecision, summarize, type Change, type Decision, type ReviewItem } from "@/lib/rod/helper-changes";
import { discardHeld, helperOverview, helperSession, joinAsHelper, leaveHelper, rememberWho, resendHeld, reviewIncoming, applyIncoming, sendChanges, subscribeSession, type HelperSession } from "@/lib/rod/helper";
import type { Verdict } from "@/lib/rod/helper-verdicts";
import { Button, useNav } from "@/components/rod/chrome";
import { useMedia } from "@/lib/rod/media";
import { cn } from "@/lib/cn";
import { useRod } from "@/lib/rod/store";

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
    const stale = applyIncoming(changes, items, choice, who);
    if (stale.length) {
      setItems(stale);
      setChoice({});
      toast("Часть предложений не применена: запись изменилась");
      return;
    }
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
            {i.changedSince ? <p className="mt-0.5 text-xs text-ink/80">Вы изменили эту запись после того, как пришло предложение. Теперь значения расходятся: выберите, что оставить. Ничего не потеряно.</p> : null}
            {i.state === "gone" ? <p className="mt-0.5 text-xs text-muted">Вы эту запись уже убрали, помощник её правил. Можно вернуть с его правкой.</p> : null}
            {i.wasPublished ? <p className="mt-0.5 text-xs text-ink/80">Эту запись вы раньше выкладывали для помощников, а сейчас её у вас нет. Сама она не вернётся: вернуть её можно, только нажав «Принять».</p> : null}
            {i.state === "conflict" && i.conflictKind === "edit-after-delete" ? <p className="mt-0.5 text-xs text-ink/80">Вы эту запись убрали, а помощник её правил. Она не вернётся, пока вы сами не решите.</p> : null}
            {i.state === "conflict" && i.conflictKind === "delete-edit" ? <p className="mt-0.5 text-xs text-ink/80">Помощник предлагает убрать эту запись, а вы её правили. Запись остаётся, пока вы сами не решите.</p> : null}
            {i.state === "conflict" && i.conflictKind === "fields" && i.touched.some((f) => !i.fields.includes(f)) ? <p className="mt-0.5 text-xs text-muted">Без спора добавится: {i.touched.filter((f) => !i.fields.includes(f)).map((f) => FIELD[f] ?? f).join(", ")}.</p> : null}
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
              {(i.state === "conflict" && i.conflictKind === "delete-edit" ? ([["reject", "Оставить запись"], ["theirs", "Убрать, как просит помощник"]] as [Decision, string][]) : i.state === "conflict" && i.conflictKind === "edit-after-delete" ? ([["reject", "Не возвращать"], ["theirs", "Вернуть с правкой помощника"], ...(i.key === "pages" || i.key === "stories" ? [["copy", "Вернуть копией"]] : [])] as [Decision, string][]) : i.state === "conflict" ? ([["reject", "Оставить моё"], ["theirs", "Взять помощника"], ...(i.key === "pages" || i.key === "stories" ? [["copy", "Обе, помощника копией"]] : [])] as [Decision, string][]) : i.state === "remove" ? ([["reject", "Оставить"], ["accept", "Убрать"]] as [Decision, string][]) : ([["accept", "Принять"], ["reject", "Не надо"]] as [Decision, string][])).map(([d, text]) => {
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
  const nav = useNav();
  const [busy, setBusy] = useState("");
  const [ready, setReady] = useState(Boolean(helperSession()?.room === room));
  const start = async () => {
    setBusy("Открываю…");
    try {
      await joinAsHelper(room, invite, setBusy);
      setReady(true);
      nav.replace({ id: "home" });
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

const sessionText = () => localStorage.getItem("kniga-helper") ?? "";
const readText = () => {
  try {
    return sessionText();
  } catch {
    return "";
  }
};

const verdictTitle = (v: Verdict) => `${KEYS[v.key]} «${label((v.theirs && v.kind === "remove" ? v.theirs : v.mine) as Record<string, unknown> | undefined)}»`;

/** Помощник: плашка с отправкой правок. Видна только тому, кто открыл книгу по ссылке помощника. */
export function HelperBar() {
  useSyncExternalStore(subscribeSession, readText); // экран обновляется, когда сессия изменилась: обход, решение владельца, перезапуск
  const session: HelperSession | null = helperSession();
  // счётчик «Не отправлено» следит за самой книгой, а не только за сессией: правка видна сразу, без перехода на другой экран
  for (const key of ["people", "places", "stories", "notes", "pages", "photos"] as const) useRod((state) => (state as unknown as Record<string, unknown>)[key]);
  const [busy, setBusy] = useState("");
  const [asking, setAsking] = useState(false);
  const [confirmDrop, setConfirmDrop] = useState(false);
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState(() => helperSession()?.who ?? "");
  if (!session) return null;
  const view = helperOverview(session);
  const count = view.fresh;
  const held = view.rejected.length + view.conflicts.length;
  const more = held > 0 || view.history.length > 0;
  const send = async () => {
    if (!who.trim()) return;
    setBusy("Отправляю…");
    try {
      rememberWho(who.trim());
      const n = await sendChanges(helperSession() ?? session, who.trim(), (d, t) => setBusy(`Фото ${d} из ${t}…`));
      setAsking(false);
      toast(`Отправлено правок: ${n}. Хозяйка книги их посмотрит.`, { duration: 6000 });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не получилось отправить.", { duration: 6000 });
    } finally {
      setBusy("");
    }
  };
  const lines = [
    count ? `Не отправлено: ${count}` : "",
    view.waiting.length ? `Отправлено, ждёт решения владельца: ${view.waiting.length}` : "",
    view.accepted.length ? `Принято владельцем: ${view.accepted.length}` : "",
    view.rejected.length ? `Не принято, сохранено у вас: ${view.rejected.length}` : "",
    view.conflicts.length ? `Конфликт с правкой владельца: ${view.conflicts.length}` : "",
  ].filter(Boolean);
  return (
    <div className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-md rounded-2xl bg-[#14160f] p-3 pl-4 text-sm text-paper shadow-lg">
      <div className="flex items-center gap-2">
        <span className="flex-1 leading-tight">Вы помощник: {session.name}.{lines.length ? "" : " Пока без правок"}</span>
        {asking ? null : <Button disabled={!count} onClick={() => (who.trim() ? void send() : setAsking(true))}>Отправить</Button>}
        <button type="button" aria-label="Закрыть режим помощника" className="px-2 text-paper/60" onClick={() => { leaveHelper(); }}>×</button>
      </div>
      {lines.length ? (
        <ul role="status" className="mt-1 grid gap-0.5 text-xs text-paper/85">
          {lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      ) : null}
      {more ? (
        <div className="mt-2">
          <button type="button" className="text-xs text-paper/70 underline" onClick={() => setOpen((v) => !v)}>{open ? "Скрыть подробности" : held ? "Что именно не принято" : "История решений"}</button>
          {open ? (
            <ul className="mt-1 grid gap-1.5 text-xs">
              {[...view.conflicts, ...view.rejected].map((v) => (
                <li key={`${v.key}:${v.id}`} className="rounded-lg bg-white/10 p-2">
                  <p className="font-semibold">{verdictTitle(v)}</p>
                  {v.state === "conflict" ? (
                    <>
                      <p className="mt-0.5 text-paper/80">Владелец сам изменил эту запись. Ваша правка не потеряна и не перезаписана, но решить, чья версия останется, нужно вместе.{v.resent ? " Вы отправили её владельцу снова, ждём его решения." : ""}</p>
                      {(v.fields ?? []).map((f) => (
                        <p key={f}><b>{FIELD[f] ?? f}:</b> у вас «{show(v.mine?.[f])}», у владельца «{show(v.theirs?.[f])}»</p>
                      ))}
                    </>
                  ) : <p className="mt-0.5 text-paper/80">Владелец эту правку не принял. Она осталась у вас.</p>}
                </li>
              ))}
            </ul>
          ) : null}
          {open && view.history.length ? (
            <div className="mt-2 text-xs text-paper/75">
              <p className="font-semibold">Принято раньше: {view.history.length}</p>
              <ul className="mt-0.5 grid gap-0.5">
                {view.history.slice(-10).reverse().map((v) => <li key={`h:${v.key}:${v.id}`}>{verdictTitle(v)}</li>)}
              </ul>
            </div>
          ) : null}
          {held ? <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="soft" onClick={() => { resendHeld(session); toast("Не принятые правки уйдут владельцу ещё раз", { duration: 5000 }); }}>Отправить снова</Button>
            {confirmDrop ? (
              <>
                <Button onClick={() => { discardHeld(session); setConfirmDrop(false); toast("Не принятые правки сброшены, книга снова как у владельца", { duration: 5000 }); }}>Да, сбросить {held}</Button>
                <button type="button" className="min-h-11 rounded-full border border-paper/70 px-4 text-sm font-semibold text-paper" onClick={() => setConfirmDrop(false)}>Не надо</button>
              </>
            ) : <button type="button" className="min-h-11 rounded-full border border-paper/70 px-4 text-sm font-semibold text-paper" onClick={() => setConfirmDrop(true)}>Сбросить</button>}
          </div> : null}
          {held && confirmDrop ? <p className="mt-1 text-xs text-paper/80">Сброс вернёт эти записи к версии владельца, ваши правки по ним пропадут.</p> : null}
        </div>
      ) : null}
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
