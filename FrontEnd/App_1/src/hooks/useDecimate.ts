import { useEffect, useMemo, useRef, useState } from "react";

// carga del worker (Vite): URL relativa al archivo
const createWorker = () => new Worker(new URL("../workers/decimate.worker.ts", import.meta.url), { type: "module" });

export function useDecimate(
  x: number[]|undefined,
  y: (number|null)[]|undefined,
  targetPts: number,         // ≈ ancho en px
  enabled = true
){
  const [out, setOut] = useState<{x:number[]; y:(number|null)[]}>({x:[], y:[]});
  const wRef = useRef<Worker|null>(null);

  useEffect(() => {
    if (!enabled || !x || !y || !x.length || !y.length) {
      setOut({x: x ?? [], y: y ?? []});
      return;
    }
    if (!wRef.current) wRef.current = createWorker();
    const w = wRef.current;
    let alive = true;
    w.onmessage = (ev: MessageEvent<{x:number[]; y:(number|null)[]}>) => {
      if (!alive) return;
      setOut(ev.data);
    };
    w.postMessage({ x, y, maxPts: Math.max(8, targetPts|0), keepEnds: true });
    return () => { alive = false; };
  }, [enabled, targetPts, x, y]);

  return out;
}

/** mide ancho del contenedor para decidir targetPts */
export function useContainerWidth(ref: React.RefObject<HTMLElement>) {
  const [w, setW] = useState(800);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) { if (e.contentRect.width) setW(Math.round(e.contentRect.width)); }
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}
