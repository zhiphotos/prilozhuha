import { create } from "zustand";
import { persist } from "zustand/middleware";
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
  removePage: (id: string) => void;
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
  programOpen: false,
  doneLessons: [] as string[],
};

function uid(): string {
  return crypto.randomUUID();
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
        if (get().photos.length >= 12) return false;
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
      removePage: (id) => set((state) => ({ pages: state.pages.filter((page) => page.id !== id) })),
      openProgram: () => set({ programOpen: true }),
      completeLesson: (id) =>
        set((state) => ({
          doneLessons: state.doneLessons.includes(id) ? state.doneLessons : [...state.doneLessons, id],
        })),
      resetAll: () => set({ ...empty }),
    }),
    {
      name: "kniga-roda",
      skipHydration: true,
    },
  ),
);
