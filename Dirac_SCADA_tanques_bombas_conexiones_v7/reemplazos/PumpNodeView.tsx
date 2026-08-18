import React from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import type { PumpNode } from "../../types";

type PumpOrientation = "vertical" | "horizontal";

export default function PumpNodeView({
  n,
  getPos,
  setPos,
  onDragEnd,
  showTip,
  hideTip,
  enabled = true,
  onClick,
}: {
  n: PumpNode & { name?: string | null; in_maintenance?: boolean | null; meta?: any; orientation?: PumpOrientation };
  getPos: any;
  setPos: any;
  onDragEnd: () => void;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
  enabled?: boolean;
  onClick?: () => void;
}) {
  const drag = useNodeDragCommon(n, getPos, setPos, onDragEnd, hideTip, enabled);

  const orientation: PumpOrientation =
    ((n as any).meta?.orientation as PumpOrientation) ||
    ((n as any).orientation as PumpOrientation) ||
    "vertical";

  const name = typeof n.name === "string" && n.name.trim() ? n.name.trim() : `Bomba ${n.id}`;
  const state = String(n.state || "").toLowerCase();
  const running = ["run", "running", "on", "1", "true"].includes(state);
  const online = n.online === true;
  const maintenance = (n as any).in_maintenance === true;

  const motorFill = !online ? "#cbd5e1" : maintenance ? "#fbbf24" : running ? "#ef6c35" : "#b8c2cc";
  const motorStroke = !online ? "#94a3b8" : maintenance ? "#d97706" : running ? "#c2410c" : "#64748b";
  const metal = online ? "#64748b" : "#94a3b8";
  const statusFill = !online ? "#94a3b8" : maintenance ? "#f59e0b" : running ? "#16a34a" : "#64748b";
  const statusText = !online ? "OFFLINE" : maintenance ? "MANT." : running ? "ON" : "OFF";

  const tipLines = [
    `ID: ${n.id}`,
    `Estado: ${running ? "En marcha" : "Detenida"}`,
    `Comunicación: ${online ? "Online" : "Offline"}`,
    `Montaje: ${orientation === "horizontal" ? "Horizontal" : "Vertical"}`,
    maintenance ? "Mantenimiento: sí" : "Mantenimiento: no",
  ];

  if (orientation === "horizontal") {
    const W = 132;
    const H = 76;
    const halfW = W / 2;
    const halfH = H / 2;
    return (
      <g
        transform={`translate(${n.x}, ${n.y})`}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onMouseEnter={(e) => showTip(e, { title: name, lines: tipLines })}
        onMouseMove={(e) => showTip(e, { title: name, lines: tipLines })}
        onMouseLeave={hideTip}
        onClick={onClick}
        style={{ cursor: enabled ? "move" : "default" }}
        opacity={online ? 1 : 0.58}
      >
        <text x={0} y={-halfH - 14} textAnchor="middle" fill="#334155" style={{ fontSize: 13, fontWeight: 800, pointerEvents: "none" }}>
          {name}
        </text>

        <line x1={-halfW - 18} y1={0} x2={-halfW + 2} y2={0} stroke={metal} strokeWidth={6} strokeLinecap="round" />
        <line x1={halfW - 2} y1={0} x2={halfW + 18} y2={0} stroke={metal} strokeWidth={6} strokeLinecap="round" />

        <rect x={-46} y={-14} width={64} height={28} rx={11} fill={motorFill} stroke={motorStroke} strokeWidth={2.2} />
        <rect x={18} y={-11} width={20} height={22} rx={8} fill="#e5e7eb" stroke="#64748b" strokeWidth={1.8} />
        <circle cx={42} cy={0} r={13} fill="#f8fafc" stroke="#64748b" strokeWidth={2} />
        <circle cx={42} cy={0} r={5} fill="#94a3b8" />
        <rect x={-10} y={18} width={64} height={8} rx={3} fill="#e2e8f0" stroke="#64748b" strokeWidth={1.5} />

        <rect x={-30} y={28} width={60} height={16} rx={8} fill={statusFill} opacity={0.96} />
        <text x={0} y={40} textAnchor="middle" fill="#ffffff" style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 0.4, pointerEvents: "none" }}>
          {statusText}
        </text>
        <circle cx={52} cy={-19} r={4.3} fill={maintenance ? "#f59e0b" : !online ? "#94a3b8" : running ? "#22c55e" : "#64748b"} />
      </g>
    );
  }

  const W = 84;
  const H = 124;
  const halfW = W / 2;
  const halfH = H / 2;

  return (
    <g
      transform={`translate(${n.x}, ${n.y})`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) => showTip(e, { title: name, lines: tipLines })}
      onMouseMove={(e) => showTip(e, { title: name, lines: tipLines })}
      onMouseLeave={hideTip}
      onClick={onClick}
      style={{ cursor: enabled ? "move" : "default" }}
      opacity={online ? 1 : 0.58}
    >
      <text x={0} y={-halfH - 13} textAnchor="middle" fill="#334155" style={{ fontSize: 13, fontWeight: 800, pointerEvents: "none" }}>
        {name}
      </text>

      <line x1={-halfW - 16} y1={16} x2={-halfW + 2} y2={16} stroke={metal} strokeWidth={6} strokeLinecap="round" />
      <line x1={halfW - 2} y1={-3} x2={halfW + 16} y2={-3} stroke={metal} strokeWidth={6} strokeLinecap="round" />

      <rect x={-29} y={38} width={58} height={12} rx={4} fill="#e2e8f0" stroke="#64748b" strokeWidth={1.7} />
      <path d="M -19 38 L -12 20 L 12 20 L 19 38 Z" fill="#f1f5f9" stroke="#64748b" strokeWidth={1.7} />
      <rect x={-15} y={10} width={30} height={12} rx={5} fill="#dbe3ea" stroke="#64748b" strokeWidth={1.5} />
      <rect x={-18} y={-36} width={36} height={48} rx={10} fill={motorFill} stroke={motorStroke} strokeWidth={2.2} />
      <path d="M -18 -28 Q 0 -45 18 -28 L 18 -21 L -18 -21 Z" fill="#dbe3ea" stroke="#64748b" strokeWidth={1.7} />
      <rect x={-18} y={-14} width={36} height={4} fill="#ffffff" opacity={0.45} />
      <rect x={-18} y={0} width={36} height={4} fill="#ffffff" opacity={0.3} />

      <rect x={-24} y={54} width={48} height={16} rx={8} fill={statusFill} opacity={0.96} />
      <text x={0} y={66} textAnchor="middle" fill="#ffffff" style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 0.5, pointerEvents: "none" }}>
        {statusText}
      </text>
      <circle cx={22} cy={-31} r={4.2} fill={maintenance ? "#f59e0b" : !online ? "#94a3b8" : running ? "#22c55e" : "#64748b"} />
    </g>
  );
}
