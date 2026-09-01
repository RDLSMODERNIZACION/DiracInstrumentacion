import React, { useEffect, useMemo, useState } from "react";
import type { UINode } from "../../types";
import { API_BASE } from "@/lib/api";

function toNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(v: any, decimals = 1): string {
  const n = toNum(v);
  return n === null ? "--" : n.toFixed(decimals);
}

function firstNum(...values: any[]): number | null {
  for (const v of values) {
    const n = toNum(v);
    if (n !== null) return n;
  }
  return null;
}

// ABB M4M devuelve 0x7FFFFFFF para un signed 32-bit no disponible.
// Si el Node-RED viejo lo escala como kW termina llegando 21474.83647.
function isInvalidAbbStat(v: any): boolean {
  const n = toNum(v);
  if (n === null) return false;
  return Math.abs(n - 21474.83647) < 0.02 || n > 10000;
}

function pickSignal(signals: any, keys: string[]) {
  if (!signals) return null;
  for (const key of keys) {
    const v = signals[key];
    if (v === undefined || v === null) continue;
    if (typeof v === "object") {
      const n = firstNum(v.value, v.v, v.latest, v.raw_value);
      if (n !== null) return n;
    }
    const n = toNum(v);
    if (n !== null) return n;
  }
  return null;
}

