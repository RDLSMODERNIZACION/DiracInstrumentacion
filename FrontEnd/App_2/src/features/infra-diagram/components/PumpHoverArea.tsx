import React from "react";
import type { PumpNode } from "../types";

export default function PumpHoverArea({ pump, fallbackName = "Bomba", x, y, width, height, showTip, hideTip }: {
  pump?: PumpNode;
  fallbackName?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  showTip: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip: () => void;
}) {
  const running = ["run", "running", "on", "1", "true"].includes(String(pump?.state).toLowerCase());
  const title = pump?.name || fallbackName;
  const lines = [
    "Tipo: Bomba",
    `Estado: ${!pump ? "Sin datos" : pump.online !== true ? "Sin comunicación" : running ? "En marcha" : "Detenida"}`,
    ...(pump ? [`ID: ${pump.id}`] : []),
    ...(pump?.alarma ? [`Alarma: ${pump.alarma}`] : []),
  ];
  const hover = (e: React.MouseEvent) => {
    e.stopPropagation();
    showTip(e, { title, lines });
  };
  return <rect x={x} y={y} width={width} height={height} fill="none" pointerEvents="all"
    data-role="pump-hover-area" onMouseEnter={hover} onMouseMove={hover}
    onMouseLeave={(e) => { e.stopPropagation(); hideTip(); }}>
    <title>{title}</title>
  </rect>;
}
