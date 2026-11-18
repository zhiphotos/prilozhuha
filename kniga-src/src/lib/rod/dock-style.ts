import { useSyncExternalStore } from "react";

/** Вид нижнего меню: «glass» (матовое стекло, по умолчанию) или «classic» (плотная тёмная плашка). Выбор помнится на этом устройстве. */
export type DockStyle = "classic" | "glass";
const KEY = "kniga-dock-style";
const listeners = new Set<() => void>();

export function getDockStyle(): DockStyle {
  try {
    return localStorage.getItem(KEY) === "classic" ? "classic" : "glass";
  } catch {
    return "glass";
  }
}

export function setDockStyle(style: DockStyle) {
  try {
    localStorage.setItem(KEY, style);
  } catch {
    /* без запоминания */
  }
  listeners.forEach((fn) => fn());
}

export function useDockStyle(): DockStyle {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getDockStyle,
    () => "glass" as DockStyle,
  );
}
