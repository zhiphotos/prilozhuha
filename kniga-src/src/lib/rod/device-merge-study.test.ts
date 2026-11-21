/**
 * С-4а: исследование слияния устройств. НИЧЕГО не переключает: mergeBooks остаётся рабочим, merge-core только вызывается для сравнения.
 * Здесь: сравнение старого (mergeBooks) и кандидата на merge-core на всех вариантах записи у «до / здесь / в облаке» и без «до».
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mergeBooks } from "./sync-merge.ts";
import { mergeList, stableStringify, type Rec } from "./merge-core.ts";

type V = Rec | undefined;
const R = (n: string, y: string, extra: Record<string, unknown> = {}): Rec => ({ id: "r", name: n, year: y, ...extra });
const STATES: Record<string, V> = { none: undefined, B: R("A", "1"), n1: R("B", "1"), y1: R("A", "2"), ny: R("B", "2"), n2: R("C", "1") };
const NAMES = Object.keys(STATES);
const eq = (a: V, b: V) => stableStringify(a) === stableStringify(b);
const book = (r: V) => ({ people: r ? [r] : [], pages: [] as unknown[] });

type Row = { base: string; local: string; cloud: string; old: string; fresh: string; oldLoses: boolean; newLoses: boolean };

/** Что сделал старый алгоритм с записью: чья версия осталась. */
function oldOutcome(base: V | "nobase", local: V, cloud: V) {
  const { data } = mergeBooks(book(local), book(cloud), base === "nobase" ? null : book(base as V));
  const got = (data.people as Rec[]).find((r) => r.id === "r");
  const kind = !got ? "нет записи" : eq(got, local) ? (eq(got, cloud) ? "одинаково" : "осталась здешняя") : eq(got, cloud) ? "взята облачная" : "смесь";
  // Изменение потеряно, если сторона меняла поле (относительно базы; без базы любое заполненное поле), а в результате его значения нет.
  const baseRec = base === "nobase" ? undefined : (base as V);
  const fields = new Set(["name", "year"]);
  const lostBy = (side: V) => Boolean(side && got && [...fields].some((f) => !eq(side[f] as never, baseRec?.[f] as never) && !eq(got[f] as never, side[f] as never)));
  const lostWhole = (side: V) => Boolean(side && !got && !eq(side, baseRec)); // добавление или правка пропали целиком
  const lostLocal = lostBy(local) || lostWhole(local);
  const lostCloud = lostBy(cloud) || lostWhole(cloud);
  const lostDelete = false;
  return { kind, loses: Boolean(lostLocal || lostCloud || lostDelete), got };
}

/** Кандидат на merge-core (без editedAt, без выбора по времени; без базы: add-add как конфликт). */
function freshOutcome(base: V | "nobase", local: V, cloud: V) {
  const m = mergeList(base === "nobase" ? undefined : base ? [base] : [], local ? [local] : [], cloud ? [cloud] : []).items[0];
  if (!m) return { kind: "нет записи", loses: false };
  return { kind: m.status === "conflict" ? `конфликт ${m.kind}` : m.status === "remove" ? "удаление переносится" : m.status === "take" ? (local ? "чистое слияние полей" : "запись из облака добавлена") : "без изменений", loses: false };
}

const rows: Row[] = [];
for (const b of [...NAMES, "nobase"]) {
  for (const l of NAMES) {
    for (const c of NAMES) {
      const base = b === "nobase" ? ("nobase" as const) : STATES[b];
      const o = oldOutcome(base, STATES[l], STATES[c]);
      const n = freshOutcome(base, STATES[l], STATES[c]);
      rows.push({ base: b, local: l, cloud: c, old: o.kind, fresh: n.kind, oldLoses: o.loses, newLoses: n.loses });
    }
  }
}

const group = (filter: (r: Row) => boolean) => {
  const out: Record<string, number> = {};
  for (const r of rows.filter(filter)) out[`${r.old} -> ${r.fresh}${r.oldLoses ? " [старый теряет версию]" : ""}`] = (out[`${r.old} -> ${r.fresh}${r.oldLoses ? " [старый теряет версию]" : ""}`] ?? 0) + 1;
  return out;
};

test("исследование: все сочетания «до / здесь / облако» (6 состояний записи)", () => {
  assert.equal(rows.length, 7 * 36);
  const withBase = group((r) => r.base !== "nobase");
  const noBase = group((r) => r.base === "nobase");
  assert.deepEqual(withBase, {
    "нет записи -> нет записи": 1,
    "взята облачная -> запись из облака добавлена": 5,
    "осталась здешняя -> без изменений": 37,
    "одинаково -> без изменений": 30,
    "осталась здешняя -> конфликт add-add [старый теряет версию]": 20,
    "нет записи -> без изменений": 5,
    "взята облачная -> без изменений": 5,
    "взята облачная -> конфликт edit-after-delete": 20,
    "осталась здешняя -> удаление переносится": 5,
    "взята облачная -> чистое слияние полей": 20,
    "осталась здешняя -> конфликт delete-edit": 20,
    "осталась здешняя -> чистое слияние полей [старый теряет версию]": 24,
    "осталась здешняя -> конфликт fields [старый теряет версию]": 24,
  });
  assert.deepEqual(noBase, {
    "нет записи -> нет записи": 1,
    "взята облачная -> запись из облака добавлена": 5,
    "осталась здешняя -> без изменений": 5,
    "одинаково -> без изменений": 5,
    "осталась здешняя -> конфликт add-add [старый теряет версию]": 20,
  });
  // кандидат ни в одном сочетании не теряет версию из книги
  assert.equal(rows.filter((r) => r.newLoses).length, 0);
});

