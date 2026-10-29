import { syncRelations, onParentAdded, onSiblingSet, onSpouseAdded, parentsForChild, siblingLinks, type Patch as AutoPatch } from "@/lib/tree/auto-links";
import { create } from "zustand";
import { composeName } from "@/lib/rod/person";
import { isMediaRef, resolveMedia, saveMedia } from "@/lib/rod/media";
import { useRod } from "@/lib/rod/store";
import type { Person as RodPerson } from "@/lib/rod/types";
import type { UnionFacts } from "./fill.ts";
import { flipSpouse, moveBranch, type Patch } from "./arrange.ts";
import { setLayoutSpread } from "./layout.ts";
import { SELF_ID, roleOf, treeFromPeople } from "./from-people.ts";
import { buildRelationshipGraph, validateGraph, validatePeopleLinks } from "./relgraph.ts";
import type { TreeScope } from "./scope.ts";
import type { TreeStyle } from "./styles.ts";
import type { Gender, Person, Union, UnionStatus } from "./types.ts";

export type TreeFlow = "down" | "up";
export type ThemeName = "night" | "paper";
export type RelKind = "father" | "mother" | "spouse" | "son" | "daughter" | "brother" | "sister";
export type { TreeStyle };

export type Draft = {
  firstName: string;
  patronymic: string;
  lastName: string;
  gender: Gender;
  birthYear: string;
  deathYear: string;
  note: string;
  photo: string;
  /** Девичья фамилия, если отличается от нынешней. */
  maidenName?: string;
};

export function emptyDraft(gender: Gender = "u"): Draft {
  return { firstName: "", patronymic: "", lastName: "", gender, birthYear: "", deathYear: "", note: "", photo: "" };
}

export function draftFrom(person: Person): Draft {
  return { firstName: person.firstName, patronymic: person.patronymic, lastName: person.lastName, gender: person.gender, birthYear: person.birthYear, deathYear: person.deathYear, note: person.note, photo: person.photo, maidenName: person.maidenName ?? "" };
}

type State = {
  /** Замечания к связям: показываем, молча не исправляем. */
  issues: string[];
  people: Person[];
  unions: Union[];
  focusId: string;
  theme: ThemeName;
  style: TreeStyle;
  banner: string;
  flow: TreeFlow;
  scope: TreeScope;
  /** Насколько разводить ветки: 0 плотно, 1 шире, 2 ещё шире. */
  spread: 0 | 1 | 2;
  selectedId: string | null;
  unionId: string | null;
  roster: boolean;
  selectPerson: (id: string | null) => void;
  selectUnion: (id: string | null) => void;
  setRoster: (open: boolean) => void;
  setTheme: (theme: ThemeName) => void;
  setStyle: (style: TreeStyle) => void;
  setBanner: (banner: string) => void;
  setFlow: (flow: TreeFlow) => void;
  setScope: (scope: TreeScope) => void;
  setSpread: (spread: 0 | 1 | 2) => void;
  /** Поменять человека и его супруга местами на схеме. */
  flipSpouse: (id: string) => void;
  /** Сдвинуть ветку человека влево или вправо среди веток своего ряда. */
  moveBranch: (id: string, dir: -1 | 1) => void;
  setFocus: (id: string) => void;
  updatePerson: (id: string, draft: Draft) => void;
  setUnionStatus: (id: string, status: UnionStatus) => void;
  setUnionYears: (id: string, startYear: string, endYear: string) => void;
  addRelative: (fromId: string, kind: RelKind, draft: Draft, unionId?: string, facts?: UnionFacts) => string | null;
  attachRelative: (fromId: string, kind: RelKind, existingId: string, unionId?: string, facts?: UnionFacts) => string | null;
  removePerson: (id: string) => void;
};

const KEY = "kniga-tree-ui";

function readUi(): { theme: ThemeName; style: TreeStyle; banner: string; flow: TreeFlow; scope: TreeScope; spread: 0 | 1 | 2 } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<{ theme: ThemeName; banner: string; flow: TreeFlow; scope: TreeScope; spread: number }>;
    return { theme: raw.theme === "paper" ? "paper" : "night", style: "work", banner: typeof raw.banner === "string" ? raw.banner : "", flow: raw.flow === "up" ? "up" : "down", scope: (["direct", "direct-sib-root", "direct-sib-all", "blood"] as const).find((x) => x === raw.scope) ?? "all", spread: raw.spread === 1 || raw.spread === 2 ? raw.spread : 0 };
  } catch {
    return { theme: "night", style: "work", banner: "", flow: "down", scope: "all", spread: 0 };
  }
}

