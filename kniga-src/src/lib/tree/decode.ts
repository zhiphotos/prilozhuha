/**
 * Читает текст файла с родословной в любой из кодировок, в которых программы сохраняют GED:
 * UTF-8, UTF-16 (с меткой и без), Windows-1251, DOS-866. Старые программы часто сохраняют не в UTF-8.
 */
export function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
  // UTF-16 без метки: у латинских символов в начале («0 HEAD») каждый второй байт нулевой.
  const head = bytes.subarray(0, 64);
  const zeroOdd = head.filter((b, i) => b === 0 && i % 2 === 1).length;
  const zeroEven = head.filter((b, i) => b === 0 && i % 2 === 0).length;
  if (head.length >= 8 && zeroOdd > head.length / 4) return new TextDecoder("utf-16le").decode(bytes);
  if (head.length >= 8 && zeroEven > head.length / 4) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    const probe = new TextDecoder("latin1").decode(bytes.subarray(0, 2000));
    const label = /\n\s*1\s+CHAR\s+(\S+)/i.exec(probe)?.[1]?.toUpperCase() ?? "";
    if (/866|IBMPC|OEM|DOS/.test(label)) return new TextDecoder("ibm866").decode(bytes);
    return new TextDecoder("windows-1251").decode(bytes);
  }
}
