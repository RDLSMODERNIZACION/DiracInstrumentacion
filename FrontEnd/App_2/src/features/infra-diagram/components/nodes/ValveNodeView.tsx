import React, { useId, useMemo } from "react";
import useNodeDragCommon from "../../useNodeDragCommon";
import type { ValveNode } from "../../types";

type ValveMeta = {
  model?: "2way" | "3way";
  rot?: 0 | 90 | 180 | 270;
  flipX?: boolean;
  ports?: Record<string, "open" | "closed">;
};

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

  const meta = (n as any).meta as ValveMeta | undefined;
  const model = (meta?.model ?? "2way") as "2way" | "3way";
  const rot = (meta?.rot ?? 0) as 0 | 90 | 180 | 270;
  const flipX = Boolean(meta?.flipX ?? false);
  const ports = meta?.ports ?? {};

  const r1Closed = ports?.R1 === "closed";
  const r2Closed = ports?.R2 === "closed";

  // Transform para que el símbolo acompañe a los puertos (getPortPos ya rota/flippea)
  // OJO: el order importa: primero rotar y después flip en el eje X del símbolo
  const xform = `rotate(${rot}) scale(${flipX ? -1 : 1} 1)`;

  // === dimensiones ===
  const W = 34; // ancho total del cuerpo
  const H = 18; // alto del cuerpo
  const halfW = W / 2;
  const halfH = H / 2;

  // === colores (industrial naranja) ===
  const stroke = "#f97316";
  const strokeDark = "#c2410c";
  const fillBase = "#fff7ed";
  const pipe = "#64748b";
  const closedPipe = "#94a3b8";

  const uid = useId().replace(/:/g, "_");
  const gradBody = `valveBodyGrad_${uid}`;
  const gradPipe = `pipeGrad_${uid}`;
  const shadow = `valveShadow_${uid}`;
  const shine = `valveShine_${uid}`;

  const tipLines: string[] = [
    model === "3way" ? "Tipo: válvula (3 vías)" : "Tipo: válvula (2 vías)",
    `Rot: ${rot}°`,
    `FlipX: ${flipX ? "sí" : "no"}`,
    model === "3way" ? `R2: ${r2Closed ? "cerrada" : "abierta"}` : "",
  ].filter(Boolean);

  // cuerpo base (gate)
  const leftTri = `${-halfW + 3},${-halfH} ${-halfW + 3},${halfH} -1,0`;
  const rightTri = `${halfW - 3},${-halfH} ${halfW - 3},${halfH} 1,0`;

  // volante con rayos
  const spokes = useMemo(() => {
    const outR = 5.6;
    const inR = 2.2;
    const cx = 0;
    const cy = -halfH - 16;
    const k = 6;
    const arr: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    for (let i = 0; i < k; i++) {
      const a = (Math.PI * 2 * i) / k;
      arr.push({
        x1: cx + Math.cos(a) * inR,
        y1: cy + Math.sin(a) * inR,
        x2: cx + Math.cos(a) * outR,
        y2: cy + Math.sin(a) * outR,
      });
    }
    return arr;
  }, [halfH]);

  // helper “X” para marcar salida cerrada
  const ClosedX = ({ x, y }: { x: number; y: number }) => (
    <g opacity={0.95}>
      <line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} stroke="#ef4444" strokeWidth={2.2} strokeLinecap="round" />
      <line x1={x - 5} y1={y + 5} x2={x + 5} y2={y - 5} stroke="#ef4444" strokeWidth={2.2} strokeLinecap="round" />
    </g>
  );

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
      style={{ cursor: enabled ? "move" : "default" }}
    >
      <defs>
        {/* sombra suave */}
        <filter id={shadow} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" floodColor="#000" floodOpacity="0.22" />
        </filter>

        {/* cuerpo con degradado */}
        <linearGradient id={gradBody} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="55%" stopColor={fillBase} stopOpacity="1" />
          <stop offset="100%" stopColor="#fed7aa" stopOpacity="1" />
        </linearGradient>

        {/* brillo superior del cuerpo */}
        <linearGradient id={shine} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        {/* caño con degradado metálico */}
        <linearGradient id={gradPipe} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#94a3b8" stopOpacity="1" />
          <stop offset="55%" stopColor={pipe} stopOpacity="1" />
          <stop offset="100%" stopColor="#475569" stopOpacity="1" />
        </linearGradient>
      </defs>

      {/* ✅ Todo el símbolo adentro del xform para rot/flip */}
      <g transform={xform}>
        {/* CAÑO */}
        <g filter={`url(#${shadow})`}>
          {/* Entrada / línea principal */}
          <rect
            x={-halfW - 18}
            y={-3.2}
            width={W + 36}
            height={6.4}
            rx={3.2}
            fill={`url(#${gradPipe})`}
            opacity={0.95}
          />
          {/* filete de luz */}
          <rect
            x={-halfW - 17}
            y={-2.6}
            width={W + 34}
            height={1.6}
            rx={0.8}
            fill="#ffffff"
            opacity={0.18}
          />

          {/* Si es 3 vías: agregamos la segunda salida (ramal inferior) */}
          {model === "3way" && (
            <>
              {/* ramal superior (R1) */}
              <line
                x1={halfW + 2}
                y1={0}
                x2={halfW + 18}
                y2={-12}
                stroke={r1Closed ? closedPipe : pipe}
                strokeWidth={6.2}
                strokeLinecap="round"
                opacity={r1Closed ? 0.55 : 0.95}
              />
              {/* ramal inferior (R2) */}
              <line
                x1={halfW + 2}
                y1={0}
                x2={halfW + 18}
                y2={12}
                stroke={r2Closed ? closedPipe : pipe}
                strokeWidth={6.2}
                strokeLinecap="round"
                opacity={r2Closed ? 0.55 : 0.95}
              />
              {/* X en la salida cerrada */}
              {r2Closed && <ClosedX x={halfW + 18} y={12} />}
              {r1Closed && <ClosedX x={halfW + 18} y={-12} />}
            </>
          )}
        </g>

        {/* CUERPO VÁLVULA */}
        <g filter={`url(#${shadow})`}>
          <polygon
            points={leftTri}
            fill={`url(#${gradBody})`}
            stroke={strokeDark}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <polygon
            points={rightTri}
            fill={`url(#${gradBody})`}
            stroke={strokeDark}
            strokeWidth={2}
            strokeLinejoin="round"
          />

          {/* brillo superior */}
          <path
            d={`M ${-halfW + 4} ${-halfH + 1} L ${-2} ${-2} L ${2} ${-2} L ${halfW - 4} ${-halfH + 1}`}
            fill="none"
            stroke={`url(#${shine})`}
            strokeWidth={3.2}
            strokeLinecap="round"
            opacity={0.9}
          />

          {/* centro con doble anillo */}
          <circle cx={0} cy={0} r={4.0} fill="#fff" opacity={0.65} />
          <circle cx={0} cy={0} r={3.0} fill="none" stroke={strokeDark} strokeWidth={1.8} opacity={0.85} />
          <circle cx={0} cy={0} r={1.8} fill={stroke} opacity={0.95} />

          {/* bonete */}
          <rect
            x={-5.2}
            y={-halfH - 6.8}
            width={10.4}
            height={6.8}
            rx={2.6}
            fill={`url(#${gradBody})`}
            stroke={strokeDark}
            strokeWidth={1.6}
          />

          {/* vástago */}
          <line
            x1={0}
            y1={-halfH - 6.6}
            x2={0}
            y2={-halfH - 12.5}
            stroke={strokeDark}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
        </g>

        {/* VOLANTE */}
        <g filter={`url(#${shadow})`}>
          <circle cx={0} cy={-halfH - 16} r={6.8} fill="#ffffff" stroke={strokeDark} strokeWidth={2} />
          <circle cx={0} cy={-halfH - 16} r={2.4} fill={fillBase} stroke={strokeDark} strokeWidth={1.6} />
          {spokes.map((s, i) => (
            <line
              key={i}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke={stroke}
              strokeWidth={1.6}
              strokeLinecap="round"
              opacity={0.95}
            />
          ))}
        </g>
      </g>

      {/* hit-area opcional */}
      {/* <rect x={-halfW-26} y={-halfH-30} width={W+52} height={H+60} fill="transparent" /> */}
    </g>
  );
}