function saveUi(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ theme: s.theme, banner: s.banner, flow: s.flow, scope: s.scope, spread: s.spread }));
  } catch {
    /* оформление живёт до закрытия */
  }
}

const photoUrls = new Map<string, string>();
const STATUS_BACK: Record<UnionStatus, "married" | "divorced" | "partners" | "widowed"> = { married: "married", divorced: "divorced", widowed: "widowed", partner: "partners" };

/** Список «Люди» с готовыми адресами фото: источник правды остаётся там. */
function currentPeople(): RodPerson[] {
  return useRod.getState().people.map((p) => {
    if (!p.photo || !isMediaRef(p.photo)) return p;
    const url = photoUrls.get(p.photo);
    return url ? { ...p, photo: url } : { ...p, photo: undefined };
  });
}

function realId(id: string): boolean {
  return !id.startsWith("__");
}

function genderOf(g: Gender): "m" | "f" | undefined {
  return g === "m" || g === "f" ? g : undefined;
}

async function storedPhoto(photo: string): Promise<string | undefined> {
  if (!photo) return undefined;
  if (photo.startsWith("data:")) return saveMedia(photo);
  return undefined;
}

function relationFor(kind: RelKind, baseRole: string, gender: "m" | "f" | undefined): string {
  const f = gender === "f" || kind === "mother" || kind === "daughter" || kind === "sister";
  if (kind === "father" || kind === "mother") {
    if (baseRole === "self") return f ? "мама" : "папа";
    if (baseRole === "mother" || baseRole === "father") return f ? "бабушка" : "дедушка";
    if (baseRole === "grand") return f ? "прабабушка" : "прадедушка";
    // Слова «мать» и «отец» без уточнения программа читает как моих родителей: у родителей мужа, бабушки и других пишем «родитель».
    return f ? "родитель (мать)" : "родитель (отец)";
  }
  if (kind === "spouse") return f ? "жена" : "муж";
  if (kind === "son" || kind === "daughter") return baseRole === "self" ? (f ? "дочь" : "сын") : baseRole === "child" ? (f ? "внучка" : "внук") : f ? "дочь" : "сын";
  return f ? "сестра" : "брат";
}

/** Рождает человека в основном списке и возвращает его id. */
function createPerson(draft: Draft, relation: string, extra: Partial<RodPerson>, photo?: string): string {
  const parts = { firstName: draft.firstName.trim(), patronymic: draft.patronymic.trim(), lastName: draft.lastName.trim() };
  useRod.getState().addPerson({
    name: composeName(parts),
    ...parts,
    relation,
    birthYear: draft.birthYear,
    deathYear: draft.deathYear || undefined,
    maidenName: draft.maidenName?.trim() ?? "",
    notes: draft.note,
    gender: genderOf(draft.gender),
    photo,
    ...extra,
  });
  return useRod.getState().people[0]!.id;
}

function applyAuto(patch: AutoPatch) {
  for (const [id, change] of Object.entries(patch)) useRod.getState().updatePerson(id, change);
  useRod.setState((state) => ({ people: syncRelations(state.people) }));
}

/** Записывает ручную расстановку в список людей: источник правды остаётся там. */
function applyPatches(patches: Patch[]) {
  for (const patch of patches) {
    if (!realId(patch.id)) continue;
    const change: Partial<RodPerson> = {};
    if ("side" in patch) change.treeSide = patch.side ?? undefined;
    if (patch.rank !== undefined) change.treeRank = patch.rank;
    useRod.getState().updatePerson(patch.id, change);
  }
}

function issuesOf(data: ReturnType<typeof treeFromPeople>): string[] {
  const name = (id: string) => data.people.find((p) => p.id === id)?.firstName || "?";
  const found = validateGraph(buildRelationshipGraph(data), data.focusId).map((i) => `${i.message} (${[...new Set(i.ids)].map(name).join(", ")})`);
  return [...validatePeopleLinks(currentPeople()), ...found, ...(data.ambiguous ?? []).map((a) => a.message)];
}

