// Готовые развороты-шаблоны, как в цифровых дневниках: заголовок, рамки под фото, поля, карточка с вопросом.
import { findPrompt, type PagePrompt } from "@/lib/rod/pages";
import type { BookPage, PageBlock } from "@/lib/rod/types";

const id = () => crypto.randomUUID();

type Text = Extract<PageBlock, { type: "text" }>;

function text(partial: Partial<Text> & Pick<Text, "x" | "y" | "w">): Text {
  return { id: id(), type: "text", text: "", font: "serif", size: "md", ...partial };
}

function slot(x: number, y: number, w: number, h: number, label: string, frame: "polaroid" | "none" | "tape" | "sticker" = "polaroid", rotate = 0): PageBlock {
  return { id: id(), type: "slot", x, y, w, h, label, frame, rotate };
}

function sticker(kind: Extract<PageBlock, { type: "sticker" }>["kind"], x: number, y: number, w: number, rotate = 0): PageBlock {
  return { id: id(), type: "sticker", kind, x, y, w, rotate };
}

const PERSON = new Set(["mom", "dad", "grandma"]);
const LIST = new Set(["five-things", "words", "give", "repeats", "stop"]);

export function layoutFor(prompt: PagePrompt): PageBlock[] {
  return build(prompt).filter((block): block is PageBlock => block !== null);
}

function build(prompt: PagePrompt): Array<PageBlock | null> {
  const [q1 = "", q2 = "", q3 = ""] = prompt.questions;
  // Квадратная страница: координаты в % стороны. Всё важное — внутри охранного поля (≈4–6 %).
  const long = prompt.title.length > 26;
  const title = text({ x: 8, y: 6, w: 84, text: prompt.title, size: "lg" });
  const hint = long ? null : text({ x: 8, y: 13, w: 84, text: prompt.hint, font: "script", size: "sm" });
  const top = long ? 20 : 19;

  if (prompt.id === "dedication") {
    return [
      sticker("flower", 45, 10, 10),
      text({ x: 10, y: 22, w: 80, text: "Посвящение", size: "lg", align: "center" }),
      text({ x: 14, y: 34, w: 72, font: "script", size: "md", align: "center", placeholder: q1 }),
      text({ x: 14, y: 60, w: 72, font: "serif", size: "md", align: "center", placeholder: q3 || q2 }),
      sticker("branch", 40, 84, 20),
    ];
  }
  if (PERSON.has(prompt.id)) {
    return [
      title,
      hint,
      slot(8, top, 38, 44, "Портрет", "polaroid", -2),
      text({ x: 52, y: top + 1, w: 40, text: "Имя", look: "pill", font: "sans", size: "sm" }),
      text({ x: 52, y: top + 6, w: 40, font: "script", size: "md", placeholder: "впишите" }),
      text({ x: 52, y: top + 15, w: 40, text: "Годы жизни", look: "pill", font: "sans", size: "sm" }),
      text({ x: 52, y: top + 20, w: 40, font: "script", size: "md", placeholder: "впишите" }),
      text({ x: 52, y: top + 29, w: 40, text: "Откуда", look: "pill", font: "sans", size: "sm" }),
      text({ x: 52, y: top + 34, w: 40, font: "script", size: "md", placeholder: "впишите" }),
      text({ x: 8, y: 68, w: 84, font: "serif", size: "md", placeholder: q2 || q1 }),
      text({ x: 8, y: 84, w: 56, font: "sans", size: "sm", look: "card", text: q3 || q1, rotate: -1.5 }),
      sticker("heart", 80, 82, 9, 8),
    ];
  }
  if (LIST.has(prompt.id)) {
    return [
      title,
      hint,
      text({ x: 8, y: top + 1, w: 48, font: "script", size: "md", placeholder: "1. …\n2. …\n3. …\n4. …\n5. …" }),
      slot(60, top + 2, 32, 38, "Фото или вещь", "tape", 3),
      text({ x: 8, y: 80, w: 52, font: "sans", size: "sm", look: "card", text: q1, rotate: -1 }),
      sticker("sparkle", 82, 78, 8),
    ];
  }
  if (prompt.id === "recipe") {
    return [
      title,
      hint,
      slot(8, top, 46, 36, "Блюдо или кухня", "tape", -2),
      text({ x: 60, y: top + 1, w: 32, text: "Чья рука", look: "pill", font: "sans", size: "sm" }),
      text({ x: 60, y: top + 6, w: 32, font: "script", size: "md", placeholder: "впишите" }),
      text({ x: 8, y: 60, w: 40, text: "Что нужно", look: "pill", font: "sans", size: "sm" }),
      text({ x: 8, y: 65, w: 40, font: "script", size: "sm", placeholder: "мука, яйца, щепотка…" }),
      text({ x: 52, y: 60, w: 40, text: "Как готовили", look: "pill", font: "sans", size: "sm" }),
      text({ x: 52, y: 65, w: 40, font: "script", size: "sm", placeholder: q2 || q1 }),
      sticker("leaf", 84, 6, 8, 12),
    ];
  }
  if (prompt.id === "unknown-photo") {
    return [
      title,
      slot(14, 15, 72, 52, "Та самая фотография", "polaroid", -1.5),
      text({ x: 8, y: 71, w: 26, text: "Кто", look: "pill", font: "sans", size: "sm" }),
      text({ x: 8, y: 76, w: 26, font: "script", size: "sm", placeholder: "впишите" }),
      text({ x: 37, y: 71, w: 26, text: "Где", look: "pill", font: "sans", size: "sm" }),
      text({ x: 37, y: 76, w: 26, font: "script", size: "sm", placeholder: "впишите" }),
      text({ x: 66, y: 71, w: 26, text: "Когда", look: "pill", font: "sans", size: "sm" }),
      text({ x: 66, y: 76, w: 26, font: "script", size: "sm", placeholder: "впишите" }),
      text({ x: 8, y: 86, w: 84, font: "serif", size: "sm", placeholder: q2 || q1 }),
    ];
  }
  return [
    title,
    hint,
    slot(8, top, 42, 40, "Фото", "polaroid", -3),
    slot(52, top + 4, 40, 32, "Ещё фото", "tape", 3),
    text({ x: 8, y: 66, w: 84, font: "serif", size: "md", placeholder: q1 }),
    text({ x: 8, y: 83, w: 56, font: "sans", size: "sm", look: "card", text: q2 || q1, rotate: -1.5 }),
    text({ x: 76, y: 85, w: 16, font: "sans", size: "sm", look: "pill", placeholder: "год" }),
  ];
}

