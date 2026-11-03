import assert from "node:assert/strict";
import test from "node:test";
import { DATA_KEYS, collectRefs } from "./backup.ts";
import { fingerprint, splitParts } from "./sync-logic.ts";
import type { FamilyDoc } from "./types.ts";

const ref = (n: number) => `media:${"0123456789abcdef0123456789abcdef".slice(0, 8)}-0000-4000-8000-00000000000${n}`;
const oldDoc: FamilyDoc = { id: "d0", title: "Свидетельство", kind: "другое", year: "1950", note: "в коробке" };
const newDoc: FamilyDoc = { id: "d1", title: "Метрика", kind: "другое", year: "1901", note: "", attachments: [{ id: "a1", ref: ref(1), name: "Скан 1", kind: "image" }, { id: "a2", ref: ref(2), name: "Скан 2", kind: "image" }] };

test("документы входят в резервную копию и синхронизацию", () => {
  assert.ok((DATA_KEYS as readonly string[]).includes("documents"));
});

test("ссылки на сканы всех страниц документа попадают в список файлов копии", () => {
  const refs = new Set<string>();
  collectRefs({ documents: [oldDoc, newDoc] }, refs);
  assert.deepEqual([...refs].sort(), [ref(1), ref(2)]);
});

test("старый документ без файлов открывается как раньше и ссылок не даёт", () => {
  const refs = new Set<string>();
  collectRefs({ documents: [oldDoc] }, refs);
  assert.equal(refs.size, 0);
  assert.equal(oldDoc.attachments?.length ?? 0, 0);
});

test("круг через JSON (копия .kniga и облако): вложения и порядок страниц сохраняются", () => {
  const data = { documents: [newDoc, oldDoc] };
  const back = JSON.parse(JSON.stringify(data)) as typeof data;
  assert.deepEqual(back.documents[0]!.attachments?.map((a) => a.ref), [ref(1), ref(2)]);
  assert.equal(back.documents[1]!.attachments, undefined);
  const parts = splitParts(JSON.stringify(data), 40);
  assert.equal(parts.join(""), JSON.stringify(data));
  assert.notEqual(fingerprint(JSON.stringify(data)), fingerprint(JSON.stringify({ documents: [newDoc, { ...oldDoc, title: "другое" }] })));
});
