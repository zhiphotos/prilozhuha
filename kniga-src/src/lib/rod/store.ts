import { toast } from "sonner";
import { bumpUsage, searchesLeft, type SearchUsage } from "@/lib/rod/search-limit";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { applyFormat } from "@/lib/rod/book-format";
import { noteEdit } from "@/lib/rod/edit-counter";
import { DEFAULT_PRINT, isDark, type PrintSetup } from "@/lib/rod/page-style";
import { MEDIA_STORE, STATE_STORE, idbClear, idbGet, idbSet } from "@/lib/rod/idb";
import { activeProjectId, listProjects, setActiveProject, storageKeyFor } from "@/lib/rod/projects";
import {
  BACK_ID,
  type Audience,
  type BookPage,
  type CardNote,
  type Chapter,
  type CustomFontEntry,
  type FamilyDoc,
  type FamilyPhoto,
  type Person,
  type Place,
  type SpineSetup,
  type Story,
  type TimelineEvent,
} from "@/lib/rod/types";

export type TrashedPage = { page: BookPage; index: number; at: string };

type RodState = {
  onboarded: boolean;
  audience: Audience | null;
  dedicatee: string;
  collector: string;
  people: Person[];
  places: Place[];
  photos: FamilyPhoto[];
  stories: Story[];
  events: TimelineEvent[];
  documents: FamilyDoc[];
  notes: CardNote[];
  pages: BookPage[];
  trash: TrashedPage[];
  programOpen: boolean;
  /** Счётчик поисков предков по архивам за месяц (лимит 10). */
  searchUsage?: SearchUsage;
  /** Оплаченный доступ: подписанный токен от сервера. В копию книги не попадает, чтобы файлом нельзя было открыть программу другим. */
  access: { token: string; until: number; order: string } | null;
  /** Семейная комната: ссылка для родственников и ключ владельца (в копию книги не попадает). */
  room: { id: string; ownerKey: string; inviteKey: string; name: string } | null;
  doneLessons: string[];
  print: PrintSetup;
  /** Картинки-ориентиры для дизайна («вайб»), в книгу не печатаются. */
  moodboard: string[];
  /** Задняя сторона обложки (null – стандартная надпись). */
  back: BookPage | null;
  spine: SpineSetup;
  /** Свои шрифты и стикеры/футажи из файлов. */
  fonts: CustomFontEntry[];
  userStickers: string[];
  /** Оглавление: главы по порядку. */
  plan: Chapter[];
  setPlan: (plan: Chapter[]) => void;
  toggleChapter: (id: string) => void;
  renameChapter: (id: string, title: string) => void;
  setChapterPlanned: (id: string, planned: number) => void;
  removeChapter: (id: string) => void;
  moveChapter: (id: string, dir: -1 | 1) => void;
  addFont: (font: CustomFontEntry) => void;
  removeFont: (id: string) => void;
  addUserSticker: (ref: string) => void;
  removeUserSticker: (ref: string) => void;
  setSpine: (patch: Partial<SpineSetup>) => void;
  insertPage: (input: Omit<BookPage, "id">, index: number) => string;
  /** Переносит выбранные страницы так, чтобы они встали перед страницей с номером `to` (по списку без них). */
  movePages: (ids: string[], to: number) => void;
  addMood: (ref: string) => void;
  removeMood: (ref: string) => void;
  setPrint: (patch: Partial<PrintSetup>) => void;
  finishOnboarding: (input: { audience: Audience; dedicatee: string; collector: string }) => void;
  updateProfile: (input: { audience: Audience; dedicatee: string; collector: string }) => void;
  addPerson: (input: Omit<Person, "id">) => void;
  updatePerson: (id: string, patch: Partial<Omit<Person, "id">>) => void;
  removePerson: (id: string) => void;
  addPlace: (input: Omit<Place, "id">) => void;
  updatePlace: (id: string, patch: Partial<Omit<Place, "id">>) => void;
  removePlace: (id: string) => void;
  addPhoto: (input: Omit<FamilyPhoto, "id">) => boolean;
  removePhoto: (id: string) => void;
  addStory: (input: Omit<Story, "id" | "createdAt">) => string;
  removeStory: (id: string) => void;
  updateStory: (id: string, patch: Partial<Pick<Story, "title" | "narrative" | "attachments">>) => void;
  addEvent: (input: Omit<TimelineEvent, "id">) => void;
  removeEvent: (id: string) => void;
  addDocument: (input: Omit<FamilyDoc, "id">) => void;
  removeDocument: (id: string) => void;
  addNote: (input: Omit<CardNote, "id" | "createdAt">) => void;
  removeNote: (id: string) => void;
  addPage: (input: Omit<BookPage, "id">) => string;
  updatePage: (id: string, updater: (page: BookPage) => BookPage) => void;
  movePage: (id: string, direction: -1 | 1) => void;
  placePage: (id: string, index: number) => void;
  duplicatePage: (id: string) => string | null;
  removePage: (id: string) => void;
  removePages: (ids: string[]) => void;
  restorePage: (id: string) => void;
  purgeTrash: () => void;
  openProgram: () => void;
  /** Списывает один поиск предков; false, если месячный лимит исчерпан. */
  spendSearch: () => boolean;
  setRoom: (room: { id: string; ownerKey: string; inviteKey: string; name: string } | null) => void;
  grantAccess: (access: { token: string; until: number; order: string }) => void;
  revokeAccess: () => void;
  completeLesson: (id: string) => void;
  resetAll: () => void;
};

