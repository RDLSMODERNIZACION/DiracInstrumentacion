import React from "react";
import PumpHoverArea from "../PumpHoverArea";
import type { ManifoldNode, PumpNode } from "../../types";
import type useNodeDragCommon from "../../useNodeDragCommon";
import { schematicPort } from "../../schematic";

export default function WaterIntakeNodeView({ n, pumps = [], drag, showTip, hideTip, enabled, onClick }: {
  n: ManifoldNode;
  pumps?: PumpNode[];
  drag: ReturnType<typeof useNodeDragCommon>;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
  enabled: boolean;
  onClick?: () => void;
}) {
  const inlet = schematicPort(n, "in").x - n.x;
  const outlet = schematicPort(n, "out").x - n.x;
  const running = (p?: PumpNode) => p?.online === true && ["run", "running", "on", "1", "true"].includes(String(p.state).toLowerCase());
  const lines = ["Captación con reja y cámara de bombeo", "2 bombas instaladas · 2 espacios de reserva", "Salida común hacia la laguna",
    ...[0, 1].map((i) => `Bomba ${i + 1}: ${pumps[i]?.online !== true ? "Sin comunicación" : running(pumps[i]) ? "En marcha" : "Detenida"}`)];
  return (
    <g transform={`translate(${n.x}, ${n.y})`}
      onPointerDown={drag.onPointerDown} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) => showTip(e, { title: n.name, lines })}
      onMouseMove={(e) => showTip(e, { title: n.name, lines })}
      onMouseLeave={hideTip} onClick={onClick}
      style={{ cursor: enabled ? "move" : "default" }} data-role="water-intake">
      <title>{n.name}</title>
      <rect x={-246} y={-220} width={456} height={338} fill="none" pointerEvents="all" />
      <g style={{ pointerEvents: "none" }}>
        <text x={0} y={-204} textAnchor="middle" fill="#0f172a" style={{ fontSize: 16, fontWeight: 800 }}>{n.name}</text>
        <text x={0} y={-185} textAnchor="middle" fill="#0369a1" style={{ fontSize: 10, fontWeight: 800 }}>CAPTACIÓN · 2 BOMBAS + 2 RESERVAS</text>
        {/* River inlet, screen and concrete wet chamber. */}
        <path d="M -225 -88 Q -207 -45 -225 0 Q -241 45 -225 88 L -130 88 L -130 -88 Z" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth={2} />
        <path d="M -134 -88 L 196 -88 L 196 88 L -134 88" fill="#e2e8f0" stroke="#64748b" strokeWidth={3} />
        <path d="M -134 -74 L 182 -74 L 182 74 L -134 74" fill="#d7effa" stroke="#94a3b8" strokeWidth={1.5} />
        <g fill="none" stroke="#7bbbd5" strokeWidth={2} strokeLinecap="round">
          <path d="M -218 -39 Q -202 -46 -186 -39 T -154 -39 M -221 40 Q -205 33 -189 40 T -157 40" />
          <path d="M -112 58 Q -96 51 -80 58 T -48 58 M 17 58 Q 33 51 49 58 T 81 58 M 102 58 Q 118 51 134 58 T 166 58" />
        </g>
        <rect x={-140} y={-75} width={18} height={150} rx={2} fill="#cbd5e1" stroke="#475569" strokeWidth={2} />
        {[-63,-49,-35,-21,-7,7,21,35,49,63].map((y) => <path key={y} d={`M -140 ${y} L -122 ${y}`} stroke="#64748b" strokeWidth={3} />)}
        <text x={-180} y={106} textAnchor="middle" fill="#0369a1" style={{ fontSize: 10, fontWeight: 700 }}>ENTRADA · REJA</text>
        {/* Only the two installed pumps feed the common discharge header. */}
        <path d="M -65 -94 L -65 30 L 170 30 L 170 0 M 5 -94 L 5 30" fill="none" stroke="#64748b" strokeWidth={7} strokeLinejoin="round" />
        <path d="M -65 -94 L -65 30 L 170 30 L 170 0 M 5 -94 L 5 30" fill="none" stroke="#cbd5e1" strokeWidth={4} strokeLinejoin="round" />
        {[0,1,2,3].map((i) => {
          const x = -65 + i * 70;
          const reserve = i >= 2;
          const p = pumps[i];
          return <g key={i} transform={`translate(${x}, -135)`} data-role={reserve ? "pump-reserve" : "installed-pump"}>
            {reserve ? <>
              <rect x={-22} y={-33} width={44} height={69} rx={7} fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" />
              <path d="M -7 0 L 7 0 M 0 -7 L 0 7" stroke="#94a3b8" strokeWidth={1.5} />
            </> : <>
              <rect x={-14} y={-30} width={28} height={37} rx={7} fill={p?.online !== true ? "#cbd5e1" : running(p) ? "#22c55e" : "#b8c2cc"} stroke="#64748b" strokeWidth={1.8} />
              <path d="M -14 -24 Q 0 -37 14 -24" fill="none" stroke="#64748b" strokeWidth={1.5} />
              <circle cy={20} r={13} fill="#f8fafc" stroke="#64748b" strokeWidth={1.8} />
              <path d="M -7 20 L 7 20 M 0 13 L 0 27" stroke={running(p) ? "#16a34a" : "#94a3b8"} strokeWidth={3} />
              <rect x={-21} y={34} width={42} height={7} rx={2} fill="#e2e8f0" stroke="#64748b" />
            </>}
            <text x={0} y={101} textAnchor="middle" fill={reserve ? "#64748b" : "#334155"} style={{ fontSize: 10, fontWeight: 700 }}>{reserve ? `Reserva ${i + 1}` : `Bomba ${i + 1}`}</text>
          </g>;
        })}
        {[{ a: -246, b: inlet }, { a: 210, b: outlet }].map(({a,b}) => <g key={a}>
          <path d={`M ${a} 0 L ${b} 0`} stroke="#64748b" strokeWidth={9} strokeLinecap="round" />
          <path d={`M ${a} 0 L ${b} 0`} stroke="#cbd5e1" strokeWidth={6} strokeLinecap="round" />
          <circle cx={b} r={3} fill="white" stroke="#475569" />
        </g>)}
        <text x={137} y={106} textAnchor="middle" fill="#0369a1" style={{ fontSize: 10, fontWeight: 700 }}>SALIDA HACIA LAGUNA</text>
      </g>
      {[0, 1].map((i) => <PumpHoverArea key={i} pump={pumps[i]} fallbackName={`Bomba ${i + 1}`}
        x={-87 + i * 70} y={-168} width={44} height={75} showTip={showTip} hideTip={hideTip} />)}
    </g>
  );
}
