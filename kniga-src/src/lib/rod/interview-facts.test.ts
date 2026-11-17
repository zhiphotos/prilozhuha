import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptFacts, chunkText, findQuote, foundLine, locateQuote, mergeFacts, runExtraction, stripMarks } from "./interview-facts.ts";
import type { InterviewFact } from "./types.ts";

let n = 0;
const id = () => `f${(n += 1)}`;
const fact = (o: Partial<InterviewFact>): InterviewFact => ({ id: id(), kind: "people", title: "Анна", detail: "", relation: "", years: "", place: "", quote: "бабушку звали Анна", certainty: "ясно", note: "", review: "new", ...o });

test("нарезка: короткий текст одним куском, длинный по предложениям с перекрытием", () => {
  assert.deepEqual(chunkText("Мы жили в деревне."), ["Мы жили в деревне."]);
  const sentence = "Это предложение про семью и дом на краю деревни.";
  const text = Array.from({ length: 400 }, (_, i) => `${sentence} ${i}.`).join(" ");
  const chunks = chunkText(text, 3000, 300);
  assert.ok(chunks.length > 5);
  for (const c of chunks) assert.ok(c.length <= 3000, "кусок не длиннее лимита");
  // перекрытие: конец одного куска повторяется в начале следующего
  const tail = chunks[0]!.slice(-60).trim();
  assert.ok(chunks[1]!.includes(tail.split(" ").slice(-4).join(" ")), "стык не потерян");
  // каждое предложение попало хотя бы в один кусок
  for (const i of [0, 199, 399]) assert.ok(chunks.some((c) => c.includes(`${sentence} ${i}.`)));
});

test("нарезка: одно огромное предложение без точек режется по пробелам", () => {
  const chunks = chunkText("слово ".repeat(5000), 2000, 100);
  assert.ok(chunks.length >= 15);
  assert.ok(chunks.every((c) => c.length <= 2000));
});

test("отметки времени убираются из текста для ИИ", () => {
  assert.equal(stripMarks("[0:05] Привет\n[1:02:03] Пока"), "Привет\nПока");
});

test("поиск цитаты: регистр и пробелы не важны, знаки препинания дают «loose»", () => {
  const text = "Мою бабушку звали Анна Петровна, она жила в Туле.";
  assert.equal(findQuote(text, "бабушку  ЗВАЛИ анна петровна"), "exact");
  assert.equal(findQuote(text, "она жила в туле"), "exact");
  assert.equal(findQuote(text, "Анна Петровна она жила"), "loose");
  assert.equal(findQuote(text, "дедушку звали Иван"), null);
  assert.equal(findQuote(text, "Анна"), null, "слишком короткая цитата не проверяема");
});

test("цитата привязывается ко времени, с учётом сдвига кусков", () => {
  const segs = [
    { start: 0, end: 5, text: "Мы жили в деревне." },
    { start: 5, end: 11, text: "Мою бабушку звали Анна Петровна," },
    { start: 760, end: 770, text: "потом переехали в Тулу." },
  ];
  assert.equal(locateQuote(segs, "бабушку звали Анна"), 5);
  assert.equal(locateQuote(segs, "Анна Петровна потом переехали"), 5, "цитата через границу сегментов: время её начала");
  assert.equal(locateQuote(segs, "потом переехали в Тулу"), 760);
  assert.equal(locateQuote(segs, "этого нет в записи совсем"), undefined);
  assert.equal(locateQuote([], "бабушку звали Анна"), undefined);
});

