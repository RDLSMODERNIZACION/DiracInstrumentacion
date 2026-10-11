import React from "react";
import type { ManifoldNode } from "../../types";
import type useNodeDragCommon from "../../useNodeDragCommon";
import { schematicPort } from "../../schematic";

export default function WaterIntakeNodeView({ n, drag, showTip, hideTip, enabled, onClick }: {
  n: ManifoldNode;
  drag: ReturnType<typeof useNodeDragCommon>;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
  enabled: boolean;
  onClick?: () => void;
}) {
  const inlet = schematicPort(n, "in").x - n.x;
  const outlet = schematicPort(n, "out").x - n.x;
  const lines = ["Captación de agua con reja de entrada", "Salida hacia la laguna"];
  return (
    <g transform={`translate(${n.x}, ${n.y})`}
      onPointerDown={drag.onPointerDown} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) => showTip(e, { title: n.name, lines })}
      onMouseMove={(e) => showTip(e, { title: n.name, lines })}
      onMouseLeave={hideTip} onClick={onClick}
      style={{ cursor: enabled ? "move" : "default" }} data-role="water-intake">
      <title>{n.name}</title>
      <text x={0} y={-105} textAnchor="middle" fill="#0f172a" style={{ fontSize: 16, fontWeight: 800 }}>{n.name}</text>
      <text x={0} y={-88} textAnchor="middle" fill="#0369a1" style={{ fontSize: 10, fontWeight: 800 }}>CAPTACIÓN · AGUA</text>
      <path d="M -150 -64 Q -130 -35 -150 0 Q -170 35 -150 64 L -72 64 L -72 -64 Z" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth={2} />
      <path d="M -74 -62 L 126 -62 L 126 62 L -74 62" fill="#e2e8f0" stroke="#64748b" strokeWidth={3} />
      <path d="M -74 -48 L 111 -48 L 111 48 L -74 48" fill="#d7effa" stroke="#94a3b8" strokeWidth={2} />
      <g fill="none" stroke="#7bbbd5" strokeWidth={2} strokeLinecap="round" style={{ pointerEvents: "none" }}>
        <path d="M -139 -26 Q -125 -33 -111 -26 T -83 -26 M -141 26 Q -127 19 -113 26 T -85 26" />
        <path d="M -37 -20 Q -20 -27 -3 -20 T 31 -20 M -20 23 Q -3 16 14 23 T 48 23" />
      </g>
      <rect x={-78} y={-49} width={18} height={98} rx={2} fill="#cbd5e1" stroke="#475569" strokeWidth={2} />
      {[-39,-26,-13,0,13,26,39].map((y) => <path key={y} d={`M -78 ${y} L -60 ${y}`} stroke="#64748b" strokeWidth={3} />)}
      {[{ a: inlet, b: -103 }, { a: outlet, b: 86 }].map(({ a, b }) => (
        <g key={a} style={{ pointerEvents: "none" }}>
          <path d={`M ${a} 0 L ${b} 0`} stroke="#64748b" strokeWidth={9} strokeLinecap="round" />
          <path d={`M ${a} 0 L ${b} 0`} stroke="#cbd5e1" strokeWidth={6} strokeLinecap="round" />
          <circle cx={b} r={3} fill="#94a3b8" stroke="#475569" />
        </g>
      ))}
    </g>
  );
}
