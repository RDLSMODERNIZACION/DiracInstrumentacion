import React from "react";
import type { ManifoldNode } from "../../types";
import type useNodeDragCommon from "../../useNodeDragCommon";
import { schematicPort } from "../../schematic";

export default function ProcessNodeView({ n, drag, showTip, hideTip, enabled, onClick }: {
  n: ManifoldNode;
  drag: ReturnType<typeof useNodeDragCommon>;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
  enabled: boolean;
  onClick?: () => void;
}) {
  const mixer = n.meta?.symbol === "mixer";
  const inlet = schematicPort(n, "in").x - n.x;
  const outlet = schematicPort(n, "out").x - n.x;
  const lines = mixer ? ["Mezclador con bomba superior", "Entrada y salida de agua"] : ["Sedimentador", "Entrada y salida de agua"];
  return (
    <g transform={`translate(${n.x}, ${n.y})`}
      onPointerDown={drag.onPointerDown} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) => showTip(e, { title: n.name, lines })}
      onMouseMove={(e) => showTip(e, { title: n.name, lines })}
      onMouseLeave={hideTip} onClick={onClick}
      style={{ cursor: enabled ? "move" : "default" }} data-role={mixer ? "water-mixer" : "water-sedimenter"}>
      <title>{n.name}</title>
      <text x={0} y={mixer ? -142 : -87} textAnchor="middle" fill="#0f172a" style={{ fontSize: 16, fontWeight: 800 }}>{n.name}</text>
      <text x={0} y={mixer ? -126 : -71} textAnchor="middle" fill="#0369a1" style={{ fontSize: 10, fontWeight: 800 }}>{mixer ? "MEZCLADO · AGUA" : "SEDIMENTACIÓN · AGUA"}</text>
      <path d={`M ${inlet} 0 L ${outlet} 0`} stroke="#64748b" strokeWidth={10} strokeLinecap="round" />
      <path d={`M ${inlet} 0 L ${outlet} 0`} stroke="#cbd5e1" strokeWidth={6} strokeLinecap="round" />
      {mixer ? (
        <>
          <path d="M -70 -42 L -70 49 A 70 16 0 0 0 70 49 L 70 -42 Z" fill="#eff6ff" stroke="#64748b" strokeWidth={3} />
          <ellipse cy={-42} rx={70} ry={16} fill="#e2e8f0" stroke="#64748b" strokeWidth={3} />
          <path d="M -60 15 Q 0 25 60 15 L 60 47 Q 0 68 -60 47 Z" fill="#dbeafe" />
          {/* Bomba superior estática: símbolo sin telemetría. */}
          <rect x={-25} y={-108} width={50} height={29} rx={6} fill="#cbd5e1" stroke="#64748b" strokeWidth={2} />
          <path d="M -15 -102 L -15 -85 M -5 -102 L -5 -85 M 5 -102 L 5 -85 M 15 -102 L 15 -85" stroke="#94a3b8" strokeWidth={2} />
          <circle cy={-72} r={10} fill="#f8fafc" stroke="#64748b" strokeWidth={2} />
          <path d="M -5 -72 L 5 -72 M 0 -77 L 0 -67 M 0 -61 L 0 38" stroke="#64748b" strokeWidth={3} />
          <path d="M -31 35 L 31 35 M -31 35 L -20 27 M 31 35 L 20 43" stroke="#0284c7" strokeWidth={4} strokeLinecap="round" />
          <path d="M -64 66 L -64 75 M 64 66 L 64 75" stroke="#64748b" strokeWidth={4} />
        </>
      ) : (
        <>
          <path d="M -140 -53 L 140 -53 L 140 31 L 108 57 L -108 57 L -140 31 Z" fill="#e2e8f0" stroke="#64748b" strokeWidth={3} />
          <rect x={-131} y={-44} width={262} height={71} fill="#eff6ff" stroke="#94a3b8" />
          <path d="M -127 32 L 127 32 L 104 49 L -104 49 Z" fill="#d6c7a6" />
          {[0,1,2,3,4,5,6].map((i) => <line key={i} x1={-104 + i * 34} y1={-34} x2={-122 + i * 34} y2={17} stroke="#7ca5bb" strokeWidth={3} />)}
          <path d="M -115 59 L -115 69 M 115 59 L 115 69" stroke="#64748b" strokeWidth={4} />
        </>
      )}
      <path d={`M ${inlet + 10} -7 L ${inlet + 10} 7 M ${outlet - 10} -7 L ${outlet - 10} 7`} stroke="#475569" strokeWidth={3} />
    </g>
  );
}
