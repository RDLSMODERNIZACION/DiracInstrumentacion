import React from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import type { PumpNode } from "../../types";

export default function PumpNodeView({
  n, getPos, setPos, onDragEnd, showTip, hideTip, enabled = true, onClick,
}: {
  n: PumpNode & { name?: string | null; in_maintenance?: boolean | null };
  getPos: any;
  setPos: any;
  onDragEnd: () => void;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
  enabled?: boolean;
  onClick?: () => void;
}) {
  const drag = useNodeDragCommon(n, getPos, setPos, onDragEnd, hideTip, enabled);

  const R = 34;
  const NOZZLE = 16;

  const name = typeof n.name === "string" && n.name.trim() ? n.name.trim() : `Bomba ${n.id}`;
  const state = String(n.state || "").toLowerCase();
  const running = ["run", "running", "on", "1", "true"].includes(state);
  const online = n.online === true;
  const maintenance = (n as any).in_maintenance === true;

  const stroke = maintenance ? "#f59e0b" : !online ? "#94a3b8" : running ? "#16a34a" : "#64748b";
  const impeller = !online ? "#94a3b8" : running ? "#0ea5e9" : "#64748b";
  const pipe = online ? "#64748b" : "#94a3b8";

  const tipLines = [
    `ID: ${n.id}`,
    `Estado: ${running ? "En marcha" : "Detenida"}`,
    `Comunicación: ${online ? "Online" : "Offline"}`,
    maintenance ? "Mantenimiento: sí" : "Mantenimiento: no",
  ];

  return (
    <g
      transform={`translate(${n.x},${n.y})`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) => showTip(e, { title: name, lines: tipLines })}
      onMouseMove={(e) => showTip(e, { title: name, lines: tipLines })}
      onMouseLeave={hideTip}
      onClick={onClick}
      style={{ cursor: enabled ? "move" : "default" }}
      opacity={online ? 1 : 0.56}
    >
      <text
        y={-R - 18}
        textAnchor="middle"
        fill="#334155"
        style={{ fontSize: 14, fontWeight: 800, pointerEvents: "none" }}
      >
        {name}
      </text>

      <line x1={-R - NOZZLE} y1={0} x2={-R} y2={0} stroke={pipe} strokeWidth={6} strokeLinecap="round" />
      <line x1={R} y1={0} x2={R + NOZZLE} y2={0} stroke={pipe} strokeWidth={6} strokeLinecap="round" />

      <circle r={R} fill="#ffffff" stroke={stroke} strokeWidth={3} />
      <circle r={22} fill="#f8fafc" stroke="#cbd5e1" strokeWidth={1.3} />

      <g>
        {[0, 72, 144, 216, 288].map((deg) => (
          <path
            key={deg}
            d="M 0 -17 C 8 -15 13 -7 7 -2 L 0 0 Z"
            transform={`rotate(${deg})`}
            fill={impeller}
          />
        ))}
        <circle r={3.2} fill={impeller} />
        {running && online && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 0 0"
            to="360 0 0"
            dur="1.3s"
            repeatCount="indefinite"
          />
        )}
      </g>

      <circle
        cx={R - 4}
        cy={-R + 4}
        r={5}
        fill={maintenance ? "#f59e0b" : !online ? "#94a3b8" : running ? "#22c55e" : "#64748b"}
      />
    </g>
  );
}
