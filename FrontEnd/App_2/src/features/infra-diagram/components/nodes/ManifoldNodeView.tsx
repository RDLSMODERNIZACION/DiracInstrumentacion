// src/features/infra-diagram/components/nodes/ManifoldNodeView.tsx
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

function Flange({
  x,
  y,
  side,
  r = 10,
  neck = 10,
  active,
  alarm,
}: {
  x: number;
  y: number;
  side: "left" | "right";
  r?: number;
  neck?: number;
  active: boolean;
  alarm: boolean;
}) {
  const stroke = alarm ? "#ef4444" : active ? "#22c55e" : "#64748b";
  const neckX = side === "left" ? x : x - neck;

  return (
    <g>
      {/* cuello */}
      <rect x={neckX} y={y - 5} width={neck} height={10} rx={3} ry={3} fill="#94a3b8" opacity={0.9} />
      {/* brida */}
      <circle cx={x} cy={y} r={r} fill="#e5e7eb" stroke={stroke} strokeWidth={2.5} />
      {/* aro interior */}
      <circle cx={x} cy={y} r={r - 3.5} fill="none" stroke="#94a3b8" strokeWidth={1.5} opacity={0.9} />
      {/* tornillos */}
      {[0, 60, 120, 180, 240, 300].map((a) => {
        const rad = (a * Math.PI) / 180;
        return (
          <circle
            key={a}
            cx={x + Math.cos(rad) * (r - 2.6)}
            cy={y + Math.sin(rad) * (r - 2.6)}
            r={1.6}
            fill="#475569"
            opacity={0.95}
          />
        );
      })}
    </g>
  );
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
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
  enabled?: boolean;
  onClick?: () => void;
}) {
  const drag = useNodeDragCommon(n, getPos, setPos, onDragEnd, hideTip, enabled);

  // ✅ MÁS GRANDE (legible)
  const w = 230;
  const h = 86;

  // --- Datos (desde backend: signals.pressure / signals.flow) ---
  const pSig = (n as any).signals?.pressure ?? null;
  const qSig = (n as any).signals?.flow ?? null;

  const pUnit = String(pSig?.unit ?? "bar").trim() || "bar";
  const qUnit = String(qSig?.unit ?? "mts3/h").trim() || "mts3/h";

  // values
  const pValRaw = pSig?.value ?? pSig?.v ?? null;
  const qValRaw = qSig?.value ?? qSig?.v ?? null;

  const pVal = formatValue(pValRaw, 1);
  const qVal = formatValue(qValRaw, 1);

  // timestamps (para tooltip)
  const pTs = pSig?.ts ?? pSig?.updated_at ?? null;
  const qTs = qSig?.ts ?? qSig?.updated_at ?? null;

  // ✅ Estado conectado: preferimos online (viene del backend con regla 10 min).
  // Fallback: si no viene online, inferimos por "tiene algún valor numérico".
  const hasValue = isFiniteNumber(pValRaw) || isFiniteNumber(qValRaw);
  const connected = (n as any).online === true ? true : (n as any).online === false ? false : hasValue;

  // ✅ Texto base (solo valida número)
  const pTextVal = pVal == null ? `-- ${pUnit}` : `${pVal} ${pUnit}`;
  const qTextVal = qVal == null ? `-- ${qUnit}` : `${qVal} ${qUnit}`;

  // ✅ Texto a mostrar: si está OFFLINE => siempre "--" (aunque haya último valor guardado)
  const pTextShow = connected ? pTextVal : `-- ${pUnit}`;
  const qTextShow = connected ? qTextVal : `-- ${qUnit}`;

  // Alarma por min/max si existen (opcional)
  const pMin = pSig?.min_value;
  const pMax = pSig?.max_value;
  const qMin = qSig?.min_value;
  const qMax = qSig?.max_value;

  const pNum = typeof pValRaw === "string" ? Number(pValRaw) : pValRaw;
  const qNum = typeof qValRaw === "string" ? Number(qValRaw) : qValRaw;

  const pAlarm =
    Number.isFinite(pNum) &&
    ((pMin != null && Number.isFinite(Number(pMin)) && pNum < Number(pMin)) ||
      (pMax != null && Number.isFinite(Number(pMax)) && pNum > Number(pMax)));

  const qAlarm =
    Number.isFinite(qNum) &&
    ((qMin != null && Number.isFinite(Number(qMin)) && qNum < Number(qMin)) ||
      (qMax != null && Number.isFinite(Number(qMax)) && qNum > Number(qMax)));

  const alarm = !!(pAlarm || qAlarm);

  // Tags para tooltip
  const pTag = String(pSig?.tag ?? "").trim();
  const qTag = String(qSig?.tag ?? "").trim();

  const tipLines = useMemo(() => {
    const lines: string[] = [];
    lines.push(`P: ${pTextShow}${pTag ? ` (${pTag})` : ""}`);
    lines.push(`Q: ${qTextShow}${qTag ? ` (${qTag})` : ""}`);
    if (pTs) lines.push(`P ts: ${String(pTs)}`);
    if (qTs) lines.push(`Q ts: ${String(qTs)}`);
    lines.push(connected ? "Estado: Online (≤10 min)" : "Estado: Offline / sin datos");
    if (alarm) lines.push("⚠️ Alarma: fuera de rango");
    return lines;
  }, [pTextShow, qTextShow, pTag, qTag, pTs, qTs, connected, alarm]);

  // --- Estilos por estado ---
  const stroke = alarm ? "#ef4444" : connected ? "#22c55e" : "#475569";
  const strokeW = alarm ? 3 : connected ? 3 : 2;
  const fill = connected ? "url(#lgSteel)" : "url(#lgSteelDim)";
  const filterId = alarm ? "glowRed" : connected ? "glowGreen" : undefined;

  // Layout filas
  const rowH = 28;
  const gapY = 10;
  const startY = (h - (rowH * 2 + gapY)) / 2;

  const leftPad = 18;
  const badgeW = 36;
  const badgeH = 22;
  const valueX = leftPad + badgeW + 12;

  const valueFont = 19;
  const badgeFont = 13;

  return (
    <g
      transform={`translate(${n.x - w / 2}, ${n.y - h / 2})`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) => showTip(e, { title: "P / Q", lines: tipLines })}
      onMouseMove={(e) => showTip(e, { title: "P / Q", lines: tipLines })}
      onMouseLeave={hideTip}
      onClick={onClick}
      className="node-shadow"
      style={{ cursor: enabled ? "move" : "default" }}
    >
      {/* defs: dim + glow */}
      <defs>
        <linearGradient id="lgSteelDim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.55" />
        </linearGradient>

        {/* OJO: lgSteel ya existe en tu SVG global (si no, definilo ahí). */}

        <filter id="glowGreen" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="
              0 0 0 0 0
              0 1 0 0 0
              0 0 0 0 0
              0 0 0 0.8 0"
            result="green"
          />
          <feMerge>
            <feMergeNode in="green" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="glowRed" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="
              1 0 0 0 0
              0 0 0 0 0
              0 0 0 0 0
              0 0 0 0.9 0"
            result="red"
          />
          <feMerge>
            <feMergeNode in="red" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Bridas (conexión al caño) */}
      <Flange x={0} y={h / 2} side="left" active={connected} alarm={alarm} />
      <Flange x={w} y={h / 2} side="right" active={connected} alarm={alarm} />

      {/* Base */}
      <rect
        width={w}
        height={h}
        rx={18}
        ry={18}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeW}
        filter={filterId ? `url(#${filterId})` : undefined}
      />

      {/* indicador mini */}
      <circle
        cx={w - 18}
        cy={18}
        r={6.5}
        fill={alarm ? "#ef4444" : connected ? "#22c55e" : "#94a3b8"}
        stroke="#0f172a"
        strokeOpacity={0.22}
      />

      {/* Fila P */}
      <g transform={`translate(0, ${startY})`}>
        <rect
          x={leftPad}
          y={(rowH - badgeH) / 2}
          width={badgeW}
          height={badgeH}
          rx={10}
          ry={10}
          fill="#e2e8f0"
          stroke="#94a3b8"
        />
        <text
          x={leftPad + badgeW / 2}
          y={rowH / 2 + 5}
          textAnchor="middle"
          className="select-none"
          fill="#0f172a"
          style={{ fontSize: badgeFont, fontWeight: 900 }}
        >
          P
        </text>

        <text
          x={valueX}
          y={rowH / 2 + 7}
          textAnchor="start"
          className="select-none"
          fill="#0f172a"
          style={{ fontSize: valueFont, fontWeight: 900, letterSpacing: 0.2 }}
        >
          {pTextShow}
        </text>
      </g>

      {/* Fila Q */}
      <g transform={`translate(0, ${startY + rowH + gapY})`}>
        <rect
          x={leftPad}
          y={(rowH - badgeH) / 2}
          width={badgeW}
          height={badgeH}
          rx={10}
          ry={10}
          fill="#e2e8f0"
          stroke="#94a3b8"
        />
        <text
          x={leftPad + badgeW / 2}
          y={rowH / 2 + 5}
          textAnchor="middle"
          className="select-none"
          fill="#0f172a"
          style={{ fontSize: badgeFont, fontWeight: 900 }}
        >
          Q
        </text>

        <text
          x={valueX}
          y={rowH / 2 + 7}
          textAnchor="start"
          className="select-none"
          fill="#0f172a"
          style={{ fontSize: valueFont, fontWeight: 900, letterSpacing: 0.2 }}
        >
          {qTextShow}
        </text>
      </g>
    </g>
  );
}
