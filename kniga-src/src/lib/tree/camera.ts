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

export type CamLike = { x: number; y: number; k: number };
export type Box = { w: number; h: number };

/** Камера всё ещё та, что выставила сама подгонка: человек её не двигал и не приближал. */
export function cameraUntouched(auto: CamLike | null, c: CamLike): boolean {
  if (!auto) return true;
  return Math.abs(auto.x - c.x) <= 0.5 && Math.abs(auto.y - c.y) <= 0.5 && Math.abs(auto.k - c.k) <= 0.001;
}

/**
 * Размер рабочей области изменился (поворот телефона, боковая панель, окно браузера): заново подгоняем и центрируем,
 * но только если размер изменился по-настоящему и человек не двигал и не приближал древо вручную.
 */
export function resizeDecision(prev: Box | null, next: Box, auto: CamLike | null, c: CamLike): boolean {
  if (next.w < 1 || next.h < 1) return false; // область скрыта или ещё не измерена
  if (prev && Math.abs(prev.w - next.w) < 1 && Math.abs(prev.h - next.h) < 1) return false;
  return cameraUntouched(auto, c);
}
