import React, { useMemo } from "react";
import type { UINode } from "../../types";

type Props = {
  id: number;
  a: string;
  b: string;
  nodesById: Record<string, UINode>;
  editable: boolean;
  selected?: boolean;
  onSelect?: (edgeId: number) => void;
};

function halfByType(t?: string) {
  const tt = (t || "").toLowerCase();
  if (tt === "tank") return 66;      // W/2 de TankNode
  if (tt === "pump") return 26;      // rOuter de PumpNode
  if (tt === "manifold") return 55;  // W/2 de ManifoldNode
  if (tt === "valve") return 14;     // semi-longitud de la línea
  return 20;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Path ortogonal con codos redondeados:
 *  A ----> (mx, sy)  |
 *                   v
 *                 (mx, ey) ----> B
 */
function pipePath(A: UINode, B: UINode) {
  const sx = A.x + halfByType(A.type);
  const sy = A.y;

  const ex = B.x - halfByType(B.type);
  const ey = B.y;

  const mx = (sx + ex) / 2;

  // Corner radius dinámico según distancia
  const dx = Math.abs(ex - sx);
  const dy = Math.abs(ey - sy);
  const r = clamp(Math.min(dx, dy) / 4, 6, 14);

  // Si están casi alineados horizontalmente, hacemos línea recta
  if (dy < 2) {
    return { sx, sy, ex, ey, d: `M ${sx} ${sy} L ${ex} ${ey}` };
  }

  // Si están casi alineados verticalmente, hacemos camino con un solo quiebre
  // (igual usamos mx, pero quedará bien)
  const x1 = mx;

  // Construimos con codos redondeados usando Q (quadratic)
  // Segmentos:
  // 1) sx,sy -> (x1 - r, sy)
  // 2) codo  -> (x1, sy + signY*r)
  // 3) vertical -> (x1, ey - signY*r)
  // 4) codo -> (x1 + signX*r, ey)
  // 5) horizontal -> ex,ey
  const signY = ey > sy ? 1 : -1;
  const signX = ex > x1 ? 1 : -1;

  const d = [
    `M ${sx} ${sy}`,
    `L ${x1 - r} ${sy}`,
    `Q ${x1} ${sy} ${x1} ${sy + signY * r}`,
    `L ${x1} ${ey - signY * r}`,
    `Q ${x1} ${ey} ${x1 + signX * r} ${ey}`,
    `L ${ex} ${ey}`,
  ].join(" ");

  return { sx, sy, ex, ey, d };
}

export default function EditableEdge({
  id,
  a,
  b,
  nodesById,
  editable,
  selected,
  onSelect,
}: Props) {
  const A = nodesById[a];
  const B = nodesById[b];

  const geom = useMemo(() => (A && B ? pipePath(A, B) : null), [A, B]);
  if (!A || !B || !geom) return null;

  // Estética “tubería”
  const STROKE_OUTER = 10; // sombra/borde
  const STROKE_BODY = 7;   // cuerpo
  const STROKE_HL = 2.2;   // brillo
  const HIT_STROKE = 18;   // área clic

  return (
    <g>
      {/* ===== TUBERÍA (3 capas) ===== */}

      {/* sombra exterior */}
      <path
        d={geom.d}
        fill="none"
        stroke="#0f172a"
        strokeWidth={STROKE_OUTER}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.55}
      />

      {/* cuerpo */}
      <path
        d={geom.d}
        fill="none"
        stroke="#cbd5e1"
        strokeWidth={STROKE_BODY}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.95}
      />

      {/* brillo */}
      <path
        d={geom.d}
        fill="none"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth={STROKE_HL}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.9}
      />

      {/* ===== HIT TEST (invisible, para click) ===== */}
      <path
        d={geom.d}
        stroke="transparent"
        strokeWidth={HIT_STROKE}
        fill="none"
        style={{ pointerEvents: "stroke", cursor: editable ? "pointer" : "default" }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(id);
        }}
      />

      {/* ===== SELECCIÓN (más pro que el dash) ===== */}
      {selected && (
        <>
          {/* halo suave */}
          <path
            d={geom.d}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={STROKE_OUTER + 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.25}
          />
          {/* línea de selección */}
          <path
            d={geom.d}
            fill="none"
            stroke="#0ea5e9"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.95}
          />
        </>
      )}
    </g>
  );
}
