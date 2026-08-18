import React, { useMemo } from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import type { ManifoldNode } from "../../types";

function toNum(v: any) {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(v: any, decimals = 1) {
  const n = toNum(v);
  return n == null ? null : n.toFixed(decimals);
}

function prettyUnit(unit: any, fallback: string) {
  const raw = String(unit ?? fallback).trim();
  const s = raw.toLowerCase();
  if (["mts3/h","m3/h","m³/h","mt3/h"].includes(s)) return "m³/h";
  if (["mts3/s","m3/s","m³/s"].includes(s)) return "m³/s";
  if (["l/s","lts/s"].includes(s)) return "l/s";
  return raw || fallback;
}

export default function ManifoldNodeView({
  n, getPos, setPos, onDragEnd, showTip, hideTip, enabled = true, onClick,
}: {
  n: ManifoldNode;
  getPos: any;
  setPos: any;
  onDragEnd: () => void;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
  enabled?: boolean;
  onClick?: () => void;
}) {
  const drag = useNodeDragCommon(n, getPos, setPos, onDragEnd, hideTip, enabled);

  // Tamaño lógico conservado para no romper conexiones.
  const W = 230;
  const H = 86;
  const cy = H / 2;

  const pSig = (n as any).signals?.pressure ?? null;
  const qSig = (n as any).signals?.flow ?? null;

  const pRaw = pSig?.value ?? pSig?.v ?? null;
  const qRaw = qSig?.value ?? qSig?.v ?? null;

  // En el sinóptico general mostramos únicamente mediciones reales.
  const hasP = toNum(pRaw) != null;
  const hasQ = toNum(qRaw) != null;
  const hasAny = hasP || hasQ;

  const pUnit = prettyUnit(pSig?.unit, "bar");
  const qUnit = prettyUnit(qSig?.unit, "m³/h");
  const pText = hasP ? `${fmt(pRaw, 1)} ${pUnit}` : null;
  const qText = hasQ ? `${fmt(qRaw, 1)} ${qUnit}` : null;

  const alarmOf = (sig: any, raw: any) => {
    const v = toNum(raw);
    if (v == null) return false;
    const lo = toNum(sig?.min_value);
    const hi = toNum(sig?.max_value);
    return (lo != null && v < lo) || (hi != null && v > hi);
  };
  const pAlarm = alarmOf(pSig, pRaw);
  const qAlarm = alarmOf(qSig, qRaw);

  const tipLines = useMemo(() => {
    const out = [`ID: ${n.id ?? "—"}`];
    if (hasP) out.push(`Presión: ${pText}`);
    if (hasQ) out.push(`Caudal: ${qText}`);
    return out;
  }, [n.id, hasP, hasQ, pText, qText]);

  // Si no hay ninguna medición real, el nodo queda invisible.
  // Se conserva hit-area en edición para poder moverlo.
  if (!hasAny) {
    if (!enabled) return null;
    return (
      <g
        transform={`translate(${n.x - W / 2}, ${n.y - H / 2})`}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onMouseLeave={hideTip}
        style={{ cursor: "move" }}
      >
        <rect width={W} height={H} fill="transparent" />
      </g>
    );
  }

  const both = hasP && hasQ;

  return (
    <g
      transform={`translate(${n.x - W / 2}, ${n.y - H / 2})`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) => showTip(e, { title: "Medición de línea", lines: tipLines })}
      onMouseMove={(e) => showTip(e, { title: "Medición de línea", lines: tipLines })}
      onMouseLeave={hideTip}
      onClick={onClick}
      style={{ cursor: enabled ? "move" : "default" }}
    >
      <rect width={W} height={H} fill="transparent" style={{ pointerEvents: "all" }} />

      {/* Pequeños tramos para integrarlo visualmente con la cañería */}
      <line x1={0} y1={cy} x2={24} y2={cy} stroke="#94a3b8" strokeWidth={3} strokeLinecap="round" />
      <line x1={W - 24} y1={cy} x2={W} y2={cy} stroke="#94a3b8" strokeWidth={3} strokeLinecap="round" />

      {both ? (
        <>
          <text x={30} y={cy + 6} fill="#64748b" style={{fontSize:14,fontWeight:800}}>P</text>
          <text x={50} y={cy + 6} fill={pAlarm ? "#dc2626" : "#0f172a"} style={{fontSize:18,fontWeight:850}}>
            {pText}
          </text>

          <line x1={122} y1={cy - 12} x2={122} y2={cy + 12} stroke="#cbd5e1" strokeWidth={1} />

          <text x={134} y={cy + 6} fill="#64748b" style={{fontSize:14,fontWeight:800}}>Q</text>
          <text x={154} y={cy + 6} fill={qAlarm ? "#dc2626" : "#0f172a"} style={{fontSize:18,fontWeight:850}}>
            {qText}
          </text>
        </>
      ) : hasP ? (
        <>
          <text x={68} y={cy + 6} fill="#64748b" style={{fontSize:14,fontWeight:800}}>P</text>
          <text x={90} y={cy + 6} fill={pAlarm ? "#dc2626" : "#0f172a"} style={{fontSize:18,fontWeight:850}}>
            {pText}
          </text>
        </>
      ) : (
        <>
          <text x={64} y={cy + 6} fill="#64748b" style={{fontSize:14,fontWeight:800}}>Q</text>
          <text x={86} y={cy + 6} fill={qAlarm ? "#dc2626" : "#0f172a"} style={{fontSize:18,fontWeight:850}}>
            {qText}
          </text>
        </>
      )}

      <circle cx={W - 10} cy={cy - 14} r={3.5} fill={pAlarm || qAlarm ? "#ef4444" : "#22c55e"} />
    </g>
  );
}
