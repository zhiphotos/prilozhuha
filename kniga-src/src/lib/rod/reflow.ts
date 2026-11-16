// Подтягивание длинного текста: если сменили шрифт или размер у куска, разложенного по страницам, весь рассказ раскладывается заново.
import { layoutPages, type Item, type StyleOverride } from "@/lib/rod/auto-layout";
import type { BookPage, PageBlock } from "@/lib/rod/types";

type TextBlock = Extract<PageBlock, { type: "text" }>;
type FlowKind = Item["kind"];

export type FlowChange = { font?: TextBlock["font"]; px?: number };

export type ReflowPlan = {
  /** Страницы цепочки в новом виде: старые id сохраняются, лишние вставляются после последней. */
  pages: { id?: string; page: Omit<BookPage, "id"> }[];
  /** Старые страницы цепочки, которым не хватило текста. */
  drop: string[];
  /** Страница, после которой вставляются новые. */
  insertAfter: string;
};

const isFlow = (b: PageBlock): b is TextBlock & { flow: NonNullable<TextBlock["flow"]> } => b.type === "text" && !!b.flow;

/** Пересобирает цепочку страниц, в которую входит блок, с новым оформлением вида (заголовок, абзац или цитата). */
export function planReflow(pages: BookPage[], blockId: string, change: FlowChange): ReflowPlan | null {
  const origin = pages.flatMap((p) => p.blocks).find((b) => b.id === blockId);
  if (!origin || !isFlow(origin)) return null;
  const fid = origin.flow.id;
  const chain = pages.filter((p) => p.blocks.some((b) => isFlow(b) && b.flow.id === fid));
  if (!chain.length) return null;
  // Собираем абзацы обратно: куски одного абзаца идут подряд по страницам и по высоте.
  const paras = new Map<number, { kind: FlowKind; parts: { seg: number; text: string }[] }>();
  const style: StyleOverride = {};
  const reuse = new Map<string, string>();
  for (const page of chain) {
    const flowBlocks = page.blocks.filter(isFlow).filter((b) => b.flow.id === fid);
    for (const b of flowBlocks) {
      const entry = paras.get(b.flow.para) ?? { kind: b.flow.kind, parts: [] };
      entry.parts.push({ seg: b.flow.seg, text: b.text });
      paras.set(b.flow.para, entry);
      reuse.set(`${b.flow.para}:${b.flow.seg}`, b.id);
      if (!style[b.flow.kind]) style[b.flow.kind] = { font: b.font, px: b.px };
    }
  }
  const kind = origin.flow.kind;
  style[kind] = { ...(style[kind] ?? {}), ...(change.font ? { font: change.font } : {}), ...(change.px ? { px: change.px } : {}) };
  const items: Item[] = [...paras.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, e]) => ({ kind: e.kind, text: e.parts.sort((a, b) => a.seg - b.seg).map((p) => p.text).join(e.kind === "quote" ? "\n" : " ") }));
  const laid = layoutPages(items, { style, flowId: fid, reuse, paper: chain[0].paper });
  const out: ReflowPlan["pages"] = laid.map((page, i) => {
    const old = chain[i];
    if (!old) return { page };
    const keep = old.blocks.filter((b) => !(isFlow(b) && b.flow.id === fid));
    return { id: old.id, page: { ...old, blocks: [...page.blocks, ...keep], title: old.title } };
  });
  const drop = chain.slice(laid.length).filter((p) => p.blocks.every((b) => isFlow(b) && b.flow.id === fid)).map((p) => p.id);
  // Страницы с чужими блоками (фото) остаются, но без текста цепочки.
  for (const old of chain.slice(laid.length)) {
    if (drop.includes(old.id)) continue;
    out.push({ id: old.id, page: { ...old, blocks: old.blocks.filter((b) => !(isFlow(b) && b.flow.id === fid)) } });
  }
  return { pages: out, drop, insertAfter: chain[chain.length - 1].id };
}
