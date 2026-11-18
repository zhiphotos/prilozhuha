// Сопоставление файлов «Фамилия (Девичья) Имя Отчество.jpg» с людьми в древе.

type Who = { id: string; firstName?: string; patronymic?: string; lastName?: string; maidenName?: string; name?: string; photo?: string };

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, " ").trim();

export type PhotoFile = { file: File; base: string; variant: number };

/** «Попов Иван (2).jpg» -> база «Попов Иван», вариант 2 (без номера – 1). */
export function parseFileName(fileName: string): { base: string; variant: number } {
  const noExt = fileName.normalize("NFC").replace(/\.[a-z0-9]+$/i, "");
  const m = noExt.match(/\s*\((\d+)\)\s*$/);
  return { base: (m ? noExt.slice(0, m.index) : noExt).trim(), variant: m ? Number(m[1]) : 1 };
}

function tokens(base: string): { maiden: string; words: string[] } {
  const maiden = base.match(/\(([^)]+)\)/)?.[1] ?? "";
  return { maiden: norm(maiden), words: norm(base.replace(/\([^)]*\)/g, " ")).split(" ").filter(Boolean) };
}

function nameWords(p: Who): string[] {
  const parts = [p.lastName, p.firstName, p.patronymic].filter(Boolean) as string[];
  const text = parts.length ? parts.join(" ") : (p.name ?? "");
  return norm(text).split(" ").filter(Boolean);
}

/** Находит человека: все слова из имени файла есть в имени человека, девичья фамилия (если указана) совпадает. */
export function matchPerson(base: string, people: Who[]): Who | null {
  const { maiden, words } = tokens(base);
  if (!words.length) return null;
  const poolOf = (p: Who) => {
    const maidenHave = norm(p.maidenName ?? "");
    return new Set([...nameWords(p), ...(maidenHave ? maidenHave.split(" ") : [])]);
  };
  let hits = people.filter((p) => { const pool = poolOf(p); return words.every((w) => pool.has(w)); });
  if (hits.length > 1 && maiden) {
    const byMaiden = hits.filter((p) => maiden.split(" ").every((w) => poolOf(p).has(w)));
    if (byMaiden.length) hits = byMaiden;
  }
  if (hits.length > 1) {
    const byLast = hits.filter((p) => norm(p.lastName ?? "") === words[0]);
    if (byLast.length) hits = byLast;
  }
  if (hits.length > 1) {
    const exact = hits.filter((p) => nameWords(p).length === words.length);
    if (exact.length) hits = exact;
  }
  if (hits.length === 1) return hits[0]!;
  return null;
}

export type PhotoPlan = { assign: { person: Who; file: File }[]; unmatched: string[]; skipped: number };

/** На человека берём фото без номера, потом (2), (3); тем, у кого фото уже есть, не меняем. */
export function planPhotos(files: File[], people: Who[]): PhotoPlan {
  const best = new Map<string, { person: Who; file: File; variant: number }>();
  const unmatched: string[] = [];
  let skipped = 0;
  for (const file of files) {
    const { base, variant } = parseFileName(file.name);
    const person = matchPerson(base, people);
    if (!person) { unmatched.push(file.name); continue; }
    if (person.photo) { skipped += 1; continue; }
    const cur = best.get(person.id);
    if (!cur || variant < cur.variant) best.set(person.id, { person, file, variant });
  }
  return { assign: [...best.values()].map(({ person, file }) => ({ person, file })), unmatched, skipped };
}
