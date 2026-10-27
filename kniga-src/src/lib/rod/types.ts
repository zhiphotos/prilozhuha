export type Audience = "self" | "children" | "future" | "parents" | "family";

export type Person = {
  id: string;
  name: string;
  relation: string;
  birthYear: string;
  maidenName: string;
  notes: string;
  /** Годы жизни и фамилия по документам (необязательно). */
  deathYear?: string;
  /** Родители (id людей из этого же списка): по ним строится схема семьи. */
  parents?: string[];
  /** Брат или сестра кого-то из списка (id): встаёт в тот же ряд схемы. */
  siblingOf?: string;
  /** Положение рядом с супругом на схеме древа: слева или справа. */
  treeSide?: "left" | "right";
  /** Порядок ветки в ряду на схеме древа, слева направо. */
  treeRank?: number;
  /** Супруг или супруга (id из этого же списка): пара встаёт в один ряд рядом друг с другом. */
  spouse?: string;
  /** Статус пары: в браке, развелись, живут вместе без брака. */
  spouseStatus?: "married" | "divorced" | "partners";
  /** Годы союза (для древа), хранятся у одного из супругов. */
  unionFrom?: string;
  unionTo?: string;
  /** Имя, отчество и фамилия по отдельности; `name` собирается из них. */
  firstName?: string;
  patronymic?: string;
  lastName?: string;
  gender?: "m" | "f";
  /** Линия предков и дядь/тёть: по маминой или папиной стороне (для нового древа). */
  line?: "mom" | "dad";
  /** Фото человека (ссылка на хранилище), в древе показывается кружком. */
  photo?: string;
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

/** Фото или файл, прикреплённый к истории (ref на медиа). */
export type Attachment = {
  id: string;
  ref: string;
  name: string;
  kind: "image" | "file";
};

export type Story = {
  id: string;
  attachments?: Attachment[];
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
/** Встроенный шрифт или свой, загруженный из файла (например, почерк бабушки): "custom:<id>". */
export type FontRef = FontKind | `custom:${string}`;
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

type Placed = {
  rotate?: number;
  /** Замок: блок не двигается и не выделяется нажатием, пока не открыть в «Слоях». */
  locked?: boolean;
  opacity?: number;
  blend?: BlendKind;
  mask?: EraseMask;
  /** Лежит через разворот: часть на соседней странице (фото, рисунок, стикер, фигура). */
  spread?: boolean;
};

export type BrushKind = "pen" | "marker" | "brush" | "highlighter" | "thread" | "dashed" | "dots" | "wash" | "ink" | "charcoal";

export type InkStroke = {
  id: string;
  /** Любой цвет "#rrggbb"; старые названия ink/rose/sage/gold/white тоже читаются. */
  color: string;
  /** Толщина в % ширины страницы. */
  width: number;
  /** Маркер полупрозрачный. */
  alpha?: number;
  brush?: BrushKind;
  points: number[];
  /** Нажим пера 0..1 по точке (если был). */
  pressure?: number[];
};

export type BlendKind = "multiply" | "screen" | "overlay" | "soft-light" | "darken" | "lighten";

/** Стёртое ластиком у блока (текст, фото, стикер): круги по линии, в единицах 1 % ширины блока. */
export type EraseMask = { h: number; strokes: { r: number; pts: number[] }[] };

export type ShapeKind =
  | "rect"
  | "round"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "star"
  | "heart"
  | "line"
  | "arrow"
  | "arrow2"
  | "curve"
  | "dot"
  | "ring"
  | "cross"
  | "burst"
  | "dots"
  | "stitch";

export type PageBlock =
  | ({
      id: string;
      type: "text";
      x: number;
      y: number;
      w: number;
      text: string;
      font: FontRef;
      size: "sm" | "md" | "lg" | "xl";
      /** Размер букв в пикселях (страница = 1000 px в ширину). Если задан, главнее S/M/L/XL. */
      px?: number;
      look?: TextLook;
      /** Свой цвет букв и фона карточки/плашки. */
      color?: string;
      bg?: string;
      align?: "left" | "center" | "right";
      /** Текст обтекает фото и стикеры на странице. */
      wrap?: boolean;
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
      /** Какой кусок фото виден в рамке: центр (0..1) и приближение (1 = вся рамка). */
      crop?: { cx: number; cy: number; z: number };
      /** Тень под фото. Старые фото без поля – с тенью. */
      shadow?: boolean;
    } & Placed)
  | ({ id: string; type: "sticker"; x: number; y: number; kind: StickerKind; w?: number; text?: string } & Placed)
  | ({ id: string; type: "chip"; x: number; y: number; kind: "place" | "date"; text: string } & Placed)
  | ({ id: string; type: "voice"; x: number; y: number; w: number; title: string; transcript: string } & Placed)
  | ({ id: string; type: "doc"; x: number; y: number; w: number; title: string; note: string } & Placed)
  | ({ id: string; type: "shape"; x: number; y: number; w: number; h: number; shape: ShapeKind; fill?: string; stroke?: string; strokeW?: number } & Placed)
  | ({
      id: string;
      type: "ink";
      x: number;
      y: number;
      w: number;
      h: number;
      /** Исходный размер рисунка в % страницы: линии лежат в этих координатах и растягиваются вместе с блоком. */
      ow: number;
      oh: number;
      strokes: InkStroke[];
      /** Заливка внутри контура (картинка во всю рамку рисунка, под линиями). */
      fill?: string;
    } & Placed);

/** Глава из оглавления: её страницы помечены `chapterId`. */
export type Chapter = { id: string; title: string; planned: number; done: boolean };

export type BookPage = {
  id: string;
  /** Глава оглавления, к которой относится страница. */
  chapterId?: string;
  title: string;
  kind: "cover" | "page";
  /** Обложка собрана из блоков, которые можно двигать (новые обложки). */
  designed?: boolean;
  /** Когда страницу правили последний раз (мс). Главная предлагает вернуться к последней исправленной. */
  editedAt?: number;
  /** Свой цвет страницы поверх выбранной бумаги. */
  bg?: string;
  paper: PaperKind;
  promptId?: string;
  strokes: InkStroke[];
  blocks: PageBlock[];
};

export type ArchiveTab = "people" | "tree" | "time" | "photos" | "places" | "docs";

export type Screen =
  | { id: "home" }
  | { id: "lessons" }
  | { id: "lesson"; lessonId: string }
  | { id: "cards" }
  | { id: "deck"; situationId: string }
  | { id: "answers" }
  | { id: "stories" }
  | { id: "wizard"; templateId: string }
  | { id: "story"; storyId: string }
  | { id: "free" }
  | { id: "archive"; tab: ArchiveTab }
  | { id: "photo-new" }
  | { id: "surname" }
  | { id: "book" }
  | { id: "editor"; pageId: string }
  | { id: "projects" }
  | { id: "legal"; doc?: string }
  | { id: "join"; room: string; invite: string }
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

/** Задняя сторона обложки редактируется как обычная страница с этим номером. */
export const BACK_ID = "__back__";

/** Корешок: надпись и цвета. */
export type SpineSetup = { text: string; bg?: string; color?: string; font: FontRef; size: number };

/** Свой шрифт, загруженный из файла (например, почерк бабушки). */
export type CustomFontEntry = { id: string; name: string; ref: string };
