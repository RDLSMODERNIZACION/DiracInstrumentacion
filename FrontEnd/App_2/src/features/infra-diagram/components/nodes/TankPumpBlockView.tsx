import React from "react";
import type { TankNode, PumpNode } from "../../types";
import useNodeDragCommon from "../../useNodeDragCommon";
import TankNodeView from "./TankNodeView";
import PumpNodeView from "./PumpNodeView";
import { tankBlockConnectionPoint, mountedPumpOffset } from "../../equipmentAppearance";

// Keeps the original well and pump dimensions inside one movable block.
export default function TankPumpBlockView({ n, pump, getPos, setPos, onDragEnd, showTip, hideTip, enabled, onClick }: {
  n: TankNode;
  pump: PumpNode;
  getPos: any;
  setPos: any;
  onDragEnd: () => void;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
  enabled: boolean;
  onClick?: () => void;
}) {
  const drag = useNodeDragCommon(n, getPos, setPos, onDragEnd, hideTip, enabled);
  const offset = mountedPumpOffset(n.id);
  const blockTop = -250;
  const connectionX = tankBlockConnectionPoint(n).x - n.x;
  const running = ["run", "running", "on", "1", "true"].includes(String(pump.state).toLowerCase());
  const tip = { title: n.name, lines: [
    `Nivel: ${n.level_pct == null ? "Sin datos" : `${Number(n.level_pct).toFixed(0)}%`}`,
    `${pump.name}: ${pump.online !== true ? "Sin comunicación" : running ? "En marcha" : "Detenida"}`,
  ] };
  return (
    <g transform={`translate(${n.x}, ${n.y})`} data-role="well-pump-block"
      onPointerDown={drag.onPointerDown} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp}
      onMouseEnter={(e) => showTip(e, tip)} onMouseMove={(e) => showTip(e, tip)}
      onMouseLeave={hideTip} onClick={onClick} style={{ cursor: enabled ? "move" : "default" }}>
      <title>{`${n.name} · ${pump.name}`}</title>
      <rect x={-224} y={blockTop} width={448} height={184 - blockTop} rx={14} fill="transparent" stroke="none" />
      <text x={0} y={-224} textAnchor="middle" fill="#0f172a" style={{ fontSize: 20, fontWeight: 900 }}>{n.name}</text>
      <g transform={`translate(${-n.x}, ${-n.y})`} style={{ pointerEvents: "none" }}>
        <TankNodeView n={n} hideHeading getPos={getPos} setPos={setPos} onDragEnd={onDragEnd}
          showTip={showTip} hideTip={hideTip} enabled={false} />
        <PumpNodeView n={pump} mounted getPos={getPos} setPos={setPos} onDragEnd={onDragEnd}
          showTip={showTip} hideTip={hideTip} enabled={false} />
      </g>
      <g style={{ pointerEvents: "none" }}>
        <path d={`M 140 0 L ${connectionX} 0`} stroke="#64748b" strokeWidth={9} strokeLinecap="round" />
        <path d={`M 140 0 L ${connectionX} 0`} stroke="#cbd5e1" strokeWidth={6} strokeLinecap="round" />
        <path d={`M 0 ${offset.y + 49} L 0 -108`} stroke="#64748b" strokeWidth={7} strokeLinecap="round" />
        <path d={`M 0 ${offset.y + 49} L 0 -108`} stroke="#cbd5e1" strokeWidth={4} strokeLinecap="round" />
        <circle cx={connectionX} r={4} fill="white" stroke="#64748b" strokeWidth={1.5} />
      </g>
    </g>
  );
}
