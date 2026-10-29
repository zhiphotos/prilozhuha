import type { Person } from "@/lib/rod/types";
import { SELF_ID, treeFromPeople } from "./from-people.ts";
import { layoutTree } from "./layout.ts";
import { buildRelationshipGraph, validateGraph, validatePeopleLinks } from "./relgraph.ts";

/** Собственный файл древа (.tree): версионированный JSON со всеми записями «Люди». Фото не входят: это ссылки на хранилище устройства. */
export const TREE_FORMAT = "kniga-roda-tree";
export const TREE_VERSION = 1;

export type TreeFile = {
  format: typeof TREE_FORMAT;
  version: number;
  exportedAt: string;
  app: { build: string };
  counts: { people: number; links: number };
  people: Person[];
  view?: Record<string, unknown>;
};

const LINK_KEYS = ["parents", "siblingOf", "spouse", "moreSpouses"] as const;

/** Число записанных связей: родители, брат/сестра, супруги. */
export function countLinks(people: Person[]): number {
  let n = 0;
  for (const p of people) n += (p.parents ?? []).length + (p.siblingOf ? 1 : 0) + (p.spouse ? 1 : 0) + (p.moreSpouses ?? []).length;
  return n;
}

/** Файл со всеми людьми и связями. Исходные записи не меняются (копия без фото-ссылок). */
export function buildTreeFile(people: Person[], build = "", view?: Record<string, unknown>, now = new Date()): TreeFile {
  const copy = people.map((p) => {
    const { photo, ...rest } = JSON.parse(JSON.stringify(p)) as Person;
    void photo;
    return rest as Person;
  });
  return { format: TREE_FORMAT, version: TREE_VERSION, exportedAt: now.toISOString(), app: { build }, counts: { people: copy.length, links: countLinks(copy) }, people: copy, view };
}

export type ParseResult = { ok: true; file: TreeFile; warnings: string[] } | { ok: false; error: string };

const isStr = (v: unknown): v is string => typeof v === "string";
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

/** Проверка файла до любого изменения данных: формат, версия, структура, уникальность id. */
export function parseTreeFile(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Файл не читается: это не файл древа или он повреждён." };
  }
  if (!raw || typeof raw !== "object") return { ok: false, error: "Файл не похож на файл древа." };
  const f = raw as Record<string, unknown>;
  if (f.format !== TREE_FORMAT) return { ok: false, error: "Это не файл древа «Книги рода»." };
  if (typeof f.version !== "number" || !Number.isInteger(f.version) || f.version < 1) return { ok: false, error: "В файле не указана версия формата." };
  if (f.version > TREE_VERSION) return { ok: false, error: `Файл создан более новой версией приложения (формат ${f.version}). Обновите приложение и повторите.` };
  if (!Array.isArray(f.people)) return { ok: false, error: "В файле нет списка людей." };
  const seen = new Set<string>();
  const warnings: string[] = [];
  for (const [i, item] of f.people.entries()) {
    if (!item || typeof item !== "object") return { ok: false, error: `Запись №${i + 1} повреждена.` };
    const p = item as Record<string, unknown>;
    if (!isStr(p.id) || !p.id) return { ok: false, error: `У записи №${i + 1} нет id.` };
    if (seen.has(p.id)) return { ok: false, error: `Повторяется id «${p.id}»: файл повреждён.` };
    seen.add(p.id);
    if (!isStr(p.name) || !isStr(p.relation)) return { ok: false, error: `У записи №${i + 1} нет имени или «кем приходится».` };
    if (p.parents !== undefined && !isStrArr(p.parents)) return { ok: false, error: `У «${p.name}» неверно записаны родители.` };
    if (p.spouse !== undefined && !isStr(p.spouse)) return { ok: false, error: `У «${p.name}» неверно записан супруг.` };
    if (p.siblingOf !== undefined && !isStr(p.siblingOf)) return { ok: false, error: `У «${p.name}» неверно записан брат или сестра.` };
    if (p.moreSpouses !== undefined && !(Array.isArray(p.moreSpouses) && p.moreSpouses.every((m) => m && typeof m === "object" && isStr((m as { id?: unknown }).id)))) return { ok: false, error: `У «${p.name}» неверно записаны другие браки.` };
  }
  for (const p of f.people as Person[]) {
    for (const key of LINK_KEYS) {
      const refs = key === "parents" ? p.parents ?? [] : key === "siblingOf" ? (p.siblingOf ? [p.siblingOf] : []) : key === "spouse" ? (p.spouse ? [p.spouse] : []) : (p.moreSpouses ?? []).map((m) => m.id);
      for (const r of refs) if (!seen.has(r)) warnings.push(`«${p.name}»: ссылка на человека, которого нет в файле (${key}).`);
    }
  }
  const file: TreeFile = { format: TREE_FORMAT, version: f.version, exportedAt: isStr(f.exportedAt) ? f.exportedAt : "", app: { build: isStr((f.app as { build?: unknown } | undefined)?.build) ? (f.app as { build: string }).build : "" }, counts: { people: (f.people as unknown[]).length, links: countLinks(f.people as Person[]) }, people: f.people as Person[], view: f.view as Record<string, unknown> | undefined };
  return { ok: true, file, warnings };
}

