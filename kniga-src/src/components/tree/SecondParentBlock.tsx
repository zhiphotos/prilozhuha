import { useMemo, useState } from "react";
import { useRod } from "@/lib/rod/store";
import type { Person as RodPerson } from "@/lib/rod/types";
import { checkCloudBeforeEdit } from "@/lib/rod/sync";
import { NEW_PARENT, afterParents, cloudBlockMessage, commitExistingChild, parentVariants, previewChange, type ParentVariant } from "@/lib/tree/child-parents";
import { currentParentsState, parentsDiff, secondParentOptions, type CloudCheck, type Confirmations, type Needs } from "@/lib/tree/second-parent";
import { emptyDraft, type Draft, type StoreSecond } from "@/lib/tree/ui-store";

const nameOf = (p?: RodPerson) => (p ? p.name?.trim() || `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || "Без имени" : "Без имени");
const roleOf = (p?: RodPerson) => (p?.gender === "f" ? "Мать" : p?.gender === "m" ? "Отец" : "Родитель");
const pill = (on: boolean) => `min-h-11 rounded-2xl border px-3 text-left text-sm ${on ? "border-ink bg-ink text-sheet" : "border-line bg-white"}`;

function partnerWord(p: RodPerson | undefined, status?: string): string {
  const base = p?.gender === "f" ? "жена" : p?.gender === "m" ? "муж" : "супруг";
  if (status === "divorced") return p?.gender === "f" ? "бывшая жена" : p?.gender === "m" ? "бывший муж" : "бывший супруг";
  if (status === "partners") return "партнёр";
  return base;
}

/** Блок «Родитель по рождению». Ничего не выбрано заранее; предложенный супруг записывается только после «Подтвердить». */
export function SecondParentPicker({ firstId, childId, value, onChange }: { firstId: string; childId?: string; value: StoreSecond | null; onChange: (next: StoreSecond | null) => void }) {
  const people = useRod((s) => s.people);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft("u"));
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const options = useMemo(() => secondParentOptions(people, firstId).filter((o) => o.id !== childId), [people, firstId, childId]);
  const q = query.trim().toLowerCase();
  const candidates = people.filter((p) => p.id !== firstId && p.id !== childId && !p.id.startsWith("__") && (!q || nameOf(p).toLowerCase().includes(q)));

  const summary = (() => {
    if (!value) return null;
    if (value.mode === "unknown") return "Неизвестно";
    if (value.mode === "new") return `${value.draft.firstName} ${value.draft.lastName}`.trim() + " (новый человек)";
    return nameOf(byId.get(value.id));
  })();

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-white/70 p-3" data-testid="second-parent">
      <p className="text-xs tracking-widest text-muted uppercase">Второй родитель по рождению</p>
      {summary ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm">Выбрано: <b>{summary}</b></p>
          <button type="button" className="min-h-11 px-2 text-sm underline" onClick={() => onChange(null)}>Изменить</button>
        </div>
      ) : (
        <>
          {options.map((o) => {
            const person = byId.get(o.id);
            const text = o.kind === "partner" ? `Предложение: ${nameOf(person)} (${partnerWord(person, o.status)})` : `Уже есть общий ребёнок: ${nameOf(person)}`;
            return (
              <div key={o.id} className="flex items-center justify-between gap-2 rounded-xl bg-sheet px-3 py-2">
                <span className="text-sm">{text}</span>
                <button type="button" className="min-h-11 shrink-0 rounded-xl bg-ink px-3 text-sm font-semibold text-sheet" onClick={() => onChange({ mode: o.kind === "partner" ? "partner" : "coparent", id: o.id })}>Подтвердить</button>
              </div>
            );
          })}
          {options.length ? <p className="text-xs leading-snug text-muted">Брак не означает, что это родной отец или мать. Подтверждайте, только если это так.</p> : null}
          <div className="grid grid-cols-1 gap-2">
            <button type="button" className={pill(searching)} onClick={() => { setSearching((v) => !v); setCreating(false); }}>Выбрать из древа</button>
            {searching ? (
              <div className="flex flex-col gap-1">
                <input className="min-h-11 rounded-2xl border border-line bg-white px-3" placeholder="Найти по имени" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Найти второго родителя" />
                <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                  {candidates.map((c) => (
                    <button key={c.id} type="button" className="min-h-11 rounded-xl border border-line bg-white px-3 text-left" onClick={() => onChange({ mode: "existing", id: c.id })}>{nameOf(c)}</button>
                  ))}
                </div>
              </div>
            ) : null}
            <button type="button" className={pill(creating)} onClick={() => { setCreating((v) => !v); setSearching(false); }}>Новый человек</button>
            {creating ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="field">Имя<input value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} /></label>
                <label className="field">Фамилия<input value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} /></label>
                <div className="col-span-2 grid grid-cols-3 gap-2">
                  {(["f", "m", "u"] as const).map((g) => (
                    <button key={g} type="button" className={pill(draft.gender === g)} onClick={() => setDraft({ ...draft, gender: g })}>{g === "f" ? "Женщина" : g === "m" ? "Мужчина" : "Не указан"}</button>
                  ))}
                </div>
                <button type="button" className="col-span-2 min-h-11 rounded-2xl bg-ink font-semibold text-sheet disabled:opacity-40" disabled={!draft.firstName.trim()} onClick={() => onChange({ mode: "new", draft })}>Выбрать этого человека</button>
              </div>
            ) : null}
            <button type="button" className={pill(false)} onClick={() => onChange({ mode: "unknown" })}>Неизвестно</button>
          </div>
          <p className="text-xs leading-snug text-muted">Общий ребёнок не делает людей мужем и женой. Брак записывается отдельно, если вы его запишете.</p>
        </>
      )}
    </div>
  );
}

/** Предупреждения и вопросы, на которые нужно ответить явно. «Всё равно записать» только для мягких предупреждений. */
export function NeedsNotice({ needs, onConfirm }: { needs: Needs; onConfirm: (c: Confirmations) => void }) {
  const people = useRod((s) => s.people);
  const names = (ids: string[]) => ids.map((id) => nameOf(people.find((p) => p.id === id))).join(", ");
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-amber-400 bg-amber-50 p-3 text-sm" role="alert">
      {needs.warnings?.map((w) => <p key={w}>{w}</p>)}
      {needs.warnings ? <button type="button" className="min-h-11 rounded-xl bg-ink px-3 font-semibold text-sheet" onClick={() => onConfirm({ warnings: true })}>Всё равно записать</button> : null}
      {needs.similar ? (
        <>
          <p>Похожий человек уже есть в древе: {names(needs.similar)}. Это тот же человек?</p>
          <button type="button" className="min-h-11 rounded-xl border border-line bg-white px-3" onClick={() => onConfirm({ notDuplicate: true })}>Нет, это другой человек</button>
        </>
      ) : null}
    </div>
  );
}

type Step = "form" | "preview";

/** Существующий человек как ребёнок: выбор заменяемого родителя, «Было → Станет», подтверждение. Программа никого не снимает сама. */
export function ExistingChildPanel({ first, childId, onDone, onCancel }: { first: RodPerson; childId: string; onDone: (id: string) => void; onCancel: () => void }) {
  const people = useRod((s) => s.people);
  const child = people.find((p) => p.id === childId);
  const vs = useMemo(() => parentVariants(people, first.id, childId), [people, first.id, childId]);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [pick, setPick] = useState<StoreSecond | null>(null);
  const [step, setStep] = useState<Step>("form");
  const [busy, setBusy] = useState<string | null>(null);
  const [expected, setExpected] = useState<{ parents: string[]; unmarried: boolean } | null>(null);
  const [cloud, setCloud] = useState<CloudCheck>("failed");
  const [confirm, setConfirm] = useState<Pick<Confirmations, "warnings" | "notDuplicate">>({});
  const [needs, setNeeds] = useState<Needs | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const effectiveId = variantId ?? (vs?.mode === "normal" ? "second" : null);
  const variant: ParentVariant | undefined = vs?.variants.find((v) => v.id === effectiveId);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const label = (id: string) => (id === NEW_PARENT ? (pick?.mode === "new" ? `${pick.draft.firstName} ${pick.draft.lastName}`.trim() : "Новый человек") : nameOf(byId.get(id)));
  const line = (ids: string[]) => (ids.length ? ids.map((id) => `${roleOf(byId.get(id))} — ${label(id)}`).join(". ") + "." : "Родители не записаны.");

  if (!vs || !child) return <p className="text-sm">Этого человека больше нет в древе.</p>;
  const needsPick = variant?.second === "pick";
  const ready = Boolean(variant && !variant.disabled && (!needsPick || pick));
  const preview = variant ? previewChange(people, childId, variant, pick) : null;

  const select = (id: string) => { setVariantId(id); setPick(null); setStep("form"); setNeeds(null); setConfirm({}); setMessage(null); };
  const resetAll = (text: string) => { setVariantId(null); setPick(null); setStep("form"); setExpected(null); setNeeds(null); setConfirm({}); setMessage(text); };

  const sameVariant = (a?: ParentVariant, b?: ParentVariant) => Boolean(a && b && a.firstId === b.firstId && JSON.stringify(a.removes) === JSON.stringify(b.removes) && JSON.stringify(a.second) === JSON.stringify(b.second));

  const commit = (cloudState: CloudCheck, exp: { parents: string[]; unmarried: boolean }, cf = confirm) => {
    if (!variant) return;
    const res = commitExistingChild({ childId, variant, pick: pick ?? undefined, confirm: cf, expected: exp, replaceConfirmed: step === "preview", cloud: cloudState });
    if (res.ok) { onDone(res.childId); return; }
    if ("blocked" in res) { setMessage(res.errors.join(" ")); setStep("form"); return; }
    const n = res.needs;
    if (n?.stale) {
      // Старое подтверждение недействительно: строим новый просмотр по актуальным данным.
      const fresh = parentVariants(useRod.getState().people, first.id, childId);
      const again = fresh?.variants.find((v) => v.id === variant.id);
      if (!fresh || !sameVariant(again, variant)) { resetAll("Данные изменились. Выберите вариант заново."); return; }
      setExpected(n.current ?? exp);
      setStep("preview");
      setMessage("Данные изменились на другом устройстве или здесь. Проверьте новый просмотр и подтвердите ещё раз.");
      return;
    }
    if (n?.warnings || n?.similar) { setNeeds(n); return; }
    setMessage(res.errors.join(" ") || "Не получилось записать");
  };

  const next = async () => {
    if (!variant || !ready || !preview) return;
    setMessage(null);
    if (preview.diff.unchanged) { setMessage("Ничего не изменится: эти родители уже записаны."); return; }
    if (!preview.diff.destructive) { commit("failed", preview.state); return; }
    // Замена или снятие: сначала проверка облака, потом просмотр по свежим данным.
    setBusy("Проверяю облако…");
    const result = await checkCloudBeforeEdit();
    setBusy(null);
    setCloud(result);
    const fresh = parentVariants(useRod.getState().people, first.id, childId);
    const again = fresh?.variants.find((v) => v.id === variant.id);
    if (!fresh || !sameVariant(again, variant)) { resetAll("После проверки облака данные изменились. Выберите вариант заново."); return; }
    if (result !== "checked" && result !== "no-cloud") {
      setMessage(cloudBlockMessage(result));
      return;
    }
    setExpected({ parents: fresh.before, unmarried: fresh.unmarried });
    setStep("preview");
  };

  // Экран подтверждения строится по тому, что пользователь видел («Было»), а не по живым данным: устаревание ловит сама запись.
  const diff = step === "preview" && expected && variant ? parentsDiff(expected.parents, afterParents(variant, pick)) : preview?.diff;
  const liveNow = currentParentsState(people, childId);
  const outdated = step === "preview" && expected && liveNow ? JSON.stringify([...expected.parents].sort()) !== JSON.stringify([...liveNow.parents].sort()) || expected.unmarried !== liveNow.unmarried : false;
  const verb = diff ? (diff.removed.length && diff.added.length ? `Заменить: ${diff.removed.map(label).join(", ")} → ${diff.added.map(label).join(", ")}` : diff.removed.length ? `Снять связь: ${diff.removed.map(label).join(", ")}` : `Добавить: ${diff.added.map(label).join(", ")}`) : "";
  const optionLabel = (v: ParentVariant) => {
    const [x] = v.removes;
    const f = nameOf(first);
    if (v.id === "add") return `Добавить: ${f} вторым родителем`;
    if (v.id === "replace-x" && vs.before.length === 1) return `Заменить: ${nameOf(byId.get(x!))} → ${f}`;
    if (v.id === "replace-one") return `Заменить: ${nameOf(byId.get(x!))} → ${f} и выбрать второго`;
    if (v.id === "replace-x" || v.id === "replace-y") return `Заменить: ${nameOf(byId.get(x!))} → ${f}`;
    if (v.id === "replace-both") return `Заменить обоих: на ${f} и выбранного второго`;
    return "Второй родитель";
  };

  return (
    <div className="flex flex-col gap-3" data-testid="existing-child">
      <p className="text-sm">Ребёнок: <b>{nameOf(child)}</b>. Сейчас: {line(vs.before)}</p>
      {step === "form" ? (
        <>
          {vs.mode === "choose" ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs tracking-widest text-muted uppercase">Как записать: {nameOf(first)}</p>
              {vs.variants.map((v) => (
                <button key={v.id} type="button" disabled={Boolean(v.disabled)} className={`${pill(effectiveId === v.id)} disabled:opacity-45`} onClick={() => select(v.id)}>
                  {optionLabel(v)}
                  {v.disabled ? <span className="block text-xs">{v.disabled}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
          {variant && needsPick ? <SecondParentPicker firstId={variant.firstId} childId={childId} value={pick} onChange={(v) => { setPick(v); setNeeds(null); setConfirm({}); }} /> : null}
          {diff && ready ? <p className="text-sm">Станет: {line(diff.after)}</p> : null}
          {needs ? <NeedsNotice needs={needs} onConfirm={(c) => { const cf = { ...confirm, ...c }; setConfirm(cf); setNeeds(null); const exp = expected ?? preview?.state; if (exp) commit(cloud, exp, cf); }} /> : null}
          {message ? <p className="text-sm text-role" role="alert">{message}</p> : null}
          {busy ? <p className="text-sm text-muted">{busy}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="min-h-11 rounded-2xl border border-line" onClick={onCancel}>Назад</button>
            <button type="button" className="min-h-11 rounded-2xl bg-ink font-semibold text-sheet disabled:opacity-40" disabled={!ready || Boolean(busy)} onClick={() => void next()}>{diff?.destructive ? "Показать изменения" : "Положить в древо"}</button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2" data-testid="preview">
          <p className="font-serif text-xl">Изменятся родители у {nameOf(child)}</p>
          <p className="text-sm">Было: {line(expected?.parents ?? vs.before)}</p>
          <p className="text-sm">Станет: {line(diff?.after ?? [])}</p>
          {outdated ? <p className="text-sm text-role" role="alert">Данные изменились после показа этого экрана. Нажмите кнопку: просмотр обновится, и запись пока не произойдёт.</p> : null}
          {child && (child as { adoptedBy?: unknown[]; caredBy?: unknown[] }).adoptedBy?.length || (child as { caredBy?: unknown[] }).caredBy?.length ? <p className="text-xs text-muted">Усыновители и опекуны не меняются.</p> : null}
          {needs ? <NeedsNotice needs={needs} onConfirm={(c) => { const cf = { ...confirm, ...c }; setConfirm(cf); setNeeds(null); if (expected) commit(cloud, expected, cf); }} /> : null}
          {message ? <p className="text-sm text-role" role="alert">{message}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="min-h-11 rounded-2xl border border-line" onClick={() => { setStep("form"); setExpected(null); }}>Оставить как есть</button>
            <button type="button" className="min-h-11 rounded-2xl bg-ink font-semibold text-sheet" onClick={() => expected && commit(cloud, expected)}>{verb}</button>
          </div>
        </div>
      )}
    </div>
  );
}

