import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Lock, X } from "lucide-react";

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
  /** Короткая строка над кругами (для информационных кругов). */
  kicker?: string;
  /** Крупная строка над кругами; если не задана, берётся заголовок. */
  topTitle?: string;
  /** Короткий текст под названием, виден без нажатия. */
  teaser?: string;
  /** Картинки, которые открываются на весь экран по нажатию (отзывы, планы уроков). */
  images?: string[];
  /** Подпись кнопки открытия доступа у информационного диска (если задана). */
  cta?: string;
};

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="tpo-zoom" role="dialog" aria-modal="true" aria-label="Картинка крупно" onClick={onClose}>
      <button type="button" className="tpo-zoom-close" onClick={onClose} aria-label="Закрыть">
        <X size={22} />
      </button>
      <img src={src} alt="" onClick={(event) => event.stopPropagation()} />
    </div>,
    document.body,
  );
}

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
  const maxDisc = Math.min(box.w * 0.42, box.h * 0.26, 250);
  return { maxDisc, rx: Math.min(box.w * 0.5, 460), ry: Math.min(box.h * 0.2, 200), hubX: box.w / 2, hubY: box.h * 0.43 };
}

/** Масштабы кругов по удалению от центра и зазор между ними: круги стоят рядом, не заходя друг на друга. */
const SLOT_SCALE = [1, 0.58, 0.38, 0.26];
const SLOT_GAP = 10;

function slotOffsets(maxDisc: number) {
  const offsets = [0];
  for (let i = 1; i < SLOT_SCALE.length; i++) offsets[i] = offsets[i - 1] + 0.5 * maxDisc * (SLOT_SCALE[i - 1] + SLOT_SCALE[i]) + SLOT_GAP;
  return offsets;
}

function interp(values: number[], at: number) {
  const a = Math.min(at, values.length - 1);
  const i = Math.floor(a);
  const next = values[Math.min(i + 1, values.length - 1)];
  return values[i] + (next - values[i]) * (a - i);
}

function pose(index: number, progress: number, box: Box, count: number) {
  const { maxDisc, ry, hubX, hubY } = metrics(box);
  const delta = wrapDelta(index, progress, count);
  const a = Math.abs(delta);
  const x = hubX + Math.sign(delta || 1) * interp(slotOffsets(maxDisc), a);
  const scale = interp(SLOT_SCALE, a);
  const opacity = a <= 2 ? 1 - 0.18 * a : Math.max(0, (3 - a) * 0.64);
  return { x, y: hubY + Math.min(a, 3) * ry * 0.3, scale, opacity, z: Math.round(60 - a * 10), delta, maxDisc };
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
  const [zoom, setZoom] = useState<string | null>(null);

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
      <div className="tpo-wall" aria-hidden="true" />
      <div className="tpo-tone" aria-hidden="true" />
      <div className="tpo-vignette" />
      <div className="tpo-top" aria-hidden="true">
        {items.map((item, index) => {
          const delta = Math.abs(wrapDelta(index, progress, count));
          return (
            <div key={item.id} className="tpo-top-layer" style={{ opacity: Math.max(0, 1 - delta * 1.4), transform: `translateY(${delta * -6}px)` }}>
              <p className="tpo-kicker">{item.kicker}</p>
              <p className="tpo-top-title">{item.topTitle ?? item.title}</p>
            </div>
          );
        })}
      </div>
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
          {current.info ? null : <p className="tpo-menu-title">{current.title}</p>}
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
          {current.images?.length ? (
            <div className={current.images.length > 1 ? "tpo-thumbs" : "tpo-thumbs one"}>
              {current.images.map((src) => (
                <button key={src} type="button" onClick={() => setZoom(src)} aria-label="Открыть крупно">
                  <img src={src} alt="" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          ) : null}
          {current.images?.length ? <p className="tpo-hint">Нажмите на картинку, чтобы открыть крупно</p> : null}
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
              {item.teaser ? <p className="tpo-teaser">{item.teaser}</p> : <p className="tpo-note">{item.note}</p>}
            </div>
          );
        })}
      </div>

      <div className="tpo-dots">
        {items.map((item, index) => (
          <button key={item.id} type="button" className="tpo-dot" data-dot={index} aria-label={`${item.first} ${item.second}`} aria-current={Math.abs(wrapDelta(index, progress, count)) < 0.5 ? "true" : undefined} />
        ))}
      </div>

      {zoom ? <Lightbox src={zoom} onClose={() => setZoom(null)} /> : null}
      <p className="tpo-live" aria-live="polite">
        {current.first} {current.second}
      </p>
    </section>
  );
}
