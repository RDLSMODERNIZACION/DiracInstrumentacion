import React from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import type { PumpNode } from "../../types";

type PumpOrientation = "vertical" | "horizontal";

export default function PumpNodeView({
  n,
  getPos,
  setPos,
  onDragEnd,
  showTip,
  hideTip,
  enabled = true,
  onClick,
  tapConnectMode = false,
  tapSelected = false,
  onTapSelect,
}: {
  n: PumpNode & {
    name?: string | null;
    in_maintenance?: boolean | null;
    orientacion?: PumpOrientation | null;
    meta?: any;
    orientation?: PumpOrientation;
  };
  getPos: any;
  setPos: any;
  onDragEnd: () => void;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
  enabled?: boolean;
  onClick?: () => void;
  tapConnectMode?: boolean;
  tapSelected?: boolean;
  onTapSelect?: (nodeId: string) => void;
}) {
  const drag = useNodeDragCommon(n, getPos, setPos, onDragEnd, hideTip, enabled);
  const orientation: PumpOrientation =
    (n.orientacion as PumpOrientation) ||
    ((n as any).meta?.orientation as PumpOrientation) ||
    ((n as any).orientation as PumpOrientation) ||
    "vertical";
  const name = typeof n.name === "string" && n.name.trim() ? n.name.trim() : `Bomba ${n.id}`;
  const state = String(n.state || "").toLowerCase();
  const running = ["run", "running", "on", "1", "true"].includes(state);
  const online = n.online === true;
  const maintenance = (n as any).in_maintenance === true;

  const motorFill = !online ? "#cbd5e1" : maintenance ? "#fbbf24" : running ? "#ef6c35" : "#b8c2cc";
  const motorStroke = tapSelected ? "#0ea5e9" : !online ? "#94a3b8" : maintenance ? "#d97706" : running ? "#c2410c" : "#64748b";
  const statusFill = !online ? "#94a3b8" : maintenance ? "#f59e0b" : running ? "#16a34a" : "#64748b";
  const statusText = !online ? "OFFLINE" : maintenance ? "MANT." : running ? "ON" : "OFF";
  const tipLines = [
    `ID: ${n.id}`,
    `Estado: ${running ? "En marcha" : "Detenida"}`,
    `Comunicación: ${online ? "Online" : "Offline"}`,
    `Montaje: ${orientation === "horizontal" ? "Horizontal" : "Vertical"}`,
  ];

  const handlePointerDown = (e: React.PointerEvent<SVGGElement>) => {
    if (tapConnectMode) {
      e.preventDefault();
      e.stopPropagation();
      onTapSelect?.(n.id);
      return;
    }
    if (enabled) drag.onPointerDown(e);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGGElement>) => {
    if (!tapConnectMode && enabled) drag.onPointerMove(e);
  };
  const handlePointerUp = (e: React.PointerEvent<SVGGElement>) => {
    if (!tapConnectMode && enabled) drag.onPointerUp(e);
  };
  const handleClick = (e: React.MouseEvent<SVGGElement>) => {
    e.stopPropagation();
    if (!tapConnectMode) onClick?.();
  };

  if (orientation === "horizontal") {
    return (
      <g transform={`translate(${n.x}, ${n.y})`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
        onMouseEnter={(e)=>showTip(e,{title:name,lines:tipLines})} onMouseMove={(e)=>showTip(e,{title:name,lines:tipLines})} onMouseLeave={hideTip} onClick={handleClick}
        style={{cursor: tapConnectMode ? "crosshair" : enabled ? "move" : "default", touchAction:"none"}} opacity={online?1:0.58}>
        <text x={72} y={4} textAnchor="start" fill="#1e293b" style={{fontSize:14,fontWeight:850,pointerEvents:"none"}}>{name}</text>
        <rect x={-48} y={-16} width={70} height={34} rx={12} fill={motorFill} stroke={motorStroke} strokeWidth={tapSelected?4:2.3}/>
        {[-30,-14,2].map((x)=><line key={x} x1={x} y1={-13} x2={x} y2={15} stroke="#fff" strokeWidth={2} opacity={0.25} style={{pointerEvents:"none"}}/>)}
        <rect x={22} y={-9} width={12} height={18} rx={4} fill="#dbe3ea" stroke="#64748b" strokeWidth={1.5} style={{pointerEvents:"none"}}/>
        <circle cx={43} cy={5} r={18} fill="#f8fafc" stroke={motorStroke} strokeWidth={tapSelected?3.6:2.4} style={{pointerEvents:"none"}}/>
        <g transform="translate(43 5)" style={{pointerEvents:"none"}}>
          {[0,90,180,270].map((deg)=><path key={deg} d="M 0 -11 C 6 -10 9 -5 5 -1 L 0 0 Z" transform={`rotate(${deg})`} fill={running&&online?"#0ea5e9":"#94a3b8"}/>)}
          <circle r={3} fill={running&&online?"#0284c7":"#64748b"}/>
          {running&&online&&<animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="0.9s" repeatCount="indefinite"/>}
        </g>
        <rect x={-42} y={25} width={94} height={10} rx={3} fill="#e2e8f0" stroke="#64748b" strokeWidth={1.5} style={{pointerEvents:"none"}}/>
        <rect x={-23} y={41} width={46} height={16} rx={8} fill={statusFill} style={{pointerEvents:"none"}}/>
        <text x={0} y={53} textAnchor="middle" fill="#fff" style={{fontSize:10,fontWeight:900,pointerEvents:"none"}}>{statusText}</text>
      </g>
    );
  }

  return (
    <g transform={`translate(${n.x}, ${n.y})`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
      onMouseEnter={(e)=>showTip(e,{title:name,lines:tipLines})} onMouseMove={(e)=>showTip(e,{title:name,lines:tipLines})} onMouseLeave={hideTip} onClick={handleClick}
      style={{cursor: tapConnectMode ? "crosshair" : enabled ? "move" : "default", touchAction:"none"}} opacity={online?1:0.58}>
      <text x={48} y={-18} textAnchor="start" fill="#1e293b" style={{fontSize:14,fontWeight:850,pointerEvents:"none"}}>{name}</text>
      <rect x={-18} y={-36} width={36} height={48} rx={10} fill={motorFill} stroke={motorStroke} strokeWidth={tapSelected?4:2.2}/>
      <path d="M -18 -28 Q 0 -45 18 -28 L 18 -21 L -18 -21 Z" fill="#dbe3ea" stroke="#64748b" strokeWidth={1.5} style={{pointerEvents:"none"}}/>
      <circle cx={0} cy={20} r={17} fill="#f8fafc" stroke={motorStroke} strokeWidth={tapSelected?3.6:2.3} style={{pointerEvents:"none"}}/>
      <g transform="translate(0 20)" style={{pointerEvents:"none"}}>
        {[0,90,180,270].map((deg)=><path key={deg} d="M 0 -10 C 5 -9 8 -4 4 -1 L 0 0 Z" transform={`rotate(${deg})`} fill={running&&online?"#0ea5e9":"#94a3b8"}/>)}
        <circle r={3} fill={running&&online?"#0284c7":"#64748b"}/>
        {running&&online&&<animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="0.9s" repeatCount="indefinite"/>}
      </g>
      <rect x={-27} y={39} width={54} height={10} rx={3} fill="#e2e8f0" stroke="#64748b" strokeWidth={1.5} style={{pointerEvents:"none"}}/>
      <rect x={-23} y={54} width={46} height={16} rx={8} fill={statusFill} style={{pointerEvents:"none"}}/>
      <text x={0} y={66} textAnchor="middle" fill="#fff" style={{fontSize:10,fontWeight:900,pointerEvents:"none"}}>{statusText}</text>
    </g>
  );
}
