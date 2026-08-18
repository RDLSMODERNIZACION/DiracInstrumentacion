import React from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import { toNumber } from "../../layout";
import type { TankNode } from "../../types";

type TankCategory = "tanque" | "pozo";

function hasAlarmValue(v: any) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s !== "" && !["sin alarma", "ok", "normal", "none"].includes(s);
}

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
  n: TankNode & {
    name?: string | null;
    categoria?: TankCategory | null;
  };
  getPos: any;
  setPos: any;
  onDragEnd: () => void;
  showTip: (
    e: React.MouseEvent,
    content: { title: string; lines: string[] }
  ) => void;
  hideTip: () => void;
  enabled?: boolean;
  onClick?: () => void;
}) {
  const drag = useNodeDragCommon(
    n,
    getPos,
    setPos,
    onDragEnd,
    hideTip,
    enabled
  );

  const category: TankCategory =
    (n as any).categoria === "pozo" ? "pozo" : "tanque";

  const isOnline = n.online === true;
  const rawAlarm = String(n.alarma || "").toLowerCase();
  const critical = ["critico", "crítico", "critical"].includes(rawAlarm);
  const warning = ["alerta", "warning", "warn"].includes(rawAlarm);
  const hasAlarm = hasAlarmValue(n.alarma);

  const levelRaw =
    typeof n.level_pct === "number"
      ? n.level_pct
      : toNumber(n.level_pct);

  const level = Math.max(0, Math.min(100, levelRaw ?? 0));

  const name =
    typeof n.name === "string" && n.name.trim()
      ? n.name.trim()
      : category === "pozo"
      ? `Pozo ${n.id}`
      : `Tanque ${n.id}`;

  const stroke = !isOnline
    ? "#94a3b8"
    : critical
    ? "#ef4444"
    : warning
    ? "#f59e0b"
    : "#3b82f6";

  const tipLines = [
    `ID: ${n.id ?? "—"}`,
    `Tipo: ${category === "pozo" ? "Pozo" : "Tanque"}`,
    `Nivel: ${level.toFixed(0)}%`,
    `Estado: ${isOnline ? "Online" : "Sin comunicación"}`,
    hasAlarm ? `Alarma: ${n.alarma}` : "Alarma: no",
  ];

  // ============================================================
  // POZO
  // ============================================================
  if (category === "pozo") {
    const W = 210;
    const H = 230;
    const shaftX = 57;
    const shaftY = 46;
    const shaftW = 96;
    const shaftH = 155;
    const waterH = shaftH * (level / 100);
    const waterY = shaftY + shaftH - waterH;
    const clipId = `well-clip-${String(n.id).replace(/[^a-zA-Z0-9_-]/g, "_")}`;

    return (
      <g
        transform={`translate(${n.x - W / 2}, ${n.y - H / 2})`}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onMouseEnter={(e) => showTip(e, { title: name, lines: tipLines })}
        onMouseMove={(e) => showTip(e, { title: name, lines: tipLines })}
        onMouseLeave={hideTip}
        onClick={onClick}
        style={{ cursor: enabled ? "move" : "default" }}
        opacity={isOnline ? 1 : 0.58}
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x={shaftX}
              y={shaftY}
              width={shaftW}
              height={shaftH}
              rx={18}
            />
          </clipPath>
          <linearGradient id={`wellSteel-${n.id}`} x1="0" x2="1">
            <stop offset="0%" stopColor="#dbe3ea" />
            <stop offset="45%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#aeb9c5" />
          </linearGradient>
        </defs>

        <text
          x={W / 2}
          y={18}
          textAnchor="middle"
          fill="#0f172a"
          style={{ fontSize: 18, fontWeight: 850, pointerEvents: "none" }}
        >
          {name}
        </text>

        {/* Cabezal del pozo */}
        <ellipse
          cx={W / 2}
          cy={42}
          rx={54}
          ry={14}
          fill={`url(#wellSteel-${n.id})`}
          stroke="#64748b"
          strokeWidth={2}
        />

        <rect
          x={shaftX}
          y={shaftY}
          width={shaftW}
          height={shaftH}
          rx={18}
          fill={`url(#wellSteel-${n.id})`}
          stroke={stroke}
          strokeWidth={2.6}
        />

        <g clipPath={`url(#${clipId})`}>
          <rect
            x={shaftX}
            y={waterY}
            width={shaftW}
            height={waterH}
            fill="#60a5fa"
            opacity={0.95}
          />
          <rect
            x={shaftX}
            y={waterY}
            width={shaftW}
            height={4}
            fill="#2563eb"
            opacity={0.7}
          />
        </g>

        {/* Brocal inferior */}
        <ellipse
          cx={W / 2}
          cy={shaftY + shaftH}
          rx={48}
          ry={11}
          fill="#cbd5e1"
          stroke="#64748b"
          strokeWidth={1.7}
        />

        {/* Indicador */}
        <rect
          x={74}
          y={104}
          width={62}
          height={36}
          rx={8}
          fill="#f8fafc"
          stroke="#cbd5e1"
          strokeWidth={1.3}
          opacity={0.93}
        />
        <text
          x={105}
          y={129}
          textAnchor="middle"
          fill="#0f172a"
          style={{ fontSize: 24, fontWeight: 950 }}
        >
          {level.toFixed(0)}%
        </text>

        <circle
          cx={70}
          cy={59}
          r={5}
          fill={isOnline ? "#22c55e" : "#94a3b8"}
        />
      </g>
    );
  }

  // ============================================================
  // TANQUE INDUSTRIAL
  // ============================================================
  const W = 300;
  const H = 220;
  const bodyX = 22;
  const bodyY = 50;
  const bodyW = W - 44;
  const bodyH = 144;
  const ellipseH = 24;

  const waterH = bodyH * (level / 100);
  const waterY = bodyY + bodyH - waterH;

  const clipId = `tank-industrial-clip-${String(n.id).replace(
    /[^a-zA-Z0-9_-]/g,
    "_"
  )}`;

  return (
    <g
      transform={`translate(${n.x - W / 2}, ${n.y - H / 2})`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) => showTip(e, { title: name, lines: tipLines })}
      onMouseMove={(e) => showTip(e, { title: name, lines: tipLines })}
      onMouseLeave={hideTip}
      onClick={onClick}
      style={{ cursor: enabled ? "move" : "default" }}
      opacity={isOnline ? 1 : 0.58}
    >
      <defs>
        <clipPath id={clipId}>
          <rect
            x={bodyX}
            y={bodyY}
            width={bodyW}
            height={bodyH}
            rx={14}
          />
        </clipPath>

        <linearGradient id={`tankSteel-${n.id}`} x1="0" x2="1">
          <stop offset="0%" stopColor="#d6dee7" />
          <stop offset="22%" stopColor="#f8fafc" />
          <stop offset="62%" stopColor="#eef2f7" />
          <stop offset="100%" stopColor="#aeb9c5" />
        </linearGradient>
      </defs>

      {/* Nombre limpio */}
      <text
        x={W / 2}
        y={22}
        textAnchor="middle"
        fill="#0f172a"
        style={{ fontSize: 19, fontWeight: 850, pointerEvents: "none" }}
      >
        {name}
      </text>

      {/* Cuerpo metálico cilíndrico */}
      <rect
        x={bodyX}
        y={bodyY}
        width={bodyW}
        height={bodyH}
        rx={15}
        fill={`url(#tankSteel-${n.id})`}
        stroke={stroke}
        strokeWidth={2.8}
      />

      {/* Tapa elíptica */}
      <ellipse
        cx={W / 2}
        cy={bodyY}
        rx={bodyW / 2}
        ry={ellipseH / 2}
        fill="#eef2f7"
        stroke={stroke}
        strokeWidth={2.2}
      />

      {/* Base elíptica */}
      <ellipse
        cx={W / 2}
        cy={bodyY + bodyH}
        rx={bodyW / 2}
        ry={ellipseH / 2}
        fill="#cbd5e1"
        stroke={stroke}
        strokeWidth={2}
      />

      {/* Agua */}
      <g clipPath={`url(#${clipId})`}>
        <rect
          x={bodyX}
          y={waterY}
          width={bodyW}
          height={waterH}
          fill="#60a5fa"
          opacity={0.92}
        />
        <rect
          x={bodyX}
          y={waterY}
          width={bodyW}
          height={5}
          fill="#2563eb"
          opacity={0.72}
        />
      </g>

      {/* Nivel */}
      <rect
        x={W / 2 - 50}
        y={104}
        width={100}
        height={44}
        rx={9}
        fill="#f8fafc"
        stroke="#cbd5e1"
        strokeWidth={1.2}
        opacity={0.94}
      />

      <text
        x={W / 2}
        y={135}
        textAnchor="middle"
        fill="#0f172a"
        style={{ fontSize: 32, fontWeight: 950, pointerEvents: "none" }}
      >
        {level.toFixed(0)}%
      </text>

      {/* Estado */}
      <circle
        cx={38}
        cy={66}
        r={5.5}
        fill={isOnline ? "#22c55e" : "#94a3b8"}
      />

      {hasAlarm && (
        <circle
          cx={W - 38}
          cy={66}
          r={7}
          fill={critical ? "#ef4444" : "#f59e0b"}
        />
      )}

      {/*
        IMPORTANTE:
        No dibujamos puntos de conexión acá.
        Los puntos se muestran únicamente desde InfraDiagram
        cuando Editar + Conectar están activos.
      */}
    </g>
  );
}
