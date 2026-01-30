import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
} from "recharts";

import { getApiRoot, getApiHeaders } from "@/lib/config";

type Props = { analyzerId?: number };

type LatestReading = {
  id: number;
  analyzer_id: number | null;
  ts: string | null;
  p_kw: number | null;
  pf: number | null;
  source?: string | null;
};

type LivePoint = { t: string; kw: number; pf: number | null };

type KpiMinuteRow = {
  ts: string;
  kw_avg: number | null;
  kw_max: number | null;
  pf_avg: number | null;
  pf_min: number | null;
  samples: number | null;
};

type KpiDayRow = {
  ts: string; // YYYY-MM-DD
  kwh_est: number | null;
  kw_avg: number | null;
  kw_max: number | null;
  pf_avg: number | null;
  pf_min: number | null;
  samples: number | null;
};

function toNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
}
function fmt(v: any, decimals = 2, unit = ""): string {
  const n = toNum(v);
  if (n === null) return `--${unit}`;
  return `${n.toFixed(decimals)}${unit}`;
}
function fmt1(v: any, unit = ""): string {
  const n = toNum(v);
  if (n === null) return `--${unit}`;
  return `${n.toFixed(1)}${unit}`;
}
function absKw(v: any): number | null {
  const n = toNum(v);
  if (n === null) return null;
  return Math.abs(n);
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(dateStr: string, delta: number) {
  const d = new Date(dateStr + "T00:00:00.000");
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

// TZ Argentina
const AR_TZ = "America/Argentina/Buenos_Aires";

function startOfDayISO_AR(dateStr: string) {
  return `${dateStr}T00:00:00-03:00`;
}
function endOfDayISO_AR(dateStr: string) {
  return `${dateStr}T23:59:59.999-03:00`;
}
function dayStartMs_AR(dateStr: string) {
  return Date.parse(`${dateStr}T00:00:00-03:00`);
}
function dayEndMs_AR(dateStr: string) {
  return dayStartMs_AR(dateStr) + 24 * 60 * 60 * 1000;
}
function fmtTimeFromMs_AR(ms: number) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "--:--";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: AR_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function monthRange(monthStr: string) {
  const [y, m] = monthStr.split("-").map((x) => Number(x));
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { start: isoDate(start), end: isoDate(end) };
}
function prevMonth(monthStr: string) {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function nextMonth(monthStr: string) {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function fetchLatestNoScope(analyzerId: number, signal?: AbortSignal): Promise<LatestReading> {
  const root = getApiRoot();
  const url = `${root}/components/network_analyzers/${analyzerId}/latest?fields=lite`;
  const r = await fetch(url, {
    method: "GET",
    headers: getApiHeaders({ "Content-Type": undefined as any }),
    cache: "no-store",
    signal,
  });
  if (r.status === 404) throw new Error("SIN_LECTURAS");
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText}${txt ? ` - ${txt}` : ""}`);
  }
  return (await r.json()) as LatestReading;
}

async function fetchHistory(
  analyzerId: number,
  params: { from: string; to: string; granularity: "minute" | "day" },
  signal?: AbortSignal
): Promise<any> {
  const root = getApiRoot();
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
    granularity: params.granularity,
  }).toString();

  const url = `${root}/components/network_analyzers/${analyzerId}/history?${qs}`;
  const r = await fetch(url, {
    method: "GET",
    headers: getApiHeaders({ "Content-Type": "application/json" as any }),
    cache: "no-store",
    signal,
  });

  if (r.status === 404) throw new Error("SIN_HISTORIA");
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText}${txt ? ` - ${txt}` : ""}`);
  }
  return await r.json();
}

type Mode = "live" | "day" | "month";

function SoftBadge({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${
        ok ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"
      }`}
    >
      {text}
    </span>
  );
}

function clamp01(x: number) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export default function EnergyEfficiencyPage({ analyzerId: initialAnalyzerId = 1 }: Props) {
  const [analyzerId, setAnalyzerId] = useState<number>(initialAnalyzerId);
  const [mode, setMode] = useState<Mode>("live");

  const today = useMemo(() => isoDate(new Date()), []);
  const thisMonth = useMemo(() => today.slice(0, 7), [today]);

  const [selectedDay, setSelectedDay] = useState<string>(today);
  const [selectedMonth, setSelectedMonth] = useState<string>(thisMonth);

  // ALERT CONFIG (mes)
  const [pfThreshold, setPfThreshold] = useState<number>(0.85);
  const [spikePct, setSpikePct] = useState<number>(25);

  // TARIFA
  const [tariffArsPerKwh, setTariffArsPerKwh] = useState<number>(0);

  useEffect(() => {
    const t = localStorage.getItem("dirac.tariff_ars_kwh");
    const p = localStorage.getItem("dirac.pf_threshold");
    const s = localStorage.getItem("dirac.kwh_spike_pct");
    if (t) {
      const n = Number(t);
      if (Number.isFinite(n)) setTariffArsPerKwh(n);
    }
    if (p) {
      const n = Number(p);
      if (Number.isFinite(n)) setPfThreshold(clamp01(n));
    }
    if (s) {
      const n = Number(s);
      if (Number.isFinite(n)) setSpikePct(Math.max(0, n));
    }
  }, []);

  useEffect(() => localStorage.setItem("dirac.tariff_ars_kwh", String(tariffArsPerKwh)), [tariffArsPerKwh]);
  useEffect(() => localStorage.setItem("dirac.pf_threshold", String(pfThreshold)), [pfThreshold]);
  useEffect(() => localStorage.setItem("dirac.kwh_spike_pct", String(spikePct)), [spikePct]);

  // LIVE state
  const [latest, setLatest] = useState<LatestReading | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [series, setSeries] = useState<LivePoint[]>([]);

  // HIST state
  const [histError, setHistError] = useState<string | null>(null);
  const [dayRows, setDayRows] = useState<KpiMinuteRow[]>([]);
  const [monthRows, setMonthRows] = useState<KpiDayRow[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  function resetAll() {
    setLatest(null);
    setLiveError(null);
    setSeries([]);
    setHistError(null);
    setDayRows([]);
    setMonthRows([]);
    setLoadingHist(false);
  }

  // Polling LIVE
  useEffect(() => {
    if (mode !== "live") return;
    let alive = true;
    const ctrl = new AbortController();
    let t: any;

    async function tick() {
      try {
        const row = await fetchLatestNoScope(analyzerId, ctrl.signal);
        if (!alive) return;

        setLatest(row);
        setLiveError(null);

        const ts = row.ts ?? new Date().toISOString();
        const kw = absKw(row.p_kw) ?? 0;
        const pf = toNum(row.pf);

        setSeries((prev) => {
          const next = [...prev, { t: ts, kw, pf }];
          if (next.length > 300) next.splice(0, next.length - 300);
          return next;
        });
      } catch (e: any) {
        if (!alive) return;
        if (String(e?.message).includes("SIN_LECTURAS")) {
          setLatest(null);
          setLiveError("Sin lecturas todavía.");
        } else {
          setLiveError(e?.message ?? String(e));
        }
      } finally {
        if (!alive) return;
        t = setTimeout(tick, 2000);
      }
    }

    tick();
    return () => {
      alive = false;
      ctrl.abort();
      if (t) clearTimeout(t);
    };
  }, [analyzerId, mode]);

  // Fetch HIST
  useEffect(() => {
    if (mode === "live") return;

    let alive = true;
    const ctrl = new AbortController();

    async function run() {
      try {
        setLoadingHist(true);
        setHistError(null);

        if (mode === "day") {
          const from = startOfDayISO_AR(selectedDay);
          const to = endOfDayISO_AR(selectedDay);

          const json = await fetchHistory(analyzerId, { from, to, granularity: "minute" }, ctrl.signal);
          const arr = Array.isArray(json) ? json : json?.points ?? [];

          const pts: KpiMinuteRow[] = (arr || [])
            .map((r: any) => ({
              ts: String(r.ts ?? r.minute_ts ?? r.t),
              kw_avg: toNum(r.kw_avg),
              kw_max: toNum(r.kw_max),
              pf_avg: toNum(r.pf_avg),
              pf_min: toNum(r.pf_min),
              samples: toNum(r.samples) as any,
            }))
            .filter((r) => !!r.ts);

          if (!alive) return;
          setDayRows(pts);
          setMonthRows([]);
        }

        if (mode === "month") {
          const { start, end } = monthRange(selectedMonth);
          const from = startOfDayISO_AR(start);
          const to = endOfDayISO_AR(end);

          const json = await fetchHistory(analyzerId, { from, to, granularity: "day" }, ctrl.signal);
          const arr = Array.isArray(json) ? json : json?.points ?? json?.days ?? [];

          const pts: KpiDayRow[] = (arr || [])
            .map((r: any) => ({
              ts: String(r.ts ?? r.day_ts ?? r.day),
              kwh_est: toNum(r.kwh_est ?? r.kwh),
              kw_avg: toNum(r.kw_avg),
              kw_max: toNum(r.kw_max),
              pf_avg: toNum(r.pf_avg),
              pf_min: toNum(r.pf_min),
              samples: toNum(r.samples) as any,
            }))
            .filter((r) => !!r.ts);

          if (!alive) return;
          setMonthRows(pts);
          setDayRows([]);
        }
      } catch (e: any) {
        if (!alive) return;
        if (String(e?.message).includes("SIN_HISTORIA")) setHistError("Sin histórico para ese período.");
        else setHistError(e?.message ?? String(e));
      } finally {
        if (!alive) return;
        setLoadingHist(false);
      }
    }

    run();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [mode, analyzerId, selectedDay, selectedMonth]);

  // -------------------
  // LIVE chart
  // -------------------
  const liveChartData = useMemo(
    () =>
      series.map((p) => ({
        t: fmtTimeFromMs_AR(Date.parse(p.t)),
        kw: p.kw,
        pf: p.pf ?? undefined,
      })),
    [series]
  );

  // -------------------
  // DAY chart (FIXED)
  // - x: timestamp ms (numérico)
  // - kw: valor de ese minuto (no promedio general)
  // - Línea vertical en el máximo del día
  // -------------------
  const dayDomain = useMemo(() => {
    const start = dayStartMs_AR(selectedDay);
    const end = dayEndMs_AR(selectedDay);
    return { start, end };
  }, [selectedDay]);

  const dayChartData = useMemo(() => {
    const pts = dayRows
      .map((r) => {
        const x = Date.parse(r.ts);
        const kw = toNum(r.kw_avg);
        if (!Number.isFinite(x) || typeof kw !== "number") return null;
        return { x, kw };
      })
      .filter(Boolean) as Array<{ x: number; kw: number }>;

    pts.sort((a, b) => a.x - b.x);

    // estira el eje a 00:00–24:00 aunque falten datos en extremos
    return [
      { x: dayDomain.start, kw: pts.length ? pts[0].kw : 0 },
      ...pts,
      { x: dayDomain.end, kw: pts.length ? pts[pts.length - 1].kw : 0 },
    ];
  }, [dayRows, dayDomain.start, dayDomain.end]);

  const dayMaxPoint = useMemo(() => {
    let best: { x: number; kw: number } | null = null;
    for (const p of dayChartData) {
      if (!best || p.kw > best.kw) best = p;
    }
    return best;
  }, [dayChartData]);

  // -------------------
  // DAY KPIs
  // -------------------
  const dayKwAvg = useMemo(() => {
    const vals = dayRows.map((r) => toNum(r.kw_avg)).filter((x): x is number => typeof x === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [dayRows]);

  const dayPfMin = useMemo(() => {
    const vals = dayRows.map((r) => toNum(r.pf_min)).filter((x): x is number => typeof x === "number");
    return vals.length ? Math.min(...vals) : null;
  }, [dayRows]);

  const dayPfAvg = useMemo(() => {
    const vals = dayRows.map((r) => toNum(r.pf_avg)).filter((x): x is number => typeof x === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [dayRows]);

  // -------------------
  // MONTH (igual que antes)
  // -------------------
  const monthChartData = useMemo(() => {
    return monthRows.map((r) => ({
      day: String(r.ts).slice(8, 10),
      date: String(r.ts).slice(0, 10),
      kwh: r.kwh_est ?? undefined,
      pf: r.pf_avg ?? undefined,
      kw_max: r.kw_max ?? undefined,
      kw_avg: r.kw_avg ?? undefined,
    }));
  }, [monthRows]);

  const monthKwhTotal = useMemo(() => {
    const vals = monthRows.map((r) => r.kwh_est).filter((x): x is number => typeof x === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }, [monthRows]);

  const monthKwhAvg = useMemo(() => {
    const vals = monthRows.map((r) => r.kwh_est).filter((x): x is number => typeof x === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [monthRows]);

  const monthPfAvg = useMemo(() => {
    const vals = monthRows.map((r) => r.pf_avg).filter((x): x is number => typeof x === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [monthRows]);

  const monthPeak = useMemo(() => {
    let best: { date: string; kwh: number } | null = null;
    for (const r of monthChartData) {
      const kwh = toNum(r.kwh);
      if (typeof kwh !== "number") continue;
      if (!best || kwh > best.kwh) best = { date: r.date, kwh };
    }
    return best;
  }, [monthChartData]);

  const monthCost = useMemo(() => {
    if (monthKwhTotal == null) return null;
    if (!Number.isFinite(tariffArsPerKwh) || tariffArsPerKwh <= 0) return null;
    return monthKwhTotal * tariffArsPerKwh;
  }, [monthKwhTotal, tariffArsPerKwh]);

  const kwhSpikeThreshold = useMemo(() => {
    if (monthKwhAvg == null) return null;
    return monthKwhAvg * (1 + spikePct / 100);
  }, [monthKwhAvg, spikePct]);

  function barKind(row: any): "normal" | "pf" | "kwh" | "both" {
    const pf = toNum(row?.pf);
    const kwh = toNum(row?.kwh);
    const lowPf = typeof pf === "number" && pf < pfThreshold;
    const highKwh = typeof kwh === "number" && typeof kwhSpikeThreshold === "number" && kwh > kwhSpikeThreshold;
    if (lowPf && highKwh) return "both";
    if (lowPf) return "pf";
    if (highKwh) return "kwh";
    return "normal";
  }
  function barFill(kind: ReturnType<typeof barKind>) {
    if (kind === "both") return "#fecaca";
    if (kind === "pf") return "#fde68a";
    if (kind === "kwh") return "#bfdbfe";
    return "#e5e7eb";
  }

  const kwNow = useMemo(() => absKw(latest?.p_kw), [latest?.p_kw]);
  const pfNow = useMemo(() => toNum(latest?.pf), [latest?.pf]);
  const liveKwMax = useMemo(() => (series.length ? Math.max(...series.map((x) => x.kw)) : null), [series]);

  const statusText = useMemo(() => {
    const err = mode === "live" ? liveError : histError;
    if (err) return { ok: false, text: err };
    if (mode !== "live" && loadingHist) return { ok: true, text: "Cargando…" };
    return { ok: true, text: "OK" };
  }, [mode, liveError, histError, loadingHist]);

  // Tooltip de DÍA: muestra el valor exacto del punto (kw) y la hora AR
  const dayTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    const x = Number(d?.x);
    const kw = toNum(d?.kw);
    return (
      <div className="bg-white border rounded-xl p-2 shadow-sm text-xs space-y-1">
        <div className="font-medium">{fmtTimeFromMs_AR(x)}</div>
        <div>
          kW: <span className="font-medium">{fmt(kw, 2, " kW")}</span>
        </div>
      </div>
    );
  };

  const monthTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    const kwh = toNum(d?.kwh);
    const pf = toNum(d?.pf);
    const date = d?.date ?? label;

    const cost = typeof kwh === "number" && tariffArsPerKwh > 0 ? kwh * tariffArsPerKwh : null;
    const kind = barKind(d);

    return (
      <div className="bg-white border rounded-xl p-2 shadow-sm text-xs space-y-1">
        <div className="font-medium">{date}</div>
        <div>
          Energía: <span className="font-medium">{fmt(kwh, 2, " kWh")}</span>
        </div>
        <div>
          PF prom: <span className="font-medium">{fmt(pf, 3)}</span>
        </div>
        {cost != null && (
          <div>
            Costo: <span className="font-medium">{fmt(cost, 0, " ARS")}</span>
          </div>
        )}
        {kind !== "normal" && (
          <div className="pt-1">
            {kind === "pf" && <span className="text-amber-700">⚠ PF bajo (&lt; {pfThreshold.toFixed(2)})</span>}
            {kind === "kwh" && (
              <span className="text-blue-700">⚠ Consumo alto (&gt; {fmt1(kwhSpikeThreshold, " kWh")})</span>
            )}
            {kind === "both" && <span className="text-red-700">⛔ PF bajo + consumo alto</span>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-gray-700">Eficiencia Energética</div>
          <div className="text-xs text-gray-500">LIVE + Histórico (día/mes) + alertas + costo.</div>
        </div>

        <div className="flex flex-wrap gap-2 items-center text-xs">
          <div className="flex items-center gap-1 border bg-white rounded-xl p-1">
            {(["live", "day", "month"] as const).map((m) => (
              <button
                key={m}
                className={`px-2 py-1 rounded-lg ${
                  mode === m ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
                }`}
                onClick={() => {
                  setMode(m);
                  if (m === "live") {
                    setHistError(null);
                    setDayRows([]);
                    setMonthRows([]);
                  } else {
                    setSeries([]);
                    setLatest(null);
                    setLiveError(null);
                  }
                }}
              >
                {m === "live" ? "LIVE" : m === "day" ? "Día" : "Mes"}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1">
            <span className="text-gray-500">Analizador:</span>
            <select
              value={analyzerId}
              onChange={(e) => {
                setAnalyzerId(Number(e.target.value));
                resetAll();
              }}
              className="border rounded-md px-2 py-1 text-xs bg-white"
            >
              <option value={1}>ABB #1</option>
              <option value={2}>ABB #2</option>
              <option value={3}>ABB #3</option>
              <option value={4}>ABB #4</option>
            </select>
          </label>

          <SoftBadge ok={statusText.ok} text={statusText.text} />
        </div>
      </div>

      {/* Config día */}
      {mode === "day" && (
        <div className="border rounded-2xl bg-white p-3">
          <div className="flex items-center gap-2">
            <button className="px-2 py-1 rounded-lg border bg-white hover:bg-gray-50" onClick={() => setSelectedDay(addDays(selectedDay, -1))}>
              ← Ayer
            </button>

            <label className="flex items-center gap-1">
              <span className="text-gray-500">Día:</span>
              <input
                type="date"
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="border rounded-md px-2 py-1 text-xs bg-white"
              />
            </label>

            <button className="px-2 py-1 rounded-lg border bg-white hover:bg-gray-50" onClick={() => setSelectedDay(today)}>
              Hoy
            </button>
          </div>
        </div>
      )}

      {/* Config mes */}
      {mode === "month" && (
        <div className="border rounded-2xl bg-white p-3">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
            <div className="flex items-center gap-2">
              <button className="px-2 py-1 rounded-lg border bg-white hover:bg-gray-50" onClick={() => setSelectedMonth(prevMonth(selectedMonth))}>
                ← Mes ant.
              </button>

              <label className="flex items-center gap-1">
                <span className="text-gray-500">Mes:</span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="border rounded-md px-2 py-1 text-xs bg-white"
                />
              </label>

              <button className="px-2 py-1 rounded-lg border bg-white hover:bg-gray-50" onClick={() => setSelectedMonth(thisMonth)}>
                Mes actual
              </button>

              <button className="px-2 py-1 rounded-lg border bg-white hover:bg-gray-50" onClick={() => setSelectedMonth(nextMonth(selectedMonth))}>
                Mes sig. →
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="text-[11px] text-gray-600">
                Tarifa (ARS/kWh)
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={tariffArsPerKwh}
                  onChange={(e) => setTariffArsPerKwh(Number(e.target.value))}
                  className="mt-1 w-full border rounded-md px-2 py-1 text-xs bg-white"
                />
              </label>

              <label className="text-[11px] text-gray-600">
                Umbral PF
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={pfThreshold}
                  onChange={(e) => setPfThreshold(clamp01(Number(e.target.value)))}
                  className="mt-1 w-full border rounded-md px-2 py-1 text-xs bg-white"
                />
              </label>

              <label className="text-[11px] text-gray-600">
                Spike kWh (% sobre prom)
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={spikePct}
                  onChange={(e) => setSpikePct(Math.max(0, Number(e.target.value)))}
                  className="mt-1 w-full border rounded-md px-2 py-1 text-xs bg-white"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {mode === "live" ? (
          <>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">kW ahora</div>
              <div className="text-xl font-semibold">{fmt1(kwNow, " kW")}</div>
              <div className="text-[11px] text-gray-400">src: {latest?.source ?? "--"}</div>
            </div>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">kW pico (buffer)</div>
              <div className="text-xl font-semibold">{fmt1(liveKwMax, " kW")}</div>
              <div className="text-[11px] text-gray-400">últimos {series.length} pts</div>
            </div>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">PF actual</div>
              <div className="text-xl font-semibold">{fmt(pfNow, 3)}</div>
              <div className="text-[11px] text-gray-400">calidad</div>
            </div>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">Estado</div>
              <div className="text-sm font-medium">
                {liveError ? <span className="text-amber-600">{liveError}</span> : <span className="text-green-600">OK</span>}
              </div>
            </div>
          </>
        ) : mode === "day" ? (
          <>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">Día</div>
              <div className="text-xl font-semibold">{selectedDay}</div>
              <div className="text-[11px] text-gray-400">AR</div>
            </div>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">kW prom (día)</div>
              <div className="text-xl font-semibold">{fmt1(dayKwAvg, " kW")}</div>
              <div className="text-[11px] text-gray-400">promedio</div>
            </div>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">Máximo del día</div>
              <div className="text-xl font-semibold">{dayMaxPoint ? fmt1(dayMaxPoint.kw, " kW") : "--"}</div>
              <div className="text-[11px] text-gray-400">{dayMaxPoint ? fmtTimeFromMs_AR(dayMaxPoint.x) : "--:--"}</div>
            </div>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">PF min / prom</div>
              <div className="text-xl font-semibold">
                {fmt(dayPfMin, 3)} / {fmt(dayPfAvg, 3)}
              </div>
              <div className="text-[11px] text-gray-400">
                {dayPfMin != null && dayPfMin < pfThreshold ? "⚠ PF bajo" : "OK"}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">kWh mes</div>
              <div className="text-xl font-semibold">{fmt1(monthKwhTotal, " kWh")}</div>
              <div className="text-[11px] text-gray-400">{selectedMonth}</div>
            </div>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">Costo estimado</div>
              <div className="text-xl font-semibold">{monthCost == null ? "--" : fmt(monthCost, 0, " ARS")}</div>
              <div className="text-[11px] text-gray-400">tarifa: {tariffArsPerKwh > 0 ? fmt(tariffArsPerKwh, 0, " ARS/kWh") : "--"}</div>
            </div>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">PF prom</div>
              <div className="text-xl font-semibold">{fmt(monthPfAvg, 3)}</div>
              <div className="text-[11px] text-gray-400">mes</div>
            </div>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">Pico mensual</div>
              <div className="text-xl font-semibold">{monthPeak ? fmt1(monthPeak.kwh, " kWh") : "--"}</div>
              <div className="text-[11px] text-gray-400">{monthPeak ? monthPeak.date : "--"}</div>
            </div>
          </>
        )}
      </div>

      {/* Chart */}
      <div className="h-72 border rounded-2xl bg-white p-2">
        {mode !== "live" && loadingHist ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">Cargando histórico…</div>
        ) : mode === "live" ? (
          liveChartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-500">Sin datos aún.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={liveChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" />
                <YAxis yAxisId="kw" />
                <YAxis yAxisId="pf" orientation="right" domain={[-1, 1]} />
                <Tooltip />
                <Legend />
                <Line yAxisId="kw" type="monotone" dataKey="kw" name="kW" dot={false} strokeWidth={2} />
                <Line yAxisId="pf" type="monotone" dataKey="pf" name="PF" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )
        ) : mode === "day" ? (
          dayChartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-500">Sin datos para el día.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dayChartData}>
                <CartesianGrid strokeDasharray="3 3" />

                <XAxis
                  dataKey="x"
                  type="number"
                  domain={[dayDomain.start, dayDomain.end]}
                  tickFormatter={(ms) => fmtTimeFromMs_AR(Number(ms))}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />

                <YAxis />

                <Tooltip content={dayTooltip} />
                <Legend />

                {/* Línea vertical en el máximo del día */}
                {dayMaxPoint && (
                  <ReferenceLine
                    x={dayMaxPoint.x}
                    strokeDasharray="6 4"
                    stroke="#ef4444"
                    label={{
                      value: `MAX ${fmt1(dayMaxPoint.kw, " kW")} @ ${fmtTimeFromMs_AR(dayMaxPoint.x)}`,
                      position: "insideTopLeft",
                      fontSize: 11,
                    }}
                  />
                )}

                <Line type="monotone" dataKey="kw" name="kW (minuto)" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )
        ) : monthChartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">Sin datos para el mes.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={monthChartData}
              onClick={(e: any) => {
                const idx = e?.activeTooltipIndex;
                if (typeof idx !== "number") return;
                const row = monthChartData[idx];
                if (!row?.date) return;
                setSelectedDay(row.date);
                setMode("day");
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis yAxisId="kwh" />
              <YAxis yAxisId="pf" orientation="right" domain={[-1, 1]} />
              <Tooltip content={monthTooltip} />
              <Legend />
              <Bar yAxisId="kwh" dataKey="kwh" name="kWh / día">
                {monthChartData.map((row, idx) => {
                  const kind = barKind(row);
                  return <Cell key={idx} fill={barFill(kind)} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
