// Цвета ветвей древа: необязательная настройка. Цвет задают предку, потомки берут его сами.
// Хранится на устройстве, как выбор цвета линий. Выключено по умолчанию (см. card-fields: branches).
import { useSyncExternalStore } from "react";
import type { Person, Union } from "./types.ts";

export const BRANCH_PALETTE = ["#4f6b3a", "#8a2f3d", "#2f5d8a", "#c08a2e", "#6b4a8a", "#2f7d78", "#8a5a3a", "#6d6d68"] as const;

const KEY = "kr-branch-colors";

function load(): Record<string, string> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch {
    // без хранилища работает пустой выбор
  }
  return {};
}

let current: Record<string, string> = load();
const listeners = new Set<() => void>();

export const getBranchColors = () => current;

export function setBranchColor(id: string, color: string | null) {
  const next = { ...current };
  if (color) next[id] = color;
  else delete next[id];
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // выбор останется до закрытия страницы
  }
  for (const l of listeners) l();
}

export function useBranchColors(): Record<string, string> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getBranchColors,
    getBranchColors,
  );
}

/** Цвет ветви человека: свой, а если не задан, ближайшего предка с цветом. */
export function branchColorOf(people: Person[], unions: Union[], id: string, colors: Record<string, string> = current): string | undefined {
  const seen = new Set<string>();
  let level = [id];
  for (let depth = 0; depth < 20 && level.length; depth++) {
    const next: string[] = [];
    for (const pid of level) {
      if (seen.has(pid)) continue;
      seen.add(pid);
      if (colors[pid]) return colors[pid];
      for (const u of unions) if (u.childIds.includes(pid)) next.push(...u.partnerIds);
    }
    level = next;
  }
  return undefined;
}
