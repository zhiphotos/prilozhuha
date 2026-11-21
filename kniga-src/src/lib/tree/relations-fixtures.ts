// Синтетические семейные ситуации для этапа «отношения: родные, усыновление, отчимы, опека». Не тест: импорт отсюда ничего не запускает.
// Все люди вымышленные и без имён: только роли. «Сегодня» описывает, как такие связи записываются в книге сейчас (усыновления и опеки в данных нет);
// «позже» описывает ожидаемое поведение будущих этапов и пока ничем не проверяется.
import { person, union } from "./family-fixtures.ts";
import type { Person, Union } from "./types.ts";

export type Situation = {
  id: string;
  title: string;
  people: Person[];
  unions: Union[];
  /** Пары (от кого, кто) для проверки подписей. */
  pairs: [string, string][];
  /** Ожидаемая запись будущих этапов: усыновители и опека по ребёнку. */
  later?: { adoptedBy?: Record<string, string[]>; caredBy?: Record<string, { id: string; role: "guardian" | "foster" }[]>; expect: string };
};

const st = (u: Union, status: Union["status"]): Union => ({ ...u, status });

export const situations: Situation[] = [
  {
    id: "s1-stepfather-no-common",
    title: "У матери сын от прежних отношений, затем муж; общих детей нет",
    people: [person("M", "f"), person("O1", "m"), person("S", "m"), person("H", "m")],
    unions: [st(union("u1", ["M", "O1"], ["S"]), "divorced"), union("u2", ["M", "H"])],
    pairs: [["S", "H"], ["H", "S"], ["S", "O1"]],
    later: { expect: "H отчим для S (из партнёрства), в родителях S его нет" },
  },
  {
    id: "s2-stepfather-common-child",
    title: "То же, затем общая дочь у матери и мужа",
    people: [person("M", "f"), person("O1", "m"), person("S", "m"), person("H", "m"), person("C", "f")],
    unions: [st(union("u1", ["M", "O1"], ["S"]), "divorced"), union("u2", ["M", "H"], ["C"])],
    pairs: [["S", "C"], ["C", "S"], ["S", "H"], ["C", "H"]],
    later: { expect: "S и C: брат и сестра по матери; H: для S отчим, для C отец" },
  },
  {
    id: "s3-child-from-other-man",
    title: "Официальный муж, ребёнок от другого мужчины",
    people: [person("M", "f"), person("H", "m"), person("P", "m"), person("K", "m")],
    unions: [union("u1", ["M", "H"]), st(union("u2", ["M", "P"], ["K"]), "partner")],
    pairs: [["K", "H"], ["K", "P"], ["H", "K"]],
    later: { expect: "H отчим для K, P отец; брак M и H не затронут; общий ребёнок M и P не брак" },
  },
  {
    id: "s4-stepmother",
    title: "Вдовец женился второй раз, у них общий ребёнок",
    people: [person("F", "m"), person("W1", "f"), person("W2", "f"), person("A", "f"), person("B", "m"), person("E", "f")],
    unions: [st(union("u1", ["F", "W1"], ["A", "B"]), "widowed"), union("u2", ["F", "W2"], ["E"])],
    pairs: [["A", "W2"], ["A", "E"], ["E", "A"], ["E", "W2"]],
    later: { expect: "W2 мачеха для A и B; A, B и E: братья и сёстры по отцу" },
  },
  {
    id: "s5-step-siblings",
    title: "Двое с детьми от прошлых браков поженились; общих детей нет",
    people: [person("P1", "m"), person("Q1", "f"), person("K1", "f"), person("P2", "f"), person("Q2", "m"), person("K2", "m")],
    unions: [st(union("u1", ["P1", "Q1"], ["K1"]), "divorced"), st(union("u2", ["P2", "Q2"], ["K2"]), "divorced"), union("u3", ["P1", "P2"])],
    pairs: [["K1", "K2"], ["K1", "P2"], ["K2", "P1"]],
    later: { expect: "K1 и K2: сводные брат и сестра; P2 мачеха для K1, P1 отчим для K2" },
  },
  {
    id: "s6-adopted-by-stepfather",
    title: "Отчим усыновил пасынка, биологический отец жив",
    people: [person("M", "f"), person("F", "m"), person("K", "m"), person("H", "m")],
    unions: [st(union("u1", ["M", "F"], ["K"]), "divorced"), union("u2", ["M", "H"])],
    pairs: [["K", "H"], ["K", "F"]],
    later: { adoptedBy: { K: ["H"] }, expect: "F родной отец, H усыновитель (и муж матери); H не отчим, а усыновитель" },
  },
  {
    id: "s7-adopted-bio-unknown",
    title: "Усыновлён, биологические родители неизвестны",
    people: [person("A1", "m"), person("A2", "f"), person("K", "f")],
    unions: [union("u1", ["A1", "A2"], ["K"])],
    pairs: [["K", "A1"], ["K", "A2"]],
    later: { adoptedBy: { K: ["A1", "A2"] }, expect: "K под усыновителями, пометка «усыновлена», биологические родители не известны" },
  },
  {
    id: "s8-guardian-grandmother",
    title: "Бабушка опекун внука, родители живы",
    people: [person("G", "f"), person("GF", "m"), person("P", "m"), person("Q", "f"), person("K", "m")],
    unions: [union("u1", ["G", "GF"], ["P"]), union("u2", ["P", "Q"], ["K"])],
    pairs: [["K", "G"], ["K", "P"]],
    later: { caredBy: { K: [{ id: "G", role: "guardian" }] }, expect: "G бабушка по крови, дополнительно опекун; родство не меняется" },
  },
  {
    id: "s9-uncle-adopts-nephew",
    title: "Дядя усыновил племянника",
    people: [person("G1", "m"), person("G2", "f"), person("B", "m"), person("U", "m"), person("W", "f"), person("K", "m")],
    unions: [union("u1", ["G1", "G2"], ["B", "U"]), union("u2", ["B", "W"], ["K"])],
    pairs: [["K", "U"], ["K", "B"]],
    later: { adoptedBy: { K: ["U"] }, expect: "две цепочки отдельно: дядя по крови и усыновитель" },
  },
  {
    id: "s10-foster-family",
    title: "Приёмная семья без усыновления",
    people: [person("P", "m"), person("Q", "f"), person("K", "f"), person("R", "m"), person("T", "f")],
    unions: [union("u1", ["P", "Q"], ["K"]), union("u2", ["R", "T"])],
    pairs: [["K", "R"], ["K", "P"]],
    later: { caredBy: { K: [{ id: "R", role: "foster" }, { id: "T", role: "foster" }] }, expect: "R и T: приёмная семья без усыновления; не отец и не мать; родство не создаётся" },
  },
];