const DEFAULT_SPINE: SpineSetup = { text: "", font: "script", size: 0 };

const empty = {
  onboarded: false,
  audience: null as Audience | null,
  dedicatee: "",
  collector: "",
  people: [] as Person[],
  places: [] as Place[],
  photos: [] as FamilyPhoto[],
  stories: [] as Story[],
  events: [] as TimelineEvent[],
  documents: [] as FamilyDoc[],
  notes: [] as CardNote[],
  pages: [] as BookPage[],
  trash: [] as TrashedPage[],
  programOpen: false,
  access: null,
  room: null,
  doneLessons: [] as string[],
  print: DEFAULT_PRINT as PrintSetup,
  moodboard: [] as string[],
  back: null as BookPage | null,
  spine: DEFAULT_SPINE as SpineSetup,
  fonts: [] as CustomFontEntry[],
  userStickers: [] as string[],
  plan: [] as Chapter[],
};

/** Задняя сторона по умолчанию: того же цвета, что и лицевая. */
export function backPage(cover?: BookPage | null): BookPage {
  const darkCover = Boolean(cover?.bg && /^#[0-9a-f]{6}$/i.test(cover.bg) && isDark(cover.bg));
  return {
    id: BACK_ID,
    title: "Задняя сторона",
    kind: "page",
    designed: true,
    paper: cover?.paper ?? "rose",
    bg: cover?.bg,
    strokes: [],
    blocks: [
      {
        id: "back-text",
        type: "text",
        x: 12,
        y: 42,
        w: 76,
        text: "Эту книгу можно продолжать.\nСледующую страницу допишет уже другой.",
        font: "script",
        size: "lg",
        align: "center",
        color: darkCover ? "#fbf8f3" : "#8e3d52",
      },
    ],
  };
}

function uid(): string {
  return crypto.randomUUID();
}

let KEY = typeof window === "undefined" ? "kniga-roda" : storageKeyFor(activeProjectId());
let suspendSave = false;
let saveTimer: number | undefined;
let lastValue: string | null = null;

let warnedAt = 0;

/** Пишет книгу в IndexedDB; при ошибке повторяет, потом пишет запасную копию и честно предупреждает. */
async function persistBook(name: string, value: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await idbSet(STATE_STORE, name, value);
      return;
    } catch {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    }
  }
  let backedUp = false;
  try {
    localStorage.setItem(name, value);
    backedUp = true;
  } catch {
    /* места нет и там */
  }
  if (Date.now() - warnedAt > 30000) {
    warnedAt = Date.now();
    toast(backedUp ? "Книга сохранена в запасном месте. Сделайте копию в «Настройках»." : "Не получилось сохранить последние правки. Сделайте копию книги в «Настройках».", { duration: 9000 });
  }
}

