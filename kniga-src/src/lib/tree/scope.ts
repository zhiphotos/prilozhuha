import type { Person, Union } from "./types.ts";

/** Кого показывать в древе относительно выбранного человека (корня). Как в генеалогических программах. */
export type TreeScope = "direct" | "direct-sib-root" | "direct-sib-all" | "blood" | "all";

export const SCOPES: { id: TreeScope; label: string; hint: string }[] = [
  { id: "direct", label: "Прямые предки и потомки", hint: "Только ваша линия: родители, бабушки и дедушки выше, дети и внуки ниже" },
  { id: "direct-sib-root", label: "Прямая родня и братья и сёстры корня", hint: "Линия и ваши братья и сёстры" },
  { id: "direct-sib-all", label: "Прямая родня, братья и сёстры", hint: "Линия и братья и сёстры каждого из прямых родственников" },
  { id: "blood", label: "Кровные родственники", hint: "Все, у кого с вами общие предки, без родни по браку" },
  { id: "all", label: "Все родственники", hint: "Всё древо целиком" },
];

export function scopeFilter(people: Person[], unions: Union[], focusId: string, scope: TreeScope): { people: Person[]; unions: Union[] } {
  if (scope === "all" || !people.some((p) => p.id === focusId)) return { people, unions };
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const partnersOf = new Map<string, string[]>();
  for (const u of unions) {
    for (const c of u.childIds) parentsOf.set(c, [...(parentsOf.get(c) ?? []), ...u.partnerIds]);
    for (const p of u.partnerIds) {
      childrenOf.set(p, [...(childrenOf.get(p) ?? []), ...u.childIds]);
      partnersOf.set(p, [...(partnersOf.get(p) ?? []), ...u.partnerIds.filter((x) => x !== p)]);
    }
  }
  const walk = (start: string[], next: (id: string) => string[]) => {
    const seen = new Set<string>();
    const queue = [...start];
    while (queue.length) {
      const id = queue.shift()!;
      for (const n of next(id)) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
    return seen;
  };
  const ancestors = walk([focusId], (id) => parentsOf.get(id) ?? []);
  const descendants = walk([focusId], (id) => childrenOf.get(id) ?? []);
  const siblingsOf = (id: string) => (parentsOf.get(id) ?? []).flatMap((p) => childrenOf.get(p) ?? []).filter((x) => x !== id);
  const keep = new Set<string>([focusId, ...ancestors, ...descendants]);
  if (scope === "direct-sib-root") for (const s of siblingsOf(focusId)) keep.add(s);
  if (scope === "direct-sib-all") for (const id of [...keep]) for (const s of siblingsOf(id)) keep.add(s);
  if (scope === "blood") {
    const all = walk([...ancestors, focusId], (id) => childrenOf.get(id) ?? []);
    for (const id of all) keep.add(id);
  } else {
    // Супруг корня и потомков остаётся рядом с ними, но его родня не добавляется.
    for (const id of [focusId, ...descendants]) for (const mate of partnersOf.get(id) ?? []) keep.add(mate);
  }
  return {
    people: people.filter((p) => keep.has(p.id)),
    unions: unions
      .map((u) => ({ ...u, partnerIds: u.partnerIds.filter((id) => keep.has(id)), childIds: u.childIds.filter((id) => keep.has(id)) }))
      .filter((u) => (u.partnerIds.length >= 2 || (u.partnerIds.length >= 1 && u.childIds.length >= 1))),
  };
}
