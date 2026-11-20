export type Gender = "m" | "f" | "u";

/** «coparents»: «Общий ребёнок», у двоих есть общий ребёнок, а записи о браке или союзе нет. Брака и союза не означает. */
export type UnionStatus = "married" | "divorced" | "widowed" | "partner" | "coparents";

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
  /** Как записано в «Кем приходится» (от лица хозяина книги): показываем, если по связям родство доказать не удалось. */
  declared?: string;
  /** Место рождения (необязательно): можно показать на карточке древа. */
  birthPlace?: string;
  /** Как человек стоит рядом с супругом: слева или справа (выбор пользователя). */
  side?: "left" | "right";
  /** Место ветки среди других в ряду слева направо (выбор пользователя). */
  rank?: number;
  /** Ручной сдвиг карточки на схеме (перетащили пальцем). */
  treeDx?: number;
  treeDy?: number;
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
  /** Раскладка для экспорта PNG/PDF: `family` («пара в центре») по выбору на экране; нет или `classic`: прежняя. */
  engine?: "classic" | "family";
  /** Владелец книги (центр семейной раскладки). */
  ownerId?: string;
  /** Источник файла (программа и, если есть, идентификатор базы): вместе с id человека из файла помогает узнать его при повторной загрузке. */
  source?: string;
  /** Связи, которые нельзя определить без выбора пользователя (не угадываются). */
  ambiguous?: { id: string; message: string }[];
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
  /** Ручной сдвиг: высота входа в каждого ребёнка (в порядке xs). Если нет, у всех childTop. */
  childTops?: number[];
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
