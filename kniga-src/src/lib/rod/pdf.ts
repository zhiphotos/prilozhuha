// Минимальный PDF: каждая страница — одна JPEG-картинка во весь лист.
// У страниц с вылетами указаны TrimBox (обрезной формат) и BleedBox — так их понимает типография.

export type PdfSheet = {
  bytes: Uint8Array;
  width: number;
  height: number;
  /** Размер листа с вылетами, pt. */
  pageW?: number;
  pageH?: number;
  /** Вылет с каждой стороны, pt. */
  bleed?: number;
};

export const MM = 72 / 25.4;

export function buildJpegPdf(images: PdfSheet[], defaultW = 510.24, defaultH = 680.32): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let position = 0;
  const offsets: number[] = [0];
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(bytes);
    position += bytes.length;
  };
  const obj = (body: string | Uint8Array) => {
    offsets.push(position);
    const index = offsets.length - 1;
    push(`${index} 0 obj\n`);
    push(body);
    push("\nendobj\n");
  };

  push("%PDF-1.4\n");
  const kids: string[] = [];
  images.forEach((_, index) => {
    kids.push(`${3 + index * 3} 0 R`);
  });
  obj(`<< /Type /Catalog /Pages 2 0 R >>`);
  obj(`<< /Type /Pages /Count ${images.length} /Kids [${kids.join(" ")}] >>`);
  images.forEach((image) => {
    const pageIndex = offsets.length;
    const pageW = image.pageW ?? defaultW;
    const pageH = image.pageH ?? defaultH;
    const b = image.bleed ?? 0;
    const content = `q\n${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
    const boxes = b > 0 ? ` /BleedBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /TrimBox [${b.toFixed(2)} ${b.toFixed(2)} ${(pageW - b).toFixed(2)} ${(pageH - b).toFixed(2)}]` : "";
    obj(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}]${boxes} /Contents ${pageIndex + 1} 0 R /Resources << /XObject << /Im0 ${pageIndex + 2} 0 R >> >> >>`,
    );
    obj(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);
    offsets.push(position);
    const imageIndex = offsets.length - 1;
    push(`${imageIndex} 0 obj\n`);
    push(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`);
    push(image.bytes);
    push("\nendstream\nendobj\n");
  });

  const xref = position;
  const size = offsets.length;
  let table = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let index = 1; index < size; index++) {
    table += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  push(table);
  push(`trailer << /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const out = new Uint8Array(position);
  let cursor = 0;
  chunks.forEach((chunk) => {
    out.set(chunk, cursor);
    cursor += chunk.length;
  });
  return out;
}
