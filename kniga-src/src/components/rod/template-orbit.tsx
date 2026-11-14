import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Check, Lock } from "lucide-react";

/**
 * Карусель шаблонов книги. Основа: компонент «Мастера» (atelier), переделанный под страницу:
 * круглые диски дугой, центральный крупный, фон меняется кроссфейдом, нажатие на центр открывает меню шаблона.
 * Отличия от оригинала: блок живёт внутри прокручиваемой страницы (вертикальный жест уходит странице),
 * колесо мыши перехватывается только по горизонтали, стрелки работают только когда карусель в фокусе.
 */

export type OrbitChapter = { n: number; title: string; range: string };
export type OrbitItem = {
  id: string;
  first: string;
  second: string;
  note: string;
  title: string;
  intro: string;
  /** Картинка заднего плана и кадрирование. */
  work: string;
  focus: string;
  /** Картинка круга и кадрирование. */
  face: string;
  faceFocus: string;
  total: number;
  chapters: OrbitChapter[];
  added: boolean;
  /** Дополнительный элемент в меню (например, кнопка с видео). */
  extra?: ReactNode;
  /** Информационный диск («что входит в доступ»): без «Взять шаблон». */
  info?: boolean;
  /** Подпись кнопки открытия доступа у информационного диска (если задана). */
  cta?: string;
};

const STIFF = 62;
const DAMP = 16;

type Box = { w: number; h: number };

const mod = (value: number, count: number) => ((value % count) + count) % count;

function wrapDelta(index: number, progress: number, count: number) {
  let delta = index - progress;
  delta -= Math.round(delta / count) * count;
  return delta;
}

function metrics(box: Box) {
  const maxDisc = Math.min(box.w * 0.42, box.h * 0.28, 260);
  return { maxDisc, rx: Math.min(box.w * 0.5, 460), ry: Math.min(box.h * 0.2, 200), hubX: box.w / 2, hubY: box.h * 0.39 };
}

