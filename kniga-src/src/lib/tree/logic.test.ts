import { demoTree } from "./demo.ts";
import { kinship } from "./kinship.ts";
import { layoutTree } from "./layout.ts";
import { H_GAP, PLATE_W, SPOUSE_DX } from "./metrics.ts";
import type { Person } from "./types.ts";

const demo = demoTree();

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function check(data: ReturnType<typeof demoTree>, label: string) {
  const layout = layoutTree(data.people, data.unions, data.focusId);
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const missing = data.people.filter((p) => !byId.has(p.id)).map((p) => p.id);
  assert(!missing.length, `${label} missing ${missing.join(",")}`);
  const gens = new Map<number, typeof layout.nodes>();
  for (const n of layout.nodes) {
    const row = gens.get(n.gen) ?? [];
    row.push(n);
    gens.set(n.gen, row);
  }
  for (const [gen, row] of gens) {
    row.sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) {
      const gap = row[i]!.x - row[i - 1]!.x;
      assert(gap >= PLATE_W + H_GAP - 0.5, `${label} overlap gen ${gen}: ${row[i - 1]!.id}/${row[i]!.id} ${gap.toFixed(1)}`);
    }
  }
  return { layout, byId };
}

const { layout, byId } = check(demo, "demo");
const anna = byId.get("anna")!;
const ustinya = byId.get("ustinya")!;
assert(anna.gen - ustinya.gen === 6, `ustinya distance ${anna.gen - ustinya.gen}`);

const kids = ["dmitry", "anna", "ekaterina", "ilya"].map((id) => byId.get(id)!);
for (let i = 1; i < kids.length; i++) {
  assert(kids[i]!.x > kids[i - 1]!.x, "sibling order");
  assert(kids[i]!.gen === kids[0]!.gen, "sibling row");
}
assert(Math.abs(byId.get("viktor")!.x - byId.get("olga")!.x) < 260, "olga/viktor");
assert(byId.get("valentina")!.x < byId.get("sergei")!.x && byId.get("sergei")!.x < byId.get("nina")!.x, "two marriages");

function coupleMid(a: string, b: string) {
  return (byId.get(a)!.x + byId.get(b)!.x) / 2;
}
assert(Math.abs(byId.get("marfa")!.x - coupleMid("egor", "ustinya")) < 24, `marfa not under parents ${byId.get("marfa")!.x}`);
assert(Math.abs(byId.get("agrafena")!.x - coupleMid("pyotr", "marfa")) < 24, "agrafena not under parents");
assert(Math.abs(byId.get("sergei")!.x - coupleMid("ivan", "elena")) < 24, "sergei not under parents");
const ninaMid = coupleMid("sergei", "nina");
const nearest = Math.min(Math.abs(byId.get("olga")!.x - ninaMid), Math.abs(byId.get("pavel")!.x - ninaMid));
assert(nearest < 280, `second marriage children left the couple by ${nearest.toFixed(0)}`);
assert(Math.abs(byId.get("igor")!.x - coupleMid("sergei", "valentina")) < 24, "igor not under first marriage");
const volkovMid = coupleMid("viktor", "olga");
const volkovKids = ["dmitry", "anna", "ekaterina", "ilya"].map((id) => byId.get(id)!.x);
const volkovSpan = (Math.min(...volkovKids) + Math.max(...volkovKids)) / 2;
assert(Math.abs(volkovSpan - volkovMid) < 80, `children not under olga ${Math.abs(volkovSpan - volkovMid).toFixed(0)}`);
for (const [a, b] of [
  ["egor", "ustinya"],
  ["sergei", "nina"],
  ["sergei", "valentina"],
  ["viktor", "olga"],
  ["kirill", "anna"],
] as const) {
  const dx = Math.abs(byId.get(a)!.x - byId.get(b)!.x);
  assert(dx < SPOUSE_DX * 1.35, `${a}/${b} split ${dx.toFixed(0)}`);
}

const kin = (id: string) => kinship(demo.people, demo.unions, "anna", id);
assert(kin("ustinya").card === "Прапрапрапрабабушка (6)", kin("ustinya").card);
assert(kin("egor").title === "Прапрапрапрадедушка", kin("egor").title);
assert(kin("elena").card === "Прабабушка (3)", kin("elena").card);
assert(kin("olga").title === "Мать", kin("olga").title);
assert(kin("viktor").title === "Отец", kin("viktor").title);
assert(kin("dmitry").title === "Старший брат", kin("dmitry").title);
assert(kin("igor").title === "Сводный дядя", kin("igor").title);
assert(kin("pavel").title === "Дядя", kin("pavel").title);
assert(kin("kirill").title === "Муж", kin("kirill").title);
assert(kin("alina").title === "Бывшая невестка", kin("alina").title);
assert(kin("artem").title === "Зять", kin("artem").title);
assert(kin("lev").title === "Сын", kin("lev").title);
assert(kin("valentina").title === "Бывшая жена дедушки", kin("valentina").title);
assert(kin("pyotr").degree === 5, String(kin("pyotr").degree));

const father: Person = {
  id: "andrey",
  firstName: "Андрей",
  patronymic: "",
  lastName: "Волков",
  gender: "m",
  birthYear: "1924",
  deathYear: "2001",
  photo: "",
  note: "",
};
const grafted = {
  people: [...demo.people, father],
  unions: demo.unions.map((u) =>
    u.id === "u-volkov" ? u : u,
  ).concat([{ id: "u-andrey", partnerIds: ["andrey"], childIds: ["viktor"], status: "widowed" as const, startYear: "1950", endYear: "" }]),
  focusId: "anna",
};
const g2 = check(grafted, "graft");
const v = g2.byId.get("viktor")!;
const o = g2.byId.get("olga")!;
const f = g2.byId.get("andrey")!;
assert(v.gen === o.gen, "viktor stays beside olga's row");
assert(Math.abs(v.x - o.x) < 280, `viktor drifted ${Math.abs(v.x - o.x)}`);
assert(f.gen === v.gen - 1, "father sits one row above");
assert(Math.abs(f.x - v.x) < 360, `father not above viktor ${Math.abs(f.x - v.x)}`);

console.log("ok", layout.nodes.length, Math.round(layout.width), "x", Math.round(layout.height));
