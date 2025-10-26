// src/layout/auto.ts

// Nodo mínimo que usamos en UI (sin depender de '@/data/graph')
export type NodeBase = {
  id: string;
  x: number;
  y: number;
  type?: string; // 'pump' | 'tank' | ... (libre)
  name?: string;
};

type NodeInput = Omit<NodeBase, "x" | "y"> & Partial<Pick<NodeBase, "x" | "y">>;

type LayoutOpts = {
  /** ancho/alto del viewBox donde dibujás */
  width?: number;
  height?: number;
  /** separación vertical entre nodos dentro de una misma columna */
  gapY?: number;
  /** columnas X por tipo de nodo (si no se provee, usamos defaults) */
  columns?: Partial<Record<string, number>>;
  /** orden de tipos para repartir columnas; si no se provee, usamos ['pump','manifold','valve','tank','other'] */
  typeOrder?: string[];
};

/**
 * computeAutoLayout:
 * - Respeta x/y si ya vienen en el nodo.
 * - Si faltan, los calcula en columnas X por tipo y Y espaciado.
 * - Sin dependencias a '@/data/graph' ni a listas de IDs fijas.
 */
export function computeAutoLayout(base: NodeInput[], opts: LayoutOpts = {}): NodeBase[] {
  const width = opts.width ?? 1200;
  const height = opts.height ?? 520;
  const gapY = Math.max(24, opts.gapY ?? 60);

  // Orden sugerida de tipos (izq→der)
  const defaultTypeOrder = ["pump", "manifold", "valve", "tank", "other"];
  const typeOrder = opts.typeOrder && opts.typeOrder.length ? opts.typeOrder : defaultTypeOrder;

  // Columnas por tipo (pueden venir del caller)
  const defaultColumns: Record<string, number> = {
    pump: Math.round(width * 0.15),
    manifold: Math.round(width * 0.35),
    valve: Math.round(width * 0.55),
    tank: Math.round(width * 0.80),
    other: Math.round(width * 0.65),
  };
  const columns = { ...defaultColumns, ...(opts.columns ?? {}) };

  // Agrupar por tipo
  const groups = new Map<string, NodeInput[]>();
  for (const n of base) {
    const t = (n.type || "other").toLowerCase();
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t)!.push(n);
  }

  // Asegurar que todos los tipos que aparecieron estén en typeOrder
  for (const t of groups.keys()) {
    if (!typeOrder.includes(t)) typeOrder.push(t);
    if (!(t in columns)) {
      // si el tipo no existe en columns, lo ponemos proporcionalmente a la derecha
      const idx = typeOrder.indexOf(t);
      columns[t] = Math.round(width * (0.2 + 0.12 * idx));
    }
  }

  // Helper: asigna Y con espaciado uniforme en una franja vertical
  const layoutColumnY = (nodes: NodeInput[], top = 80, bottom = height - 80) => {
    // orden estable por id para no “bailar”
    const arr = [...nodes].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const span = Math.max(0, bottom - top);
    const step = Math.max(gapY, Math.floor(span / Math.max(1, arr.length - 1)));
    let y = top;
    for (const n of arr) {
      if (typeof n.y !== "number" || Number.isNaN(n.y)) {
        n.y = y;
        y += step;
      }
    }
  };

  // 1) Asignar X por tipo donde falte, respetando lo que ya vino
  for (const t of typeOrder) {
    const list = groups.get(t);
    if (!list || list.length === 0) continue;
    const xCol = columns[t];

    for (const n of list) {
      if (typeof n.x !== "number" || Number.isNaN(n.x)) n.x = xCol;
    }
  }

  // 2) Asignar Y en cada columna para los que no tenían
  for (const t of typeOrder) {
    const list = groups.get(t);
    if (!list || list.length === 0) continue;
    layoutColumnY(list, 80, height - 80);
  }

  // 3) Ensamblar salida (garantizando x/y)
  return base.map((n) => ({
    id: n.id,
    type: n.type,
    name: n.name,
    x: clamp(n.x ?? columns[(n.type || "other").toLowerCase()] ?? Math.round(width * 0.5), 10, width - 10),
    y: clamp(n.y ?? Math.round(height / 2), 10, height - 10),
  }));
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