test("принятие фактов: выдуманная цитата отбрасывается, «неясно» и время сохраняются", () => {
  const text = "Мою бабушку звали Анна Петровна. Она потом вернулась, а кто она, не помню.";
  const segs = [{ start: 12, end: 20, text }];
  const { facts, dropped } = acceptFacts(
    [
      { kind: "people", title: "Анна Петровна", quote: "бабушку звали Анна Петровна", certainty: "ясно", relation: "бабушка" },
      { kind: "places", title: "Москва", quote: "жили в Москве на Арбате" },
      { kind: "unclear", title: "Кто вернулась", quote: "а кто она, не помню", certainty: "неясно", note: "Не сказано, о ком речь" },
      { kind: "странное", title: "x", quote: "бабушку звали Анна" },
    ],
    text,
    segs,
    id,
  );
  assert.equal(dropped, 2);
  assert.equal(facts.length, 2);
  assert.equal(facts[0]!.at, 12);
  assert.equal(facts[1]!.certainty, "неясно");
  assert.equal(facts[1]!.note, "Не сказано, о ком речь");
});

test("слияние: дубли из перекрытия склеиваются, одинаковые имена с разным родством остаются разными людьми", () => {
  const a = fact({ title: "Мария", relation: "бабушка", quote: "бабушка Мария пекла хлеб" });
  const dup = fact({ title: "Мария", relation: "", years: "1920", quote: "бабушка Мария пекла хлеб" });
  const other = fact({ title: "Мария", relation: "тётя", quote: "тётя Мария жила рядом" });
  const merged = mergeFacts([a], [dup, other]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0]!.years, "1920", "недостающее поле дополнено");
  assert.equal(merged[1]!.relation, "тётя");
  // то же место с другой цитатой – один факт, худшая уверенность
  const p1 = fact({ kind: "places", title: "Сосновка", quote: "родилась в Сосновке" });
  const p2 = fact({ kind: "places", title: "сосновка", quote: "в Сосновке был колодец", certainty: "неясно" });
  const m2 = mergeFacts([p1], [p2]);
  assert.equal(m2.length, 1);
  assert.equal(m2[0]!.certainty, "неясно");
});

test("строка прогресса от лица Дарины", () => {
  const facts = [fact({}), fact({ title: "Иван" }), fact({ kind: "places", title: "Тула", quote: "жили в Туле" }), fact({ kind: "unclear", title: "кто", certainty: "неясно" }), fact({ title: "скрыт", review: "wrong" })];
  assert.equal(foundLine(facts), "Нашла: 2 человека, 1 место. Неясного: 1");
  assert.equal(foundLine([]), "Пока ничего не нашла");
});

test("разбор по кускам: прогресс, остановка при отказе и продолжение", async () => {
  const text = Array.from({ length: 300 }, (_, i) => `Предложение номер ${i} про семью Ивановых из деревни.`).join(" ");
  const interview = { id: "iv", text, segments: [], facts: [] as InterviewFact[], dropped: 0 };
  let calls = 0;
  const seen: number[] = [];
  const failAt = 1;
  const call = async (chunk: string) => {
    const i = calls;
    calls += 1;
    if (i === failAt) return { ok: false as const, status: 429, code: "user_quota", message: "Ваш лимит закончился.", resetAt: "2026-12-01T00:00:00Z" };
    return { ok: true as const, data: { facts: [{ kind: "places", title: `Деревня ${i}`, quote: chunk.slice(0, 40) }], dropped: 1 } };
  };
  const first = await runExtraction(interview, { call, makeId: id, onProgress: (p) => seen.push(p.done), nonce: () => "n" }, 0);
  const total = first.total;
  assert.ok(total >= 1);
  assert.ok(total >= 2, "длинный текст режется минимум на два куска");
  assert.equal(first.error?.code, "user_quota");
  assert.equal(first.done, 1);
  assert.equal(first.facts.length, 1, "найденное до отказа сохранено");
  const second = await runExtraction({ ...interview, facts: first.facts, dropped: first.dropped }, { call: async (chunk) => ({ ok: true as const, data: { facts: [{ kind: "places", title: "Ещё", quote: chunk.slice(0, 40) }], dropped: 0 } }), makeId: id, nonce: () => "m" }, first.done);
  assert.equal(second.error, undefined);
  assert.equal(second.done, total);
});