function pose(index: number, progress: number, box: Box, count: number) {
  const { maxDisc, rx, ry, hubX, hubY } = metrics(box);
  const delta = wrapDelta(index, progress, count);
  const angle = -delta * ((Math.PI * 2) / count);
  const cos = Math.cos(angle);
  const sink = (1 - cos) / 2;
  const depth = (cos + 1) / 2;
  return {
    x: hubX + Math.sin(angle) * rx * (0.8 + 0.28 * sink),
    y: hubY + sink * ry * 1.7,
    scale: 0.32 + 0.68 * Math.pow(depth, 2.8),
    opacity: 0.4 + 0.6 * Math.pow(depth, 0.5),
    z: Math.round(8 + depth * 52),
    delta,
    maxDisc,
  };
}

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function TemplateOrbit({
  items,
  open: access,
  onTake,
  onUnlock,
}: {
  items: OrbitItem[];
  /** Открыт ли полный доступ: у закрытых вместо «Взять шаблон» кнопка «Открыть полный доступ». */
  open: boolean;
  onTake: (id: string) => void;
  onUnlock: () => void;
}) {
  const count = items.length;
  const stageRef = useRef<HTMLElement>(null);
  const [box, setBox] = useState<Box>({ w: 390, h: 600 });
  const [progress, setProgress] = useState(0);
  const [menu, setMenu] = useState(false);
  const [ask, setAsk] = useState(false);

  const progressRef = useRef(0);
  const targetRef = useRef(0);
  const velRef = useRef(0);
  const modeRef = useRef<"idle" | "drag" | "spring">("idle");
  const boxRef = useRef(box);
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const wheelLock = useRef(0);
  const dragRef = useRef({ x: 0, y: 0, p: 0, moved: false, index: null as number | null, dot: null as number | null, lastX: 0, lastT: 0 });
  boxRef.current = box;

  const active = mod(Math.round(progress), count);
  const current = items[active] ?? items[0];
  const scene = metrics(box);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const next = { w: el.clientWidth, h: el.clientHeight };
      if (next.w > 0 && next.h > 0) setBox(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  function ensureSpring() {
    if (runningRef.current) return;
    runningRef.current = true;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.034, (now - last) / 1000);
      last = now;
      if (modeRef.current !== "spring") {
        runningRef.current = false;
        return;
      }
      const offset = progressRef.current - targetRef.current;
      velRef.current += (-STIFF * offset - DAMP * velRef.current) * dt;
      const next = progressRef.current + velRef.current * dt;
      if (Math.abs(next - targetRef.current) < 0.0012 && Math.abs(velRef.current) < 0.015) {
        progressRef.current = targetRef.current;
        velRef.current = 0;
        modeRef.current = "idle";
        runningRef.current = false;
        setProgress(targetRef.current);
        return;
      }
      progressRef.current = next;
      setProgress(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function springTo(target: number) {
    setAsk(false);
    if (reduced()) {
      progressRef.current = target;
      targetRef.current = target;
      velRef.current = 0;
      modeRef.current = "idle";
      setProgress(target);
      return;
    }
    targetRef.current = target;
    modeRef.current = "spring";
    ensureSpring();
  }

  const stepBy = (step: number) => {
    setMenu(false);
    springTo(Math.round(progressRef.current) + step);
  };

  // Колесо: только горизонтальное, вертикальное прокручивает страницу.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || Math.abs(event.deltaX) < 6) return;
      event.preventDefault();
      const now = performance.now();
      if (now - wheelLock.current < 460) return;
      wheelLock.current = now;
      stepBy(event.deltaX > 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") setMenu(false);
    else if (event.key === "ArrowRight") {
      event.preventDefault();
      stepBy(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepBy(-1);
    }
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-stop]")) return;
    const indexNode = target.closest<HTMLElement>("[data-index]");
    const dotNode = target.closest<HTMLElement>("[data-dot]");
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      p: progressRef.current,
      moved: false,
      index: indexNode ? Number(indexNode.dataset.index) : null,
      dot: dotNode ? Number(dotNode.dataset.dot) : null,
      lastX: event.clientX,
      lastT: performance.now(),
    };
    velRef.current = 0;
    modeRef.current = "drag";
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    if (modeRef.current !== "drag") return;
    const drag = dragRef.current;
    const dx = event.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) <= 8) return;
      drag.moved = true;
      setMenu(false);
      setAsk(false);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* без захвата жест всё равно работает */
      }
    }
    const now = performance.now();
    const dt = Math.max(8, now - drag.lastT);
    const px = Math.max(130, boxRef.current.w * 0.36);
    velRef.current = ((event.clientX - drag.lastX) / dt / px) * 1000;
    drag.lastX = event.clientX;
    drag.lastT = now;
    const next = drag.p + dx / px;
    progressRef.current = next;
    setProgress(next);
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    if (modeRef.current !== "drag") return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const drag = dragRef.current;
    modeRef.current = "idle";
    if (!drag.moved) {
      if (event.type === "pointercancel") return;
      if (drag.dot !== null) {
        setMenu(false);
        springTo(progressRef.current + wrapDelta(drag.dot, progressRef.current, count));
        return;
      }
      if (drag.index !== null) {
        const delta = wrapDelta(drag.index, progressRef.current, count);
        if (Math.abs(delta) < 0.42) {
          setAsk(false);
          setMenu((value) => !value);
        } else {
          setMenu(false);
          springTo(progressRef.current + delta);
        }
        return;
      }
      if (menu) setMenu(false);
      return;
    }
    springTo(Math.round(progressRef.current + velRef.current * 0.22));
  }

  const menuTop = scene.hubY + scene.maxDisc * 0.52 + 14;
  const menuMax = Math.max(160, box.h - menuTop - 16);

  return (
    <section
      ref={stageRef}
      className="tpo-stage"
      aria-roledescription="карусель"
      aria-label="Готовые шаблоны книги"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {items.map((item, index) => {
        const delta = Math.abs(wrapDelta(index, progress, count));
        return (
          <img
            key={item.id}
            className="tpo-painting"
            src={item.work}
            alt=""
            draggable={false}
            decoding="async"
            style={{ opacity: Math.max(0, 1 - delta * 1.2), objectPosition: item.focus, transform: `scale(${1.06 - Math.min(delta, 1) * 0.04})` }}
          />
        );
      })}
      <div className="tpo-vignette" />
      <div className="tpo-ring" style={{ width: scene.maxDisc * 1.2, height: scene.maxDisc * 1.2, left: scene.hubX, top: scene.hubY }} />
      {items.map((item, index) => {
        const place = pose(index, progress, box, count);
        const focused = Math.abs(place.delta) < 0.42;
        return (
          <button
            key={item.id}
            type="button"
            className="tpo-disc"
            data-index={index}
            aria-label={focused ? `${item.first} ${item.second}. Открыть меню` : `${item.first} ${item.second}`}
            aria-expanded={focused ? menu : undefined}
            style={{
              width: place.maxDisc,
              height: place.maxDisc,
              opacity: place.opacity,
              zIndex: place.z,
              transform: `translate3d(${place.x}px, ${place.y}px, 0) translate(-50%, -50%) scale(${place.scale})`,
            }}
          >
            <img src={item.face} alt="" draggable={false} decoding="async" style={{ objectPosition: item.faceFocus }} />
            {!access && !item.info ? (
              <span className="tpo-lock" aria-hidden="true">
                <Lock size={14} strokeWidth={2.2} />
              </span>
            ) : null}
          </button>
        );
      })}

      <div className={menu ? "tpo-menu open" : "tpo-menu"} data-stop="true" role="dialog" aria-label={current.title} aria-hidden={!menu} inert={menu ? undefined : true} style={{ top: menuTop, maxHeight: menuMax }}>
        <div className="tpo-scroll">
          <p className="tpo-menu-title">{current.title}</p>
          {current.info ? null : <p className="tpo-menu-meta">Глав: {current.chapters.length}</p>}
          <p className="tpo-menu-body">{current.intro}</p>
          {current.info ? null : (
            <details className="tpo-chapters">
              <summary>Главы: {current.chapters.length}</summary>
              <ol>
                {current.chapters.map((chapter) => (
                  <li key={chapter.n}>
                    <span>{chapter.range}</span>
                    {chapter.n}. {chapter.title}
                  </li>
                ))}
              </ol>
            </details>
          )}
          {current.extra ? <div className="mt-3">{current.extra}</div> : null}
        </div>
        <div className="tpo-foot">
        {current.info ? (
          current.cta && !access ? (
            <button type="button" className="tpo-take btn-glass-green" onClick={onUnlock}>
              <Lock size={16} /> {current.cta}
            </button>
          ) : null
        ) : !access ? (
          <button type="button" className="tpo-take btn-glass-green" onClick={onUnlock}>
            <Lock size={16} /> Открыть полный доступ
          </button>
        ) : current.added ? (
          <p className="tpo-added">
            <Check size={16} /> Шаблон уже в книге: листайте и заполняйте страницы
          </p>
        ) : ask ? (
          <div className="tpo-ask">
            <button type="button" className="tpo-take" onClick={() => { setAsk(false); setMenu(false); onTake(current.id); }}>
              Да, добавить {current.total} страниц
            </button>
            <button type="button" className="tpo-cancel" onClick={() => setAsk(false)}>
              Отмена
            </button>
          </div>
        ) : (
          <button type="button" className="tpo-take" onClick={() => setAsk(true)}>
            Взять шаблон
          </button>
        )}
        <button type="button" className="tpo-close" onClick={() => setMenu(false)}>
          Закрыть
        </button>
        </div>
      </div>

      <div className="tpo-caption">
        {items.map((item, index) => {
          const delta = Math.abs(wrapDelta(index, progress, count));
          return (
            <div key={item.id} className="tpo-caption-layer" style={{ opacity: Math.max(0, 1 - delta), transform: `translateY(${delta * 8}px)` }}>
              <p className="tpo-name">
                {item.first} <span>{item.second}</span>
              </p>
              <p className="tpo-note">{item.note}</p>
            </div>
          );
        })}
      </div>

      <div className="tpo-dots">
        {items.map((item, index) => (
          <button key={item.id} type="button" className="tpo-dot" data-dot={index} aria-label={`${item.first} ${item.second}`} aria-current={Math.abs(wrapDelta(index, progress, count)) < 0.5 ? "true" : undefined} />
        ))}
      </div>

      <p className="tpo-live" aria-live="polite">
        {current.first} {current.second}
      </p>
    </section>
  );
}
