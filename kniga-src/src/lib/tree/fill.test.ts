import { demoTree } from "./demo.ts";
import { addPerson, attachPerson, buildStarter, familyOf } from "./fill.ts";
import { kinship } from "./kinship.ts";
import { layoutTree } from "./layout.ts";
import type { TreeData } from "./types.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const starter = buildStarter({
  self: { firstName: "Анна", lastName: "Волкова", gender: "f", birthYear: "1992" },
  father: { firstName: "Виктор", lastName: "Волков", birthYear: "1953" },
  mother: { firstName: "Ольга", lastName: "Морозова", birthYear: "1957" },
  paternalGrandfather: { firstName: "Андрей", birthYear: "1924" },
  paternalGrandmother: { firstName: "Мария", birthYear: "1928" },
  maternalGrandfather: { firstName: "Сергей", birthYear: "1929" },
  maternalGrandmother: { firstName: "Нина", birthYear: "1933" },
});

assert(starter.people.length === 7, `starter count ${starter.people.length}`);
assert(starter.focusId === "self", "focus is self");
const family = familyOf(starter.people, starter.unions, "self");
assert(family.father?.firstName === "Виктор", "father slot");
assert(family.mother?.firstName === "Ольга", "mother slot");
const layout = layoutTree(starter.people, starter.unions, "self");
const at = new Map(layout.nodes.map((n) => [n.id, n]));
const fatherId = family.father!.id;
const motherId = family.mother!.id;
assert(at.get(fatherId)!.x < at.get(motherId)!.x, "father stands left of mother");
assert(at.get(fatherId)!.gen === at.get(motherId)!.gen, "parents share a generation");
const grandma = starter.people.find((p) => p.firstName === "Мария")!;
const kin = kinship(starter.people, starter.unions, "self", grandma.id);
assert(kin.title === "Бабушка", kin.title);
assert(kin.degree === 2, `grandma degree ${kin.degree}`);

const deep = buildStarter({
  self: { firstName: "Анна", gender: "f" },
  mother: { firstName: "Ольга" },
  maternalGrandmother: { firstName: "Нина" },
});
let data: TreeData = deep;
const chain = ["Елена", "Аграфена", "Марфа", "Устинья"];
let cursor = deep.people.find((p) => p.firstName === "Нина")!.id;
for (const name of chain) {
  const added = addPerson(data, cursor, "mother", {
    firstName: name,
    patronymic: "",
    lastName: "",
    gender: "f",
    birthYear: "",
    deathYear: "",
    note: "",
    photo: "",
  });
  assert(!("error" in added), "error" in added ? added.error : "");
  if ("error" in added) throw new Error(added.error);
  data = added.data;
  cursor = added.id;
}
const ustinya = data.people.find((p) => p.firstName === "Устинья")!;
const deepKin = kinship(data.people, data.unions, "self", ustinya.id);
assert(deepKin.card === "Прапрапрапрабабушка (6)", deepKin.card);

const sibs = buildStarter({ self: { firstName: "Анна", gender: "f", birthYear: "1992" } });
const brother = addPerson(sibs, "self", "brother", {
  firstName: "Илья",
  patronymic: "",
  lastName: "Волков",
  gender: "m",
  birthYear: "2000",
  deathYear: "",
  note: "",
  photo: "",
});
assert(!("error" in brother), "brother");
if (!("error" in brother)) {
  const title = kinship(brother.data.people, brother.data.unions, "self", brother.id).title;
  assert(title === "Младший брат", title);
  const back = attachPerson(brother.data, "self", "father", brother.id);
  assert("error" in back, "child cannot become father via sibling");
}

const demo = demoTree();
const annaFamily = familyOf(demo.people, demo.unions, "anna");
assert(annaFamily.father?.id === "viktor", "demo father");
assert(annaFamily.mother?.id === "olga", "demo mother");
assert(annaFamily.siblings.length === 3, `siblings ${annaFamily.siblings.length}`);
assert(annaFamily.marriages.length === 1 && annaFamily.marriages[0]!.children.length === 2, "anna children under her marriage");
const igor = kinship(demo.people, demo.unions, "olga", "igor");
assert(igor.title.includes("сводн"), igor.title);

console.log("fill ok", deepKin.card, igor.title);
