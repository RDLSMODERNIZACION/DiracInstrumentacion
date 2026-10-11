import React from "react";
import type { ManifoldNode } from "../../types";
import type useNodeDragCommon from "../../useNodeDragCommon";
import { schematicPort } from "../../schematic";

export default function LagoonNodeView({ n, drag, showTip, hideTip, enabled, onClick }: {
  n: ManifoldNode;
  drag: ReturnType<typeof useNodeDragCommon>;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
  enabled: boolean;
  onClick?: () => void;
}) {
  const inlet = schematicPort(n, "in").x - n.x;
  const outlet = schematicPort(n, "out").x - n.x;
  const outline = "M -160 0 C -163 -45 -111 -79 -45 -72 C 13 -88 72 -80 119 -51 C 153 -37 164 -18 160 0 C 169 43 117 78 55 72 C -6 90 -84 71 -127 46 C -153 35 -163 17 -160 0 Z";
  const lines = ["Laguna", "Entrada y salida de agua"];
  return (
    <g transform={`translate(${n.x}, ${n.y})`}
      onPointerDown={drag.onPointerDown} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) => showTip(e, { title: n.name, lines })}
      onMouseMove={(e) => showTip(e, { title: n.name, lines })}
      onMouseLeave={hideTip} onClick={onClick}
      style={{ cursor: enabled ? "move" : "default" }} data-role="lagoon">
      <title>{n.name}</title>
      <text x={0} y={-108} textAnchor="middle" fill="#0f172a" style={{ fontSize: 16, fontWeight: 800 }}>{n.name}</text>
      <text x={0} y={-91} textAnchor="middle" fill="#0369a1" style={{ fontSize: 10, fontWeight: 800 }}>LAGUNA · AGUA</text>
      <path d={outline} fill="#e7e5d2" stroke="#9a9e81" strokeWidth={3} />
      <path d={outline} transform="scale(0.94, 0.88)" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth={2} />
      <g fill="none" stroke="#7bbbd5" strokeWidth={2} strokeLinecap="round" style={{ pointerEvents: "none" }}>
        <path d="M -87 -27 Q -68 -35 -49 -27 T -11 -27 M 35 -34 Q 53 -42 71 -34 T 107 -34" />
        <path d="M -119 6 Q -100 -2 -81 6 T -43 6 M 14 3 Q 33 -5 52 3 T 90 3" />
        <path d="M -60 39 Q -41 31 -22 39 T 16 39 M 59 33 Q 77 25 95 33" />
      </g>
      {/* Both connections cross the bank and reach the water area. */}
      {[{ a: inlet, b: -137 }, { a: outlet, b: 137 }].map(({ a, b }) => (
        <g key={a} style={{ pointerEvents: "none" }}>
          <path d={`M ${a} 0 L ${b} 0`} stroke="#64748b" strokeWidth={9} strokeLinecap="round" />
          <path d={`M ${a} 0 L ${b} 0`} stroke="#cbd5e1" strokeWidth={6} strokeLinecap="round" />
          <circle cx={b} r={3} fill="#94a3b8" stroke="#475569" />
        </g>
      ))}
    </g>
  );
}
