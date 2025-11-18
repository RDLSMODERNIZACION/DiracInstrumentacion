import React from "react";

type NodeBase = {
  id: string;
  x: number;
  y: number;
  type?: string;          // "pump" | "tank" | "manifold" | "valve"
  state?: string | null;  // para bombas
  online?: boolean | null;
};

type NodesById = Record<string, NodeBase>;

/** Tamaños aproximados (half-size) por tipo para conectar en los bordes, no al centro */
function halfSize(type?: string) {
  const t = (type || "").toLowerCase();
  switch (t) {
    case "tank":     return { hw: 66, hh: 50 };  // ~132x100
    case "pump":     return { hw: 26, hh: 26 };  // círculo ~52
    case "manifold": return { hw: 55, hh: 8 };   // ~110x16
    case "valve":    return { hw: 10, hh: 10 };  // ~20
    default:         return { hw: 24, hh: 24 };
  }
}

/** Path ortogonal con insets y longitud Manhattan del tramo (para lógicas del dash) */
function orthogonalInsetWithLen(A: NodeBase, B: NodeBase) {
  const { hw: ahw } = halfSize(A.type);
  const { hw: bhw } = halfSize(B.type);

  const dir = Math.sign(B.x - A.x) || 1; // izq→der o der→izq

  // conectamos por los lados (no centro)
  const sx = A.x + dir * ahw;
  const sy = A.y;
  const ex = B.x - dir * bhw;
  const ey = B.y;

  // codo mínimo para no colapsar
  const MIN_KNEE = 12;
  let midX = (sx + ex) / 2;
  if (Math.abs(midX - sx) < MIN_KNEE) midX = sx + dir * MIN_KNEE;
  if (Math.abs(ex - midX) < MIN_KNEE) midX = ex - dir * MIN_KNEE;
  if (Math.abs(ex - sx) < 1) midX = sx + dir * MIN_KNEE; // casi vertical

  const d = `M ${sx},${sy} L ${midX},${sy} L ${midX},${ey} L ${ex},${ey}`;

  // longitud manhattan de ese polilínea (aprox para lógica del dash)
  const len = Math.abs(midX - sx) + Math.abs(ey - sy) + Math.abs(ex - midX);

  return { d, len };
}

/** Evitar spam en consola: solo warn una vez por sesión */
let warnedOnce = false;

export default function Edge({
  a,
  b,
  nodesById,
  pipe,
}: {
  a: string;
  b: string;
  nodesById: NodesById;
  pipe?: "8" | "10" | "G";
}) {
  const A = nodesById[a];
  const B = nodesById[b];

  // ---- LOG de diagnóstico cuando falta un extremo ----
  if (!A || !B) {
    if (!warnedOnce) {
      try {
        const keysSample = Object.keys(nodesById).slice(0, 10);
        console.warn("[Edge] sin match (solo 1 vez):", {
          a, b, hasA: !!A, hasB: !!B, keysSample,
        });
      } catch {
        // no-op
      }
      warnedOnce = true;
    }
    return null;
  }

  const { d, len } = orthogonalInsetWithLen(A, B);

  const strokeWidth =
    pipe === "10" ? 4 : pipe === "8" ? 3.5 : pipe === "G" ? 3 : 3;

  // “flujo” solo si la BOMBA origen está corriendo y online
  const isPumpSrc = (A.type || "").toLowerCase() === "pump";
  const pumpRunning = (A.state || "").toLowerCase() === "run";
  const pumpOnline = A.online === true;
  const isFlowing = isPumpSrc && pumpRunning && pumpOnline;

  // base siempre visible + dash animado opcional
  const baseColor = isFlowing ? "#93c5fd" : "#94a3b8"; // azul claro si hay flujo, gris si no
  const flowColor = "#0ea5e9";
  const opacity = isPumpSrc && A.online === false ? 0.55 : 1;

  // si el tramo es muy corto, evitamos dash para que no “desaparezca”
  const DASH_MIN_LEN = 36;
  const showDash = isFlowing && len >= DASH_MIN_LEN;

  return (
    <g className="edge-glow" opacity={opacity}>
      {/* Base sólida siempre visible */}
      <path
        d={d}
        stroke={baseColor}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ pointerEvents: "none" }}
      />
      {/* Capa de flujo (animada) solo si aplica */}
      {showDash && (
        <path
          d={d}
          stroke={flowColor}
          strokeWidth={strokeWidth}
          fill="none"
          className="flowing"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
      )}
    </g>
  );
}
