// src/hooks/useDragNode.ts
import { useRef, useCallback } from "react";

type Opts = {
  id: string;
  enabled: boolean;
  /** Tamaño de grilla para snap (en unidades del viewBox) */
  snap?: number;
  /** Lectura de posición actual del nodo */
  getPos: (id: string) => { x: number; y: number } | null | undefined;
  /** Escritura de nueva posición del nodo */
  setPos: (id: string, x: number, y: number) => void;
  /** Se dispara en cada cambio (ya con throttle a rAF) */
  onChange?: (x: number, y: number) => void;
  /** Se dispara al soltar */
  onEnd?: () => void;
  /** Logs en consola */
  debug?: boolean;
};

/** Convierte coords de pantalla a coords del viewBox del SVG */
function clientToSvg(svg: SVGSVGElement, cx: number, cy: number) {
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const x = ((cx - rect.left) / rect.width) * vb.width + vb.x;
  const y = ((cy - rect.top) / rect.height) * vb.height + vb.y;
  return { x, y };
}

export default function useDragNode({
  id,
  enabled,
  snap = 10,
  getPos,
  setPos,
  onChange,
  onEnd,
  debug,
}: Opts) {
  const dragging = useRef(false);
  const grabDx = useRef(0);
  const grabDy = useRef(0);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const raf = useRef<number | null>(null);

  const tick = (fn: () => void) => {
    if (raf.current != null) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      fn();
    });
  };

  const handleMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current || !svgRef.current) return;

      const svg = svgRef.current;
      const pos = getPos(id);
      if (!pos) return;

      const { x: mx, y: my } = clientToSvg(svg, e.clientX, e.clientY);

      let x = mx + grabDx.current;
      let y = my + grabDy.current;

      // Snap a grilla
      const s = Math.max(1, snap);
      x = Math.round(x / s) * s;
      y = Math.round(y / s) * s;

      // Limitar al viewBox con margen
      const vb = svg.viewBox.baseVal;
      x = Math.max(vb.x + 10, Math.min(vb.x + vb.width - 10, x));
      y = Math.max(vb.y + 10, Math.min(vb.y + vb.height - 10, y));

      // Persistir en estado externo
      setPos(id, x, y);

      if (debug) console.debug("[drag] move", id, "→", x, y);
      if (onChange) tick(() => onChange(x, y));
    },
    [id, snap, getPos, setPos, onChange, debug]
  );

  const handleUp = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      if (debug) console.debug("[drag] up", id);

      window.removeEventListener("pointermove", handleMove as any, {
        // @ts-expect-error passive in remove is fine
        passive: true,
      });
      window.removeEventListener("pointerup", handleUp as any, {
        // @ts-expect-error passive in remove is fine
        passive: true,
      });

      onEnd?.();
    },
    [id, handleMove, onEnd, debug]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGElement>) => {
      if (!enabled) return;

      const svg =
        (e.currentTarget.ownerSVGElement ||
          (e.currentTarget as any)) as SVGSVGElement | null;
      if (!svg) return;
      svgRef.current = svg;

      const current = getPos(id) || { x: 0, y: 0 };
      const { x: sx, y: sy } = clientToSvg(svg, e.clientX, e.clientY);

      grabDx.current = current.x - sx;
      grabDy.current = current.y - sy;

      dragging.current = true;
      if (debug)
        console.debug("[drag] down", id, "client=", e.clientX, e.clientY);

      // Capture + listeners globales
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      window.addEventListener("pointermove", handleMove as any, {
        // @ts-expect-error passive ok
        passive: true,
      });
      window.addEventListener("pointerup", handleUp as any, {
        // @ts-expect-error passive ok
        passive: true,
      });

      e.preventDefault();
    },
    [enabled, id, getPos, handleMove, handleUp, debug]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGElement>) => {
      // Fallback si el browser no emite pointermove global
      if (!dragging.current) return;
      handleMove(e.nativeEvent);
    },
    [handleMove]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGElement>) => {
      handleUp(e.nativeEvent);
    },
    [handleUp]
  );

  return { onPointerDown, onPointerMove, onPointerUp };
}
