export type Gender = "m" | "f" | "u";

export type UnionStatus = "married" | "divorced" | "widowed" | "partner";

export type Person = {
  id: string;
  firstName: string;
  patronymic: string;
  lastName: string;
  gender: Gender;
  birthYear: string;
  deathYear: string;
  photo: string;
  note: string;
  /** Девичья фамилия (если в файле она отличается от фамилии в замужестве). */
  maidenName?: string;
  /** Как человек стоит рядом с супругом: слева или справа (выбор пользователя). */
  side?: "left" | "right";
  /** Место ветки среди других в ряду слева направо (выбор пользователя). */
  rank?: number;
};

export type Union = {
  id: string;
  partnerIds: string[];
  childIds: string[];
  status: UnionStatus;
  startYear: string;
  endYear: string;
};

export type TreeData = {
  people: Person[];
  unions: Union[];
  focusId: string;
};

export type LayoutNode = {
  id: string;
  x: number;
  y: number;
  gen: number;
};

export type SpouseLink = {
  unionId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  status: UnionStatus;
  curved: boolean;
  /** Супруги стоят далеко друг от друга (каждый под своими родителями): линии брака нет, плашка стоит на скобке над ребёнком на этой высоте. */
  bracketY?: number;
};

export type ChildBus = {
  unionId: string;
  fromX: number | null;
  fromY: number | null;
  busY: number;
  xs: number[];
  childTop: number;
  /** Супруги далеко друг от друга: линии идут от каждого из них вниз к общей скобке. */
  partnerXs?: number[];
  partnerTop?: number;
  /** Высота линии брака между далёкими супругами (выше линии детей). */
  bracketY?: number;
};

export type GenLabel = {
  gen: number;
  y: number;
  text: string;
};

export type TreeLayout = {
  nodes: LayoutNode[];
  spouses: SpouseLink[];
  buses: ChildBus[];
  labels: GenLabel[];
  /** Люди, чьи родители стоят далеко: связь с ними не рисуется, у карточки значок. */
  detached?: string[];
  width: number;
  height: number;
  focusGen: number;
};

export type KinKind =
  | "self"
  | "ancestor"
  | "descendant"
  | "spouse"
  | "sibling"
  | "collateral"
  | "inlaw"
  | "other";

export type Kinship = {
  kind: KinKind;
  title: string;
  degree: number | null;
  card: string;
};
