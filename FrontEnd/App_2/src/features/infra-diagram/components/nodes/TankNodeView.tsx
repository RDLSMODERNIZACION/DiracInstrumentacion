import React from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import { toNumber } from "../../layout";
import type { TankNode } from "../../types";

export default function TankNodeView({
  n,
  getPos,
  setPos,
  onDragEnd,
  showTip,
  hideTip,
  enabled = true,
  onClick,
}: {
  n: TankNode;
  getPos: any;
  setPos: any;
  onDragEnd: () => void;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
  enabled?: boolean;
  onClick?: () => void;
}) {
  const drag = useNodeDragCommon(n, getPos, setPos, onDragEnd, hideTip, enabled);

  const W = 132;
  const H = 100;
  const P = 12;
  const innerW = W - 2 * P;
  const innerH = H - 2 * P;

  const isOnline = n.online === true;
  const alarmaRaw = (n.alarma || "").toLowerCase();
  const isCritical = ["critico", "crítico", "critical"].includes(alarmaRaw);
  const isWarning  = ["alerta", "warning", "warn"].includes(alarmaRaw);

  // Borde: si NO está online, gris. Solo rojo/amarillo cuando online.
  const stroke = !isOnline
    ? "#94a3b8"
    : isCritical
    ? "#ef4444"
    : isWarning
    ? "#f59e0b"
    : "#3b82f6";

  const levelRaw = typeof n.level_pct === "number" ? n.level_pct : toNumber(n.level_pct);
  const level = Math.max(0, Math.min(100, levelRaw ?? 0));
  const levelY = P + innerH - (level / 100) * innerH;

  // Si está offline, bajamos la opacidad general para “desactivar”
  const groupOpacity = isOnline ? 1 : 0.55;

  const clipId = `clip-${n.id}`;
  const tipLines = [
    `Online: ${isOnline ? "Sí" : "No"}`,
    `Nivel: ${levelRaw != null ? `${level}%` : "—"}`,
    `Alarma: ${n.alarma ?? "—"}`,
  ];

  const Pulse = ({ color }: { color: string }) => (
    <g filter="url(#glow)">
      <rect
        x={-6}
        y={-6}
        width={W + 12}
        height={H + 12}
        rx={22}
        ry={22}
        fill="none"
        stroke={color}
        strokeWidth={3}
        opacity={0.6}
      >
        <animate attributeName="stroke-width" values="2;6;2" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.15;0.75;0.15" dur="1.6s" repeatCount="indefinite" />
      </rect>
    </g>
  );

  return (
    <g
      transform={`translate(${n.x - W / 2}, ${n.y - H / 2})`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) => showTip(e, { title: n.name, lines: tipLines })}
      onMouseMove={(e) => showTip(e, { title: n.name, lines: tipLines })}
      onMouseLeave={hideTip}
      onClick={onClick}
      className="node-shadow"
      style={{ cursor: enabled ? "move" : "default" }}
      opacity={groupOpacity}
    >
      {/* Halo pulsante: solo si está online */}
      {isOnline && isCritical && <Pulse color="#ef4444" />}
      {isOnline && !isCritical && isWarning && <Pulse color="#f59e0b" />}

      <defs>
        <clipPath id={clipId}>
          <rect x={P} y={P} width={innerW} height={innerH} rx={12} ry={12} />
        </clipPath>
      </defs>

      {/* cuerpo del tanque */}
      <rect width={W} height={H} rx={16} ry={16} fill="url(#lgTank)" stroke={stroke} strokeWidth={2.2} />

      {/* marcas laterales */}
      {Array.from({ length: 5 }).map((_, i) => {
        const yy = P + (i * innerH) / 4;
        return <line key={i} x1={W - P + 2} y1={yy} x2={W - P + 8} y2={yy} stroke="#cbd5e1" strokeWidth={1} />;
      })}

      {/* “agua” */}
      <g clipPath={`url(#${clipId})`}>
        <rect x={P} y={levelY} width={innerW} height={P + innerH - levelY} fill="url(#lgWaterDeep)" />
        <line x1={P} y1={levelY} x2={P + innerW} y2={levelY} stroke="#60a5fa" strokeWidth={1.5} />
        <rect x={P} y={P} width={innerW} height={innerH / 2.4} fill="url(#lgGlass)" opacity={0.18} />
      </g>

      {/* etiquetas */}
      <text x={W / 2} y={20} textAnchor="middle" fontSize={13} className="node-label">
        {n.name}
      </text>
      <text x={W / 2} y={H - 14} textAnchor="middle" className="node-subtle">
        {n.alarma ?? "sin alarma"}
      </text>

      {/* badge crítico solo online */}
      {isOnline && isCritical && (
        <g transform={`translate(${W - 18}, ${18})`}>
          <rect x={-14} y={-8} width={28} height={16} rx={8} fill="#fee2e2" stroke="#ef4444" />
          <circle r={3} fill="#ef4444" />
        </g>
      )}
    </g>
  );
}
