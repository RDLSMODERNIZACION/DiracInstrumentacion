import React from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import { toNumber } from "../../layout";
import type { TankNode, PortId } from "../../types";
import { getNodePorts } from "../../types";

function hasAlarmValue(v: any) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s !== "" && !["sin alarma", "ok", "normal", "none"].includes(s);
}

export default function TankNodeView({
  n, getPos, setPos, onDragEnd, showTip, hideTip, enabled = true, onClick,
}: {
  n: TankNode & { signals?: Record<string, any> | null; name?: string | null };
  getPos: any;
  setPos: any;
  onDragEnd: () => void;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
  enabled?: boolean;
  onClick?: () => void;
}) {
  const drag = useNodeDragCommon(n, getPos, setPos, onDragEnd, hideTip, enabled);

  const W = 280;
  const H = 200;

  const isOnline = n.online === true;
  const rawAlarm = String(n.alarma || "").toLowerCase();
  const critical = ["critico", "crítico", "critical"].includes(rawAlarm);
  const warning = ["alerta", "warning", "warn"].includes(rawAlarm);
  const hasAlarm = hasAlarmValue(n.alarma);

  const levelRaw = typeof n.level_pct === "number" ? n.level_pct : toNumber(n.level_pct);
  const level = Math.max(0, Math.min(100, levelRaw ?? 0));
  const tankName = n.name?.trim() || `Tanque ${n.id}`;

  const bodyX = 12;
  const bodyY = 36;
  const bodyW = W - 24;
  const bodyH = H - 50;
  const waterH = bodyH * level / 100;
  const waterY = bodyY + bodyH - waterH;
  const clipId = `tank-industrial-v5-${String(n.id).replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  const border = !isOnline ? "#94a3b8" : critical ? "#ef4444" : warning ? "#f59e0b" : "#3b82f6";
  const ports = n.ports ?? getNodePorts("tank");

  const portPos = (pid: PortId) => {
    switch (pid) {
      case "L1": return { x: 0, y: H / 2 };
      case "L2": return { x: 0, y: H - 38 };
      case "R1": return { x: W, y: 58 };
      case "R2": return { x: W, y: H / 2 };
      case "R3": return { x: W, y: H - 38 };
      case "T1": return { x: W / 2, y: 0 };
      case "B1": return { x: W / 2, y: H };
      default: return { x: W, y: H / 2 };
    }
  };

  const Port = ({ pid }: { pid: PortId }) => {
    const p = portPos(pid);
    return <circle cx={p.x} cy={p.y} r={5} fill="#f8fafc" stroke="#64748b" strokeWidth={1.5} opacity={0.88} />;
  };

  const tipLines = [
    `ID: ${n.id ?? "—"}`,
    `Nivel: ${level.toFixed(0)}%`,
    `Estado: ${isOnline ? "Online" : "Sin comunicación"}`,
    hasAlarm ? `Alarma: ${n.alarma}` : "Alarma: no",
  ];

  return (
    <g
      transform={`translate(${n.x - W / 2},${n.y - H / 2})`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) => showTip(e, { title: tankName, lines: tipLines })}
      onMouseMove={(e) => showTip(e, { title: tankName, lines: tipLines })}
      onMouseLeave={hideTip}
      onClick={onClick}
      style={{ cursor: enabled ? "move" : "default" }}
      opacity={isOnline ? 1 : 0.58}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx={18} />
        </clipPath>
      </defs>

      {/* placa de nombre más industrial */}
      <rect
        x={W / 2 - 72}
        y={6}
        width={144}
        height={20}
        rx={6}
        fill="#e2e8f0"
        stroke="#cbd5e1"
        strokeWidth={1}
      />
      <text
        x={W / 2}
        y={20}
        textAnchor="middle"
        fill="#0f172a"
        style={{ fontSize: 18, fontWeight: 850, pointerEvents: "none" }}
      >
        {tankName}
      </text>

      {/* cuerpo */}
      <rect
        x={bodyX}
        y={bodyY}
        width={bodyW}
        height={bodyH}
        rx={18}
        fill="#f8fafc"
        stroke={border}
        strokeWidth={2.9}
      />

      {/* franja superior técnica */}
      <rect
        x={bodyX + 1}
        y={bodyY + 1}
        width={bodyW - 2}
        height={18}
        rx={10}
        fill="#eef2f7"
        opacity={0.95}
      />

      <g clipPath={`url(#${clipId})`}>
        <rect x={bodyX} y={waterY} width={bodyW} height={waterH} fill="#60a5fa" opacity={0.96} />
        <rect x={bodyX} y={waterY} width={bodyW} height={5} fill="#2563eb" opacity={0.68} />
        <rect x={bodyX} y={bodyY} width={bodyW} height={bodyH * .24} fill="#ffffff" opacity={0.12} />
      </g>

      <text
        x={W / 2}
        y={bodyY + bodyH / 2 + 14}
        textAnchor="middle"
        fill="#0f172a"
        style={{ fontSize: 40, fontWeight: 950, pointerEvents: "none" }}
      >
        {level.toFixed(0)}%
      </text>

      <circle cx={24} cy={48} r={5.5} fill={isOnline ? "#22c55e" : "#94a3b8"} />
      {hasAlarm && <circle cx={W - 24} cy={48} r={7} fill={critical ? "#ef4444" : "#f59e0b"} />}

      {(ports.in ?? []).map((pid) => <Port key={`in-${pid}`} pid={pid} />)}
      {(ports.out ?? []).map((pid) => <Port key={`out-${pid}`} pid={pid} />)}
    </g>
  );
}
