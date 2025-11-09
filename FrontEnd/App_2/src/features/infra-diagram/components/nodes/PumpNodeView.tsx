import React from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import type { PumpNode } from "../../types";

export default function PumpNodeView({
  n,
  getPos,
  setPos,
  onDragEnd,
  showTip,
  hideTip,
  enabled = true,
  onClick,
}: {
  n: PumpNode;
  getPos: any;
  setPos: any;
  onDragEnd: () => void;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
  enabled?: boolean;
  onClick?: () => void;
}) {
  const drag = useNodeDragCommon(n, getPos, setPos, onDragEnd, hideTip, enabled);

  const rOuter = 26;
  const rInner = 15.5;
  const isRunning = (n.state || "").toLowerCase() === "run";
  const isOnline = n.online === true;

  const groupOpacity = isOnline ? 1 : 0.55;
  const stroke = isOnline ? "#16a34a" : "#94a3b8";
  const casingFill = "url(#lgSteel)";
  const impellerFill = isRunning && isOnline ? "#0ea5e9" : "#94a3b8";
  const labelState = (n.state || "bomba").toLowerCase();

  const tipLines = [`Online: ${isOnline ? "Sí" : "No"}`, `Estado: ${labelState}`];

  return (
    <g
      transform={`translate(${n.x}, ${n.y})`}
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
      <circle r={rOuter} fill={casingFill} stroke={stroke} strokeWidth={2.8} />
      <circle
        r={rOuter - 2}
        fill="none"
        stroke={isRunning && isOnline ? "#0ea5e9" : "transparent"}
        strokeWidth={2}
        strokeDasharray="6 10"
        opacity={0.8}
      >
        {isRunning && isOnline && (
          <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="2.4s" repeatCount="indefinite" />
        )}
      </circle>

      <circle r={rInner + 3} fill="#ffffff" stroke="#cbd5e1" strokeWidth={1.5} />
      <circle r={rInner + 3} fill="url(#lgGlass)" />

      <g>
        <circle r={2.6} fill={impellerFill} />
        {[0, 72, 144, 216, 288].map((deg) => (
          <path
            key={deg}
            d={`M 0 -${rInner} C 6 -${rInner - 6} 8 -6 4 -2 L 0 0 Z`}
            transform={`rotate(${deg})`}
            fill={impellerFill}
            opacity={0.95}
          />
        ))}
        {isRunning && isOnline && (
          <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="1.1s" repeatCount="indefinite" />
        )}
      </g>

      <circle cx={rOuter - 6} cy={-rOuter + 6} r={3.2} fill={isOnline ? "#22c55e" : "#a3a3a3"} />

      <text y={-rOuter - 12} textAnchor="middle" fontSize={12} className="node-label">
        {n.name}
      </text>
      <text y={rOuter + 16} textAnchor="middle" className="node-subtle">
        {labelState}
      </text>
    </g>
  );
}