function rawPick(raw: any, keys: string[]) {
  if (!raw) return null;
  for (const key of keys) {
    const n = firstNum(raw[key], raw?.data?.[key], raw?.values?.[key]);
    if (n !== null) return n;
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
  id?: number;
  analyzer_id?: number | null;
  ts?: string | null;
  p_kw?: number | null;
  avg_p_kw?: number | null;
  max_p_kw?: number | null;
  q_kvar?: number | null;
  s_kva?: number | null;
  pf?: number | null;
  hz?: number | null;
  v_l1l2?: number | null;
  v_l2l3?: number | null;
  v_l3l2?: number | null;
  v_l1l3?: number | null;
  v_l3l1?: number | null;
  i_l1?: number | null;
  i_l2?: number | null;
  i_l3?: number | null;
  raw?: any;
  source?: string | null;
};

type PumpEnergyRow = {
  pump_id: number;
  name: string;
  location_id?: number | null;
  potencia_kw?: number | null;
  tipo_arranque?: string | null;
  expected_power_kw?: number | null;
  last_state?: string | null;
  last_state_at?: string | null;
  valid_starts?: number | null;
  operating_kw_est?: number | null;
  operating_kw_sd?: number | null;
  avg_start_step_kw?: number | null;
  max_start_step_kw?: number | null;
};

type PumpEnergySummary = {
  analyzer?: {
    id: number;
    name?: string | null;
    location_name?: string | null;
    ts?: string | null;
    p_kw?: number | null;
    avg_p_kw?: number | null;
    max_p_kw?: number | null;
    pf?: number | null;
  };
  window_days: number;
  pumps: PumpEnergyRow[];
};

function extractAnalyzerId(n: UINode & any): number | null {
  const candidates = [n?.analyzer_id, n?.analyzerId, n?.analyzer?.id];
  for (const c of candidates) {
    const v = toNum(c);
    if (v !== null && v > 0) return Math.trunc(v);
  }
  const match = String(n?.id ?? "").match(/(\d+)/);
  if (match?.[1]) {
    const v = Number(match[1]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText}${txt ? ` - ${txt}` : ""}`);
  }
  return (await r.json()) as T;
}

export default function NetworkAnalyzerNodeView({
  n,
  getPos,
  setPos,
  onDragEnd,
  showTip,
  hideTip,
  enabled,
}: {
  n: UINode & {
    signals?: Record<string, any>;
    analyzer_id?: number | null;
    name?: string | null;
  };
  getPos: (id: string) => { x: number; y: number } | null;
  setPos: (id: string, x: number, y: number) => void;
  onDragEnd?: (x: number, y: number) => void;
  showTip?: (e: React.MouseEvent, content: { title: string; lines: string[] }) => void;
  hideTip?: () => void;
  enabled: boolean;
  onClick?: () => void;
}) {
  const pos = getPos(n.id) ?? { x: n.x, y: n.y };
  const CARD_W = 118;
  const CARD_H = 72;
  const PANEL_W = 460;
  const PANEL_GAP = 14;

  const x0 = pos.x - CARD_W / 2;
  const y0 = pos.y - CARD_H / 2;
  const analyzerId = useMemo(() => extractAnalyzerId(n), [n]);

  const [latest, setLatest] = useState<LatestReading | null>(null);
  const [latestErr, setLatestErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [energy, setEnergy] = useState<PumpEnergySummary | null>(null);
  const [energyErr, setEnergyErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ctrl: AbortController | null = null;

    async function tick() {
      if (!analyzerId) {
        if (alive) {
          setLatest(null);
          setLatestErr("missing analyzerId");
        }
        return;
      }
      ctrl = new AbortController();
      try {
        const row = await fetchJson<LatestReading>(
          `${API_BASE}/components/network_analyzers/${analyzerId}/latest?fields=full`,
          ctrl.signal
        );
        if (!alive) return;
        setLatest(row);
        setLatestErr(null);
      } catch (err: any) {
        if (!alive) return;
        setLatestErr(err?.message ?? String(err));
      } finally {
        if (alive) timer = setTimeout(tick, 2000);
      }
    }

    tick();
    return () => {
      alive = false;
      ctrl?.abort();
      if (timer) clearTimeout(timer);
    };
  }, [analyzerId]);

  useEffect(() => {
    if (!expanded || enabled || !analyzerId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ctrl: AbortController | null = null;

    async function tick() {
      ctrl = new AbortController();
      try {
        const row = await fetchJson<PumpEnergySummary>(
          `${API_BASE}/components/network_analyzers/${analyzerId}/pump-energy?days=30`,
          ctrl.signal
        );
        if (!alive) return;
        setEnergy(row);
        setEnergyErr(null);
      } catch (err: any) {
        if (!alive) return;
        setEnergyErr(err?.message ?? String(err));
      } finally {
        if (alive) timer = setTimeout(tick, 15000);
      }
    }

    tick();
    return () => {
      alive = false;
      ctrl?.abort();
      if (timer) clearTimeout(timer);
    };
  }, [expanded, enabled, analyzerId]);

  useEffect(() => {
    if (enabled) setExpanded(false);
  }, [enabled]);

  const ageSec = useMemo(() => {
    if (!latest?.ts) return null;
    const ms = Date.parse(latest.ts);
    if (!Number.isFinite(ms)) return null;
    return Math.max(0, Math.floor((Date.now() - ms) / 1000));
  }, [latest?.ts]);

  const online = ageSec !== null && ageSec <= 180;
  const signals = n.signals ?? null;
  const raw = latest?.raw ?? null;

  const pKW = firstNum(latest?.p_kw, rawPick(raw, ["p_kw", "power_kw"]), pickSignal(signals, ["p_kw", "power_kw", "kw"]));
  const avgPKWRaw = firstNum(latest?.avg_p_kw);
  const maxPKWRaw = firstNum(latest?.max_p_kw);
  const invalidAbbStats = isInvalidAbbStat(avgPKWRaw) || isInvalidAbbStat(maxPKWRaw);
  const avgPKW = invalidAbbStats ? null : avgPKWRaw;
  const maxPKW = invalidAbbStats ? null : maxPKWRaw;
  const qKvar = firstNum(latest?.q_kvar, rawPick(raw, ["q_kvar"]), pickSignal(signals, ["q_kvar", "kvar"]));
  const sKva = firstNum(latest?.s_kva, rawPick(raw, ["s_kva"]), pickSignal(signals, ["s_kva", "kva"]));
  const pf = firstNum(latest?.pf, rawPick(raw, ["pf", "power_factor"]), pickSignal(signals, ["pf", "power_factor"]));
  const hz = firstNum(latest?.hz, rawPick(raw, ["hz", "frequency"]), pickSignal(signals, ["hz", "frequency"]));
  const v12 = firstNum(latest?.v_l1l2, rawPick(raw, ["v_l1l2", "v12"]));
  const v23 = firstNum(latest?.v_l2l3, latest?.v_l3l2, rawPick(raw, ["v_l2l3", "v_l3l2", "v23"]));
  const v31 = firstNum(latest?.v_l3l1, latest?.v_l1l3, rawPick(raw, ["v_l3l1", "v_l1l3", "v31"]));
  const i1 = firstNum(latest?.i_l1, rawPick(raw, ["i_l1", "i1"]));
  const i2 = firstNum(latest?.i_l2, rawPick(raw, ["i_l2", "i2"]));
  const i3 = firstNum(latest?.i_l3, rawPick(raw, ["i_l3", "i3"]));

  const lowPf = pf !== null && pf < 0.96;
  const clockStatsUnavailable = online && (invalidAbbStats || avgPKW === null || maxPKW === null);
  const name = typeof n.name === "string" && n.name.trim() ? n.name.trim() : "Eléctrico";
  const border = !analyzerId
    ? "#ef4444"
    : !online
    ? "#94a3b8"
    : clockStatsUnavailable
    ? "#f59e0b"
    : lowPf
    ? "#f59e0b"
    : "#64748b";
  const powerColor = !online ? "#64748b" : "#0f172a";

  function onMouseDown(e: React.MouseEvent<SVGGElement>) {
    e.stopPropagation();
    if (!enabled) {
      setExpanded((v) => !v);
      return;
    }
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const startSvg = clientToSvg(svg, e.clientX, e.clientY);
    if (!startSvg) return;
    const startPos = getPos(n.id) ?? { x: n.x, y: n.y };
    let last = { x: startPos.x, y: startPos.y };

    function onMove(ev: MouseEvent) {
      const curSvg = clientToSvg(svg!, ev.clientX, ev.clientY);
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

  const tipLines = [
    `Actual: ${fmt(pKW, 1)} kW`,
    clockStatsUnavailable ? "⚠ Media/Máx ABB no disponibles · revisar fecha/hora" : "",
    avgPKW !== null ? `Media ABB: ${fmt(avgPKW, 1)} kW` : "Media ABB: --",
    maxPKW !== null ? `Máx ABB: ${fmt(maxPKW, 1)} kW` : "Máx ABB: --",
    pf !== null ? `FP: ${fmt(pf, 2)}${lowPf ? " (bajo)" : ""}` : "",
    online ? "Online" : "Sin comunicación",
  ].filter(Boolean);

  const pumps = energy?.pumps ?? [];
  const PANEL_H = 290 + Math.max(0, pumps.length) * 27;
  const panelX = x0 + CARD_W + PANEL_GAP;
  const panelY = y0 - 12;

  const metric = (label: string, value: number | null, unit: string, x: number, y: number, color = "#0f172a") => (
    <g key={`${label}-${x}-${y}`}>
      <text x={x} y={y} fill="#64748b" style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.5 }}>{label}</text>
      <text x={x} y={y + 20} fill={color} style={{ fontSize: 18, fontWeight: 950 }}>
        {value === null ? "--" : fmt(value, 1)}
      </text>
      <text x={x + 57} y={y + 20} fill="#64748b" style={{ fontSize: 9, fontWeight: 800 }}>{value === null ? "" : unit}</text>
    </g>
  );

  const smallRow = (label: string, value: number | null, unit: string, x: number, y: number, alarm = false) => (
    <g key={`${label}-${x}-${y}`}>
      <text x={x} y={y} fill="#64748b" style={{ fontSize: 10, fontWeight: 800 }}>{label}</text>
      <text x={x + 38} y={y} fill={alarm ? "#dc2626" : "#0f172a"} style={{ fontSize: 11, fontWeight: 900 }}>
        {value === null ? "--" : `${fmt(value, unit === "PF" ? 2 : 1)}${unit === "PF" ? "" : ` ${unit}`}`}
      </text>
    </g>
  );

  return (
    <g>
      <g
        onMouseDown={onMouseDown}
        onMouseEnter={(e) => showTip?.(e, { title: name, lines: tipLines })}
        onMouseLeave={() => hideTip?.()}
        style={{ cursor: enabled ? "move" : "pointer" }}
      >
        <rect x={x0} y={y0} width={CARD_W} height={CARD_H} rx={12} fill="#f8fafc" stroke={border} strokeWidth={clockStatsUnavailable || (lowPf && online) ? 2.4 : 1.6} />
        <text x={x0 + 12} y={y0 + 18} fill="#64748b" style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.7, pointerEvents: "none" }}>⚡ ELÉCTRICO</text>
        <text x={x0 + CARD_W / 2} y={y0 + 49} textAnchor="middle" fill={powerColor} style={{ fontSize: 22, fontWeight: 950, pointerEvents: "none" }}>{fmt(pKW, 1)}</text>
        <text x={x0 + CARD_W / 2} y={y0 + 63} textAnchor="middle" fill="#64748b" style={{ fontSize: 10, fontWeight: 800, pointerEvents: "none" }}>kW</text>
        <circle cx={x0 + CARD_W - 12} cy={y0 + 13} r={4} fill={!online ? "#94a3b8" : clockStatsUnavailable ? "#f59e0b" : lowPf ? "#f59e0b" : "#22c55e"} />
      </g>

      {expanded && !enabled && (
        <g>
          <rect x={panelX} y={panelY} width={PANEL_W} height={PANEL_H} rx={14} fill="#ffffff" stroke={clockStatsUnavailable ? "#f59e0b" : "#94a3b8"} strokeWidth={clockStatsUnavailable ? 2 : 1.4} onMouseDown={(e) => e.stopPropagation()} />

          <text x={panelX + 18} y={panelY + 25} fill="#0f172a" style={{ fontSize: 15, fontWeight: 950 }}>{name}</text>
          <text x={panelX + PANEL_W - 18} y={panelY + 25} textAnchor="end" fill={online ? "#16a34a" : "#94a3b8"} style={{ fontSize: 10, fontWeight: 900 }}>{online ? "ONLINE" : "OFFLINE"}</text>
          {clockStatsUnavailable && (
            <g>
              <rect x={panelX + PANEL_W - 168} y={panelY + 32} width={150} height={19} rx={9.5} fill="#fff7ed" stroke="#f59e0b" />
              <text x={panelX + PANEL_W - 93} y={panelY + 45} textAnchor="middle" fill="#b45309" style={{ fontSize: 8.5, fontWeight: 950 }}>⚠ REVISAR ABB · FECHA/HORA</text>
            </g>
          )}
          <line x1={panelX + 16} y1={panelY + 55} x2={panelX + PANEL_W - 16} y2={panelY + 55} stroke="#e2e8f0" />

          {metric("POTENCIA ACTUAL", pKW, "kW", panelX + 18, panelY + 75)}
          {metric("MEDIA ABB", avgPKW, "kW", panelX + 164, panelY + 75, avgPKW === null ? "#d97706" : "#0f172a")}
          {metric("MÁXIMO ABB", maxPKW, "kW", panelX + 310, panelY + 75, maxPKW === null ? "#d97706" : "#0f172a")}

          <line x1={panelX + 16} y1={panelY + 123} x2={panelX + PANEL_W - 16} y2={panelY + 123} stroke="#e2e8f0" />
          <text x={panelX + 18} y={panelY + 141} fill="#334155" style={{ fontSize: 10, fontWeight: 950 }}>RED</text>
          {smallRow("Q", qKvar, "kVAr", panelX + 18, panelY + 161)}
          {smallRow("S", sKva, "kVA", panelX + 122, panelY + 161)}
          {smallRow("PF", pf, "PF", panelX + 226, panelY + 161, lowPf)}
          {smallRow("Hz", hz, "Hz", panelX + 330, panelY + 161)}
          {smallRow("V12", v12, "V", panelX + 18, panelY + 182)}
          {smallRow("V23", v23, "V", panelX + 122, panelY + 182)}
          {smallRow("V31", v31, "V", panelX + 226, panelY + 182)}
          {smallRow("I1", i1, "A", panelX + 18, panelY + 203)}
          {smallRow("I2", i2, "A", panelX + 122, panelY + 203)}
          {smallRow("I3", i3, "A", panelX + 226, panelY + 203)}

          <line x1={panelX + 16} y1={panelY + 219} x2={panelX + PANEL_W - 16} y2={panelY + 219} stroke="#e2e8f0" />
          <text x={panelX + 18} y={panelY + 238} fill="#334155" style={{ fontSize: 10, fontWeight: 950 }}>BOMBAS ASOCIADAS · ANÁLISIS INDIVIDUAL (30 DÍAS)</text>

          {energyErr ? (
            <text x={panelX + 18} y={panelY + 262} fill="#dc2626" style={{ fontSize: 10, fontWeight: 800 }}>No se pudo cargar análisis de bombas</text>
          ) : pumps.length === 0 ? (
            <text x={panelX + 18} y={panelY + 262} fill="#94a3b8" style={{ fontSize: 10, fontWeight: 800 }}>Sin bombas asociadas a este analizador</text>
          ) : (
            pumps.map((pump, idx) => {
              const y = panelY + 262 + idx * 27;
              const run = String(pump.last_state ?? "").toLowerCase() === "run";
              return (
                <g key={pump.pump_id}>
                  <circle cx={panelX + 22} cy={y - 4} r={4} fill={run ? "#22c55e" : "#94a3b8"} />
                  <text x={panelX + 34} y={y} fill="#0f172a" style={{ fontSize: 10, fontWeight: 900 }}>{pump.name}</text>
                  <text x={panelX + 205} y={y} fill="#475569" style={{ fontSize: 10, fontWeight: 800 }}>
                    {pump.operating_kw_est == null ? "Potencia: --" : `Potencia: ${fmt(pump.operating_kw_est, 1)} kW`}
                  </text>
                  <text x={panelX + 320} y={y} fill="#475569" style={{ fontSize: 10, fontWeight: 800 }}>
                    {`Arranques válidos: ${pump.valid_starts ?? 0}`}
                  </text>
                  <text x={panelX + 34} y={y + 12} fill="#94a3b8" style={{ fontSize: 8.5, fontWeight: 700 }}>
                    {pump.avg_start_step_kw == null ? "Salto de arranque: --" : `Salto medio: +${fmt(pump.avg_start_step_kw, 1)} kW · máximo observado: +${fmt(pump.max_start_step_kw, 1)} kW`}
                  </text>
                </g>
              );
            })
          )}

          <text
            x={panelX + 18}
            y={panelY + PANEL_H - 14}
            fill={clockStatsUnavailable ? "#d97706" : lowPf ? "#d97706" : latestErr ? "#dc2626" : "#94a3b8"}
            style={{ fontSize: 9, fontWeight: 800 }}
          >
            {clockStatsUnavailable
              ? "Media/Máximo ABB no disponibles: revisar fecha y hora del analizador"
              : lowPf
              ? "Factor de potencia bajo (< 0.96)"
              : latestErr
              ? "Sin lectura reciente"
              : latest?.ts
              ? `Última lectura: ${new Date(latest.ts).toLocaleTimeString()}`
              : ""}
          </text>
        </g>
      )}
    </g>
  );
}
