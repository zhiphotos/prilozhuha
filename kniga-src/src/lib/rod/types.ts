export type Audience = "self" | "children" | "future" | "parents" | "family";

export type Person = {
  id: string;
  name: string;
  relation: string;
  birthYear: string;
  maidenName: string;
  notes: string;
};

export type Place = {
  id: string;
  name: string;
  years: string;
  note: string;
};

export type FamilyPhoto = {
  id: string;
  dataUrl: string;
  who: string;
  where: string;
  year: string;
  what: string;
  photographer: string;
  personId: string;
};

export type Story = {
  id: string;
  templateId: string;
  title: string;
  answers: Record<string, string>;
  narrative: string;
  createdAt: string;
};

export type TimelineEvent = {
  id: string;
  year: string;
  title: string;
  detail: string;
};

export type FamilyDoc = {
  id: string;
  title: string;
  kind: string;
  year: string;
  note: string;
};

export type CardNote = {
  id: string;
  situationId: string;
  situationTitle: string;
  question: string;
  answer: string;
  createdAt: string;
};

export type PaperKind = "cream" | "lined" | "rose" | "sage" | "dots" | "kraft";
export type FontKind = "serif" | "sans" | "script";
export type StickerKind =
  | "heart"
  | "star"
  | "leaf"
  | "home"
  | "seal"
  | "sun"
  | "tape"
  | "bubble"
  | "flower"
  | "sparkle"
  | "envelope"
  | "swirl"
  | "tape-sage"
  | "branch";
export type TextLook = "plain" | "card" | "pill";
export type PhotoFrame = "none" | "polaroid" | "sticker" | "tape";

type Placed = { rotate?: number };

export type InkStroke = {
  id: string;
  color: "ink" | "rose" | "sage" | "gold" | "white";
  /** Толщина в % ширины страницы. */
  width: number;
  /** Маркер полупрозрачный. */
  alpha?: number;
  points: number[];
};

export type PageBlock =
  | ({
      id: string;
      type: "text";
      x: number;
      y: number;
      w: number;
      text: string;
      font: FontKind;
      size: "sm" | "md" | "lg" | "xl";
      look?: TextLook;
      align?: "left" | "center";
      placeholder?: string;
    } & Placed)
  | ({ id: string; type: "slot"; x: number; y: number; w: number; h: number; label: string; frame: PhotoFrame } & Placed)
  | ({
      id: string;
      type: "photo";
      x: number;
      y: number;
      w: number;
      h: number;
      src: string;
      cut?: string;
      caption: string;
      frame: PhotoFrame;
    } & Placed)
  | ({ id: string; type: "sticker"; x: number; y: number; kind: StickerKind; w?: number; text?: string } & Placed)
  | ({ id: string; type: "chip"; x: number; y: number; kind: "place" | "date"; text: string } & Placed)
  | ({ id: string; type: "voice"; x: number; y: number; w: number; title: string; transcript: string } & Placed)
  | ({ id: string; type: "doc"; x: number; y: number; w: number; title: string; note: string } & Placed);

export type BookPage = {
  id: string;
  title: string;
  kind: "cover" | "page";
  /** Обложка собрана из блоков, которые можно двигать (новые обложки). */
  designed?: boolean;
  paper: PaperKind;
  promptId?: string;
  strokes: InkStroke[];
  blocks: PageBlock[];
};

export type ArchiveTab = "people" | "time" | "photos" | "places" | "docs";

export type Screen =
  | { id: "home" }
  | { id: "lessons" }
  | { id: "lesson"; lessonId: string }
  | { id: "cards" }
  | { id: "deck"; situationId: string }
  | { id: "stories" }
  | { id: "wizard"; templateId: string }
  | { id: "story"; storyId: string }
  | { id: "archive"; tab: ArchiveTab }
  | { id: "photo-new" }
  | { id: "surname" }
  | { id: "book" }
  | { id: "editor"; pageId: string }
  | { id: "flip"; pageId?: string };

export type LessonLink =
  | "people"
  | "photos"
  | "stories"
  | "cards"
  | "surname"
  | "book"
  | "lessons"
  | "places"
  | "time"
  | "docs";
