import { SearchSelect } from "./search-select";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button, Sheet } from "@/components/rod/chrome";
import { useRod } from "@/lib/rod/store";
import { backupLocalNow, restoreBackup } from "@/lib/rod/sync";
import { gedToPeople, type ImportedPerson } from "@/lib/tree/gedImport.ts";
import { decodeText } from "@/lib/tree/decode.ts";
import { parseGedcom } from "@/lib/tree/importTree.ts";
import { parseTable } from "@/lib/tree/tableImport.ts";
import { isAgelongXml, parseAgelongXml } from "@/lib/tree/agelongXml.ts";
import type { TreeData } from "@/lib/tree/types.ts";
import { useTree } from "@/lib/tree/ui-store";
import { parseTreeFile, planImport } from "@/lib/tree/treeFile.ts";

import { guessSelf, linkDiffs, matchExisting, planGedImport, possibleSame } from "@/lib/tree/ged-match.ts";


const uid = () => Math.random().toString(36).slice(2, 10);

/** Файл, который человек выбрал на экскурсии: кнопка «Загрузить» подхватит его, как только появится на экране древа. */
let pendingFile: File | null = null;
export function handOverGedFile(file: File) {
  pendingFile = file;
}
export const hasPendingGedFile = () => pendingFile !== null;

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
    const matched = matchExisting(people, list);
    return { list, fresh: list.length - same, same, diffs: linkDiffs(people, list, matched), possible: possibleSame(people, list, matched) };
  }, [tree, table, selfKey, people]);
  const [updateLinks, setUpdateLinks] = useState(false);

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (/\.atdb$/i.test(file.name)) {
      toast("Это база программы «Древо Жизни». Сохраните из программы файл XML (Файл, Экспорт) и загрузите его.", { duration: 8000 });
      return;
    }
    void file.arrayBuffer().then((raw) => {
      const text = decodeText(raw);
      // Файл древа самого приложения (.tree): добавляем только тех, кого ещё нет по id; совпадающих и отличающихся не трогаем.
      if (/\.tree$/i.test(file.name) || /"format"\s*:\s*"kniga-roda-tree"/.test(text.slice(0, 2000))) {
        const parsed = parseTreeFile(text);
        if (!parsed.ok) return toast(parsed.error, { duration: 9000 });
        const plan = planImport(useRod.getState().people, parsed.file.people);
        if (plan.add.length) useRod.setState({ people: [...plan.add, ...useRod.getState().people] });
        setChooser(false);
        toast(`Файл древа: добавлено людей ${plan.add.length}, уже были ${plan.identical.length}${plan.conflicts.length ? `, отличаются и не тронуты: ${plan.conflicts.length}` : ""}. Заменить дерево целиком можно в «Файл древа».`, { duration: 10000 });
        return;
      }
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

  useEffect(() => {
    if (!pendingFile) return;
    const file = pendingFile;
    pendingFile = null;
    pick(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    if (!preview) return;
    setBusy(true);
    let backupKey = "";
    try {
      backupKey = await backupLocalNow("Книга до загрузки файла с древом");
    } catch {
      setBusy(false);
      toast("Не получилось сохранить резервную копию книги перед загрузкой, поэтому ничего не загружено. Сохраните копию на Главной и повторите.", { duration: 10000 });
      return;
    }
    const current = useRod.getState().people;
    const plan = planGedImport(current, preview.list, { updateLinks, uid });
    if (!plan.ok) {
      setBusy(false);
      toast(plan.reason, { duration: 12000 });
      return;
    }
    const fix = { length: plan.added };
    const updated = { size: plan.updated };
    const keyToId = plan.keyToId;
    useRod.setState({ people: plan.people });
    // Центр древа переходит на выбранного «Я»: иначе режимы и подписи считаются от прежнего человека.
    const selfImported = preview.list.find((p) => p.relation === "я");
    const selfId = selfImported ? keyToId.get(selfImported.key) : undefined;
    if (selfId) useTree.getState().setFocus(selfId);
    // В большом древе «Все родственники» слишком широкое: сначала показываем вашу линию с братьями и сёстрами, остальное – в «Расширенных».
    if (selfId && preview.list.length > 80 && useTree.getState().scope === "all") useTree.getState().setScope("direct-sib-root");
    setBusy(false);
    setTree(null);
    setTable(null);
    toast(`Добавлено людей: ${fix.length}. Уже были в списке: ${updated.size}${updateLinks ? ", связи обновлены по файлу" : ", их связи и подписи не менялись"}.${preview.list.length > 80 ? " Показала вашу линию; всех родственников можно включить в «Расширенных»." : ""}`, { duration: 20000, action: { label: "Отменить загрузку", onClick: () => void restoreBackup(backupKey).then((ok) => toast(ok ? "Загрузка отменена, книга как была" : "Копия не нашлась")) } });
  };

  return (
    <>
      <input ref={input} type="file" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" className="chip pointer-events-auto" onClick={() => setChooser(true)}>
        Загрузить из
      </button>
      {chooser ? (
        <Sheet title="Загрузить древо из файла" onClose={() => setChooser(false)}>
          <div className="grid gap-3">
            <p className="text-sm text-muted">Бесплатно. Подойдут такие файлы:</p>
            <ul className="grid gap-2 text-sm text-ink">
              <li><b>.ged</b> (GEDCOM): обычный обмен между программами. Его сохраняют «Древо Жизни», FamilyTree, Gramps, MyHeritage, Ancestry, Familysearch и другие.</li>
              <li><b>.xml</b> из «Древа Жизни» (genery.com): Файл, Экспорт, формат XML.</li>
              <li><b>.csv</b>: таблица из Excel или Google Таблиц (Файл, Скачать или Сохранить как, CSV). Колонки: Фамилия, Имя, Отчество, Дата рождения, Дата смерти, Пол, Кем приходится, Отец, Мать, Супруг.</li>
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
                <SearchSelect
                  label="Кто вы"
                  value={selfKey}
                  onChange={setSelfKey}
                  empty="Выберите себя из списка"
                  options={[...tree.people]
                    .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || "", "ru") || (a.firstName || "").localeCompare(b.firstName || "", "ru"))
                    .map((p) => ({ value: p.id, label: `${p.lastName} ${p.firstName} ${p.patronymic}`.replace(/\s+/g, " ").trim() + (p.birthYear ? ` · ${p.birthYear}` : "") }))}
                />
              </>
            ) : (
              <p className="text-sm text-muted">Найдено людей в таблице: {table?.length}. Колонка «Кем приходится» станет подписью родства.</p>
            )}
            {tree && !selfKey ? <p className="text-sm font-semibold text-rose-deep">Сначала выберите себя в списке: от этого человека считается, кто кому кем приходится.</p> : null}
            {preview ? (
              <p className="text-sm">Будет добавлено новых: <b>{preview.fresh}</b>. Уже есть в списке, не дублируем: {preview.same}.</p>
            ) : null}
            {preview && preview.possible.length ? (
              <p className="rounded-xl border border-ink/15 p-3 text-sm">
                У <b>{preview.possible.length}</b> людей в файле тот же номер, что у уже записанных, но имя или фамилия изменились ({preview.possible.slice(0, 3).map((d) => `${d.name} → ${d.fileName}`).join("; ")}
                {preview.possible.length > 3 ? "…" : ""}). Они добавятся как новые, чтобы не склеить разных людей: после загрузки проверьте, нет ли дубля, и удалите лишнего.
              </p>
            ) : null}
            {preview && preview.diffs.length ? (
              <div className="grid gap-2 rounded-xl border border-ink/15 p-3 text-sm">
                <p>
                  У <b>{preview.diffs.length}</b> уже записанных людей связи в файле отличаются от ваших ({preview.diffs.slice(0, 4).map((d) => `${d.name}: ${d.what}`).join("; ")}
                  {preview.diffs.length > 4 ? "…" : ""}). По умолчанию они остаются как есть.
                </p>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1 size-5" checked={updateLinks} onChange={(event) => setUpdateLinks(event.target.checked)} />
                  Заменить эти связи и подписи «Кем приходится» данными из файла
                </label>
              </div>
            ) : null}
            <p className="text-xs text-muted">Перед загрузкой книга сохраняется на этом устройстве. После загрузки появится кнопка «Отменить загрузку».</p>
            <Button disabled={busy || !preview} onClick={() => void add()}>
              Добавить в древо
            </Button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