/* ============================================================
 * Helpers de encuadre / zoom (para front)
 * - Calculan bbox total de nodos
 * - Dan la transform "fit-to-screen": scale + translate
 * - Utilidades para generar el string matrix() para SVG/HTML
 * ============================================================
 */

export type BBox = { minx: number; miny: number; maxx: number; maxy: number; w: number; h: number };

export function computeBBox(nodes: Pick<NodeBase, "x" | "y">[], pad = 0): BBox {
  if (nodes.length === 0) return { minx: 0, miny: 0, maxx: 0, maxy: 0, w: 0, h: 0 };
  const xs = nodes.map(n => n.x);
  const ys = nodes.map(n => n.y);
  const minx = Math.min(...xs) - pad;
  const miny = Math.min(...ys) - pad;
  const maxx = Math.max(...xs) + pad;
  const maxy = Math.max(...ys) + pad;
  return { minx, miny, maxx, maxy, w: maxx - minx, h: maxy - miny };
}

export type FitTransform = { scale: number; tx: number; ty: number };

/**
 * Calcula la transformación para que todos los nodos entren en (W×H)
 * con margen `padding`, acotando el zoom entre [minScale,maxScale].
 * Devuelve: { scale, tx, ty } para usar como matrix(scale,0,0,scale,tx,ty).
 */
export function fitTransform(
  nodes: Pick<NodeBase, "x" | "y">[],
  W: number,
  H: number,
  padding = 40,
  minScale = 0.2,
  maxScale = 3
): FitTransform {
  const bb = computeBBox(nodes);
  const safeW = Math.max(bb.w, 1);
  const safeH = Math.max(bb.h, 1);

  const sW = (W - 2 * padding) / safeW;
  const sH = (H - 2 * padding) / safeH;
  const s = Math.min(sW, sH);
  const scale = clamp(s, minScale, maxScale);

  // centrar contenido ya escalado
  const tx = (W - scale * safeW) / 2 - scale * bb.minx;
  const ty = (H - scale * safeH) / 2 - scale * bb.miny;

  return { scale, tx, ty };
}

/** Genera el string 'matrix(a,b,c,d,e,f)' para SVG/HTML (sin sesgo, solo escala uniforme y translate). */
export function toMatrix({ scale, tx, ty }: FitTransform): string {
  // a=scale, d=scale, e=tx, f=ty
  return `matrix(${scale},0,0,${scale},${tx},${ty})`;
}

/** Aplica un delta de zoom (wheel/pinch) alrededor de un punto de la pantalla (px) */
export function zoomAroundPoint(
  current: FitTransform,
  deltaScale: number,
  originClient: { x: number; y: number },
  clampRange: { min: number; max: number }
): FitTransform {
  const nextScale = clamp(current.scale * deltaScale, clampRange.min, clampRange.max);
  // mantener el punto de origen fijo: ajustar tx/ty en función del cambio de escala
  const k = nextScale / current.scale;
  const tx = originClient.x - k * (originClient.x - current.tx);
  const ty = originClient.y - k * (originClient.y - current.ty);
  return { scale: nextScale, tx, ty };
}

/** Desplaza (pan) la vista actual */
export function pan(current: FitTransform, dx: number, dy: number): FitTransform {
  return { ...current, tx: current.tx + dx, ty: current.ty + dy };
}

/*
 * ==== Ejemplo de uso (React + SVG) ====
 *
 * import { fitTransform, toMatrix } from '@/layout/auto';
 *
 * const svgRef = useRef<SVGSVGElement>(null);
 * const nodes = useMemo(() => computeAutoLayout(rawNodes), [rawNodes]);
 *
 * useEffect(() => {
 *   const svg = svgRef.current!;
 *   const { width, height } = svg.getBoundingClientRect();
 *   const t = fitTransform(nodes, width, height, 40, 0.2, 3);
 *   const g = svg.querySelector('#viewport') as SVGGElement;
 *   g.setAttribute('transform', toMatrix(t));
 * }, [nodes]);
 *
 * return (
 *   <svg ref={svgRef} width="100%" height="100%">
 *     <g id="viewport">
 *       {nodes.map(n => <circle key={n.id} cx={n.x} cy={n.y} r={6} />)}
 *     </g>
 *   </svg>
 * );
 */
