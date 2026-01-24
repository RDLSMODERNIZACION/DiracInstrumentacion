import React from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import type { ManifoldNode } from "../../types";

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

  // Nodo compacto: 2 filas (P / Q) + unidad (fallback si no hay)
  const w = 150;
  const h = 46;

  const pUnit = (n.signals?.pressure?.unit ?? "").trim();
  const qUnit = (n.signals?.flow?.unit ?? "").trim();

  // Fallbacks "profesionales"
  const pText = `-- ${pUnit || "bar"}`;
  const qText = `-- ${qUnit || "mts3/h"}`;

  // Tooltip (mantengo tags si existen)
  const pTag = (n.signals?.pressure?.tag ?? "").trim();
  const qTag = (n.signals?.flow?.tag ?? "").trim();

  const tipLines = [
    "Manifold",
    `P: ${pText}${pTag ? ` (${pTag})` : ""}`,
    `Q: ${qText}${qTag ? ` (${qTag})` : ""}`,
  ];

  // Layout
  const rowH = 18;
  const gapY = 6;
  const startY = (h - (rowH * 2 + gapY)) / 2;

  const leftPad = 10;
  const labelW = 18; // ancho para "P"/"Q"
  const valueX = leftPad + labelW + 6;

  return (
    <g
      transform={`translate(${n.x - w / 2}, ${n.y - h / 2})`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) => showTip(e, { title: "Manifold", lines: tipLines })}
      onMouseMove={(e) => showTip(e, { title: "Manifold", lines: tipLines })}
      onMouseLeave={hideTip}
      onClick={onClick}
      className="node-shadow"
      style={{ cursor: enabled ? "move" : "default" }}
    >
      {/* Base */}
      <rect
        width={w}
        height={h}
        rx={14}
        ry={14}
        fill="url(#lgSteel)"
        stroke="#334155"
        strokeWidth={2}
      />

      {/* Fila P */}
      <g transform={`translate(0, ${startY})`}>
        {/* chip P */}
        <rect x={leftPad} y={0} width={26} height={rowH} rx={9} ry={9} fill="#e2e8f0" stroke="#94a3b8" />
        <text
          x={leftPad + 13}
          y={rowH - 5}
          textAnchor="middle"
          className="select-none"
          fill="#0f172a"
          style={{ fontSize: 12, fontWeight: 900 }}
        >
          P
        </text>

        {/* valor */}
        <text
          x={valueX}
          y={rowH - 5}
          textAnchor="start"
          className="select-none"
          fill="#0f172a"
          style={{ fontSize: 12, fontWeight: 800 }}
        >
          {pText}
        </text>
      </g>

      {/* Fila Q */}
      <g transform={`translate(0, ${startY + rowH + gapY})`}>
        {/* chip Q */}
        <rect x={leftPad} y={0} width={26} height={rowH} rx={9} ry={9} fill="#e2e8f0" stroke="#94a3b8" />
        <text
          x={leftPad + 13}
          y={rowH - 5}
          textAnchor="middle"
          className="select-none"
          fill="#0f172a"
          style={{ fontSize: 12, fontWeight: 900 }}
        >
          Q
        </text>

        {/* valor */}
        <text
          x={valueX}
          y={rowH - 5}
          textAnchor="start"
          className="select-none"
          fill="#0f172a"
          style={{ fontSize: 12, fontWeight: 800 }}
        >
          {qText}
        </text>
      </g>
    </g>
  );
}