export const useTree = create<State>((set, get) => {
  const ui = readUi();
  setLayoutSpread(ui.spread);
  const initial = treeFromPeople(currentPeople());
  const persistUi = () => saveUi(get());
  const rebuild = () => {
    const data = treeFromPeople(currentPeople());
    const focus = data.people.some((p) => p.id === get().focusId) ? get().focusId : data.focusId;
    set({ people: data.people, unions: data.unions, focusId: focus, issues: issuesOf(data) });
  };
  useRod.subscribe(rebuild);

  const rod = (id: string) => useRod.getState().people.find((p) => p.id === id);
  const baseRoleOf = (id: string) => (id === SELF_ID ? "self" : roleOf(rod(id)?.relation ?? ""));

  return {
    ...ui,
    issues: issuesOf(initial),
    people: initial.people,
    unions: initial.unions,
    focusId: initial.focusId,
    selectedId: null,
    unionId: null,
    roster: false,
    selectPerson: (id) => set({ selectedId: id, unionId: null, roster: false }),
    selectUnion: (id) => set({ unionId: id, selectedId: null, roster: false }),
    setRoster: (roster) => set({ roster, selectedId: roster ? null : get().selectedId, unionId: null }),
    setTheme: (theme) => { set({ theme }); persistUi(); },
    setStyle: (style) => set({ style }),
    setBanner: (banner) => { set({ banner }); persistUi(); },
    setFlow: (flow) => { set({ flow }); persistUi(); },
    setScope: (scope) => { set({ scope }); persistUi(); },
    setSpread: (spread) => { setLayoutSpread(spread); set({ spread }); persistUi(); },
    flipSpouse: (id) => applyPatches(flipSpouse(get().people, get().unions, get().focusId, id)),
    moveBranch: (id, dir) => applyPatches(moveBranch(get().people, get().unions, get().focusId, id, dir)),
    setFocus: (id) => set({ focusId: id }),
    updatePerson: (id, draft) => {
      void (async () => {
        const photo = draft.photo ? (await storedPhoto(draft.photo)) ?? rod(id)?.photo : undefined;
        const parts = { firstName: draft.firstName.trim(), patronymic: draft.patronymic.trim(), lastName: draft.lastName.trim() };
        if (!realId(id)) {
          // Пустое место в древе: имя заполнили, значит появился настоящий человек.
          if (!parts.firstName) return;
          const grand = id.match(/^__grand_(mom|dad)_(m|f)$/);
          const relation = grand ? (grand[2] === "f" ? "бабушка" : "дедушка") : id.startsWith("__mother") ? "мама" : "папа";
          const created = createPerson(draft, relation, { line: grand ? (grand[1] as "mom" | "dad") : undefined }, photo);
          set({ selectedId: created });
          return;
        }
        if (id === SELF_ID) return;
        useRod.getState().updatePerson(id, {
          name: composeName(parts),
          ...parts,
          gender: genderOf(draft.gender),
          birthYear: draft.birthYear,
          deathYear: draft.deathYear || undefined,
          notes: draft.note,
          maidenName: draft.maidenName?.trim() ?? "",
          photo,
        });
      })();
    },
    setUnionStatus: (id, status) => {
      const union = get().unions.find((u) => u.id === id);
      if (!union) return;
      const next = STATUS_BACK[status];
      // Статус хранится у того, кто указал супруга: основной брак или один из «ещё браков». Сохраняем у обоих, чтобы работало и без заполненной вкладки «Люди».
      let saved = false;
      for (const pid of union.partnerIds) {
        const p = rod(pid);
        if (!p) continue;
        const other = union.partnerIds.find((x) => x !== pid);
        if (p.spouse && p.spouse === other) {
          useRod.getState().updatePerson(pid, { spouseStatus: next });
          saved = true;
        } else if (other && p.moreSpouses?.some((m) => m.id === other)) {
          useRod.getState().updatePerson(pid, { moreSpouses: p.moreSpouses.map((m) => (m.id === other ? { ...m, status: next } : m)) });
          saved = true;
        }
      }
      if (!saved) {
        // Связи в «Людях» нет (брак добавлен на схеме без записи): ставим её первому из пары.
        const first = union.partnerIds.map(rod).find(Boolean);
        const other = union.partnerIds.find((x) => x !== first?.id);
        if (first && other && !first.spouse) useRod.getState().updatePerson(first.id, { spouse: other, spouseStatus: next });
      }
    },
    setUnionYears: (id, startYear, endYear) => {
      const union = get().unions.find((u) => u.id === id);
      if (!union) return;
      const clean = (v: string) => v.replace(/\D/g, "").slice(0, 4);
      const holder = union.partnerIds.map(rod).find((p) => p?.spouse) ?? union.partnerIds.map(rod).find(Boolean);
      if (holder) useRod.getState().updatePerson(holder.id, { unionFrom: clean(startYear), unionTo: clean(endYear) });
    },
    addRelative: (fromId, kind, draft, _unionId, facts) => {
      if (!draft.firstName.trim()) return "Введите имя";
      const base = rod(fromId);
      if (!realId(fromId) && fromId !== SELF_ID) return "Сначала заполните это место, потом добавляйте родню";
      const baseRole = baseRoleOf(fromId);
      const gender: "m" | "f" | undefined = kind === "father" || kind === "brother" || kind === "son" ? "m" : kind === "mother" || kind === "sister" || kind === "daughter" ? "f" : genderOf(draft.gender);
      const relation = relationFor(kind, baseRole, gender);
      const line = base?.line ?? (baseRole === "mother" ? "mom" : baseRole === "father" ? "dad" : undefined);
      const extra: Partial<RodPerson> = { gender };
      if (kind === "father" || kind === "mother") {
        if (/бабушк|дедушк/.test(relation)) extra.line = line;
      } else if (kind === "spouse") {
        if (base) extra.spouse = base.id;
        extra.spouseStatus = facts?.status ? STATUS_BACK[facts.status] : "married";
        if (facts?.startYear) extra.unionFrom = facts.startYear;
        if (facts?.endYear) extra.unionTo = facts.endYear;
      } else if (kind === "son" || kind === "daughter") {
        if (base) extra.parents = parentsForChild(useRod.getState().people, base.id);
      } else if (base) Object.assign(extra, siblingLinks(base));
      void (async () => {
        const photo = await storedPhoto(draft.photo);
        const created = createPerson(draft, relation, extra, photo);
        if ((kind === "father" || kind === "mother") && base) applyAuto(onParentAdded(useRod.getState().people, base.id, created));
        if (kind === "spouse" && base) applyAuto(onSpouseAdded(useRod.getState().people, base.id, created));
        useRod.setState((state) => ({ people: syncRelations(state.people) }));
        set({ selectedId: created, unionId: null, roster: false });
      })();
      return null;
    },
    attachRelative: (fromId, kind, existingId) => {
      const base = rod(fromId);
      const other = rod(existingId);
      if (!other) return "Нет такого человека";
      if (kind === "father" || kind === "mother") {
        if (base) applyAuto(onParentAdded(useRod.getState().people, base.id, other.id));
      } else if (kind === "spouse") {
        useRod.getState().updatePerson(other.id, { spouse: base?.id });
        if (base) applyAuto(onSpouseAdded(useRod.getState().people, base.id, other.id));
      } else if (kind === "son" || kind === "daughter") {
        if (base) useRod.getState().updatePerson(other.id, { parents: parentsForChild(useRod.getState().people, base.id) });
      } else if (base) {
        useRod.getState().updatePerson(other.id, siblingLinks(base));
        applyAuto(onSiblingSet(useRod.getState().people, other.id, base.id));
      }
      set({ selectedId: other.id, unionId: null, roster: false });
      return null;
    },
    removePerson: (id) => {
      if (realId(id)) useRod.getState().removePerson(id);
      set({ selectedId: null, unionId: null });
    },
  };
});

/** Подтягиваем фото из хранилища книги; когда готовы, пересобираем древо. */
export function warmPhotos(): void {
  for (const p of useRod.getState().people) {
    if (!p.photo || !isMediaRef(p.photo) || photoUrls.has(p.photo)) continue;
    const ref = p.photo;
    void resolveMedia(ref).then((url) => {
      if (!url) return;
      photoUrls.set(ref, url);
      useRod.setState({});
    });
  }
}
