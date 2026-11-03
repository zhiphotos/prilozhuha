// Выравнивание «по ширине»: строка растягивается за счёт пробелов до края блока. Последняя строка абзаца остаётся как есть.

/** Сколько добавить к каждому пробелу, чтобы строка заняла всю ширину. 0: строку не растягиваем. */
export function justifyGap(lineWidth: number, targetWidth: number, text: string, maxGap = Infinity): number {
  const body = text.replace(/^[ \t]+/, ""); // красная строка не растягивается
  const spaces = (body.match(/ /g) ?? []).length;
  if (spaces < 1 || lineWidth >= targetWidth || targetWidth <= 0) return 0;
  return Math.min(maxGap, (targetWidth - lineWidth) / spaces);
}

/** Какие строки заканчивают абзац: их не растягиваем. Абзацы разделены переводом строки в исходном тексте. */
export function lastLinesOf(text: string, lines: string[]): boolean[] {
  const ends = new Array<boolean>(lines.length).fill(false);
  // Строки приходят в том же порядке, что и абзацы: пустая строка = пустой абзац, иначе абзац занимает подряд идущие строки, пока слова не кончатся.
  let at = 0;
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean).length;
    if (!words) {
      if (at < lines.length) ends[at] = true;
      at += 1;
      continue;
    }
    let left = words;
    while (at < lines.length && left > 0) {
      left -= lines[at].split(/\s+/).filter(Boolean).length;
      if (left <= 0) ends[at] = true;
      at += 1;
    }
  }
  return ends;
}
