import React, { useEffect, useMemo, useState } from "react";
import type { UINode } from "../../types";

// ✅ Usa tu helper existente (ya lo usás en InfraDiagram)
import { fetchJSON } from "../../services/data";

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

type LatestReading = {
  id: number;
  analyzer_id: number | null;
  ts: string | null;

  p_kw: number | null;
  pf: number | null;

  e_kwh_import: number | null;
  e_kwh_export: number | null;

  // por si más adelante querés mostrar todo
  v_l1l2?: number | null;
  v_l3l2?: number | null;
  v_l1l3?: number | null;
  i_l1?: number | null;
  i_l2?: number | null;
  i_l3?: number | null;
  hz?: number | null;

  raw?: any;
  source?: string | null;
};

function extractAnalyzerId(n: UINode & any): number | null {
  // ✅ preferimos analyzer_id si existe
  const a = n?.analyzer_id ?? n?.analyzerId ?? n?.analyzer?.id;
  const na = toNum(a);
  if (na !== null && na > 0) return Math.trunc(na);

  // fallback: si el id del nodo es "1" o "001"
  const idNum = toNum(n?.id);
  if (idNum !== null && idNum > 0) return Math.trunc(idNum);

  // fallback si es algo tipo "NA-1"
  const m = String(n?.id ?? "").match(/(\d+)/);
  if (m?.[1]) {
    const k = Number(m[1]);
    return Number.isFinite(k) && k > 0 ? k : null;
  }

  return null;
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
  n: UINode & { signals?: Record<string, any>; analyzer_id?: number };
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

  const analyzerId = useMemo(() => extractAnalyzerId(n as any), [n]);

  // --------- ✅ Traer latest del backend (polling) ----------
  const [latest, setLatest] = useState<LatestReading | null>(null);
  const [latestErr, setLatestErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let t: any = null;

    async function tick() {
      if (!analyzerId) {
        if (alive) {
          setLatest(null);
          setLatestErr("missing analyzerId");
        }
        return;
      }

      try {
        const row = await fetchJSON(`/components/network_analyzers/${analyzerId}/latest`);
        if (!alive) return;
        setLatest(row as LatestReading);
        setLatestErr(null);
      } catch (e: any) {
        if (!alive) return;
        setLatestErr(e?.message ?? String(e));
        // mantenemos latest anterior si falla (no lo borramos)
      } finally {
        if (!alive) return;
        t = setTimeout(tick, 2000); // ✅ polling 2s
      }
    }

    tick();
    return () => {
      alive = false;
      if (t) clearTimeout(t);
    };
  }, [analyzerId]);

  // --------- ✅ Online / Offline por ts ----------
  const ageSec = useMemo(() => {
    const ts = latest?.ts;
    if (!ts) return null;
    const ms = Date.parse(ts);
    if (!Number.isFinite(ms)) return null;
    const diff = Date.now() - ms;
    return Math.floor(diff / 1000);
  }, [latest?.ts]);

  const online = useMemo(() => {
    if (ageSec === null) return false;
    return ageSec <= 180; // 3 minutos
  }, [ageSec]);

  const signals = (n as any).signals ?? null;

  // ✅ Valores: primero latest del backend, si no hay -> señales locales fallback
  const powerKW = useMemo(() => {
    const v = toNum(latest?.p_kw);
    if (v !== null) return v;
    return pickSignal(signals, ["power_kw", "kw", "p_kw", "active_power_kw", "active_power", "power"]);
  }, [latest?.p_kw, signals]);

  const pf = useMemo(() => {
    const v = toNum(latest?.pf);
    if (v !== null) return v;
    return pickSignal(signals, ["pf", "cosphi", "cos_phi", "power_factor"]);
  }, [latest?.pf, signals]);

  // ✅ Row 3: por ahora mostramos kWh import (total import)
  const kwh = useMemo(() => {
    const v = toNum(latest?.e_kwh_import);
    if (v !== null) return v;
    // fallback a nombres viejos si existieran en signals
    return pickSignal(signals, ["kwh", "kwh_import", "energy_kwh", "e_kwh_import"]);
  }, [latest?.e_kwh_import, signals]);

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
  const vKWh = fmt(kwh, 0);

  // ✅ Layout fijo (no se corre)
  const labelX = x0 + 20;
  const unitRight = x0 + W - 18;
  const valueX = unitRight - 28;

  const row1Y = y0 + 34;
  const row2Y = y0 + 66;
  const row3Y = y0 + 96;

  const border = !analyzerId ? "#ef4444" : online ? "#1e293b" : "#f59e0b"; // rojo si no hay id, amarillo offline

  const tipLines = [
    `kW: ${vKW}`,
    `cosφ: ${vPF}`,
    `kWh: ${vKWh}`,
    analyzerId ? `analyzer_id: ${analyzerId}` : `analyzer_id: --`,
    ageSec !== null ? `age: ${ageSec}s` : `age: --`,
    latestErr ? `err: ${latestErr}` : "",
  ].filter(Boolean) as string[];

  return (
    <g
      onMouseDown={onMouseDown}
      onMouseEnter={(e) =>
        showTip?.(e, {
          title: "Eléctrico",
          lines: tipLines,
        })
      }
      onMouseLeave={() => hideTip?.()}
      style={{ cursor: enabled ? "move" : "pointer" }}
    >
      <defs>
        <filter id={`shadow-${n.id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.35" />
        </filter>

        <linearGradient id={`bg-${n.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#020617" stopOpacity="0.78" />
          <stop offset="100%" stopColor="#020617" stopOpacity="0.58" />
        </linearGradient>

        <linearGradient id={`boltFade-${n.id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#facc15" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#facc15" stopOpacity="0.03" />
        </linearGradient>

        <g id={`boltBg-${n.id}`}>
          <path d="M40 0 L10 60 H45 L30 120 L110 40 H70 L90 0 Z" fill={`url(#boltFade-${n.id})`} />
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
        stroke={border}
        strokeWidth={1.4}
        filter={`url(#shadow-${n.id})`}
      />

      {/* ⚡ rayo de fondo */}
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

      {/* Row 3: kWh */}
      <text x={labelX} y={row3Y} style={{ fontSize: 16, fill: "#e2e8f0", fontWeight: 800 }}>
        kWh
      </text>
      <text x={valueX} y={row3Y} textAnchor="end" style={{ fontSize: 18, fill: "#f8fafc", fontWeight: 950 }}>
        {vKWh}
      </text>
      <text x={unitRight} y={row3Y} textAnchor="end" style={{ fontSize: 13, fill: "#94a3b8", fontWeight: 800 }}>
        kWh
      </text>

      {/* indicador sutil offline */}
      {!online && analyzerId ? (
        <text
          x={x0 + W - 14}
          y={y0 + 18}
          textAnchor="end"
          style={{ fontSize: 10, fill: "#fbbf24", fontWeight: 900, letterSpacing: 0.5 }}
        >
          OFF
        </text>
      ) : null}
    </g>
  );
}