export function pageFromPrompt(promptId: string): Omit<BookPage, "id"> | null {
  const prompt = findPrompt(promptId);
  if (!prompt) return null;
  return { title: prompt.title, kind: "page", paper: prompt.paper, promptId, strokes: [], blocks: layoutFor(prompt) };
}

export function blankPage(): Omit<BookPage, "id"> {
  return { title: "Чистая страница", kind: "page", paper: "dots", strokes: [], blocks: [] };
}

export function coverPage(): Omit<BookPage, "id"> {
  return { title: "Обложка", kind: "cover", paper: "rose", strokes: [], blocks: [] };
}

/** Страница из готовой истории: заголовок и текст главы. */
export function pageFromStory(title: string, narrative: string): Omit<BookPage, "id"> {
  return {
    title,
    kind: "page",
    paper: "cream",
    strokes: [],
    blocks: [
      text({ x: 8, y: 6, w: 84, text: title, size: "lg" }),
      sticker("branch", 8, 14, 18),
      text({ x: 8, y: 21, w: 84, text: narrative, size: "sm" }),
    ],
  };
}

/** Страница из оцифрованной фотографии с подписью. */
export function pageFromPhoto(src: string, caption: string, detail: string): Omit<BookPage, "id"> {
  return {
    title: caption || "Фотография",
    kind: "page",
    paper: "kraft",
    strokes: [],
    blocks: [
      { id: id(), type: "photo", x: 12, y: 8, w: 76, h: 62, src, caption, frame: "polaroid", rotate: -1.5 },
      sticker("tape", 40, 5.5, 20, -3),
      text({ x: 10, y: 76, w: 80, text: detail, font: "script", size: "md" }),
    ],
  };
}

/** Старые блоки (место, дата, голос, документ, облачко) становятся обычным текстом, толщина чернил — в % листа. */
export function migratePage(page: BookPage): BookPage {
  let changed = false;
  const blocks: PageBlock[] = page.blocks.map((block) => {
    if (block.type === "chip") {
      changed = true;
      return text({ id: block.id, x: block.x, y: block.y, w: 40, text: `${block.kind === "date" ? "Дата" : "Место"} · ${block.text}`, font: "sans", size: "sm", look: "pill", rotate: block.rotate });
    }
    if (block.type === "voice") {
      changed = true;
      return text({ id: block.id, x: block.x, y: block.y, w: block.w, text: `${block.title}\n${block.transcript}`, font: "serif", size: "sm", look: "card", rotate: block.rotate });
    }
    if (block.type === "doc") {
      changed = true;
      return text({ id: block.id, x: block.x, y: block.y, w: block.w, text: [block.title, block.note].filter(Boolean).join("\n"), font: "sans", size: "sm", look: "card", rotate: block.rotate });
    }
    if (block.type === "sticker" && block.kind === "bubble") {
      changed = true;
      return text({ id: block.id, x: block.x, y: block.y, w: block.w ?? 46, text: block.text ?? "", font: "sans", size: "sm", look: "card", rotate: block.rotate });
    }
    return block;
  });
  const strokes = page.strokes.map((stroke) => {
    if (stroke.width !== 2.6 && stroke.width !== 7) return stroke;
    changed = true;
    return { ...stroke, width: stroke.width === 7 ? 2 : 0.6 };
  });
  return changed ? { ...page, blocks, strokes } : page;
}
