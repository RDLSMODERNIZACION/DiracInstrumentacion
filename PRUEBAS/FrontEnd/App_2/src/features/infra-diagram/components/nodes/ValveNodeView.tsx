import React from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import type { ValveNode } from "../../types";

export default function ValveNodeView({
  n,
  getPos,
  setPos,
  onDragEnd,
  showTip,
  hideTip,
  enabled = true,
  onClick,
}: {
  n: ValveNode;
  getPos: any;
  setPos: any;
  onDragEnd: () => void;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
  enabled?: boolean;
  onClick?: () => void;
}) {
  const drag = useNodeDragCommon(n, getPos, setPos, onDragEnd, hideTip, enabled);
  const s = 20;
  const tipLines: string[] = ["Tipo: válvula"];

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
    >
      <polygon points={`0,-${s / 2} ${s / 2},0 0,${s / 2} -${s / 2},0`} fill="#fff7ed" stroke="#f97316" strokeWidth={2} />
      <line x1="-14" y1="0" x2="14" y2="0" stroke="#f97316" strokeWidth={2} />
      <circle r="2" fill="#f97316" />
    </g>
  );
}
