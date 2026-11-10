"use client";

import { useMemo, useState } from "react";

export type SelectOption = { value: string; label: string };

/** Выпадающий список с поиском: когда вариантов много, над списком появляется строка «Найти». */
export function SearchSelect({
  value,
  onChange,
  options,
  empty,
  className = "field",
  sort = true,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Текст пустого варианта («Не выбрано»). Если не задан, пустого варианта нет. */
  empty?: string;
  className?: string;
  /** Варианты по алфавиту (по умолчанию да). */
  sort?: boolean;
  label?: string;
}) {
  // Одно поле: нажали, список раскрылся, печатаешь, список сужается. Поиск и список вместе, а не отдельно.
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const current = options.find((item) => item.value === value);
  const shown = useMemo(() => {
    const base = sort ? [...options].sort((a, b) => a.label.localeCompare(b.label, "ru")) : options;
    return q ? base.filter((item) => item.label.toLowerCase().includes(q)) : base;
  }, [options, q, sort]);
  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };
  return (
    <div className="relative grid gap-1.5">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-label={label}
        className={className}
        value={open ? query : (current?.label ?? empty ?? "")}
        placeholder={open ? "Начните вводить имя" : (empty ?? "Выбрать")}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(event) => setQuery(event.target.value)}
        enterKeyHint="search"
        autoComplete="off"
      />
      {open ? (
        <ul role="listbox" className="max-h-56 overflow-y-auto rounded-xl border border-ink/15 bg-white p-1 shadow-lg">
          {empty !== undefined && !q ? (
            <li>
              <button type="button" className="min-h-11 w-full rounded-lg px-3 text-left text-sm text-muted" onMouseDown={(event) => event.preventDefault()} onClick={() => choose("")}>
                {empty}
              </button>
            </li>
          ) : null}
          {shown.map((item) => (
            <li key={item.value}>
              <button type="button" role="option" aria-selected={item.value === value} className={`min-h-11 w-full rounded-lg px-3 text-left text-sm ${item.value === value ? "bg-sage-soft font-semibold" : ""}`} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item.value)}>
                {item.label}
              </button>
            </li>
          ))}
          {shown.length === 0 ? <li className="px-3 py-2 text-sm text-muted">Никого не нашли</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
