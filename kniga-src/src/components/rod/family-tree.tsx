import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { familyLevels } from "@/lib/rod/family-tree";
import { useRod } from "@/lib/rod/store";
import { Button, useNav } from "@/components/rod/chrome";

type Line = { x1: number; y1: number; x2: number; y2: number };

/** Простая схема: ряды поколений, линии от родителей к детям. Добавлять и править людей можно во вкладке «Люди». */
export function TreePane() {
  const nav = useNav();
  const people = useRod((state) => state.people);
  const rows = useMemo(() => familyLevels(people), [people]);
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const [lines, setLines] = useState<Line[]>([]);

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

  if (!people.length) {
    return (
      <div className="grid gap-3">
        <p className="text-muted">Здесь появится схема семьи. Добавьте людей во вкладке «Люди» и укажите, кто чей ребёнок.</p>
        <Button onClick={() => nav.replace({ id: "archive", tab: "people" })}>Добавить человека</Button>
      </div>
    );
  }
  const linked = people.some((person) => person.parents?.length);
  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        {linked ? "Линии ведут от родителей к детям." : "Пока родители не указаны, люди расставлены по тому, кем приходятся. Откройте человека во вкладке «Люди» и выберите его родителей."}
      </p>
      <div ref={box} className="relative grid gap-9 overflow-x-auto pb-2">
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {lines.map((line, i) => (
            <path key={i} d={`M${line.x1},${line.y1} C${line.x1},${(line.y1 + line.y2) / 2} ${line.x2},${(line.y1 + line.y2) / 2} ${line.x2},${line.y2}`} fill="none" stroke="#3f4a22" strokeOpacity="0.55" strokeWidth="1.5" />
          ))}
        </svg>
        {rows.map((row, index) => (
          <div key={index} className="relative flex flex-wrap justify-center gap-3">
            {row.map((person) => (
              <button
                key={person.id}
                type="button"
                ref={(el) => {
                  if (el) cards.current.set(person.id, el);
                  else cards.current.delete(person.id);
                }}
                onClick={() => nav.replace({ id: "archive", tab: "people" })}
                className="min-w-24 max-w-40 rounded-2xl border border-ink/10 bg-paper px-3 py-2 text-center shadow-sm"
              >
                <span className="block text-sm font-semibold leading-tight text-ink">{person.name}</span>
                <span className="block text-xs text-muted">
                  {person.relation}
                  {person.birthYear ? ` · ${person.birthYear}` : ""}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
