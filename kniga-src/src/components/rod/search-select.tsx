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
  sort = false,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Текст пустого варианта («Не выбрано»). Если не задан, пустого варианта нет. */
  empty?: string;
  className?: string;
  /** Сортировать варианты по алфавиту. */
  sort?: boolean;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const base = sort ? [...options].sort((a, b) => a.label.localeCompare(b.label, "ru")) : options;
    if (!q) return base;
    return base.filter((item) => item.value === value || item.label.toLowerCase().includes(q));
  }, [options, q, sort, value]);
  const search = options.length >= 6;
  const none = q && !shown.some((item) => item.value !== value) ? "Никого не нашли" : null;
  return (
    <div className="grid gap-1.5">
      {search ? (
        <input
          type="search"
          className="field"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти по имени"
          aria-label={label ? `Поиск: ${label}` : "Поиск по списку"}
          enterKeyHint="search"
        />
      ) : null}
      <select className={className} value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {empty !== undefined ? <option value="">{empty}</option> : null}
        {shown.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      {none ? <p className="text-xs text-muted">{none}</p> : null}
    </div>
  );
}
