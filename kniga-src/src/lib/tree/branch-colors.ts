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

/** Человек и все его предки по родителям: «линия родства» вверх. Супруги, братья, сёстры и потомки в неё не входят. */
export function ancestryOf(unions: Union[], id: string): Set<string> {
  const line = new Set<string>([id]);
  const queue = [id];
  for (let i = 0; i < queue.length; i++) {
    for (const u of unions) {
      if (!u.childIds.includes(queue[i]!)) continue;
      for (const parent of u.partnerIds) if (!line.has(parent)) { line.add(parent); queue.push(parent); }
    }
  }
  return line;
}

// Цвет «только этому человеку» хранится в том же выборе под ключом «=номер»: потомки его не наследуют, формат .tree не затронут.
const EXACT = "=";

/** Красит только линию родства человека (он сам и его предки), прежние цвета остальных не меняются. */
export function setLineColor(unions: Union[], id: string, color: string | null) {
  const next = { ...current };
  for (const x of ancestryOf(unions, id)) {
    if (color) next[EXACT + x] = color;
    else delete next[EXACT + x];
  }
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // выбор останется до закрытия страницы
  }
  for (const l of listeners) l();
}

/** Убирает все цвета «только этому человеку»; цвета ветвей остаются. */
export function clearLineColors() {
  current = Object.fromEntries(Object.entries(current).filter(([k]) => !k.startsWith(EXACT)));
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // выбор останется до закрытия страницы
  }
  for (const l of listeners) l();
}

/** Цвет ветви человека: цвет «только ему», затем свой, а если не задан, ближайшего предка с цветом. */
export function branchColorOf(people: Person[], unions: Union[], id: string, colors: Record<string, string> = current): string | undefined {
  if (colors[EXACT + id]) return colors[EXACT + id];
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

/**
 * Раскраска по сторонам семьи: родня выбранного человека одним цветом, родня его супруга другим.
 * Сторона берётся поиском в ширину от обоих сразу (связь между ними не считается); цвет получают самые старшие предки каждой стороны, остальные берут его сами.
 * Возвращает, кому какой цвет поставить (пусто, если у выбранного нет супруга).
 */
export function sideColors(people: Person[], unions: Union[], me: string, mine: string, theirs: string): Record<string, string> {
  const spouse = unions.find((u) => u.partnerIds.length === 2 && u.partnerIds.includes(me))?.partnerIds.find((x) => x !== me);
  if (!spouse) return {};
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };
  const hasParents = new Set<string>();
  for (const u of unions) {
    for (const c of u.childIds) hasParents.add(c);
    if (u.partnerIds.includes(me) && u.partnerIds.includes(spouse)) {
      for (const c of u.childIds) {
        link(me, c);
        link(spouse, c);
      }
      continue;
    }
    if (u.partnerIds.length === 2) link(u.partnerIds[0]!, u.partnerIds[1]!);
    for (const p of u.partnerIds) for (const c of u.childIds) link(p, c);
  }
  const side = new Map<string, string>([[me, mine], [spouse, theirs]]);
  const queue = [me, spouse];
  for (let i = 0; i < queue.length; i++) for (const n of adj.get(queue[i]!) ?? []) if (!side.has(n)) { side.set(n, side.get(queue[i]!)!); queue.push(n); }
  const out: Record<string, string> = {};
  const known = new Set(people.map((p) => p.id));
  for (const [id, color] of side) if (known.has(id) && !hasParents.has(id)) out[id] = color;
  // У выбранного и его супруга родителей может не быть: тогда красим их самих.
  if (!out[me] && !hasParents.has(me)) out[me] = mine;
  return out;
}

/** Ставит цвета сторон, прежний выбор по людям заменяется. */
export function applySideColors(colors: Record<string, string>) {
  current = { ...colors };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // выбор останется до закрытия страницы
  }
  for (const l of listeners) l();
}
