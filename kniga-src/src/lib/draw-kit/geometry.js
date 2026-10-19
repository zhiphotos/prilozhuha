/**
 * Чистая геометрия штриха: без холста, чтобы её можно было проверить и встроить как есть.
 */

/** @param {{x:number,y:number}} a @param {{x:number,y:number}} b */
export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** @param {{points: {x:number,y:number}[]}} stroke */
export function endpointGap(stroke) {
  const pts = stroke.points;
  if (!pts || pts.length < 2) return Infinity;
  return distance(pts[0], pts[pts.length - 1]);
}

/** @param {{points: {x:number,y:number}[]}} stroke */
export function pathLength(stroke) {
  const pts = stroke.points ?? [];
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += distance(pts[i - 1], pts[i]);
  return len;
}

/**
 * Насколько близко должны сойтись концы, чтобы контур считался замкнутым.
 * Учитывает толщину кисти: толстое перо «почти замкнуто» раньше тонкого.
 * @param {number} size толщина в тех же единицах, что и точки
 * @param {number} [closeSlop] минимум в пикселях
 */
export function closeThreshold(size, closeSlop = 28) {
  return Math.max(closeSlop, size * 2.2);
}

/**
 * Короткий жест (точка, случайный тычок) — не контур.
 * @param {{points:{x:number,y:number}[], size:number}} stroke
 */
export function isSpeck(stroke) {
  return pathLength(stroke) < Math.max(12, stroke.size * 3);
}

/**
 * Последний настоящий жест.
 * Замкнут или концы близко — его и заливаем.
 * Длинный и открытый — это он и есть, лист целиком не красим.
 * Тычки в конце пропускаем.
 * @param {{points:{x:number,y:number}[], size:number, closed?:boolean}[]} strokes
 * @param {number} [closeSlop]
 */
export function targetContour(strokes, closeSlop = 28) {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const stroke = strokes[i];
    if (!stroke.points || stroke.points.length < 3) continue;
    if (isSpeck(stroke)) continue;
    const gap = endpointGap(stroke);
    const slop = closeThreshold(stroke.size, closeSlop);
    if (stroke.closed || gap <= slop) return { stroke, open: false, gap };
    return { stroke, open: true, gap };
  }
  return null;
}

/**
 * Шаг вдоль одного отрезка. since — сколько уже пройдено от прошлого штампа.
 * Возвращает новое since на конце отрезка.
 * @param {{x:number,y:number,pressure?:number}} from
 * @param {{x:number,y:number,pressure?:number}} to
 * @param {number} since
 * @param {number} step
 * @param {(stamp: {x:number,y:number,angle:number,pressure:number}) => void} emit
 */
export function walkSegment(from, to, since, step, emit) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0 || !(step > 0)) return since;
  const angle = Math.atan2(dy, dx);
  const p0 = from.pressure ?? 1;
  const p1 = to.pressure ?? 1;
  if (since + dist < step) return since + dist;
  let traveled = step - since;
  while (traveled <= dist + 1e-6) {
    const t = traveled / dist;
    emit({
      x: from.x + dx * t,
      y: from.y + dy * t,
      angle,
      pressure: p0 + (p1 - p0) * t,
    });
    traveled += step;
  }
  const left = dist - (traveled - step);
  return left < 0 ? 0 : left;
}

/**
 * Точки штампов вдоль полилинии. Первая точка — штамп.
 * Угол первой точки берётся из первого ненулевого отрезка, чтобы плоское перо
 * не стояло боком в начале линии.
 * @param {{x:number,y:number,pressure?:number}[]} points
 * @param {number} step
 */
export function planStamps(points, step) {
  if (!points.length || !(step > 0)) return [];
  const out = [
    {
      x: points[0].x,
      y: points[0].y,
      angle: 0,
      pressure: points[0].pressure ?? 1,
    },
  ];
  let last = points[0];
  let since = 0;
  let aimed = false;
  for (let i = 1; i < points.length; i++) {
    const next = points[i];
    const dx = next.x - last.x;
    const dy = next.y - last.y;
    if (!aimed && (dx !== 0 || dy !== 0)) {
      out[0].angle = Math.atan2(dy, dx);
      aimed = true;
    }
    since = walkSegment(last, next, since, step, (stamp) => out.push(stamp));
    last = next;
  }
  return out;
}
