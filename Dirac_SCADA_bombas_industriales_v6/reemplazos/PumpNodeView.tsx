import React from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import type { PumpNode } from "../../types";

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

  // Dimensión lógica del conjunto (centro del nodo = centro del equipo).
  const W = 74;
  const H = 116;
  const halfW = W / 2;
  const halfH = H / 2;

  const name =
    typeof n.name === "string" && n.name.trim()
      ? n.name.trim()
      : `Bomba ${n.id}`;

  const state = String(n.state || "").toLowerCase();
  const running = ["run", "running", "on", "1", "true"].includes(state);
  const online = n.online === true;
  const maintenance = (n as any).in_maintenance === true;

  const motorFill = !online
    ? "#cbd5e1"
    : maintenance
    ? "#fbbf24"
    : running
    ? "#ef6c35"
    : "#b8c2cc";

  const motorStroke = !online
    ? "#94a3b8"
    : maintenance
    ? "#d97706"
    : running
    ? "#c2410c"
    : "#64748b";

  const metal = online ? "#64748b" : "#94a3b8";
  const statusFill = !online
    ? "#94a3b8"
    : maintenance
    ? "#f59e0b"
    : running
    ? "#16a34a"
    : "#64748b";

  const statusText = !online
    ? "OFFLINE"
    : maintenance
    ? "MANT."
    : running
    ? "ON"
    : "OFF";

  const tipLines = [
    `ID: ${n.id}`,
    `Estado: ${running ? "En marcha" : "Detenida"}`,
    `Comunicación: ${online ? "Online" : "Offline"}`,
    maintenance ? "Mantenimiento: sí" : "Mantenimiento: no",
  ];

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
      {/* Nombre */}
      <text
        x={0}
        y={-halfH - 13}
        textAnchor="middle"
        fill="#334155"
        style={{
          fontSize: 13,
          fontWeight: 800,
          pointerEvents: "none",
        }}
      >
        {name}
      </text>

      {/* Succión / descarga */}
      <line
        x1={-halfW - 16}
        y1={16}
        x2={-halfW + 2}
        y2={16}
        stroke={metal}
        strokeWidth={6}
        strokeLinecap="round"
      />
      <line
        x1={halfW - 2}
        y1={-3}
        x2={halfW + 16}
        y2={-3}
        stroke={metal}
        strokeWidth={6}
        strokeLinecap="round"
      />

      {/* Base */}
      <rect
        x={-27}
        y={35}
        width={54}
        height={12}
        rx={4}
        fill="#e2e8f0"
        stroke="#64748b"
        strokeWidth={1.7}
      />

      {/* Pedestal */}
      <path
        d="M -18 35 L -11 19 L 11 19 L 18 35 Z"
        fill="#f1f5f9"
        stroke="#64748b"
        strokeWidth={1.7}
      />

      {/* Cuerpo hidráulico inferior */}
      <rect
        x={-14}
        y={10}
        width={28}
        height={12}
        rx={5}
        fill="#dbe3ea"
        stroke="#64748b"
        strokeWidth={1.5}
      />

      {/* Motor vertical */}
      <rect
        x={-17}
        y={-34}
        width={34}
        height={46}
        rx={10}
        fill={motorFill}
        stroke={motorStroke}
        strokeWidth={2.2}
      />

      {/* Cabezal superior */}
      <path
        d="M -17 -27 Q 0 -43 17 -27 L 17 -21 L -17 -21 Z"
        fill="#dbe3ea"
        stroke="#64748b"
        strokeWidth={1.7}
      />

      {/* Fajas */}
      <rect x={-17} y={-14} width={34} height={4} fill="#ffffff" opacity={0.45} />
      <rect x={-17} y={-1} width={34} height={4} fill="#ffffff" opacity={0.3} />

      {/* Estado */}
      <rect
        x={-23}
        y={51}
        width={46}
        height={16}
        rx={8}
        fill={statusFill}
        opacity={0.96}
      />
      <text
        x={0}
        y={63}
        textAnchor="middle"
        fill="#ffffff"
        style={{
          fontSize: 10.5,
          fontWeight: 900,
          letterSpacing: 0.5,
          pointerEvents: "none",
        }}
      >
        {statusText}
      </text>

      {/* Luz estado */}
      <circle
        cx={20}
        cy={-29}
        r={4.2}
        fill={
          maintenance
            ? "#f59e0b"
            : !online
            ? "#94a3b8"
            : running
            ? "#22c55e"
            : "#64748b"
        }
      />
    </g>
  );
}
