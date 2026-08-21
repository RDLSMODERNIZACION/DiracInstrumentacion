import React from "react";
import type { PumpPipeTap } from "../services/pumpTaps";
import type { UINode } from "../types";

function run(n?: UINode) {
  if (!n) return false;
  const s = String((n as any).state ?? "").toLowerCase();
  return ["run", "running", "on", "1", "true"].includes(s) && (n as any).online !== false;
}

type PumpOrientation = "vertical" | "horizontal";

export default function PumpPipeTapView({
  tap,
  pump,
  visiblePoint = false,
}: {
  tap: PumpPipeTap;
  pump?: UINode;
  visiblePoint?: boolean;
}) {
  if (!pump) return null;

  const on = run(pump);
  const px = Number(pump.x);
  const py = Number(pump.y);
  const ex = Number(tap.x);
  const ey = Number(tap.y);

  if (![px, py, ex, ey].every(Number.isFinite)) return null;

  const orientation: PumpOrientation =
    ((pump as any).orientacion as PumpOrientation) ||
    ((pump as any).meta?.orientation as PumpOrientation) ||
    ((pump as any).orientation as PumpOrientation) ||
    "vertical";

  const dx = ex - px;
  const dy = ey - py;

  let d = "";

  if (orientation === "vertical") {
    /*
     * BOMBA VERTICAL:
     * La cañería definitiva entra/sale SIEMPRE horizontal.
     *
     * Antes:
     *   bomba ──┐
     *           └──── cañería
     *
     * Ahora:
     *   bomba ───────── cañería
     *
     * El punto de arranque se coloca sobre el lateral de la bomba
     * a la misma altura exacta del tap. Así desaparece el escalón.
     */
    const sideX = px + (dx >= 0 ? 18 : -18);

    // Limita el punto de entrada al cuerpo visual de la bomba.
    const minY = py - 30;
    const maxY = py + 32;
    const startY = Math.max(minY, Math.min(maxY, ey));

    // Si el tap cae dentro de la altura de la bomba: línea 100% recta.
    if (Math.abs(ey - startY) < 0.01) {
      d = `M ${sideX} ${ey} L ${ex} ${ey}`;
    } else {
      // Caso extremo: un solo codo, pegado al cuerpo, nunca en mitad del ramal.
      const elbowX = sideX + (dx >= 0 ? 10 : -10);
      d = `M ${sideX} ${startY} L ${elbowX} ${startY} L ${elbowX} ${ey} L ${ex} ${ey}`;
    }
  } else {
    /*
     * BOMBA HORIZONTAL:
     * Priorizamos salida lateral recta.
     * Si está prácticamente alineada con el tap, queda una sola línea.
     */
    const sideX = px + (dx >= 0 ? 62 : -50);

    if (Math.abs(dy) <= 10) {
      d = `M ${sideX} ${ey} L ${ex} ${ey}`;
    } else {
      const elbowX = sideX + (dx >= 0 ? 12 : -12);
      d = `M ${sideX} ${py} L ${elbowX} ${py} L ${elbowX} ${ey} L ${ex} ${ey}`;
    }
  }

  const off = tap.mode === "inject" ? -42 : 42;

  return (
    <g style={{ pointerEvents: "none" }}>
      <path
        d={d}
        fill="none"
        stroke="#64748b"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.82}
      />

      {on && (
        <path
          d={d}
          fill="none"
          stroke="#0ea5e9"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="8 12"
        >
          <animate
            attributeName="stroke-dashoffset"
            from={0}
            to={off}
            dur="0.65s"
            repeatCount="indefinite"
          />
        </path>
      )}

      <circle
        cx={ex}
        cy={ey}
        r={visiblePoint ? 7 : 4.2}
        fill={on ? "#0ea5e9" : "#475569"}
        stroke="#fff"
        strokeWidth={1.8}
      />

      {visiblePoint && (
        <circle
          cx={ex}
          cy={ey}
          r={11}
          fill="none"
          stroke="#38bdf8"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      )}
    </g>
  );
}
