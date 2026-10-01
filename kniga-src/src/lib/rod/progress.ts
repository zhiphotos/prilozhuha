import type { Audience, BookPage, CardNote, FamilyDoc, FamilyPhoto, Person, Place, Story, TimelineEvent } from "@/lib/rod/types";
import type { Screen } from "@/lib/rod/types";

export type Counts = {
  people: number;
  places: number;
  photos: number;
  stories: number;
  docs: number;
  notes: number;
  events: number;
};

export type ProgressPart = {
  key: "family" | "places" | "photos" | "stories" | "docs";
  label: string;
  value: number;
};

export type NextStep = {
  title: string;
  detail: string;
  screen: Screen;
};

export type RodSnapshot = {
  people: Person[];
  places: Place[];
  photos: FamilyPhoto[];
  stories: Story[];
  documents: FamilyDoc[];
  notes: CardNote[];
  events: TimelineEvent[];
  audience: Audience | null;
  dedicatee: string;
  pages?: BookPage[];
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function countsOf(data: RodSnapshot): Counts {
  return {
    people: data.people.length,
    places: data.places.length,
    photos: data.photos.length,
    stories: data.stories.length,
    docs: data.documents.length,
    notes: data.notes.length,
    events: data.events.length,
  };
}

export function partsOf(data: RodSnapshot): ProgressPart[] {
  const pages = data.pages ?? [];
  const extraPhotos = pages.reduce((sum, page) => sum + page.blocks.filter((block) => block.type === "photo").length, 0);
  const extraPlaces = pages.reduce(
    (sum, page) => sum + page.blocks.filter((block) => block.type === "chip" && block.kind === "place").length,
    0,
  );
  const extraDocs = pages.reduce((sum, page) => sum + page.blocks.filter((block) => block.type === "doc").length, 0);
  const extraStories = pages.filter(
    (page) =>
      page.strokes.length > 6 ||
      page.blocks.some((block) => (block.type === "text" && block.text.trim().length > 24) || block.type === "voice"),
  ).length;
  const familyPoints = data.people.reduce((sum, person) => {
    let score = 1;
    if (person.birthYear.trim()) score += 0.45;
    if (person.maidenName.trim()) score += 0.7;
    if (person.notes.trim()) score += 0.25;
    return sum + score;
  }, 0);
  return [
    { key: "family", label: "👨‍👩‍👧 Семья", value: clamp((familyPoints / 8) * 100) },
    { key: "places", label: "📍 Места", value: clamp(((data.places.length + extraPlaces) / 4) * 100) },
    { key: "photos", label: "📸 Фотографии", value: clamp(((data.photos.length + extraPhotos) / 6) * 100) },
    { key: "stories", label: "📖 Истории", value: clamp(((data.stories.length + extraStories) / 4) * 100) },
    { key: "docs", label: "📄 Документы", value: clamp(((data.documents.length + extraDocs) / 3) * 100) },
  ];
}

export function overallOf(parts: ProgressPart[]): number {
  const weights: Record<ProgressPart["key"], number> = {
    family: 0.3,
    places: 0.15,
    photos: 0.25,
    stories: 0.2,
    docs: 0.1,
  };
  const total = parts.reduce((sum, part) => sum + part.value * weights[part.key], 0);
  return clamp(total);
}

export function isBookReady(data: RodSnapshot, overall: number): boolean {
  const c = countsOf(data);
  const rich = c.people >= 3 && c.stories >= 1 && (c.photos >= 2 || c.places >= 2);
  return rich || (overall >= 42 && c.stories >= 1 && c.people >= 2);
}

export function nextStep(data: RodSnapshot, overall: number): NextStep {
  const grandma = data.people.find((person) => /бабуш/i.test(person.relation) && !person.maidenName.trim());
  if (data.people.length === 0) {
    return {
      title: "Добавьте одного человека",
      detail: "Того, с кого хотите начать. Достаточно имени и кем он вам приходится.",
      screen: { id: "archive", tab: "people" },
    };
  }
  if (grandma) {
    return {
      title: "Узнать девичью фамилию бабушки",
      detail: `${grandma.name || "Бабушка"} уже в книге. Девичья фамилия откроет вторую половину рода.`,
      screen: { id: "archive", tab: "people" },
    };
  }
  if (data.photos.length === 0) {
    return {
      title: "Оцифровать одну фотографию",
      detail: "Не альбом целиком. Один снимок и пять коротких ответов.",
      screen: { id: "photo-new" },
    };
  }
  if (data.stories.length === 0) {
    return {
      title: "Рассказать одну историю",
      detail: "Шаблон задаст вопросы. Из ответов соберётся черновик главы.",
      screen: { id: "stories" },
    };
  }
  if (data.places.length === 0) {
    return {
      title: "Назвать один дом или город",
      detail: "Место, без которого семью не представить.",
      screen: { id: "archive", tab: "places" },
    };
  }
  if (data.notes.length === 0) {
    return {
      title: "Задать один семейный вопрос",
      detail: "Карточка подскажет формулировку — за чаем, на празднике или в дороге.",
      screen: { id: "cards" },
    };
  }
  if (data.documents.length === 0) {
    return {
      title: "Записать один документ",
      detail: "Хотя бы название и у кого он лежит. Сам скан может подождать.",
      screen: { id: "archive", tab: "docs" },
    };
  }
  if (data.events.length < 2) {
    return {
      title: "Поставить два года на ленту",
      detail: "Так становится видно, что ваша жизнь — фрагмент более длинной.",
      screen: { id: "archive", tab: "time" },
    };
  }
  if (isBookReady(data, overall)) {
    return {
      title: "Собрать первую книгу",
      detail: "Материала уже достаточно, чтобы увидеть страницы, а не список дел.",
      screen: { id: "book" },
    };
  }
  const weakest = [...partsOf(data)].sort((a, b) => a.value - b.value)[0];
  const screen: Screen =
    weakest?.key === "family"
      ? { id: "archive", tab: "people" }
      : weakest?.key === "places"
        ? { id: "archive", tab: "places" }
        : weakest?.key === "photos"
          ? { id: "photo-new" }
          : weakest?.key === "stories"
            ? { id: "stories" }
            : { id: "archive", tab: "docs" };
  return {
    title: `Добавить: ${weakest?.label.replace(/^\S+\s/, "").toLowerCase() ?? "семья"}`,
    detail: "Самый тонкий слой книги сейчас здесь.",
    screen,
  };
}

export function plural(n: number, one: string, few: string, many: string): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return `${n} ${one}`;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return `${n} ${few}`;
  return `${n} ${many}`;
}
