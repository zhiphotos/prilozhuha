/**
 * Наводка камеры на человека выполняется один раз на каждый запрос (n), а не при каждой пересборке раскладки.
 * Иначе после удаления или правки человека раскладка пересчитывается и камера возвращается к «вам» (жалоба Марии В.).
 */
export type CenterRequest = { id: string; n: number };

export function centerDecision(request: CenterRequest | null, lastDone: number, spotFound: boolean): { apply: boolean; lastDone: number } {
  if (!request) return { apply: false, lastDone };
  if (request.n === lastDone) return { apply: false, lastDone }; // этот запрос уже выполнен: пересборка раскладки камеру не двигает
  if (!spotFound) return { apply: false, lastDone }; // человека в раскладке пока нет (большое древо ещё считается): попробуем при следующей раскладке
  return { apply: true, lastDone: request.n };
}
