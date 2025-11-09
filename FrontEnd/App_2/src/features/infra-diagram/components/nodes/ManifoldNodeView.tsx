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
  const w = 110, h = 16;
  const tipLines = ["Tipo: colector"];

  return (
    <g
      transform={`translate(${n.x - w / 2}, ${n.y - h / 2})`}
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
      <rect width={w} height={h} rx={8} ry={8} fill="url(#lgSteel)" stroke="#475569" strokeWidth={2} />
    </g>
  );
}
