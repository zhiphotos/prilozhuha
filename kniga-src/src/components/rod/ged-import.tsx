import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button, Sheet } from "@/components/rod/chrome";
import { composeName } from "@/lib/rod/person";
import { yearNum } from "@/lib/tree/kinship.ts";
import { useRod } from "@/lib/rod/store";
import type { Person as RodPerson } from "@/lib/rod/types";
import { gedToPeople, type ImportedPerson } from "@/lib/tree/gedImport.ts";
import { parseGedcom } from "@/lib/tree/importTree.ts";
import { parseTable } from "@/lib/tree/tableImport.ts";
import { isAgelongXml, parseAgelongXml } from "@/lib/tree/agelongXml.ts";
import type { TreeData } from "@/lib/tree/types.ts";
import { useTree } from "@/lib/tree/ui-store";
import { roleOf } from "@/lib/tree/from-people.ts";

/** Имя и фамилия для сравнения: без регистра, «ё» как «е». */
function sameKey(first: string, last: string): string {
  const norm = (x: string) => x.trim().toLowerCase().replace(/ё/g, "е");
  const f = norm(first).split(/\s+/)[0] ?? "";
  const l = norm(last);
  return f && l ? `${f}|${l}` : "";
}

/** Годы рождения не спорят: равны или хотя бы у одного не указан. */
function yearsAgree(a?: string, b?: string): boolean {
  const ya = yearNum(a);
  const yb = yearNum(b);
  return ya === 9999 || yb === 9999 || ya === yb;
}

/** Запись без настоящего имени: «Мама», «Папа», «Бабушка» и т. п. */
function isPlaceholder(c: RodPerson): boolean {
  const first = (c.firstName ?? c.name).trim().toLowerCase();
  return /^(мама|папа|мать|отец|бабушка|дедушка|я)$/.test(first) || !c.lastName?.trim() && !/\s/.test(c.name.trim()) && first === c.relation.trim().toLowerCase();
}

/** Кто из уже записанных людей – тот же человек, что в файле. Запись «я» совпадает с выбранным «Я», мама и папа – по роли, остальные – по имени и фамилии (годы не спорят). */
function matchExisting(current: RodPerson[], list: ImportedPerson[]): Map<string, RodPerson> {
  const taken = new Set<string>();
  const matched = new Map<string, RodPerson>();
  const find = (p: ImportedPerson): RodPerson | undefined => {
    const mine = p.relation === "я";
    const want = sameKey(p.firstName, p.lastName);
    const byName = current.find((c) => {
      if (taken.has(c.id)) return false;
      if (mine && /^(я|сам|сама)$/i.test(c.relation.trim())) return true;
      if (!want) return false;
      if (sameKey(c.firstName ?? c.name.split(/\s+/)[0] ?? "", c.lastName ?? c.name.split(/\s+/).slice(-1)[0] ?? "") !== want) return false;
      return yearsAgree(c.birthYear, p.birthYear);
    });
    if (byName) return byName;
    const role = roleOf(p.relation);
    if (role === "mother" || role === "father") return current.find((c) => !taken.has(c.id) && roleOf(c.relation) === role);
    return undefined;
  };
  for (const p of list) {
    const found = find(p);
    if (!found) continue;
    taken.add(found.id);
    matched.set(p.key, found);
  }
  return matched;
}

/** Человек из файла, который, скорее всего, и есть тот, кто уже записан как «я»: по имени (и фамилии, если она есть). */
function guessSelf(tree: TreeData, current: RodPerson[]): string {
  const me = current.find((c) => /^(я|сам|сама)$/i.test(c.relation.trim()));
  if (!me) return tree.focusId;
  const first = (me.firstName ?? me.name.split(/\s+/)[0] ?? "").trim().toLowerCase().replace(/ё/g, "е");
  const last = (me.lastName ?? me.name.split(/\s+/).slice(1).join(" ")).trim().toLowerCase().replace(/ё/g, "е");
  const norm = (x: string) => x.trim().toLowerCase().replace(/ё/g, "е");
  const hits = tree.people.filter((p) => norm(p.firstName).split(/\s+/)[0] === first && (!last || norm(p.lastName) === last) && yearsAgree(me.birthYear, p.birthYear));
  // Если однозначно угадать нельзя (в файле несколько тёзок), пусть человек выберет себя сам: чужой «Я» ломает все подписи.
  return hits.length === 1 ? hits[0]!.id : "";
}

function sameFirst(c: RodPerson, p: ImportedPerson): boolean {
  const n = (x: string) => x.trim().toLowerCase().replace(/ё/g, "е").split(/\s+/)[0] ?? "";
  return n(c.firstName ?? c.name) === n(p.firstName);
}

const uid = () => Math.random().toString(36).slice(2, 10);

