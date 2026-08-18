import React, { useMemo } from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import type { ManifoldNode } from "../../types";

function isFiniteNumber(v: any) {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n);
}

function formatValue(v: any, decimals = 1) {
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return null;
  return n.toFixed(decimals);
}

function prettyUnit(unit: any, fallback: string) {
  const raw = String(unit ?? fallback).trim();
  const normalized = raw.toLowerCase();

  if (
    normalized === "mts3/h" ||
    normalized === "m3/h" ||
    normalized === "m³/h" ||
    normalized === "mt3/h"
  ) {
    return "m³/h";
  }

  if (
    normalized === "mts3/s" ||
    normalized === "m3/s" ||
    normalized === "m³/s"
  ) {
    return "m³/s";
  }

  if (normalized === "l/s" || normalized === "lts/s") {
    return "l/s";
  }

  return raw;
}

export default function ManifoldNodeView({
  n,
  getPos,
  setPos,
  onDragEnd,
  showTip,
  hideTip,
  enabled = true,
  onClick,
}: {
  n: ManifoldNode;
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

  // Mantenemos 230x86 para no romper las conexiones actuales.
  const w = 230;
  const h = 86;

  const pSig = (n as any).signals?.pressure ?? null;
  const qSig = (n as any).signals?.flow ?? null;

  const hasPressureSignal = pSig != null;
  const hasFlowSignal = qSig != null;
  const hasAnySignal = hasPressureSignal || hasFlowSignal;

  const pUnit = prettyUnit(pSig?.unit, "bar");
  const qUnit = prettyUnit(qSig?.unit, "m³/h");

  const pValRaw = pSig?.value ?? pSig?.v ?? null;
  const qValRaw = qSig?.value ?? qSig?.v ?? null;

  const pVal = formatValue(pValRaw, 1);
  const qVal = formatValue(qValRaw, 1);

  const hasAnyValue = isFiniteNumber(pValRaw) || isFiniteNumber(qValRaw);

  const connected =
    (n as any).online === true
      ? true
      : (n as any).online === false
      ? false
      : hasAnyValue;

  const pMin = pSig?.min_value;
  const pMax = pSig?.max_value;
  const qMin = qSig?.min_value;
  const qMax = qSig?.max_value;

  const pNum = typeof pValRaw === "string" ? Number(pValRaw) : pValRaw;
  const qNum = typeof qValRaw === "string" ? Number(qValRaw) : qValRaw;

  const pAlarm =
    Number.isFinite(pNum) &&
    ((pMin != null &&
      Number.isFinite(Number(pMin)) &&
      pNum < Number(pMin)) ||
      (pMax != null &&
        Number.isFinite(Number(pMax)) &&
        pNum > Number(pMax)));

  const qAlarm =
    Number.isFinite(qNum) &&
    ((qMin != null &&
      Number.isFinite(Number(qMin)) &&
      qNum < Number(qMin)) ||
      (qMax != null &&
        Number.isFinite(Number(qMax)) &&
        qNum > Number(qMax)));

  const pText = !hasPressureSignal
    ? null
    : !connected
    ? "SIN DATOS"
    : pVal == null
    ? "SIN DATOS"
    : `${pVal} ${pUnit}`;

  const qText = !hasFlowSignal
    ? null
    : !connected
    ? "SIN DATOS"
    : qVal == null
    ? "SIN DATOS"
    : `${qVal} ${qUnit}`;

  const tipLines = useMemo(() => {
    const lines = [`ID: ${n.id ?? "—"}`];

    if (hasPressureSignal) {
      lines.push(`Presión: ${pText ?? "—"}`);
    }

    if (hasFlowSignal) {
      lines.push(`Caudal: ${qText ?? "—"}`);
    }

    if (!connected) {
      lines.push("Estado: Sin comunicación");
    }

    return lines;
  }, [n.id, hasPressureSignal, hasFlowSignal, pText, qText, connected]);

  const normalColor = connected ? "#0f172a" : "#94a3b8";
  const mutedColor = connected ? "#64748b" : "#cbd5e1";
  const lineColor = connected ? "#3b82f6" : "#94a3b8";

  const cy = h / 2;
  const showBoth = !!pText && !!qText;

  // Si no tiene ningún sensor configurado, no mostramos nada visible.
  if (!hasAnySignal) {
    return (
      <g
        transform={`translate(${n.x - w / 2}, ${n.y - h / 2})`}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onMouseLeave={hideTip}
        onClick={onClick}
        style={{ cursor: enabled ? "move" : "default" }}
      >
        <rect
          width={w}
          height={h}
          fill="transparent"
          style={{ pointerEvents: "all" }}
        />
      </g>
    );
  }

  return (
    <g
      transform={`translate(${n.x - w / 2}, ${n.y - h / 2})`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) =>
        showTip(e, {
          title: "Medición de línea",
          lines: tipLines,
        })
      }
      onMouseMove={(e) =>
        showTip(e, {
          title: "Medición de línea",
          lines: tipLines,
        })
      }
      onMouseLeave={hideTip}
      onClick={onClick}
      style={{ cursor: enabled ? "move" : "default" }}
    >
      <rect
        width={w}
        height={h}
        fill="transparent"
        style={{ pointerEvents: "all" }}
      />

      <line
        x1={0}
        y1={cy}
        x2={18}
        y2={cy}
        stroke={lineColor}
        strokeWidth={3}
        strokeLinecap="round"
      />

      <line
        x1={w - 18}
        y1={cy}
        x2={w}
        y2={cy}
        stroke={lineColor}
        strokeWidth={3}
        strokeLinecap="round"
      />

      {showBoth ? (
        <>
          <g>
            <text
              x={28}
              y={cy + 6}
              fill={pAlarm ? "#dc2626" : mutedColor}
              style={{ fontSize: 14, fontWeight: 800 }}
            >
              P
            </text>

            <text
              x={46}
              y={cy + 6}
              fill={pAlarm ? "#dc2626" : normalColor}
              style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.1 }}
            >
              {pText}
            </text>
          </g>

          <line
            x1={124}
            y1={cy - 11}
            x2={124}
            y2={cy + 11}
            stroke="#cbd5e1"
            strokeWidth={1}
          />

          <g>
            <text
              x={136}
              y={cy + 6}
              fill={qAlarm ? "#dc2626" : mutedColor}
              style={{ fontSize: 14, fontWeight: 800 }}
            >
              Q
            </text>

            <text
              x={154}
              y={cy + 6}
              fill={qAlarm ? "#dc2626" : normalColor}
              style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.1 }}
            >
              {qText}
            </text>
          </g>
        </>
      ) : pText ? (
        <>
          <text
            x={70}
            y={cy + 6}
            fill={pAlarm ? "#dc2626" : mutedColor}
            style={{ fontSize: 14, fontWeight: 800 }}
          >
            P
          </text>

          <text
            x={90}
            y={cy + 6}
            fill={pAlarm ? "#dc2626" : normalColor}
            style={{ fontSize: 18, fontWeight: 800 }}
          >
            {pText}
          </text>
        </>
      ) : qText ? (
        <>
          <text
            x={68}
            y={cy + 6}
            fill={qAlarm ? "#dc2626" : mutedColor}
            style={{ fontSize: 14, fontWeight: 800 }}
          >
            Q
          </text>

          <text
            x={88}
            y={cy + 6}
            fill={qAlarm ? "#dc2626" : normalColor}
            style={{ fontSize: 18, fontWeight: 800 }}
          >
            {qText}
          </text>
        </>
      ) : null}

      <circle
        cx={w - 16}
        cy={cy - 14}
        r={3.5}
        fill={
          !connected
            ? "#94a3b8"
            : pAlarm || qAlarm
            ? "#ef4444"
            : "#22c55e"
        }
      />
    </g>
  );
}
