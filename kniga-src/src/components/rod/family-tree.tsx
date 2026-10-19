import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Download, FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import { familyLevels } from "@/lib/rod/family-tree";
import { mediaDataUrl, saveMedia } from "@/lib/rod/media";
import { maidenAllowed } from "@/lib/rod/person";
import { PAGE_H } from "@/lib/rod/ink";
import { useRod } from "@/lib/rod/store";
import type { Person } from "@/lib/rod/types";
import { Button, Sheet, useNav } from "@/components/rod/chrome";
import { PersonAvatar, PersonEditor, lookOf } from "@/components/rod/person-fields";

type Line = { x1: number; y1: number; x2: number; y2: number };

function lifeYears(person: Person): string {
  return [person.birthYear, person.deathYear].filter((part) => part?.trim()).join(" – ");
}

/** Древо: ряды поколений, линии от родителей к детям, фото кружком. Нажатие открывает карточку человека. */
export function TreePane() {
  const nav = useNav();
  const people = useRod((state) => state.people);
  const insertPage = useRod((state) => state.insertPage);
  const pages = useRod((state) => state.pages);
  const rows = useMemo(() => familyLevels(people), [people]);
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const [lines, setLines] = useState<Line[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const opened = people.find((person) => person.id === openId) ?? null;

  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const measure = () => {
      const base = root.getBoundingClientRect();
      const next: Line[] = [];
      for (const person of people) {
        const child = cards.current.get(person.id)?.getBoundingClientRect();
        if (!child) continue;
        for (const parentId of person.parents ?? []) {
          const parent = cards.current.get(parentId)?.getBoundingClientRect();
          if (!parent) continue;
          next.push({ x1: parent.left + parent.width / 2 - base.left, y1: parent.bottom - base.top, x2: child.left + child.width / 2 - base.left, y2: child.top - base.top });
        }
      }
      setLines(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [people, rows]);

  /** Рисует древо в картинку: её можно сохранить, отправить или поставить на страницу книги. */
  const render = async (): Promise<Blob> => {
    const root = box.current;
    if (!root) throw new Error("Древо не готово");
    const base = root.getBoundingClientRect();
    const scale = 2;
    const pad = 24;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((base.width + pad * 2) * scale);
    canvas.height = Math.round((base.height + pad * 2) * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Не удалось нарисовать");
    ctx.scale(scale, scale);
    ctx.translate(pad, pad);
    ctx.fillStyle = "#f3f0e8";
    ctx.fillRect(-pad, -pad, base.width + pad * 2, base.height + pad * 2);
    ctx.strokeStyle = "rgba(63,74,34,0.55)";
    ctx.lineWidth = 1.5;
    for (const line of lines) {
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.bezierCurveTo(line.x1, (line.y1 + line.y2) / 2, line.x2, (line.y1 + line.y2) / 2, line.x2, line.y2);
      ctx.stroke();
    }
    for (const person of people) {
      const el = cards.current.get(person.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const x = r.left - base.left;
      const y = r.top - base.top;
      const look = lookOf(person);
      ctx.fillStyle = look.bg;
      ctx.strokeStyle = look.border;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x, y, r.width, r.height, 16);
      ctx.fill();
      ctx.stroke();
      const radius = 22;
      const cx = x + r.width / 2;
      const cy = y + 10 + radius;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = look.bg;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      if (person.photo) {
        const image = new Image();
        image.src = await mediaDataUrl(person.photo);
        await image.decode().catch(() => undefined);
        if (image.naturalWidth) {
          const side = Math.min(image.naturalWidth, image.naturalHeight);
          ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, cx - radius, cy - radius, radius * 2, radius * 2);
        }
      } else {
        ctx.fillStyle = "rgba(28,26,22,0.6)";
        ctx.font = "600 20px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(person.name.trim().charAt(0).toUpperCase(), cx, cy);
      }
      ctx.restore();
      ctx.strokeStyle = look.ring;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#1c1a16";
      ctx.font = "600 13px sans-serif";
      let ty = y + 10 + radius * 2 + 6;
      for (const word of wrap(ctx, person.name, r.width - 12)) {
        ctx.fillText(word, cx, ty, r.width - 8);
        ty += 16;
      }
      ctx.fillStyle = "#5c574c";
      ctx.font = "12px sans-serif";
      ctx.fillText([person.relation, lifeYears(person)].filter(Boolean).join(" · "), cx, ty, r.width - 8);
    }
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Нет картинки"))), "image/png"));
  };

  const save = async () => {
    setBusy(true);
    try {
      const blob = await render();
      const file = new File([blob], "Древо семьи.png", { type: "image/png" });
      const nav2 = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (typeof nav2.share === "function" && nav2.canShare?.({ files: [file] })) {
        await nav2.share({ files: [file], title: "Древо семьи" });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
        toast("Древо сохранено в «Загрузки»");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) toast("Древо не сохранилось");
    } finally {
      setBusy(false);
    }
  };

  const toBook = async () => {
    setBusy(true);
    try {
      const blob = await render();
      const src = await saveMedia(blob);
      const probe = new Image();
      probe.src = await mediaDataUrl(src);
      await probe.decode();
      const ratio = probe.naturalHeight / probe.naturalWidth; // высота в единицах ширины
      // Вписываем целиком, без обрезки: 90 % ширины и 88 % высоты страницы, что тесное, то и определяет размер.
      const maxW = 90;
      const maxH = 88;
      let w = maxW;
      let h = ((w * ratio) / PAGE_H) * 100;
      if (h > maxH) {
        h = maxH;
        w = ((h * PAGE_H) / 100) / ratio;
      }
      const x = (100 - w) / 2;
      const y = (100 - h) / 2;
      insertPage(
        {
          title: "Древо семьи",
          kind: "page",
          paper: "cream",
          strokes: [],
          blocks: [{ id: crypto.randomUUID().slice(0, 8), type: "photo", x, y, w, h, src, caption: "", frame: "none", shadow: false }],
        },
        pages.length,
      );
      toast("Древо стоит отдельной страницей в конце книги");
    } catch {
      toast("Не получилось поставить на страницу");
    } finally {
      setBusy(false);
    }
  };

  if (!people.length) {
    return (
      <div className="grid gap-3">
        <p className="text-muted">Здесь появится древо семьи. Добавьте людей во вкладке «Люди»: имя, фото, годы жизни и чей это ребёнок.</p>
        <Button onClick={() => nav.replace({ id: "archive", tab: "people" })}>Добавить человека</Button>
      </div>
    );
  }
  const linked = people.some((person) => person.parents?.length);
  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        {linked ? "Линии ведут от родителей к детям. Нажмите на человека, чтобы открыть его карточку." : "Пока родители не указаны, люди стоят по тому, кем приходятся. Откройте человека и выберите, чей он ребёнок."}
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="soft" disabled={busy} onClick={() => void save()}>
          <Download className="size-4" /> Сохранить картинкой
        </Button>
        <Button variant="soft" disabled={busy} onClick={() => void toBook()}>
          <FilePlus2 className="size-4" /> Поставить в книгу
        </Button>
      </div>
      <div className="overflow-x-auto pb-2">
        <div ref={box} className="relative mx-auto grid w-fit min-w-full gap-10 p-1">
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            {lines.map((line, i) => (
              <path key={i} d={`M${line.x1},${line.y1} C${line.x1},${(line.y1 + line.y2) / 2} ${line.x2},${(line.y1 + line.y2) / 2} ${line.x2},${line.y2}`} fill="none" stroke="#3f4a22" strokeOpacity="0.55" strokeWidth="1.5" />
            ))}
          </svg>
          {rows.map((row, index) => (
            <div key={index} className="relative flex flex-wrap justify-center gap-3">
              {row.map((person) => {
                const look = lookOf(person);
                return (
                  <button
                    key={person.id}
                    type="button"
                    ref={(el) => {
                      if (el) cards.current.set(person.id, el);
                      else cards.current.delete(person.id);
                    }}
                    onClick={() => setOpenId(person.id)}
                    className="grid min-w-28 max-w-40 justify-items-center gap-1 rounded-2xl px-3 pb-2.5 pt-2.5 text-center shadow-sm"
                    style={{ background: look.bg, border: `1.5px solid ${look.border}` }}
                  >
                    <PersonAvatar person={person} size={44} />
                    <span className="block text-sm font-semibold leading-tight text-ink">{person.name}</span>
                    <span className="block text-xs text-muted">{[person.relation, lifeYears(person)].filter(Boolean).join(" · ")}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {opened ? (
        <Sheet title={opened.name || "Человек"} onClose={() => setOpenId(null)}>
          {opened.notes.trim() ? (
            <p className="mb-3 rounded-2xl bg-white/60 p-3 text-sm text-ink">
              {opened.notes}
              {opened.maidenName && maidenAllowed(opened) ? ` Девичья фамилия: ${opened.maidenName}.` : ""}
            </p>
          ) : null}
          <PersonEditor person={opened} onRemoved={() => setOpenId(null)} />
          <Button className="mt-4 w-full" onClick={() => setOpenId(null)}>
            Готово
          </Button>
        </Sheet>
      ) : null}
    </div>
  );
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      out.push(line);
      line = word;
    } else line = test;
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}
