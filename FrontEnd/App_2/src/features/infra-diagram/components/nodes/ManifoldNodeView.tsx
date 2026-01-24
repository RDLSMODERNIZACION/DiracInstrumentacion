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
  const w = 210;
  const h = 78;

  // --- Datos (si existen) ---
  const pUnit = (n.signals?.pressure?.unit ?? "bar").trim() || "bar";
  const qUnit = (n.signals?.flow?.unit ?? "mts3/h").trim() || "mts3/h";

  // Si tu backend ya manda .value / .ts, esto lo toma. Si no, cae en "--"
  const pValRaw = (n as any).signals?.pressure?.value ?? (n as any).signals?.pressure?.v ?? null;
  const qValRaw = (n as any).signals?.flow?.value ?? (n as any).signals?.flow?.v ?? null;

  const pVal = formatValue(pValRaw, 1);
  const qVal = formatValue(qValRaw, 1);

  const pText = pVal == null ? `-- ${pUnit}` : `${pVal} ${pUnit}`;
  const qText = qVal == null ? `-- ${qUnit}` : `${qVal} ${qUnit}`;

  // timestamp (opcional). si no existe, igual funciona
  const pTs = (n as any).signals?.pressure?.ts ?? (n as any).signals?.pressure?.updated_at ?? null;
  const qTs = (n as any).signals?.flow?.ts ?? (n as any).signals?.flow?.updated_at ?? null;

  // “Conectado”: al menos uno tiene valor numérico
  const connected = isFiniteNumber(pValRaw) || isFiniteNumber(qValRaw);

  // Alarma por min/max si existen (opcional)
  const pMin = (n as any).signals?.pressure?.min_value;
  const pMax = (n as any).signals?.pressure?.max_value;
  const qMin = (n as any).signals?.flow?.min_value;
  const qMax = (n as any).signals?.flow?.max_value;

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
  const pTag = (n.signals?.pressure?.tag ?? "").trim();
  const qTag = (n.signals?.flow?.tag ?? "").trim();

  const tipLines = useMemo(() => {
    const lines: string[] = [];
    lines.push(`P: ${pText}${pTag ? ` (${pTag})` : ""}`);
    lines.push(`Q: ${qText}${qTag ? ` (${qTag})` : ""}`);
    if (pTs) lines.push(`P ts: ${String(pTs)}`);
    if (qTs) lines.push(`Q ts: ${String(qTs)}`);
    lines.push(connected ? "Estado: Conectado" : "Estado: Sin datos");
    if (alarm) lines.push("⚠️ Alarma: fuera de rango");
    return lines;
  }, [pText, qText, pTag, qTag, pTs, qTs, connected, alarm]);

  // --- Estilos por estado ---
  const stroke = alarm ? "#ef4444" : connected ? "#22c55e" : "#475569";
  const strokeW = alarm ? 3 : connected ? 3 : 2;

  const fill = connected ? "url(#lgSteel)" : "url(#lgSteelDim)";
  // Si no tenés lgSteelDim en defs, podés dejar lgSteel y listo.

  // Glow suave si conectado/alarma (SVG filter opcional)
  const filterId = alarm ? "glowRed" : connected ? "glowGreen" : undefined;

  // Layout filas
  const rowH = 26;
  const gapY = 8;
  const startY = (h - (rowH * 2 + gapY)) / 2;

  const leftPad = 14;
  const badgeW = 34;
  const badgeH = 22;
  const valueX = leftPad + badgeW + 10;

  // Fuente más grande
  const valueFont = 18;
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
      {/* Opcional: defs para glow + dim */}
      <defs>
        <linearGradient id="lgSteelDim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.55" />
        </linearGradient>

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

      {/* Indicador mini (punto) */}
      <circle
        cx={w - 16}
        cy={16}
        r={6}
        fill={alarm ? "#ef4444" : connected ? "#22c55e" : "#94a3b8"}
        stroke="#0f172a"
        strokeOpacity={0.25}
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
          y={rowH / 2 + 6}
          textAnchor="start"
          className="select-none"
          fill="#0f172a"
          style={{ fontSize: valueFont, fontWeight: 900, letterSpacing: 0.2 }}
        >
          {pText}
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
          y={rowH / 2 + 6}
          textAnchor="start"
          className="select-none"
          fill="#0f172a"
          style={{ fontSize: valueFont, fontWeight: 900, letterSpacing: 0.2 }}
        >
          {qText}
        </text>
      </g>
    </g>
  );
}
