import React, { useMemo } from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import type { ManifoldNode } from "../../types";
import { isSandFilter, SAND_FILTER_RADIUS, SAND_FILTER_PORT_X } from "../../schematic";
import ProcessNodeView from "./ProcessNodeView";
import DosingNodeView from "./DosingNodeView";
import LagoonNodeView from "./LagoonNodeView";
import WaterIntakeNodeView from "./WaterIntakeNodeView";

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

  if (n.meta?.symbol === "water_intake") {
    return <WaterIntakeNodeView n={n} drag={drag} showTip={showTip} hideTip={hideTip} enabled={enabled} onClick={onClick} />;
  }

  if (n.meta?.symbol === "lagoon") {
    return <LagoonNodeView n={n} drag={drag} showTip={showTip} hideTip={hideTip} enabled={enabled} onClick={onClick} />;
  }

  if (n.meta?.symbol === "dosing_tank" || n.meta?.symbol === "dosing_pump") {
    return <DosingNodeView n={n} drag={drag} showTip={showTip} hideTip={hideTip} enabled={enabled} onClick={onClick} />;
  }

  if (n.meta?.symbol === "mixer" || n.meta?.symbol === "sedimenter") {
    return <ProcessNodeView n={n} drag={drag} showTip={showTip} hideTip={hideTip} enabled={enabled} onClick={onClick} />;
  }

  if (isSandFilter(n)) {
    const clipId = `sand-filter-${n.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const lines = ["Filtro de arena", "Entrada y salida de agua"];
    return (
      <g transform={`translate(${n.x}, ${n.y})`}
        onPointerDown={drag.onPointerDown} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp}
        onMouseEnter={(e) => showTip(e, { title: n.name, lines })}
        onMouseMove={(e) => showTip(e, { title: n.name, lines })}
        onMouseLeave={hideTip} onClick={onClick}
        style={{ cursor: enabled ? "move" : "default" }} data-role="sand-filter">
        <title>{n.name}</title>
        <defs><clipPath id={clipId}><circle r={SAND_FILTER_RADIUS - 7} /></clipPath></defs>
        <text x={0} y={-94} textAnchor="middle" fill="#0f172a" style={{ fontSize: 16, fontWeight: 800 }}>{n.name}</text>
        <text x={0} y={-78} textAnchor="middle" fill="#a16207" style={{ fontSize: 10, fontWeight: 800 }}>FILTRO DE ARENA · AGUA</text>
        <path d={`M ${-SAND_FILTER_PORT_X} 0 L ${SAND_FILTER_PORT_X} 0`} stroke="#64748b" strokeWidth={10} strokeLinecap="round" />
        <path d={`M ${-SAND_FILTER_PORT_X} 0 L ${SAND_FILTER_PORT_X} 0`} stroke="#cbd5e1" strokeWidth={6} strokeLinecap="round" />
        <circle r={SAND_FILTER_RADIUS} fill="#e2e8f0" stroke="#64748b" strokeWidth={3} />
        <circle r={SAND_FILTER_RADIUS - 7} fill="#eff6ff" stroke="#94a3b8" />
        <g clipPath={`url(#${clipId})`} style={{ pointerEvents: "none" }}>
          <rect x={-70} y={9} width={140} height={70} fill="#f5deb3" />
          <path d="M -70 9 L 70 9" stroke="#c49a53" strokeWidth={2} />
          {[0,1,2,3].map((row) => [0,1,2,3,4,5,6].map((col) => <circle key={`${row}-${col}`} cx={-57 + col * 19 + (row % 2) * 5} cy={22 + row * 13} r={2} fill="#bd934e" />))}
          <path d="M -48 -21 L 48 -21 M -36 -21 L -36 -11 M -12 -21 L -12 -11 M 12 -21 L 12 -11 M 36 -21 L 36 -11" stroke="#60a5fa" strokeWidth={3} strokeLinecap="round" />
        </g>
        <path d="M -76 -7 L -76 7 M 76 -7 L 76 7" stroke="#475569" strokeWidth={3} />
      </g>
    );
  }

  // Dedicated pressure instrument in Cloacas: visible even before its first reading.
  const isPressureMeter = (n as any).servicio === "cloacas" && pSig != null && qSig == null;
  if (isPressureMeter) {
    const online = hasP && n.online === true;
    const status = !hasP ? "Sin datos" : online ? "Online" : "Sin comunicación";
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
        <rect x={56} y={cy - 20} width={154} height={40} fill="none" style={{ pointerEvents: "all" }} />
        <text x={68} y={cy + 6} fill="#64748b" style={{ fontSize: 14, fontWeight: 800 }}>P</text>
        <text x={90} y={cy + 6} fill={pAlarm ? "#dc2626" : "#0f172a"} style={{ fontSize: 18, fontWeight: 850 }}>{hasP ? pText : `— ${pUnit}`}</text>
        <circle cx={202} cy={cy - 14} r={3.5} fill={pAlarm ? "#ef4444" : online ? "#22c55e" : "#94a3b8"} />
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
