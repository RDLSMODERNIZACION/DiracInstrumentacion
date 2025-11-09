import React, { useMemo } from "react";
import Edge from "@/components/diagram/Edge";
import type { UINode } from "../../types";

type Props = {
  id: number;
  a: string;
  b: string;
  nodesById: Record<string, UINode>;
  editable: boolean;
  onDelete?: (edgeId: number) => void;
  selected?: boolean;
};

/** calcula punto de "handle" cerca del centro de la arista manhattan */
function computeHandle(A: UINode, B: UINode) {
  const dir = A.x <= B.x ? 1 : -1;
  const half = (t?: string) => {
    const tt = (t || "").toLowerCase();
    if (tt === "tank") return 66;
    if (tt === "pump") return 26;
    if (tt === "manifold") return 55;
    if (tt === "valve") return 10;
    return 20;
  };
  const sx = A.x + dir * half(A.type);
  const sy = A.y;
  const ex = B.x - dir * half(B.type);
  const ey = B.y;
  const midX = (sx + ex) / 2;
  const midY = (sy + ey) / 2;
  return { x: midX, y: midY };
}

export default function EditableEdge({ id, a, b, nodesById, editable, onDelete, selected }: Props) {
  const A = nodesById[a];
  const B = nodesById[b];
  const handle = useMemo(() => (A && B ? computeHandle(A, B) : null), [A, B]);

  if (!A || !B) return null;

  return (
    <g>
      <Edge a={a} b={b} nodesById={nodesById as any} />
      {editable && handle && onDelete && (
        <g transform={`translate(${handle.x}, ${handle.y})`} style={{ cursor: "pointer" }} onClick={() => onDelete(id)}>
          <circle r={9} fill="#fff" stroke={selected ? "#ef4444" : "#64748b"} strokeWidth={selected ? 2.2 : 1.4} />
          <line x1={-4} y1={-4} x2={4} y2={4} stroke="#ef4444" strokeWidth={1.8} />
          <line x1={4} y1={-4} x2={-4} y2={4} stroke="#ef4444" strokeWidth={1.8} />
        </g>
      )}
    </g>
  );
}