/** Кнопка «Загрузить GED»: читает файл, спрашивает, кто из людей «Я», и добавляет всех в список «Люди» (древо строится из него). */
export function GedImportButton() {
  const input = useRef<HTMLInputElement>(null);
  const [tree, setTree] = useState<TreeData | null>(null);
  const [table, setTable] = useState<ImportedPerson[] | null>(null);
  const [selfKey, setSelfKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [chooser, setChooser] = useState(false);
  const people = useRod((s) => s.people);

  const preview = useMemo(() => {
    const list = table ?? (tree && selfKey ? gedToPeople(tree, selfKey) : null);
    if (!list) return null;
    const same = matchExisting(people, list).size;
    return { list, fresh: list.length - same, same };
  }, [tree, table, selfKey, people]);

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (/\.atdb$/i.test(file.name)) {
      toast("Это база программы «Древо Жизни». Сохраните из программы файл XML (Файл, Экспорт) и загрузите его.", { duration: 8000 });
      return;
    }
    void file.text().then((text) => {
      if (isAgelongXml(text)) {
        const r = parseAgelongXml(text);
        if ("error" in r) return toast(r.error);
        setTable(null);
        setTree(r.tree);
        setSelfKey(guessSelf(r.tree, useRod.getState().people));
        return;
      }
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
      setSelfKey(guessSelf(r.tree, useRod.getState().people));
    });
  };

  const add = () => {
    if (!preview) return;
    setBusy(true);
    const current = useRod.getState().people;
    const created: RodPerson[] = [];
    const matched = matchExisting(current, preview.list);
    const keyToId = new Map<string, string>();
    for (const p of preview.list) keyToId.set(p.key, matched.get(p.key)?.id ?? uid());
    for (const p of preview.list) if (!matched.has(p.key)) created.push(toRod(p, keyToId.get(p.key)!, keyToId));
    // Найденные люди получают связи и подпись родства из файла, остальное (фото, заметки) остаётся как было.
    const updated = new Map<string, RodPerson>();
    for (const p of preview.list) {
      const found = matched.get(p.key);
      if (!found) continue;
      const links = linksOf(p, keyToId);
      updated.set(found.id, {
        ...found,
        relation: p.relation,
        fromFile: true,
        ...(isPlaceholder(found) || (!found.lastName?.trim() && sameFirst(found, p)) ? { name: composeName(p), firstName: p.firstName, patronymic: p.patronymic, lastName: p.lastName } : {}),
        parents: links.parents ?? found.parents,
        spouse: links.spouse ?? found.spouse,
        spouseStatus: links.spouseStatus ?? found.spouseStatus,
        moreSpouses: links.moreSpouses ?? found.moreSpouses,
        gender: found.gender ?? p.gender,
        birthYear: found.birthYear || p.birthYear,
      });
    }
    const fix = created.map((c) => {
      const src = preview.list.find((p) => keyToId.get(p.key) === c.id)!;
      return { ...c, ...linksOf(src, keyToId) };
    });
    useRod.setState({ people: [...fix, ...current.map((c) => updated.get(c.id) ?? c)] });
    // Центр древа переходит на выбранного «Я»: иначе режимы и подписи считаются от прежнего человека.
    const selfImported = preview.list.find((p) => p.relation === "я");
    const selfId = selfImported ? keyToId.get(selfImported.key) : undefined;
    if (selfId) useTree.getState().setFocus(selfId);
    setBusy(false);
    setTree(null);
    setTable(null);
    toast(`Добавлено людей: ${fix.length}. Уже были в списке и обновлены: ${updated.size}. Древо обновлено.`);
  };

  return (
    <>
      <input ref={input} type="file" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" className="chip pointer-events-auto" onClick={() => setChooser(true)}>
        Из файла
      </button>
      {chooser ? (
        <Sheet title="Загрузить древо из файла" onClose={() => setChooser(false)}>
          <div className="grid gap-3">
            <p className="text-sm text-muted">Бесплатно. Подойдут такие файлы:</p>
            <ul className="grid gap-2 text-sm text-ink">
              <li><b>.ged</b> (GEDCOM): обычный обмен между программами. Его сохраняют «Древо Жизни», FamilyTree, Gramps, MyHeritage, Ancestry, Familysearch и другие.</li>
              <li><b>.xml</b> из «Древа Жизни» (genery.com): Файл, Экспорт, формат XML.</li>
              <li><b>.csv</b>: таблица из Excel или Google Таблиц (Файл, Скачать или Сохранить как, CSV). Колонки: Фамилия, Имя, Отчество, Год рождения, Год смерти, Пол, Кем приходится, Отец, Мать, Супруг.</li>
            </ul>
            <p className="text-xs text-muted">Файл с расширением .atdb (база «Древа Жизни») открыть нельзя: сохраните из программы XML.</p>
            <Button onClick={() => { setChooser(false); input.current?.click(); }}>Выбрать файл</Button>
          </div>
        </Sheet>
      ) : null}
      {tree || table ? (
        <Sheet title="Загрузка древа из файла" onClose={() => { setTree(null); setTable(null); }}>
          <div className="grid gap-3">
            {tree ? (
              <>
                <p className="text-sm text-muted">Найдено людей в файле: {tree.people.length}. Выберите, кто из них вы: от него считаются родственники.</p>
                <select className="field" value={selfKey} onChange={(e) => setSelfKey(e.target.value)}>
                  <option value="">Выберите себя из списка</option>
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
            {tree && !selfKey ? <p className="text-sm font-semibold text-rose-deep">Сначала выберите себя в списке: от этого человека считается, кто кому кем приходится.</p> : null}
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
  const more = (p.moreSpouses ?? [])
    .map((m) => ({ id: keyToId.get(m.key), status: m.status, from: m.from, to: m.to }))
    .filter((m): m is { id: string; status: "married" | "divorced" | "partners" | undefined; from: string | undefined; to: string | undefined } => Boolean(m.id));
  return { parents: parents.length ? parents : undefined, spouse, spouseStatus: p.spouseStatus, unionFrom: p.unionFrom, unionTo: p.unionTo, moreSpouses: more.length ? more : undefined };
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
    fromFile: true,
    ...linksOf(p, keyToId),
  } as RodPerson;
}
