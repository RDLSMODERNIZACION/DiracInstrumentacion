import React, { useMemo } from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import type { ManifoldNode } from "../../types";

function toNum(v: any) {
  if (v == null || (typeof v === "string" && !v.trim())) return null;
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

  // Dedicated pressure instrument in Cloacas: visible even before its first reading.
  const isPressureMeter = (n as any).servicio === "cloacas" && pSig != null && qSig == null;
  if (isPressureMeter) {
    const online = hasP && n.online === true;
    const status = !hasP ? "Sin datos" : online ? "Online" : "Sin comunicación";
    const color = pAlarm ? "#dc2626" : online ? "#0284c7" : "#94a3b8";
    const lines = [
      `Presión: ${hasP ? pText : "Sin datos"}`,
      `Estado: ${status}`,
      ...(pSig?.tag ? [`Tag: ${pSig.tag}`] : []),
      ...(pSig?.ts ? [`Última lectura: ${pSig.ts}`] : []),
    ];
    return (
      <g
        transform={`translate(${n.x - W / 2}, ${n.y - H / 2})`}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onMouseEnter={(e) => showTip(e, { title: n.name, lines })}
        onMouseMove={(e) => showTip(e, { title: n.name, lines })}
        onMouseLeave={hideTip}
        onClick={onClick}
        style={{ cursor: enabled ? "move" : "default" }}
        data-role="pressure-meter"
      >
        <title>{`${n.name} · ${hasP ? pText : "Sin datos"}`}</title>
        <text x={W / 2} y={-12} textAnchor="middle" fill="#0f172a" style={{ fontSize: 14, fontWeight: 800 }}>{n.name}</text>
        <rect width={W} height={H} rx={12} fill="#f8fafc" stroke={color} strokeWidth={2} />
        <circle cx={42} cy={43} r={28} fill="#fff" stroke={color} strokeWidth={2} />
        <path d="M 22 40 A 21 21 0 0 1 62 40" fill="none" stroke="#cbd5e1" strokeWidth={3} />
        <path d="M 25 30 L 29 34 M 42 22 L 42 28 M 59 30 L 55 34" stroke="#64748b" strokeWidth={2} />
        <text x={42} y={58} textAnchor="middle" fill="#0284c7" style={{ fontSize: 20, fontWeight: 900 }}>P</text>
        <text x={145} y={26} textAnchor="middle" fill="#64748b" style={{ fontSize: 10, fontWeight: 800 }}>PRESIÓN</text>
        <text x={145} y={51} textAnchor="middle" fill={pAlarm ? "#dc2626" : "#0f172a"} style={{ fontSize: 23, fontWeight: 850 }}>{hasP ? pText : `— ${pUnit}`}</text>
        <circle cx={99} cy={69} r={3.5} fill={online ? "#22c55e" : "#94a3b8"} />
        <text x={110} y={73} fill="#64748b" style={{ fontSize: 10, fontWeight: 700 }}>{status}</text>
      </g>
    );
  }

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
