import assert from "node:assert/strict";
import test from "node:test";
import { buildJpegPdf } from "./print-book.ts";

const jpeg = Uint8Array.from(
  Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==",
    "base64",
  ),
);

test("print file is a multi-page pdf of the page images", () => {
  const pdf = buildJpegPdf(
    [
      { bytes: jpeg, width: 1, height: 1 },
      { bytes: jpeg, width: 1, height: 1 },
    ],
    510.24,
    680.32,
  );
  const text = new TextDecoder("latin1").decode(pdf);
  assert.equal(text.startsWith("%PDF-1.4"), true);
  assert.equal(text.trimEnd().endsWith("%%EOF"), true);
  assert.equal(text.includes("/Count 2"), true);
  assert.equal(text.includes("/DCTDecode"), true);
  const start = Number(text.match(/startxref\s+(\d+)/)?.[1]);
  assert.equal(new TextDecoder().decode(pdf.slice(start, start + 4)), "xref");
  const objectAt = (id: number) => {
    const line = text.match(new RegExp(`\\n${String(id).padStart(10, "0")} 00000 n`));
    assert.ok(line?.index !== undefined);
    const offset = Number(text.slice(line.index + 1, line.index + 11));
    return new TextDecoder().decode(pdf.slice(offset, offset + 12));
  };
  assert.equal(objectAt(1).startsWith("1 0 obj"), true);
  assert.equal(pdf.includes(jpeg[0]) && pdf.includes(0xff) && pdf.includes(0xd8), true);
});