// Состояние пишется в IndexedDB с небольшой задержкой: при наборе текста не надо сохранять каждую букву.
const bookStorage: StateStorage = {
  getItem: async (name) => {
    let failed = false;
    const stored = await idbGet<string>(STATE_STORE, name).catch(() => {
      failed = true;
      return undefined;
    });
    // Не удалось прочитать хранилище (бывает на iPhone после сворачивания): ничего не сохраняем, чтобы пустое состояние не затёрло настоящую книгу.
    if (failed) {
      suspendSave = true;
      throw new Error("Не удалось прочитать книгу. Закройте приложение и откройте снова.");
    }
    if (stored === "") return null;
    if (stored) return stored;
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    if (suspendSave) return;
    lastValue = value;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      const next = lastValue;
      lastValue = null;
      if (next !== null) void persistBook(name, next);
    }, 250);
  },
  removeItem: async (name) => {
    await idbSet(STATE_STORE, name, "").catch(() => undefined);
  },
};

export function flushBook(): void {
  if (lastValue === null) return;
  window.clearTimeout(saveTimer);
  const next = lastValue;
  lastValue = null;
  void persistBook(KEY, next);
}

/** Переключает на другую книгу: сохраняет текущую, читает выбранную. */
export async function openProject(id: string, seed?: Partial<typeof empty>): Promise<void> {
  flushBook();
  suspendSave = true;
  try {
    setActiveProject(id);
    KEY = storageKeyFor(id);
    useRod.persist.setOptions({ name: KEY });
    useRod.setState({ ...empty, ...(seed ?? {}) });
    if (!seed) await Promise.resolve(useRod.persist.rehydrate());
  } finally {
    suspendSave = false;
  }
  if (seed) {
    // Новая книга сразу записывается под своим ключом.
    useRod.setState({});
    flushBook();
  }
}

/** Стирает хранилище книги целиком (не картинки: они общие). */
export async function dropProjectData(id: string): Promise<void> {
  await idbSet(STATE_STORE, storageKeyFor(id), "").catch(() => undefined);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushBook);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushBook();
  });
}

