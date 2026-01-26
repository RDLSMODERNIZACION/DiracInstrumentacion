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
  onDragEnd?: (x: number, y: number) => void; // ✅ ahora entrega la posición final
  showTip?: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip?: () => void;
  enabled: boolean;
  onClick?: () => void;
}) {
  const pos = getPos(n.id) ?? { x: n.x, y: n.y };

  const W = 150;
  const H = 70;

  const x0 = pos.x - W / 2;
  const y0 = pos.y - H / 2;

  const signals = (n as any).signals ?? null;

  const powerKW = useMemo(
    () => pickSignal(signals, ["power_kw", "kw", "p_kw", "active_power_kw", "active_power", "power"]),
    [signals]
  );
  const pf = useMemo(() => pickSignal(signals, ["pf", "cosphi", "cos_phi", "power_factor"]), [signals]);
  const kwhToday = useMemo(() => pickSignal(signals, ["kwh_today", "energy_today", "kwh_day"]), [signals]);

  function onMouseDown(e: React.MouseEvent<SVGGElement>) {
    if (!enabled) return;
    e.stopPropagation();
    onClick?.();

    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;

    const startSvg = clientToSvg(svg, e.clientX, e.clientY);
    if (!startSvg) return;

    const startPos = getPos(n.id) ?? { x: n.x, y: n.y };

    // ✅ guardamos el último valor calculado (NO dependemos del state)
    let last = { x: startPos.x, y: startPos.y };

    function onMove(ev: MouseEvent) {
      const curSvg = clientToSvg(svg, ev.clientX, ev.clientY);
      if (!curSvg) return;

      const dx = curSvg.x - startSvg.x;
      const dy = curSvg.y - startSvg.y;

      last = { x: startPos.x + dx, y: startPos.y + dy };
      setPos(n.id, last.x, last.y);
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);

      // ✅ guardamos con la posición real final
      onDragEnd?.(last.x, last.y);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const title = `Analizador de red`;
  const lines = [`kW: ${fmt(powerKW, 1)}`, `cosφ: ${fmt(pf, 2)}`, `hoy kWh: ${fmt(kwhToday, 0)}`];

  return (
    <g
      onMouseDown={onMouseDown}
      onMouseEnter={(e) => showTip?.(e, { title, lines })}
      onMouseLeave={() => hideTip?.()}
      style={{ cursor: enabled ? "move" : "pointer" }}
    >
      <rect x={x0} y={y0} width={W} height={H} rx={12} ry={12} fill="#ffffff" stroke="#cbd5e1" strokeWidth={1.2} />
      <text x={x0 + 10} y={y0 + 18} style={{ fontSize: 12, fontWeight: 700, fill: "#0f172a" }}>
        Analizador de red
      </text>

      <text x={x0 + 10} y={y0 + 38} style={{ fontSize: 12, fill: "#334155" }}>
        ⚡ {fmt(powerKW, 1)} kW
      </text>
      <text x={x0 + 10} y={y0 + 54} style={{ fontSize: 12, fill: "#334155" }}>
        cosφ {fmt(pf, 2)}
      </text>
      <text x={x0 + 90} y={y0 + 54} style={{ fontSize: 12, fill: "#334155" }}>
        hoy {fmt(kwhToday, 0)} kWh
      </text>
    </g>
  );
}
