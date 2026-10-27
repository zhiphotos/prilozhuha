import { useState } from "react";
import { inflectSurname } from "@/lib/tree/fill";
import { displayName } from "@/lib/tree/kinship";
import { emptyDraft, useTree, type RelKind } from "@/lib/tree/ui-store";
import type { Gender } from "@/lib/tree/types";

const ROLES: { kind: RelKind; label: string; gender: Gender }[] = [
  { kind: "father", label: "Отец", gender: "m" },
  { kind: "mother", label: "Мать", gender: "f" },
  { kind: "spouse", label: "Муж или жена", gender: "u" },
  { kind: "son", label: "Сын", gender: "m" },
  { kind: "daughter", label: "Дочь", gender: "f" },
  { kind: "brother", label: "Брат", gender: "m" },
  { kind: "sister", label: "Сестра", gender: "f" },
];

export function AddPerson({
  initialId,
  onClose,
  onAdded,
}: {
  initialId: string;
  onClose: () => void;
  onAdded: (id: string, name: string) => void;
}) {
  const people = useTree((s) => s.people);
  const unions = useTree((s) => s.unions);
  const [anchorId, setAnchorId] = useState(initialId);
  const [kind, setKind] = useState<RelKind | null>(null);
  const [spouseGender, setSpouseGender] = useState<Gender>("f");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [unionId, setUnionId] = useState("");
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anchor = people.find((p) => p.id === anchorId) ?? people[0];
  const role = ROLES.find((item) => item.kind === kind);
  const gender: Gender = kind === "spouse" ? spouseGender : (role?.gender ?? "u");
  const suggested = anchor && kind && kind !== "spouse" ? inflectSurname(anchor.lastName, gender === "u" ? "m" : gender) : "";
  const marriages = anchor ? unions.filter((u) => u.partnerIds.includes(anchor.id)) : [];
  const needsFamily = (kind === "son" || kind === "daughter") && marriages.length > 1;

  const submit = () => {
    if (!anchor || !kind) {
      setError("Выберите, кем новый человек приходится");
      return;
    }
    if (!firstName.trim()) {
      setError("Напишите имя");
      return;
    }
    if (needsFamily && !unionId) {
      setError("Выберите, с кем этот ребёнок");
      return;
    }
    const before = new Set(people.map((p) => p.id));
    const draft = {
      ...emptyDraft(gender),
      firstName: firstName.trim(),
      lastName: (lastName.trim() || suggested).trim(),
      birthYear,
      gender,
    };
    const only = marriages.length === 1 ? marriages[0]?.id : undefined;
    const message = useTree.getState().addRelative(anchor.id, kind, draft, unionId || only);
    if (message) {
      setError(message);
      return;
    }
    const created = useTree.getState().people.find((p) => !before.has(p.id));
    useTree.getState().selectPerson(null);
    if (created) onAdded(created.id, created.firstName);
    else onClose();
  };

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-canvas/80 p-0 md:items-center md:p-6">
      <section className="sheet flex max-h-[94dvh] w-full max-w-xl flex-col rounded-t-3xl md:rounded-3xl">
        <header className="px-5 pt-4">
          <p className="text-xs tracking-widest text-muted uppercase">Новый человек</p>
          <h2 className="font-serif text-4xl leading-none">Добавить в древо</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Три шага: к кому он приходится, кем именно, и как его зовут. После кнопки «Добавить» он встанет на древо.
          </p>
        </header>
        <div className="mt-4 flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4">
          <div>
            <p className="text-xs tracking-widest text-muted uppercase">1. К кому</p>
            <button
              type="button"
              className="mt-2 flex min-h-14 w-full items-center justify-between rounded-2xl bg-ink px-4 text-left text-sheet"
              onClick={() => setPicking((v) => !v)}
            >
              <span className="font-serif text-2xl">{anchor ? displayName(anchor) : "Выберите человека"}</span>
              <span className="text-sm">{picking ? "Скрыть" : "Другой"}</span>
            </button>
            {picking && (
              <div className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
                {people.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`min-h-12 rounded-2xl px-3 text-left font-serif text-xl ${p.id === anchor?.id ? "bg-ink text-sheet" : "border border-line bg-white"}`}
                    onClick={() => {
                      setAnchorId(p.id);
                      setUnionId("");
                      setPicking(false);
                    }}
                  >
                    {displayName(p)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs tracking-widest text-muted uppercase">2. Кем приходится{anchor ? ` ${anchor.firstName}` : ""}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {ROLES.map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  className={`min-h-12 rounded-2xl border px-3 text-sm font-semibold ${kind === item.kind ? "border-ink bg-ink text-sheet" : "border-line bg-white"}`}
                  onClick={() => setKind(item.kind)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {kind === "spouse" && (
            <div className="grid grid-cols-2 gap-2">
              {(["m", "f"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`min-h-12 rounded-2xl border text-sm font-semibold ${spouseGender === g ? "border-ink bg-ink text-sheet" : "border-line bg-white"}`}
                  onClick={() => setSpouseGender(g)}
                >
                  {g === "m" ? "Это муж" : "Это жена"}
                </button>
              ))}
            </div>
          )}
          {needsFamily && (
            <div className="flex flex-col gap-2">
              <p className="text-xs tracking-widest text-muted uppercase">С кем этот ребёнок</p>
              {marriages.map((union) => {
                const spouse = union.partnerIds.map((id) => people.find((p) => p.id === id)).find((p) => p && anchor && p.id !== anchor.id);
                return (
                  <button
                    key={union.id}
                    type="button"
                    className={`min-h-12 rounded-2xl border px-3 text-left ${unionId === union.id ? "border-ink bg-ink text-sheet" : "border-line bg-white"}`}
                    onClick={() => setUnionId(union.id)}
                  >
                    {spouse ? `С ${displayName(spouse)}` : "Без второго родителя"}
                  </button>
                );
              })}
            </div>
          )}
          <div>
            <p className="text-xs tracking-widest text-muted uppercase">3. Как зовут</p>
            <div className="mt-2 grid gap-3">
              <label className="field">
                Имя
                <input value={firstName} placeholder="Например, Мария" onChange={(e) => setFirstName(e.target.value)} />
              </label>
              <label className="field">
                Фамилия
                <input value={lastName} placeholder={suggested || "Можно оставить пустой"} onChange={(e) => setLastName(e.target.value)} />
              </label>
              <label className="field">
                Год рождения
                <input value={birthYear} placeholder="Год или дата, например 18.05.1989" onChange={(e) => setBirthYear(e.target.value.slice(0, 20))} />
              </label>
            </div>
          </div>
          {error && <p className="text-sm text-role">{error}</p>}
        </div>
        <footer className="grid grid-cols-2 gap-2 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" className="min-h-12 rounded-2xl border border-line" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="min-h-12 rounded-2xl bg-ink font-semibold text-sheet" onClick={submit}>
            Добавить в древо
          </button>
        </footer>
      </section>
    </div>
  );
}