export const useRod = create<RodState>()(
  persist(
    (set, get) => ({
      ...empty,
      finishOnboarding: ({ audience, dedicatee, collector }) =>
        set({ onboarded: true, audience, dedicatee: dedicatee.trim(), collector: collector.trim() }),
      updateProfile: ({ audience, dedicatee, collector }) =>
        set({ audience, dedicatee: dedicatee.trim(), collector: collector.trim() }),
      addPerson: (input) =>
        set((state) => ({
          people: [{ ...input, id: uid() }, ...state.people],
        })),
      updatePerson: (id, patch) =>
        set((state) => ({
          people: state.people.map((person) => (person.id === id ? { ...person, ...patch } : person)),
        })),
      removePerson: (id) =>
        set((state) => ({
          people: state.people.filter((person) => person.id !== id).map((person) => {
            let next = person;
            if (next.parents?.includes(id)) next = { ...next, parents: next.parents.filter((parent) => parent !== id) };
            if (next.spouse === id) next = { ...next, spouse: undefined };
            return next;
          }),
        })),
      addPlace: (input) => set((state) => ({ places: [{ ...input, id: uid() }, ...state.places] })),
      updatePlace: (id, patch) => set((state) => ({ places: state.places.map((place) => (place.id === id ? { ...place, ...patch } : place)) })),
      removePlace: (id) => set((state) => ({ places: state.places.filter((place) => place.id !== id) })),
      addPhoto: (input) => {
        if (get().photos.length >= 600) return false;
        set((state) => ({ photos: [{ ...input, id: uid() }, ...state.photos] }));
        return true;
      },
      removePhoto: (id) => set((state) => ({ photos: state.photos.filter((photo) => photo.id !== id) })),
      addStory: (input) => {
        const id = uid();
        set((state) => ({
          stories: [{ ...input, id, createdAt: new Date().toISOString() }, ...state.stories],
        }));
        return id;
      },
      removeStory: (id) => set((state) => ({ stories: state.stories.filter((story) => story.id !== id) })),
      updateStory: (id, patch) => set((state) => ({ stories: state.stories.map((story) => (story.id === id ? { ...story, ...patch } : story)) })),
      addEvent: (input) => set((state) => ({ events: [{ ...input, id: uid() }, ...state.events] })),
      removeEvent: (id) => set((state) => ({ events: state.events.filter((event) => event.id !== id) })),
      addDocument: (input) => set((state) => ({ documents: [{ ...input, id: uid() }, ...state.documents] })),
      removeDocument: (id) => set((state) => ({ documents: state.documents.filter((doc) => doc.id !== id) })),
      addNote: (input) =>
        set((state) => ({
          notes: [{ ...input, id: uid(), createdAt: new Date().toISOString() }, ...state.notes],
        })),
      removeNote: (id) => set((state) => ({ notes: state.notes.filter((note) => note.id !== id) })),
      addPage: (input) => {
        const id = uid();
        set((state) => ({ pages: [...state.pages, { ...input, id }] }));
        return id;
      },
      updatePage: (id, updater) => {
        noteEdit();
        set((state) => {
          if (id === BACK_ID) return { back: updater(state.back ?? backPage(state.pages[0]?.kind === "cover" ? state.pages[0] : null)) };
          return { pages: state.pages.map((page) => (page.id === id ? { ...updater(page), editedAt: Date.now() } : page)) };
        });
      },
      setPlan: (plan) => set({ plan }),
      toggleChapter: (id) => set((state) => ({ plan: state.plan.map((c) => (c.id === id ? { ...c, done: !c.done } : c)) })),
      setChapterPlanned: (id, planned) => set((state) => ({ plan: state.plan.map((c) => (c.id === id ? { ...c, planned: Math.max(1, Math.min(60, Math.round(planned))) } : c)) })),
      renameChapter: (id, title) => set((state) => ({ plan: state.plan.map((c) => (c.id === id ? { ...c, title: title.trim() || c.title } : c)) })),
      removeChapter: (id) =>
        set((state) => ({
          plan: state.plan.filter((c) => c.id !== id),
          pages: state.pages.map((page) => (page.chapterId === id ? { ...page, chapterId: undefined } : page)),
        })),
      moveChapter: (id, dir) =>
        set((state) => {
          const i = state.plan.findIndex((c) => c.id === id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= state.plan.length) return state;
          const plan = state.plan.slice();
          [plan[i], plan[j]] = [plan[j], plan[i]];
          return { plan };
        }),
      movePages: (ids, to) =>
        set((state) => {
          const chosen = new Set(ids);
          const moving = state.pages.filter((page) => chosen.has(page.id) && page.kind !== "cover");
          if (!moving.length) return state;
          const rest = state.pages.filter((page) => !moving.includes(page));
          const floor = rest[0]?.kind === "cover" ? 1 : 0;
          rest.splice(Math.max(floor, Math.min(to, rest.length)), 0, ...moving);
          return { pages: rest };
        }),
      insertPage: (input, index) => {
        const id = uid();
        set((state) => {
          const pages = state.pages.slice();
          pages.splice(Math.max(0, Math.min(index, pages.length)), 0, { ...input, id });
          return { pages };
        });
        return id;
      },
      addFont: (font) => set((state) => ({ fonts: [...state.fonts, font] })),
      removeFont: (id) => set((state) => ({ fonts: state.fonts.filter((font) => font.id !== id) })),
      addUserSticker: (ref) => set((state) => ({ userStickers: [ref, ...state.userStickers].slice(0, 200) })),
      removeUserSticker: (ref) => set((state) => ({ userStickers: state.userStickers.filter((item) => item !== ref) })),
      setSpine: (patch) => set((state) => ({ spine: { ...state.spine, ...patch } })),
      movePage: (id, direction) =>
        set((state) => {
          const index = state.pages.findIndex((page) => page.id === id);
          const next = index + direction;
          if (index < 0 || next < 0 || next >= state.pages.length) return state;
          const pages = state.pages.slice();
          const [item] = pages.splice(index, 1);
          pages.splice(next, 0, item);
          return { pages };
        }),
      placePage: (id, index) =>
        set((state) => {
          const from = state.pages.findIndex((page) => page.id === id);
          if (from < 0) return state;
          const pages = state.pages.slice();
          const [item] = pages.splice(from, 1);
          pages.splice(Math.max(0, Math.min(index, pages.length)), 0, item);
          return { pages };
        }),
      duplicatePage: (id) => {
        const source = get().pages.find((page) => page.id === id);
        if (!source) return null;
        const copy = {
          ...source,
          id: uid(),
          kind: "page" as const,
          title: `${source.title} (копия)`,
          blocks: source.blocks.map((block) => ({ ...block, id: uid() })),
          strokes: source.strokes.map((stroke) => ({ ...stroke, id: uid() })),
        };
        set((state) => {
          const index = state.pages.findIndex((page) => page.id === id);
          const pages = state.pages.slice();
          pages.splice(index + 1, 0, copy);
          return { pages };
        });
        return copy.id;
      },
      removePage: (id) =>
        set((state) => {
          const index = state.pages.findIndex((page) => page.id === id);
          if (index < 0) return state;
          const page = state.pages[index];
          return {
            pages: state.pages.filter((item) => item.id !== id),
            trash: [{ page, index, at: new Date().toISOString() }, ...state.trash].slice(0, 300),
          };
        }),
      removePages: (ids) =>
        set((state) => {
          const gone = new Set(ids);
          const at = new Date().toISOString();
          const removed = state.pages.map((page, index) => ({ page, index, at })).filter((item) => gone.has(item.page.id));
          return {
            pages: state.pages.filter((page) => !gone.has(page.id)),
            trash: [...removed.reverse(), ...state.trash].slice(0, 300),
          };
        }),
      restorePage: (id) =>
        set((state) => {
          const item = state.trash.find((entry) => entry.page.id === id);
          if (!item) return state;
          const pages = state.pages.slice();
          pages.splice(Math.min(item.index, pages.length), 0, item.page);
          return { pages, trash: state.trash.filter((entry) => entry.page.id !== id) };
        }),
      purgeTrash: () => set({ trash: [] }),
      openProgram: () => set({ programOpen: true }),
      spendSearch: () => {
        if (searchesLeft(get().searchUsage) <= 0) return false;
        set({ searchUsage: bumpUsage(get().searchUsage) });
        return true;
      },
      setRoom: (room) => set({ room }),
      grantAccess: (access) => set({ access, programOpen: true }),
      revokeAccess: () => set({ access: null, programOpen: false }),
      addMood: (ref) => set((state) => ({ moodboard: [ref, ...state.moodboard].slice(0, 120) })),
      removeMood: (ref) => set((state) => ({ moodboard: state.moodboard.filter((item) => item !== ref) })),
      setPrint: (patch) => set((state) => ({ print: { ...state.print, ...patch } })),
      completeLesson: (id) =>
        set((state) => ({
          doneLessons: state.doneLessons.includes(id) ? state.doneLessons : [...state.doneLessons, id],
        })),
      resetAll: () => {
        set({ ...empty });
        // Картинки общие для всех книг: стираем их только если книга одна.
        if (listProjects().length <= 1) void idbClear(MEDIA_STORE).catch(() => undefined);
      },
    }),
    {
      name: KEY,
      storage: createJSONStorage(() => bookStorage),
      skipHydration: true,
    },
  ),
);

// Формат страницы (пропорция) живёт в настройках печати: при смене или загрузке книги пересчитываем размеры.
useRod.subscribe((state, prev) => {
  if (state.print !== prev.print) applyFormat(state.print);
});
