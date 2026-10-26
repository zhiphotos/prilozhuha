import { create } from "zustand";
import { composeName } from "@/lib/rod/person";
import { isMediaRef, resolveMedia, saveMedia } from "@/lib/rod/media";
import { useRod } from "@/lib/rod/store";
import type { Person as RodPerson } from "@/lib/rod/types";
import type { UnionFacts } from "./fill.ts";
import { SELF_ID, roleOf, treeFromPeople } from "./from-people.ts";
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
};

export function emptyDraft(gender: Gender = "u"): Draft {
  return { firstName: "", patronymic: "", lastName: "", gender, birthYear: "", deathYear: "", note: "", photo: "" };
}

export function draftFrom(person: Person): Draft {
  return { firstName: person.firstName, patronymic: person.patronymic, lastName: person.lastName, gender: person.gender, birthYear: person.birthYear, deathYear: person.deathYear, note: person.note, photo: person.photo };
}

type State = {
  people: Person[];
  unions: Union[];
  focusId: string;
  theme: ThemeName;
  style: TreeStyle;
  banner: string;
  flow: TreeFlow;
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
  setFocus: (id: string) => void;
  updatePerson: (id: string, draft: Draft) => void;
  setUnionStatus: (id: string, status: UnionStatus) => void;
  setUnionYears: (id: string, startYear: string, endYear: string) => void;
  addRelative: (fromId: string, kind: RelKind, draft: Draft, unionId?: string, facts?: UnionFacts) => string | null;
  attachRelative: (fromId: string, kind: RelKind, existingId: string, unionId?: string, facts?: UnionFacts) => string | null;
  removePerson: (id: string) => void;
};

const KEY = "kniga-tree-ui";

function readUi(): { theme: ThemeName; style: TreeStyle; banner: string; flow: TreeFlow } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<{ theme: ThemeName; banner: string; flow: TreeFlow }>;
    return { theme: raw.theme === "paper" ? "paper" : "night", style: "work", banner: typeof raw.banner === "string" ? raw.banner : "", flow: raw.flow === "up" ? "up" : "down" };
  } catch {
    return { theme: "night", style: "work", banner: "", flow: "down" };
  }
}

function saveUi(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ theme: s.theme, banner: s.banner, flow: s.flow }));
  } catch {
    /* оформление живёт до закрытия */
  }
}

const photoUrls = new Map<string, string>();
const STATUS_BACK: Record<UnionStatus, "married" | "divorced" | "partners"> = { married: "married", divorced: "divorced", widowed: "married", partner: "partners" };

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
    return f ? "мать" : "отец";
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
    maidenName: "",
    notes: draft.note,
    gender: genderOf(draft.gender),
    photo,
    ...extra,
  });
  return useRod.getState().people[0]!.id;
}

export const useTree = create<State>((set, get) => {
  const ui = readUi();
  const initial = treeFromPeople(currentPeople());
  const persistUi = () => saveUi(get());
  const rebuild = () => {
    const data = treeFromPeople(currentPeople());
    const focus = data.people.some((p) => p.id === get().focusId) ? get().focusId : data.focusId;
    set({ people: data.people, unions: data.unions, focusId: focus });
  };
  useRod.subscribe(rebuild);

  const rod = (id: string) => useRod.getState().people.find((p) => p.id === id);
  const baseRoleOf = (id: string) => (id === SELF_ID ? "self" : roleOf(rod(id)?.relation ?? ""));

  return {
    ...ui,
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
          photo,
        });
      })();
    },
    setUnionStatus: (id, status) => {
      const union = get().unions.find((u) => u.id === id);
      if (!union) return;
      for (const pid of union.partnerIds) {
        const p = rod(pid);
        if (p?.spouse) useRod.getState().updatePerson(pid, { spouseStatus: STATUS_BACK[status] });
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
        if (base) extra.parents = [base.id, ...(base.spouse ? [base.spouse] : [])].slice(0, 2);
      } else if (base) extra.siblingOf = base.id;
      void (async () => {
        const photo = await storedPhoto(draft.photo);
        const created = createPerson(draft, relation, extra, photo);
        if ((kind === "father" || kind === "mother") && base) useRod.getState().updatePerson(base.id, { parents: [...(base.parents ?? []), created].slice(0, 2) });
        set({ selectedId: created, unionId: null, roster: false });
      })();
      return null;
    },
    attachRelative: (fromId, kind, existingId) => {
      const base = rod(fromId);
      const other = rod(existingId);
      if (!other) return "Нет такого человека";
      if (kind === "father" || kind === "mother") {
        if (base) useRod.getState().updatePerson(base.id, { parents: [...(base.parents ?? []), other.id].slice(0, 2) });
      } else if (kind === "spouse") {
        useRod.getState().updatePerson(other.id, { spouse: base?.id });
      } else if (kind === "son" || kind === "daughter") {
        if (base) useRod.getState().updatePerson(other.id, { parents: [base.id, ...(base.spouse ? [base.spouse] : [])].slice(0, 2) });
      } else if (base) useRod.getState().updatePerson(other.id, { siblingOf: base.id });
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
