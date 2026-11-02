import assert from "node:assert/strict";
import test from "node:test";
import { treeFromPeople } from "./from-people.ts";
import type { Person } from "@/lib/rod/types";

const p = (id: string, relation: string, extra: Partial<Person> = {}): Person => ({ id, name: id, relation, birthYear: "", maidenName: "", notes: "", ...extra });

// Тестировщица 30.10: бабушка с линией «mom» и её муж без линии. Раньше к паре добавлялся пустой «Дедушка»-двойник.
test("у бабушки с линией и мужа без линии нет пустого двойника", () => {
  const data = treeFromPeople([
    p("me", "я", { parents: ["mo", "fa"] }),
    p("mo", "Мать", { parents: ["gm", "gf"], spouse: "fa" }),
    p("fa", "Отец", { spouse: "mo" }),
    p("gm", "Бабушка", { line: "mom", spouse: "gf" }),
    p("gf", "Дедушка", { spouse: "gm" }),
  ]);
  assert.equal(data.people.filter((x) => x.id.startsWith("__grand")).length, 0);
});
