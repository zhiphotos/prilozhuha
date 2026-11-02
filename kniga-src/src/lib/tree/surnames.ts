/**
 * Фамилия и девичья фамилия без повторов. Familio и другие программы пишут замужнюю фамилию так: «Межова (Дорохина)»,
 * а девичью кладут ещё и отдельным полем, из-за чего на карточке выходило «Межова (Дорохина) (Дорохина)».
 * Скобку в фамилии переносим в девичью, а совпадающие фамилии убираем.
 */
export function normalizeSurnames(lastName: string, maidenName?: string): { lastName: string; maidenName?: string } {
  let last = (lastName ?? "").trim();
  let maiden = (maidenName ?? "").trim();
  const match = last.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (match) {
    const base = match[1]!.trim();
    const inside = match[2]!.trim();
    last = base || inside;
    if (base && !maiden) maiden = inside;
  }
  if (maiden && maiden.toLowerCase() === last.toLowerCase()) maiden = "";
  return { lastName: last, maidenName: maiden || undefined };
}
