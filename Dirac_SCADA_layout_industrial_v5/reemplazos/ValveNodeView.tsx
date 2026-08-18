import React from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import type { ValveNode } from "../../types";

type ValveMeta = {
  model?: "2way" | "3way";
  rot?: 0 | 90 | 180 | 270;
  flipX?: boolean;
  ports?: Record<string, "open" | "closed">;
};

export default function ValveNodeView({
  n, getPos, setPos, onDragEnd, showTip, hideTip, enabled = true, onClick,
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

  const meta = ((n as any).meta ?? {}) as ValveMeta;
  const model = meta.model ?? "2way";
  const rot = meta.rot ?? 0;
  const flipX = Boolean(meta.flipX);
  const ports = meta.ports ?? {};

  const r1Closed = ports.R1 === "closed";
  const r2Closed = ports.R2 === "closed";
  const anyClosed = r1Closed || (model === "3way" && r2Closed);

  const stroke = anyClosed ? "#dc2626" : "#ea580c";
  const xform = `rotate(${rot}) scale(${flipX ? -1 : 1} 1)`;

  const tipLines = [
    model === "3way" ? "Válvula 3 vías" : "Válvula 2 vías",
    anyClosed ? "Estado: con salida cerrada" : "Estado: abierta",
  ];

  return (
    <g
      transform={`translate(${n.x},${n.y})`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onMouseEnter={(e)=>showTip(e,{title:n.name,lines:tipLines})}
      onMouseMove={(e)=>showTip(e,{title:n.name,lines:tipLines})}
      onMouseLeave={hideTip}
      onClick={onClick}
      style={{cursor:enabled ? "move":"default"}}
    >
      <g transform={xform}>
        {/* cuello/cañería mínima */}
        <line x1={-23} y1={0} x2={23} y2={0} stroke="#64748b" strokeWidth={4} strokeLinecap="round"/>

        {/* símbolo industrial simplificado */}
        <polygon points="-13,-9 -13,9 0,0" fill="#fff7ed" stroke={stroke} strokeWidth={2}/>
        <polygon points="13,-9 13,9 0,0" fill="#fff7ed" stroke={stroke} strokeWidth={2}/>

        {/* vástago */}
        <line x1={0} y1={-9} x2={0} y2={-17} stroke={stroke} strokeWidth={2}/>
        <circle cx={0} cy={-21} r={4.5} fill="#ffffff" stroke={stroke} strokeWidth={1.8}/>

        {model === "3way" && (
          <line x1={13} y1={0} x2={23} y2={12} stroke={r2Closed ? "#94a3b8" : "#64748b"} strokeWidth={4} strokeLinecap="round"/>
        )}

        {r1Closed && (
          <g stroke="#dc2626" strokeWidth={2}>
            <line x1={18} y1={-5} x2={28} y2={5}/>
            <line x1={18} y1={5} x2={28} y2={-5}/>
          </g>
        )}
        {model === "3way" && r2Closed && (
          <g stroke="#dc2626" strokeWidth={2}>
            <line x1={18} y1={7} x2={28} y2={17}/>
            <line x1={18} y1={17} x2={28} y2={7}/>
          </g>
        )}
      </g>
    </g>
  );
}
