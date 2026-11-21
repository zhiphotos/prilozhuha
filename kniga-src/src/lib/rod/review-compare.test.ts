/**
 * С-3г: параллельное сравнение СТАРОЙ (снимок legacy-review.fixture.ts) и НОВОЙ (на merge-core) логики стороны владельца
 * на всей матрице входов: 28 вариантов записи у «до», у помощника и у владельца (~6500 сочетаний), по каждому сравниваются состояние,
 * спорные поля, результат, решение по умолчанию и итог применения при каждом решении.
 * Тест падает, если появится любое расхождение, которого нет в списке ожидаемых (и если ожидаемое пропадёт).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { applyReview, defaultDecision, reviewChanges, type Book, type Change, type Decision, type Rec } from "./helper-changes.ts";
import { legacyApply, legacyDefaultDecision, legacyReview } from "./legacy-review.fixture.ts";
import { stableStringify } from "./merge-core.ts";

const names = ["A", "B", "C"];
const years = [undefined, "1", "2"];
const notes = [undefined, "n"];
const all: (Rec | undefined)[] = [undefined];
for (const n of names) for (const y of years) for (const t of notes) all.push({ id: "p", name: n, ...(y !== undefined ? { year: y } : {}), ...(t !== undefined ? { note: t } : {}) });
const bookOf = (r?: Rec): Book => ({ people: r ? [r] : [], places: [], stories: [], notes: [], pages: [], photos: [] });
const decisions: (Decision | undefined)[] = ["accept", "reject", "theirs", "mine", undefined];

/** Ожидаемые расхождения с числом входов. Каждое объяснено. */
const EXPECTED: Record<string, number> = {
  // у владельца уже есть всё, что менял помощник: «ничего применять» вместо «clean» без изменений (раньше записывался тот же объект с другим порядком ключей)
  "edit: состояние clean → already": 720,
  "edit: решение по умолчанию clean: accept → reject": 720,
  "edit: применение clean→already, решение accept": 720,
  "edit: применение clean→already, решение theirs": 720,
  "edit: применение clean→already, решение по умолчанию": 720,
  // при «Оставить моё» в конфликте полей чистые правки помощника не теряются (требование С-3б)
  "edit: применение conflict→conflict, решение mine": 1008,
  "edit: применение conflict→conflict, решение reject": 1008,
  "edit: применение conflict→conflict, решение по умолчанию": 1008,
  // владелец убрал запись, помощник её правил: конфликт, сама не возвращается (решение С-3а)
  "edit: состояние gone → conflict": 306,
  "edit: решение по умолчанию gone: accept → reject": 306,
  "edit: применение gone→conflict, решение по умолчанию": 306,
  // помощник убрал запись, владелец её правил: конфликт, запись остаётся (решение С-3а)
  "remove: состояние remove → conflict": 306,
  "remove: применение remove→conflict, решение theirs": 306,
  // «theirs» для предложения убрать теперь тоже убирает (на экране для него есть только «Убрать» = accept, «theirs» не выбирается)
  "remove: применение remove→remove, решение theirs": 18,
};

test("сравнение старой и новой логики на всей матрице: расхождения только из списка ожидаемых", () => {
  const found: Record<string, number> = {};
  const note = (k: string) => (found[k] = (found[k] ?? 0) + 1);
  let total = 0;
  for (const base of all) for (const after of all) {
    if (stableStringify(base) === stableStringify(after)) continue;
    const kind: Change["kind"] = !base ? "add" : !after ? "remove" : "edit";
    const change: Change = { key: "people", kind, id: "p", before: base, after };
    for (const owner of all) {
      total += 1;
      const mine = bookOf(owner);
      const o = legacyReview(mine, [change])[0];
      const n = reviewChanges(mine, [change])[0];
      if (o.state !== n.state) note(`${kind}: состояние ${o.state} → ${n.state}`);
      else if (stableStringify(o.fields) !== stableStringify(n.fields)) note(`${kind}: спорные поля ${o.state}`);
      else if (stableStringify(o.result) !== stableStringify(n.result)) note(`${kind}: результат ${o.state}`);
      const dOld = legacyDefaultDecision(o);
      const dNew = defaultDecision(n);
      if (dOld !== dNew) note(`${kind}: решение по умолчанию ${o.state}: ${dOld} → ${dNew}`);
      for (const d of decisions) {
        const map: Record<string, Decision> = d ? { "people:p": d } : {};
        if (stableStringify(legacyApply(mine, [o], map)) !== stableStringify(applyReview(mine, [n], map))) note(`${kind}: применение ${o.state}→${n.state}, решение ${d ?? "по умолчанию"}`);
      }
    }
  }
  assert.equal(total, 6498);
  assert.deepEqual(found, EXPECTED);
});
