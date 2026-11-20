// Этап 3б: что показывает и что записывает форма «Добавить ребёнка» для СУЩЕСТВУЮЩЕГО ребёнка.
// Здесь только правила выбора, расчёт «было → станет» и вызов готового действия этапа 3а. Программа сама никого не снимает:
// каждый вариант пользователь выбирает явно.
import type { Person as RodPerson } from "../rod/types.ts";
import { useRod } from "../rod/store.ts";
import { currentParentsState, parentsDiff, replacePolicy, type CloudCheck, type Confirmations, type ParentsDiff, type SecondParentChoice } from "./second-parent.ts";
import { useTree, type ChildResult, type StoreSecond } from "./ui-store.ts";

/** «Новый человек» во втором родителе ещё не имеет id; в расчёте «было → станет» он помечается этим значением. */
export const NEW_PARENT = "+new";

export type ParentVariant = {
  id: "second" | "add" | "replace-x" | "replace-y" | "replace-one" | "replace-both";
  /** Кого снимает этот вариант (id) или пусто. */
  removes: string[];
  /** Первый и второй родитель для записи. second: "pick" значит, что второго выбирает пользователь (в том числе «Неизвестно»). */
  firstId: string;
  second: { mode: "existing"; id: string } | { mode: "unknown" } | "pick";
  /** Вариант недоступен: причина для серой строки. */
  disabled?: string;
};

export type VariantSet = {
  /** Что записано у ребёнка сейчас. */
  before: string[];
  unmarried: boolean;
  /** normal: первый родитель уже записан или родителей нет, форма показывает обычный блок «Второй родитель». choose: сначала выбор заменяемого. */
  mode: "normal" | "choose";
  variants: ParentVariant[];
};

/** Варианты записи первого родителя F существующему ребёнку. Ни один не выбран заранее. */
export function parentVariants(people: RodPerson[], firstId: string, childId: string): VariantSet | null {
  const state = currentParentsState(people, childId);
  if (!state) return null;
  const before = state.parents;
  const base = { before, unmarried: state.unmarried };
  if (!before.length || before.includes(firstId)) {
    return { ...base, mode: "normal", variants: [{ id: "second", removes: [], firstId, second: "pick" }] };
  }
  if (before.length === 1) {
    const x = before[0]!;
    return {
      ...base,
      mode: "choose",
      variants: [
        { id: "add", removes: [], firstId: x, second: { mode: "existing", id: firstId } },
        { id: "replace-x", removes: [x], firstId, second: { mode: "unknown" } },
        { id: "replace-one", removes: [x], firstId, second: "pick" },
      ],
    };
  }
  const [x, y] = before as [string, string];
  return {
    ...base,
    mode: "choose",
    variants: [
      { id: "add", removes: [], firstId, second: "pick", disabled: "Нет свободного места: у ребёнка уже двое родителей" },
      { id: "replace-x", removes: [x], firstId: y, second: { mode: "existing", id: firstId } },
      { id: "replace-y", removes: [y], firstId: x, second: { mode: "existing", id: firstId } },
      { id: "replace-both", removes: [x, y], firstId, second: "pick" },
    ],
  };
}

/** Список родителей после записи этого варианта (новый человек отмечается значением NEW_PARENT). Только расчёт. */
export function afterParents(variant: ParentVariant, pick?: StoreSecond | SecondParentChoice | null): string[] {
  const second = variant.second === "pick" ? pick ?? { mode: "unknown" as const } : variant.second;
  const out = [variant.firstId];
  if (second.mode === "new") out.push(NEW_PARENT);
  else if (second.mode !== "unknown") out.push(second.id);
  return out;
}

/** «Было → Станет» для экрана. Только расчёт. */
export function previewChange(people: RodPerson[], childId: string, variant: ParentVariant, pick?: StoreSecond | SecondParentChoice | null): { diff: ParentsDiff; state: { parents: string[]; unmarried: boolean } } | null {
  const state = currentParentsState(people, childId);
  if (!state) return null;
  return { diff: parentsDiff(state.parents, afterParents(variant, pick)), state };
}

export type CommitArgs = {
  childId: string;
  variant: ParentVariant;
  /** Выбор второго родителя там, где variant.second = "pick". */
  pick?: StoreSecond;
  /** Подтверждения мягких предупреждений и «это не тот же человек». */
  confirm?: Pick<Confirmations, "warnings" | "notDuplicate">;
  /** Состояние, которое пользователь видел на экране «Было → Станет». */
  expected: { parents: string[]; unmarried: boolean };
  /** Пользователь нажал кнопку замены или снятия. Без неё разрушительная запись не выполняется. */
  replaceConfirmed: boolean;
  /** Итог проверки облака, сделанной перед показом экрана. */
  cloud: CloudCheck;
};
export type CommitResult = ChildResult | { ok: false; errors: string[]; blocked: "cloud-unchecked" | "not-confirmed" };

/**
 * Записывает выбранный вариант. Синхронно: расчёт допустимости и запись идут подряд, без await.
 * Разрушительная операция без проверки облака или без явного подтверждения не выполняется.
 */
export function commitExistingChild(a: CommitArgs): CommitResult {
  const store = useTree.getState();
  const second: StoreSecond = a.variant.second === "pick" ? a.pick ?? { mode: "unknown" } : a.variant.second;
  const state = currentParentsState(storePeople(), a.childId);
  const after = afterParents(a.variant, second);
  const diff = parentsDiff(state?.parents ?? [], after);
  const policy = replacePolicy(diff, a.cloud);
  if (!policy.allowed) {
    return { ok: false, errors: ["Не удалось проверить изменения на другом устройстве. Сначала проверьте облако: Главная, Книга, Синхронизировать. Потом повторите. Добавить родителя без замены можно прямо сейчас."], blocked: "cloud-unchecked" };
  }
  if (diff.destructive && !a.replaceConfirmed) return { ok: false, errors: ["Нужно подтвердить замену"], blocked: "not-confirmed" };
  return store.attachChildWithParents(a.variant.firstId, a.childId, second, {
    ...a.confirm,
    // 3а просит это подтверждение при любом отличии списка; для добавления без снятия пользователь выбрал вариант явно.
    replaceParents: !diff.unchanged,
    expectedParents: a.expected.parents,
    expectedUnmarried: a.expected.unmarried,
  });
}

function storePeople(): RodPerson[] {
  return useRod.getState().people;
}
