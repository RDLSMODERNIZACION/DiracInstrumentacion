import React, { useMemo } from "react";
import type { UINode } from "../../types";

function toNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(v: any, decimals = 1): string {
  const n = toNum(v);
  if (n === null) return "--";
  return n.toFixed(decimals);
}

function pickSignal(signals: any, keys: string[]) {
  if (!signals) return null;
  for (const k of keys) {
    if (signals[k] !== undefined && signals[k] !== null) return signals[k];
  }
  return null;
}

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

export default function NetworkAnalyzerNodeView({
  n,
  getPos,
  setPos,
  onDragEnd,
  showTip,
  hideTip,
  enabled,
  onClick,
}: {
  n: UINode & { signals?: Record<string, any> };
  getPos: (id: string) => { x: number; y: number } | null;
  setPos: (id: string, x: number, y: number) => void;
  onDragEnd?: (x: number, y: number) => void;
  showTip?: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip?: () => void;
  enabled: boolean;
  onClick?: () => void;
}) {
  const pos = getPos(n.id) ?? { x: n.x, y: n.y };

  // ✅ Compacto y legible (no largo)
  const W = 190;
  const H = 120;

  const x0 = pos.x - W / 2;
  const y0 = pos.y - H / 2;

  const signals = (n as any).signals ?? null;

  const powerKW = useMemo(
    () => pickSignal(signals, ["power_kw", "kw", "p_kw", "active_power_kw", "active_power", "power"]),
    [signals]
  );
  const pf = useMemo(() => pickSignal(signals, ["pf", "cosphi", "cos_phi", "power_factor"]), [signals]);

  // ✅ nuevo: kWh/mes (usa varios nombres posibles)
  const kwhMonth = useMemo(
    () =>
      pickSignal(signals, [
        "kwh_month",
        "energy_month",
        "kwh_mes",
        "kwh_monthly",
        "kwh_mtd",
        "mtd_kwh",
      ]),
    [signals]
  );

  function onMouseDown(e: React.MouseEvent<SVGGElement>) {
    if (!enabled) return;
    e.stopPropagation();
    onClick?.();

    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;

    const startSvg = clientToSvg(svg, e.clientX, e.clientY);
    if (!startSvg) return;

    const startPos = getPos(n.id) ?? { x: n.x, y: n.y };
    let last = { x: startPos.x, y: startPos.y };

    function onMove(ev: MouseEvent) {
      const curSvg = clientToSvg(svg, ev.clientX, ev.clientY);
      if (!curSvg) return;

      last = {
        x: startPos.x + (curSvg.x - startSvg.x),
        y: startPos.y + (curSvg.y - startSvg.y),
      };
      setPos(n.id, last.x, last.y);
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      onDragEnd?.(last.x, last.y);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const vKW = fmt(powerKW, 1);
  const vPF = fmt(pf, 2);
  const vKWhM = fmt(kwhMonth, 0);

  // ✅ Layout fijo (no se corre)
  const labelX = x0 + 20;
  const unitRight = x0 + W - 18; // unidades al borde derecho
  const valueX = unitRight - 28; // valores un poquito antes de la unidad

  const row1Y = y0 + 34;
  const row2Y = y0 + 66;
  const row3Y = y0 + 96;

  return (
    <g
      onMouseDown={onMouseDown}
      onMouseEnter={(e) =>
        showTip?.(e, {
          title: "Eléctrico",
          lines: [`kW: ${vKW}`, `cosφ: ${vPF}`, `kWh/mes: ${vKWhM}`],
        })
      }
      onMouseLeave={() => hideTip?.()}
      style={{ cursor: enabled ? "move" : "pointer" }}
    >
      <defs>
        {/* sombra suave */}
        <filter id={`shadow-${n.id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.35" />
        </filter>

        {/* fondo oscuro translúcido (no impacta tanto) */}
        <linearGradient id={`bg-${n.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#020617" stopOpacity="0.78" />
          <stop offset="100%" stopColor="#020617" stopOpacity="0.58" />
        </linearGradient>

        {/* rayo grande de fondo, MUY suave */}
        <linearGradient id={`boltFade-${n.id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#facc15" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#facc15" stopOpacity="0.03" />
        </linearGradient>

        <g id={`boltBg-${n.id}`}>
          <path
            d="M40 0 L10 60 H45 L30 120 L110 40 H70 L90 0 Z"
            fill={`url(#boltFade-${n.id})`}
          />
        </g>
      </defs>

      {/* Card */}
      <rect
        x={x0}
        y={y0}
        width={W}
        height={H}
        rx={16}
        ry={16}
        fill={`url(#bg-${n.id})`}
        stroke="#1e293b"
        strokeWidth={1.2}
        filter={`url(#shadow-${n.id})`}
      />

      {/* ⚡ rayo de fondo (no afecta el layout) */}
      <g transform={`translate(${x0 + 52}, ${y0 + 10}) scale(0.85)`}>
        <use href={`#boltBg-${n.id}`} />
      </g>

      {/* Row 1: kW */}
      <text x={labelX} y={row1Y} style={{ fontSize: 16, fill: "#e2e8f0", fontWeight: 800 }}>
        kW
      </text>
      <text x={valueX} y={row1Y} textAnchor="end" style={{ fontSize: 20, fill: "#f8fafc", fontWeight: 950 }}>
        {vKW}
      </text>
      <text x={unitRight} y={row1Y} textAnchor="end" style={{ fontSize: 13, fill: "#94a3b8", fontWeight: 800 }}>
        kW
      </text>

      {/* Row 2: cosφ */}
      <text x={labelX} y={row2Y} style={{ fontSize: 16, fill: "#e2e8f0", fontWeight: 800 }}>
        cosφ
      </text>
      <text x={unitRight} y={row2Y} textAnchor="end" style={{ fontSize: 18, fill: "#f8fafc", fontWeight: 950 }}>
        {vPF}
      </text>

      {/* Row 3: kWh/mes */}
      <text x={labelX} y={row3Y} style={{ fontSize: 16, fill: "#e2e8f0", fontWeight: 800 }}>
        kWh/mes
      </text>
      <text x={valueX} y={row3Y} textAnchor="end" style={{ fontSize: 18, fill: "#f8fafc", fontWeight: 950 }}>
        {vKWhM}
      </text>
      <text x={unitRight} y={row3Y} textAnchor="end" style={{ fontSize: 13, fill: "#94a3b8", fontWeight: 800 }}>
        kWh
      </text>
    </g>
  );
}
