import React from "react";
import type { ManifoldNode } from "../../types";
import type useNodeDragCommon from "../../useNodeDragCommon";
import { schematicPort } from "../../schematic";

export default function DosingNodeView({ n, drag, showTip, hideTip, enabled, onClick }: {
  n: ManifoldNode;
  drag: ReturnType<typeof useNodeDragCommon>;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
  enabled: boolean;
  onClick?: () => void;
}) {
  const tank = n.meta?.symbol === "dosing_tank";
  const inlet = schematicPort(n, "in").x - n.x;
  const outlet = schematicPort(n, "out").x - n.x;
  const lines = tank ? ["Tanque de dosificación", "Entrada y salida"] : ["Bomba dosificadora", "Succión y descarga"];
  return (
    <g transform={`translate(${n.x}, ${n.y})`}
      onPointerDown={drag.onPointerDown} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) => showTip(e, { title: n.name, lines })}
      onMouseMove={(e) => showTip(e, { title: n.name, lines })}
      onMouseLeave={hideTip} onClick={onClick}
      style={{ cursor: enabled ? "move" : "default" }} data-role={tank ? "dosing-tank" : "dosing-pump"}>
      <title>{n.name}</title>
      <text x={0} y={tank ? -100 : -70} textAnchor="middle" fill="#0f172a" style={{ fontSize: 15, fontWeight: 800 }}>{n.name}</text>
      <text x={0} y={tank ? -84 : -54} textAnchor="middle" fill="#7c3aed" style={{ fontSize: 10, fontWeight: 800 }}>DOSIFICACIÓN · AGUA</text>
      <path d={`M ${inlet} 0 L ${outlet} 0`} stroke="#64748b" strokeWidth={8} strokeLinecap="round" />
      <path d={`M ${inlet} 0 L ${outlet} 0`} stroke="#cbd5e1" strokeWidth={5} strokeLinecap="round" />
      {tank ? (
        <>
          <path d="M -55 -60 L -55 51 A 55 15 0 0 0 55 51 L 55 -60 Z" fill="#f5f3ff" stroke="#64748b" strokeWidth={3} />
          <ellipse cy={-60} rx={55} ry={15} fill="#e2e8f0" stroke="#64748b" strokeWidth={3} />
          <rect x={-13} y={-81} width={26} height={10} rx={3} fill="#94a3b8" stroke="#64748b" />
          <path d="M -44 -43 L -44 38" stroke="#fff" strokeWidth={5} strokeLinecap="round" />
          <path d="M 0 -25 C -7 -13 -15 -5 -15 3 A 15 15 0 0 0 15 3 C 15 -5 7 -13 0 -25 Z" fill="#ddd6fe" stroke="#a78bfa" strokeWidth={2} />
          <path d="M -44 68 L -44 75 M 44 68 L 44 75" stroke="#64748b" strokeWidth={4} />
        </>
      ) : (
        <>
          <rect x={-36} y={-28} width={43} height={54} rx={7} fill="#e2e8f0" stroke="#64748b" strokeWidth={2} />
          <path d="M -26 -19 L -26 17 M -16 -19 L -16 17 M -6 -19 L -6 17" stroke="#94a3b8" strokeWidth={2} />
          <circle cx={20} r={25} fill="#f5f3ff" stroke="#7c3aed" strokeWidth={2.5} />
          <circle cx={20} r={14} fill="#ede9fe" stroke="#a78bfa" strokeWidth={2} />
          <path d="M 11 0 L 28 0 M 22 -6 L 28 0 L 22 6" stroke="#7c3aed" strokeWidth={2.5} fill="none" strokeLinecap="round" />
          <rect x={-42} y={31} width={89} height={6} rx={2} fill="#cbd5e1" stroke="#64748b" />
          <circle cx={-14} cy={-36} r={5} fill="#f8fafc" stroke="#64748b" strokeWidth={1.5} />
        </>
      )}
      <path d={`M ${inlet + 8} -6 L ${inlet + 8} 6 M ${outlet - 8} -6 L ${outlet - 8} 6`} stroke="#475569" strokeWidth={2.5} />
    </g>
  );
}