const same = (a: Person, b: Person) => JSON.stringify(a) === JSON.stringify(b);

export type ImportPlan = { add: Person[]; identical: string[]; conflicts: { id: string; name: string; current: Person; incoming: Person }[] };

/** Что произойдёт при загрузке: новых добавим, совпадающих пропустим, отличающихся покажем. Ничего не заменяется молча. */
export function planImport(current: Person[], incoming: Person[]): ImportPlan {
  const byId = new Map(current.map((p) => [p.id, p]));
  const plan: ImportPlan = { add: [], identical: [], conflicts: [] };
  for (const p of incoming) {
    const have = byId.get(p.id);
    if (!have) plan.add.push(p);
    else if (same({ ...have, photo: undefined } as Person, { ...p, photo: undefined } as Person)) plan.identical.push(p.id);
    else plan.conflicts.push({ id: p.id, name: have.name, current: have, incoming: p });
  }
  return plan;
}

export type Diagnostics = {
  format: "kniga-roda-diagnostics";
  version: number;
  anonymized: boolean;
  note: string;
  exportedAt: string;
  app: { build: string };
  counts: { people: number; links: number; unions: number };
  people: Record<string, unknown>[];
  checks: { raw: string[]; graph: { code: string; ids: string[]; message: string }[]; ambiguous: { id: string; message: string }[] };
  layout: { ok: boolean; error?: string; nodes?: number; rows?: number; width?: number; height?: number; detached?: number };
  view?: Record<string, unknown>;
};

/**
 * Файл для диагностики. В обезличенном виде имена, даты, заметки, девичьи фамилии и фото убираются, id заменяются номерами;
 * остаются связи, пол, «кем приходится» и линия. Это не гарантия анонимности: по составу семьи человека иногда можно узнать.
 */
export function buildDiagnostics(people: Person[], opts: { anonymize: boolean; build?: string; view?: Record<string, unknown>; now?: Date }): Diagnostics {
  const ids = new Map(people.map((p, i) => [p.id, `P${i + 1}`]));
  const idOf = (id: string) => (opts.anonymize ? ids.get(id) ?? "P?" : id);
  const src = opts.anonymize
    ? people.map((p) => ({ id: idOf(p.id), name: idOf(p.id), relation: p.relation, birthYear: "", maidenName: "", notes: "", parents: p.parents?.map(idOf), siblingOf: p.siblingOf ? idOf(p.siblingOf) : undefined, spouse: p.spouse ? idOf(p.spouse) : undefined, spouseStatus: p.spouseStatus, moreSpouses: p.moreSpouses?.map((m) => ({ id: idOf(m.id), status: m.status })), gender: p.gender, line: p.line, fromFile: p.fromFile, treeSide: p.treeSide, treeRank: p.treeRank } as Person))
    : people.map((p) => ({ ...JSON.parse(JSON.stringify(p)), photo: undefined }) as Person);
  const data = treeFromPeople(src);
  const g = buildRelationshipGraph(data);
  const issues = validateGraph(g, data.focusId);
  let layout: Diagnostics["layout"];
  try {
    const l = layoutTree(data.people, data.unions, data.focusId);
    layout = { ok: true, nodes: l.nodes.length, rows: new Set(l.nodes.map((n) => Math.round(n.y))).size, width: Math.round(l.width), height: Math.round(l.height), detached: l.detached?.length ?? 0 };
  } catch (error) {
    layout = { ok: false, error: String((error as Error)?.message ?? error) };
  }
  void SELF_ID;
  return {
    format: "kniga-roda-diagnostics",
    version: 1,
    anonymized: opts.anonymize,
    note: opts.anonymize
      ? "Обезличенный файл: имена, даты, заметки и фото удалены, id заменены номерами. Структура семьи сохранена, поэтому полной анонимности он не гарантирует."
      : "Полный файл: содержит имена, годы и заметки родственников. Передавайте только тем, кому доверяете.",
    exportedAt: (opts.now ?? new Date()).toISOString(),
    app: { build: opts.build ?? "" },
    counts: { people: src.length, links: countLinks(src), unions: data.unions.length },
    people: src as unknown as Record<string, unknown>[],
    checks: { raw: validatePeopleLinks(src.map((p) => ({ id: p.id, name: opts.anonymize ? p.id : p.name, parents: p.parents, spouse: p.spouse }))), graph: issues.map((i) => ({ code: i.code, ids: i.ids.map((x) => (opts.anonymize ? x : x)), message: i.message })), ambiguous: data.ambiguous ?? [] },
    layout,
    view: opts.view,
  };
}
