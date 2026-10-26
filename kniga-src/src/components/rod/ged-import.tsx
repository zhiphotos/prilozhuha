import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button, Sheet } from "@/components/rod/chrome";
import { composeName } from "@/lib/rod/person";
import { useRod } from "@/lib/rod/store";
import type { Person as RodPerson } from "@/lib/rod/types";
import { gedToPeople, type ImportedPerson } from "@/lib/tree/gedImport.ts";
import { parseGedcom } from "@/lib/tree/importTree.ts";
import { parseTable } from "@/lib/tree/tableImport.ts";
import type { TreeData } from "@/lib/tree/types.ts";

const uid = () => Math.random().toString(36).slice(2, 10);

/** Кнопка «Загрузить GED»: читает файл, спрашивает, кто из людей «Я», и добавляет всех в список «Люди» (древо строится из него). */
export function GedImportButton() {
  const input = useRef<HTMLInputElement>(null);
  const [tree, setTree] = useState<TreeData | null>(null);
  const [table, setTable] = useState<ImportedPerson[] | null>(null);
  const [selfKey, setSelfKey] = useState("");
  const [busy, setBusy] = useState(false);
  const people = useRod((s) => s.people);

  const preview = useMemo(() => {
    const list = table ?? (tree && selfKey ? gedToPeople(tree, selfKey) : null);
    if (!list) return null;
    const existing = new Set(people.map((p) => `${p.name.trim().toLowerCase()}|${p.birthYear ?? ""}`));
    const fresh = list.filter((p) => !existing.has(`${composeName(p).trim().toLowerCase()}|${p.birthYear}`));
    return { list, fresh: fresh.length, same: list.length - fresh.length };
  }, [tree, table, selfKey, people]);

  const pick = (file: File | undefined) => {
    if (!file) return;
    void file.text().then((text) => {
      if (/\.(csv|tsv|txt)$/i.test(file.name) && !/^\s*0\s+HEAD/m.test(text)) {
        const r = parseTable(text);
        if ("error" in r) return toast(r.error);
        setTree(null);
        setTable(r.people);
        return;
      }
      const r = parseGedcom(text);
      if ("error" in r) return toast("Файл не прочитался: " + r.error);
      setTable(null);
      setTree(r.tree);
      setSelfKey(r.tree.focusId);
    });
  };

  const add = () => {
    if (!preview) return;
    setBusy(true);
    const current = useRod.getState().people;
    const byName = new Map(current.map((p) => [`${p.name.trim().toLowerCase()}|${p.birthYear ?? ""}`, p.id]));
    const keyToId = new Map<string, string>();
    const created: RodPerson[] = [];
    for (const p of preview.list) {
      const nameKey = `${composeName(p).trim().toLowerCase()}|${p.birthYear}`;
      const found = byName.get(nameKey);
      if (found) keyToId.set(p.key, found);
      else {
        const id = uid();
        keyToId.set(p.key, id);
        byName.set(nameKey, id);
        created.push(toRod(p, id, keyToId));
      }
    }
    // Связи пересчитываем уже с готовыми id (родители и супруги могли идти позже).
    const fix = created.map((c) => {
      const src = preview.list.find((p) => keyToId.get(p.key) === c.id)!;
      return { ...c, ...linksOf(src, keyToId) };
    });
    useRod.setState({ people: [...fix, ...current] });
    setBusy(false);
    setTree(null);
    setTable(null);
    toast(`Добавлено людей: ${fix.length}. Древо обновлено.`);
  };

  return (
    <>
      <input ref={input} type="file" accept=".ged,.csv,.tsv,.txt,text/plain,text/csv" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" className="chip pointer-events-auto" onClick={() => input.current?.click()}>
        Загрузить из файла
      </button>
      {tree || table ? (
        <Sheet title="Загрузка древа из файла" onClose={() => { setTree(null); setTable(null); }}>
          <div className="grid gap-3">
            {tree ? (
              <>
                <p className="text-sm text-muted">Найдено людей в файле: {tree.people.length}. Выберите, кто из них вы: от него считаются родственники.</p>
                <select className="field" value={selfKey} onChange={(e) => setSelfKey(e.target.value)}>
                  {tree.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {`${p.firstName} ${p.patronymic} ${p.lastName}`.replace(/\s+/g, " ").trim()} {p.birthYear ? `· ${p.birthYear}` : ""}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <p className="text-sm text-muted">Найдено людей в таблице: {table?.length}. Колонка «Кем приходится» станет подписью родства.</p>
            )}
            {preview ? (
              <p className="text-sm">Будет добавлено новых: <b>{preview.fresh}</b>. Уже есть в списке, не дублируем: {preview.same}.</p>
            ) : null}
            <Button disabled={busy || !preview || preview.fresh === 0} onClick={add}>
              Добавить в древо
            </Button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

function linksOf(p: ImportedPerson, keyToId: Map<string, string>): Partial<RodPerson> {
  const parents = p.parentKeys.map((k) => keyToId.get(k)).filter((x): x is string => Boolean(x));
  const spouse = p.spouseKey ? keyToId.get(p.spouseKey) : undefined;
  return { parents: parents.length ? parents : undefined, spouse, spouseStatus: p.spouseStatus, unionFrom: p.unionFrom, unionTo: p.unionTo };
}

function toRod(p: ImportedPerson, id: string, keyToId: Map<string, string>): RodPerson {
  return {
    id,
    name: composeName(p),
    firstName: p.firstName,
    patronymic: p.patronymic,
    lastName: p.lastName,
    relation: p.relation,
    birthYear: p.birthYear,
    deathYear: p.deathYear,
    maidenName: "",
    notes: p.notes,
    gender: p.gender,
    ...linksOf(p, keyToId),
  } as RodPerson;
}
