import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isCalendarDate, typeDate, yearAfterBlur } from "@/lib/tree/date-input";

/**
 * Поле даты с маской ввода в реальном времени: точки встают сами, курсор остаётся там, где человек печатает.
 * Слова, диапазоны и пробелы маску отключают (см. typeDate). Сохранённое значение при открытии не меняется.
 */
export function DateInput({ value: stored, onChange: save, placeholder, inputMode, className }: { value: string; onChange: (next: string) => void; placeholder?: string; inputMode?: "decimal" | "numeric" | "text"; className?: string }) {
  // Поле показывает собственное значение сразу, а в хранилище оно уходит параллельно: если хранилище отвечает с задержкой (фото читается из памяти),
  // значение из хранилища приходит позже и не должно откатывать набранное. «Эхо» своих значений отличаем от чужих правок.
  const [value, setValue] = useState(stored);
  const echoes = useRef<string[]>([]);
  useEffect(() => {
    const at = echoes.current.indexOf(stored);
    if (at >= 0) {
      echoes.current.splice(0, at + 1);
      return;
    }
    if (stored !== value) {
      echoes.current = [];
      setValue(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);
  const onChange = (next: string) => {
    setValue(next);
    echoes.current.push(next);
    save(next);
  };
  const ref = useRef<HTMLInputElement>(null);
  const pending = useRef<number | null>(null);
  // Человек сам ставил точки в этом поле: тогда «19.10» не превращаем обратно в год.
  const manual = useRef(false);
  useLayoutEffect(() => {
    if (pending.current !== null && ref.current && document.activeElement === ref.current) {
      ref.current.setSelectionRange(pending.current, pending.current);
      pending.current = null;
    }
  }, [value]);
  const bad = !isCalendarDate(value);
  return (
    <>
      <input
        ref={ref}
        className={className}
        inputMode={inputMode}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        aria-invalid={bad || undefined}
        onFocus={() => {
          manual.current = value.includes(".");
        }}
        onBlur={() => {
          const fixed = yearAfterBlur(value, manual.current);
          if (fixed !== value) onChange(fixed);
        }}
        onChange={(event) => {
          const el = event.target;
          const result = typeDate(value, el.value, el.selectionStart ?? el.value.length, manual.current);
          manual.current = result.manualDots;
          pending.current = result.caret;
          onChange(result.value);
          // Если значение не изменилось и перерисовки не будет, курсор ставим сами.
          window.requestAnimationFrame(() => {
            if (ref.current && document.activeElement === ref.current && pending.current !== null) {
              ref.current.setSelectionRange(pending.current, pending.current);
              pending.current = null;
            }
          });
        }}
      />
      {bad ? <span role="status" className="mt-1 block text-xs text-rose-deep">Такой даты нет в календаре. Проверьте день и месяц.</span> : null}
    </>
  );
}
