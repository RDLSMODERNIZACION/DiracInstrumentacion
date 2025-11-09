import React, { useMemo } from "react";
import Edge from "@/components/diagram/Edge";
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

function pathBetween(A: UINode, B: UINode) {
  const sx = A.x + halfByType(A.type); // salida a la derecha del origen
  const sy = A.y;
  const ex = B.x - halfByType(B.type); // entrada a la izquierda del destino
  const ey = B.y;
  const mx = (sx + ex) / 2;
  return { sx, sy, ex, ey, d: `M ${sx} ${sy} L ${mx} ${sy} L ${mx} ${ey} L ${ex} ${ey}` };
}

export default function EditableEdge({ id, a, b, nodesById, editable, selected, onSelect }: Props) {
  const A = nodesById[a];
  const B = nodesById[b];
  const geom = useMemo(() => (A && B ? pathBetween(A, B) : null), [A, B]);

  if (!A || !B) return null;

  return (
    <g>
      {/* Dibujo base tal cual tu componente Edge (flujo/estética actual) */}
      <Edge a={a} b={b} nodesById={nodesById as any} />

      {/* Capa invisible para hit-test (click selección) */}
      {geom && (
        <path
          d={geom.d}
          stroke="transparent"
          strokeWidth={14}
          fill="none"
          style={{ pointerEvents: "stroke", cursor: editable ? "pointer" : "default" }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.(id);
          }}
        />
      )}

      {/* Resaltado de selección */}
      {selected && geom && (
        <path
          d={geom.d}
          stroke="#0ea5e9"
          strokeWidth={3.5}
          strokeDasharray="6 6"
          fill="none"
          opacity={0.9}
        />
      )}
    </g>
  );
}
