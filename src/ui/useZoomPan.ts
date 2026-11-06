import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_ZOOM = 1 / 1.6; // чуть дальше исходного вида
const MAX_ZOOM = 8;
const EASE = 0.22; // доля пути к цели за кадр — плавное приближение
const FRICTION = 0.93; // затухание инерции за кадр

/**
 * Приближение и перемещение SVG: колесо мыши (к курсору), перетаскивание с инерцией,
 * щипок двумя пальцами. Возвращает текущий viewBox. При смене `base` вид сбрасывается.
 */
export function useZoomPan(svgRef: RefObject<SVGSVGElement | null>, base: ViewBox, active: boolean) {
  const baseKey = `${base.x}|${base.y}|${base.w}|${base.h}`;
  const [view, setView] = useState<ViewBox>(base);
  const viewRef = useRef(view);
  const target = useRef<ViewBox>(base);
  const velocity = useRef({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);

  const clamp = useCallback(
    (v: ViewBox): ViewBox => {
      const w = Math.min(base.w / MIN_ZOOM, Math.max(base.w / MAX_ZOOM, v.w));
      const h = (w * base.h) / base.w;
      // Не уводить карту совсем за край: центр остаётся в пределах исходной области.
      const cx = Math.min(base.x + base.w, Math.max(base.x, v.x + w / 2));
      const cy = Math.min(base.y + base.h, Math.max(base.y, v.y + h / 2));
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    },
    [baseKey],
  );

  const commit = (v: ViewBox) => {
    viewRef.current = v;
    setView(v);
  };

  const tick = useCallback(() => {
    const cur = viewRef.current;
    const vel = velocity.current;
    let t = target.current;
    if (Math.abs(vel.x) + Math.abs(vel.y) > 0.01) {
      t = clamp({ ...t, x: t.x + vel.x, y: t.y + vel.y });
      target.current = t;
      vel.x *= FRICTION;
      vel.y *= FRICTION;
    } else {
      vel.x = 0;
      vel.y = 0;
    }
    const next = {
      x: cur.x + (t.x - cur.x) * EASE,
      y: cur.y + (t.y - cur.y) * EASE,
      w: cur.w + (t.w - cur.w) * EASE,
      h: cur.h + (t.h - cur.h) * EASE,
    };
    const done =
      vel.x === 0 &&
      Math.abs(next.x - t.x) < 0.05 &&
      Math.abs(next.y - t.y) < 0.05 &&
      Math.abs(next.w - t.w) < 0.05;
    commit(done ? t : next);
    frame.current = done ? null : requestAnimationFrame(tick);
  }, [clamp]);

  const animate = useCallback(() => {
    if (frame.current === null) frame.current = requestAnimationFrame(tick);
  }, [tick]);

  // Новый исходный вид (другой день, «весь кампус») или карту открыли заново — сбросить.
  useEffect(() => {
    target.current = base;
    velocity.current = { x: 0, y: 0 };
    commit(base);
  }, [baseKey, active]);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  /** Экранная точка → координаты SVG при текущем виде. */
  const toSvg = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      const ctm = svg?.getScreenCTM();
      if (!svg || !ctm) return null;
      const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    },
    [svgRef],
  );

  /** Приблизить в `factor` раз к точке (координаты SVG) — плавно, через цель. */
  const zoomAt = useCallback(
    (factor: number, at?: { x: number; y: number }) => {
      const t = target.current;
      const p = at ?? { x: t.x + t.w / 2, y: t.y + t.h / 2 };
      target.current = clamp({
        x: p.x - (p.x - t.x) / factor,
        y: p.y - (p.y - t.y) / factor,
        w: t.w / factor,
        h: t.h / factor,
      });
      animate();
    },
    [animate, clamp],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // Колесо: обязательно не-пассивный обработчик, иначе страница прокрутится.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toSvg(e.clientX, e.clientY);
      if (!p) return;
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(-delta * 0.0022), p);
    };

    const pointers = new Map<number, { x: number; y: number }>();
    let last: { x: number; y: number; t: number } | null = null;
    let pinch: { dist: number; mid: { x: number; y: number } } | null = null;

    const distance = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const midpoint = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: 0, y: 0 };
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      svg.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      velocity.current = { x: 0, y: 0 };
      if (pointers.size === 2) pinch = { dist: distance(), mid: midpoint() };
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
    };

    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const unit = 1 / ctm.a; // экранные пиксели → единицы SVG

      if (pointers.size >= 2 && pinch) {
        const dist = distance();
        const mid = midpoint();
        const p = toSvg(mid.x, mid.y);
        if (p && pinch.dist > 0) {
          const factor = dist / pinch.dist;
          const t = target.current;
          const dx = (mid.x - pinch.mid.x) * unit;
          const dy = (mid.y - pinch.mid.y) * unit;
          const next = clamp({
            x: p.x - (p.x - t.x) / factor - dx,
            y: p.y - (p.y - t.y) / factor - dy,
            w: t.w / factor,
            h: t.h / factor,
          });
          target.current = next;
          commit(next); // пальцы двигают карту напрямую, без задержки
        }
        pinch = { dist, mid };
        return;
      }

      if (last) {
        const now = performance.now();
        const dx = (e.clientX - last.x) * unit;
        const dy = (e.clientY - last.y) * unit;
        const t = target.current;
        const next = clamp({ ...t, x: t.x - dx, y: t.y - dy });
        target.current = next;
        commit(next);
        const dt = Math.max(1, now - last.t);
        // Скорость в единицах SVG за кадр (~16 мс) — для инерции после отпускания.
        velocity.current = { x: (-dx / dt) * 16, y: (-dy / dt) * 16 };
        last = { x: e.clientX, y: e.clientY, t: now };
      }
    };

    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 1) {
        const [p] = [...pointers.values()];
        last = p ? { ...p, t: performance.now() } : null;
        return;
      }
      if (pointers.size === 0) {
        // Если палец остановился перед отпусканием — без инерции.
        if (last && performance.now() - last.t > 80) velocity.current = { x: 0, y: 0 };
        last = null;
        animate();
      }
    };

    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    return () => {
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('pointerdown', onDown);
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerup', onUp);
      svg.removeEventListener('pointercancel', onUp);
    };
  }, [svgRef, toSvg, zoomAt, clamp, animate, active]);

  const reset = useCallback(() => {
    velocity.current = { x: 0, y: 0 };
    target.current = base;
    animate();
  }, [animate, baseKey]);

  const zoom = Math.round((base.w / view.w) * 10) / 10;
  return { view, zoomAt, reset, zoom };
}
