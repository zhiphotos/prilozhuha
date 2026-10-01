import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { MEDIA_STORE, STATE_STORE, idbClear, idbGet, idbSet } from "@/lib/rod/idb";
import type {
  Audience,
  BookPage,
  CardNote,
  FamilyDoc,
  FamilyPhoto,
  Person,
  Place,
  Story,
  TimelineEvent,
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
  doneLessons: string[];
  finishOnboarding: (input: { audience: Audience; dedicatee: string; collector: string }) => void;
  updateProfile: (input: { audience: Audience; dedicatee: string; collector: string }) => void;
  addPerson: (input: Omit<Person, "id">) => void;
  updatePerson: (id: string, patch: Partial<Omit<Person, "id">>) => void;
  removePerson: (id: string) => void;
  addPlace: (input: Omit<Place, "id">) => void;
  removePlace: (id: string) => void;
  addPhoto: (input: Omit<FamilyPhoto, "id">) => boolean;
  removePhoto: (id: string) => void;
  addStory: (input: Omit<Story, "id" | "createdAt">) => string;
  removeStory: (id: string) => void;
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
  restorePage: (id: string) => void;
  purgeTrash: () => void;
  openProgram: () => void;
  completeLesson: (id: string) => void;
  resetAll: () => void;
};

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
  doneLessons: [] as string[],
};

function uid(): string {
  return crypto.randomUUID();
}

const KEY = "kniga-roda";
let saveTimer: number | undefined;
let lastValue: string | null = null;

// Состояние пишется в IndexedDB с небольшой задержкой: при наборе текста не надо сохранять каждую букву.
const bookStorage: StateStorage = {
  getItem: async (name) => {
    const stored = await idbGet<string>(STATE_STORE, name).catch(() => undefined);
    if (stored) return stored;
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    lastValue = value;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      const next = lastValue;
      lastValue = null;
      if (next !== null) void idbSet(STATE_STORE, name, next).catch(() => undefined);
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
  void idbSet(STATE_STORE, KEY, next).catch(() => undefined);
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
      removePerson: (id) => set((state) => ({ people: state.people.filter((person) => person.id !== id) })),
      addPlace: (input) => set((state) => ({ places: [{ ...input, id: uid() }, ...state.places] })),
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
      updatePage: (id, updater) =>
        set((state) => ({
          pages: state.pages.map((page) => (page.id === id ? updater(page) : page)),
        })),
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
            trash: [{ page, index, at: new Date().toISOString() }, ...state.trash].slice(0, 60),
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
      completeLesson: (id) =>
        set((state) => ({
          doneLessons: state.doneLessons.includes(id) ? state.doneLessons : [...state.doneLessons, id],
        })),
      resetAll: () => {
        set({ ...empty });
        void idbClear(MEDIA_STORE).catch(() => undefined);
      },
    }),
    {
      name: KEY,
      storage: createJSONStorage(() => bookStorage),
      skipHydration: true,
    },
  ),
);
