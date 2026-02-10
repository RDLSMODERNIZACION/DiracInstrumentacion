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
  ts: string; // YYYY-MM-DD o date
  kwh_est: number | null;
  kw_avg: number | null;
  kw_max: number | null;
  pf_avg: number | null;
  pf_min: number | null; // lo usamos para “en algún momento estuvo bajo”
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
const PF_REF = 0.95; // umbral fijo para pintar rojo si estuvo bajo “en algún momento”

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

export default function EnergyEfficiencyPage({ analyzerId: initialAnalyzerId = 1 }: Props) {
  const [analyzerId, setAnalyzerId] = useState<number>(initialAnalyzerId);
  const [mode, setMode] = useState<Mode>("live");

  const today = useMemo(() => isoDate(new Date()), []);
  const thisMonth = useMemo(() => today.slice(0, 7), [today]);

  const [selectedDay, setSelectedDay] = useState<string>(today);
  const [selectedMonth, setSelectedMonth] = useState<string>(thisMonth);

  // Mes: spike de kWh (% sobre promedio) + tarifa configurable
  const [spikePct, setSpikePct] = useState<number>(25);
  const [tariffArsPerKwh, setTariffArsPerKwh] = useState<number>(0);

  useEffect(() => {
    const t = localStorage.getItem("dirac.tariff_ars_kwh");
    const s = localStorage.getItem("dirac.kwh_spike_pct");
    if (t) {
      const n = Number(t);
      if (Number.isFinite(n)) setTariffArsPerKwh(n);
    }
    if (s) {
      const n = Number(s);
      if (Number.isFinite(n)) setSpikePct(Math.max(0, n));
    }
  }, []);
  useEffect(() => localStorage.setItem("dirac.tariff_ars_kwh", String(tariffArsPerKwh)), [tariffArsPerKwh]);
  useEffect(() => localStorage.setItem("dirac.kwh_spike_pct", String(spikePct)), [spikePct]);

  // LIVE
  const [latest, setLatest] = useState<LatestReading | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [series, setSeries] = useState<LivePoint[]>([]);
  const lastLiveTimerRef = useRef<any>(null);

  // HIST
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
        lastLiveTimerRef.current = setTimeout(tick, 2000);
      }
    }

    tick();
    return () => {
      alive = false;
      ctrl.abort();
      if (lastLiveTimerRef.current) clearTimeout(lastLiveTimerRef.current);
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
  // DAY chart (OK) + max vertical line
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

  // KPIs día
  const dayKwAvg = useMemo(() => {
    const vals = dayRows.map((r) => toNum(r.kw_avg)).filter((x): x is number => typeof x === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [dayRows]);
  const dayPfAvg = useMemo(() => {
    const vals = dayRows.map((r) => toNum(r.pf_avg)).filter((x): x is number => typeof x === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [dayRows]);
  const dayPfMin = useMemo(() => {
    const vals = dayRows.map((r) => toNum(r.pf_min)).filter((x): x is number => typeof x === "number");
    return vals.length ? Math.min(...vals) : null;
  }, [dayRows]);

  // -------------------
  // MONTH chart: kWh/día (barras) + kW avg (línea) + kWh acumulado (línea)
  // Colores:
  // - rojo si pf_min < 0.95 (algún momento)
  // - azul si kWh spike (> prom*(1+spikePct))
  // -------------------
  const monthChartData = useMemo(() => {
    const rows = [...monthRows].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    let cum = 0;

    return rows.map((r) => {
      const kwh = toNum(r.kwh_est);
      if (typeof kwh === "number") cum += kwh;

      return {
        day: String(r.ts).slice(8, 10),
        date: String(r.ts).slice(0, 10),
        kwh: kwh ?? undefined,
        kwh_cum: cum,
        kw_avg: toNum(r.kw_avg) ?? undefined,
        kw_max: toNum(r.kw_max) ?? undefined,
        pf_avg: toNum(r.pf_avg) ?? undefined,
        pf_min: toNum(r.pf_min) ?? undefined,
      };
    });
  }, [monthRows]);

  const monthKwhTotal = useMemo(() => {
    const vals = monthRows.map((r) => r.kwh_est).filter((x): x is number => typeof x === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }, [monthRows]);

  const monthKwhAvg = useMemo(() => {
    const vals = monthRows.map((r) => r.kwh_est).filter((x): x is number => typeof x === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [monthRows]);

  // PF “cuadradito” debe ser PROMEDIO / MIN del mes
  const monthPfAvg = useMemo(() => {
    const vals = monthRows.map((r) => r.pf_avg).filter((x): x is number => typeof x === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [monthRows]);

  const monthPfMin = useMemo(() => {
    const vals = monthRows.map((r) => r.pf_min).filter((x): x is number => typeof x === "number");
    return vals.length ? Math.min(...vals) : null;
  }, [monthRows]);

  // kWh pico del mes
  const monthPeak = useMemo(() => {
    let best: { date: string; kwh: number } | null = null;
    for (const r of monthChartData) {
      const kwh = toNum(r.kwh);
      if (typeof kwh !== "number") continue;
      if (!best || kwh > best.kwh) best = { date: r.date, kwh };
    }
    return best;
  }, [monthChartData]);

  // kW pico del mes (y su día) — clickable card -> ir a modo día
  const monthKwPeak = useMemo(() => {
    let best: { date: string; kw: number } | null = null;
    for (const r of monthChartData) {
      const kw = toNum(r.kw_max);
      if (typeof kw !== "number") continue;
      if (!best || kw > best.kw) best = { date: r.date, kw };
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
    const pfMin = toNum(row?.pf_min);
    const kwh = toNum(row?.kwh);

    const lowPfSomeMoment = typeof pfMin === "number" && pfMin < PF_REF;
    const highKwh =
      typeof kwh === "number" && typeof kwhSpikeThreshold === "number" && kwh > kwhSpikeThreshold;

    if (lowPfSomeMoment && highKwh) return "both";
    if (lowPfSomeMoment) return "pf";
    if (highKwh) return "kwh";
    return "normal";
  }

  function barFill(kind: ReturnType<typeof barKind>) {
    if (kind === "both") return "#fecaca";
    if (kind === "pf") return "#fecaca";
    if (kind === "kwh") return "#bfdbfe";
    return "#e5e7eb";
  }

  // LIVE KPIs
  const kwNow = useMemo(() => absKw(latest?.p_kw), [latest?.p_kw]);
  const pfNow = useMemo(() => toNum(latest?.pf), [latest?.pf]);
  const liveKwMax = useMemo(() => (series.length ? Math.max(...series.map((x) => x.kw)) : null), [series]);

  const statusText = useMemo(() => {
    const err = mode === "live" ? liveError : histError;
    if (err) return { ok: false, text: err };
    if (mode !== "live" && loadingHist) return { ok: true, text: "Cargando…" };
    return { ok: true, text: "OK" };
  }, [mode, liveError, histError, loadingHist]);

  // Tooltip día
  const dayTooltip = ({ active, payload }: any) => {
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

  // Tooltip mes
  const monthTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;

    const date = d?.date ?? label;
    const kwh = toNum(d?.kwh);
    const kwhCum = toNum(d?.kwh_cum);
    const kwAvg = toNum(d?.kw_avg);
    const pfAvg = toNum(d?.pf_avg);
    const pfMin = toNum(d?.pf_min);

    const cost = typeof kwh === "number" && tariffArsPerKwh > 0 ? kwh * tariffArsPerKwh : null;

    const lowPfSomeMoment = typeof pfMin === "number" && pfMin < PF_REF;
    const highKwh =
      typeof kwh === "number" && typeof kwhSpikeThreshold === "number" && kwh > kwhSpikeThreshold;

    return (
      <div className="bg-white border rounded-xl p-2 shadow-sm text-xs space-y-1">
        <div className="font-medium">{date}</div>
        <div>
          Energía: <span className="font-medium">{fmt(kwh, 2, " kWh")}</span>
        </div>
        <div>
          Acumulado: <span className="font-medium">{fmt(kwhCum, 2, " kWh")}</span>
        </div>
        <div>
          kW prom: <span className="font-medium">{fmt(kwAvg, 2, " kW")}</span>
        </div>
        <div>
          PF prom: <span className="font-medium">{fmt(pfAvg, 3)}</span>
        </div>
        {cost != null && (
          <div>
            Costo: <span className="font-medium">{fmt(cost, 0, " ARS")}</span>
          </div>
        )}
        {(lowPfSomeMoment || highKwh) && (
          <div className="pt-1">
            {lowPfSomeMoment && (
              <div className="text-red-700">⛔ PF bajo en algún momento (min &lt; {PF_REF.toFixed(2)})</div>
            )}
            {highKwh && (
              <div className="text-blue-700">⚠ Consumo alto (&gt; {fmt1(kwhSpikeThreshold, " kWh")})</div>
            )}
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
            <button
              className="px-2 py-1 rounded-lg border bg-white hover:bg-gray-50"
              onClick={() => setSelectedDay(addDays(selectedDay, -1))}
            >
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

            <button
              className="px-2 py-1 rounded-lg border bg-white hover:bg-gray-50"
              onClick={() => setSelectedDay(today)}
            >
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
              <button
                className="px-2 py-1 rounded-lg border bg-white hover:bg-gray-50"
                onClick={() => setSelectedMonth(prevMonth(selectedMonth))}
              >
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

              <button
                className="px-2 py-1 rounded-lg border bg-white hover:bg-gray-50"
                onClick={() => setSelectedMonth(thisMonth)}
              >
                Mes actual
              </button>

              <button
                className="px-2 py-1 rounded-lg border bg-white hover:bg-gray-50"
                onClick={() => setSelectedMonth(nextMonth(selectedMonth))}
              >
                Mes sig. →
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
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

              <div className="text-[11px] text-gray-500">
                PF ref (rojo): <span className="font-medium">{PF_REF.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
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
                {dayPfMin != null && dayPfMin < PF_REF ? `⚠ PF bajo (< ${PF_REF.toFixed(2)})` : "OK"}
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

            {/* (SACADO) kWh acumulado (fin) */}

            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">PF prom / PF min (mes)</div>
              <div className="text-xl font-semibold">
                {fmt(monthPfAvg, 3)} / {fmt(monthPfMin, 3)}
              </div>
              <div className="text-[11px] text-gray-400">
                {monthPfMin != null && monthPfMin < PF_REF ? `⚠ hubo PF < ${PF_REF.toFixed(2)}` : "OK"}
              </div>
            </div>

            <button
              type="button"
              className="border rounded-2xl bg-white p-3 text-left hover:bg-gray-50 active:bg-gray-100 transition"
              onClick={() => {
                if (!monthKwPeak) return;
                setSelectedDay(monthKwPeak.date);
                setMode("day");
              }}
              title={monthKwPeak ? `Ir al día ${monthKwPeak.date}` : ""}
            >
              <div className="text-[11px] text-gray-500">kW pico (mes)</div>
              <div className="text-xl font-semibold">{monthKwPeak ? fmt1(monthKwPeak.kw, " kW") : "--"}</div>
              <div className="text-[11px] text-gray-400">{monthKwPeak ? monthKwPeak.date : "--"}</div>
            </button>

            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">Costo estimado</div>
              <div className="text-xl font-semibold">{monthCost == null ? "--" : fmt(monthCost, 0, " ARS")}</div>
              <div className="text-[11px] text-gray-400">
                tarifa: {tariffArsPerKwh > 0 ? fmt(tariffArsPerKwh, 0, " ARS/kWh") : "--"} · pico kWh:{" "}
                {monthPeak ? `${fmt1(monthPeak.kwh, " kWh")} (${monthPeak.date})` : "--"}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Chart */}
      <div className="h-72 border rounded-2xl bg-white p-2">
        {mode !== "live" && loadingHist ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">Cargando histórico…</div>
        ) : mode === "live" ? (
          liveError ? (
            <div className="h-full flex items-center justify-center text-sm text-amber-700">{liveError}</div>
          ) : liveChartData.length === 0 ? (
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
          histError ? (
            <div className="h-full flex items-center justify-center text-sm text-amber-700">{histError}</div>
          ) : dayChartData.length === 0 ? (
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
        ) : histError ? (
          <div className="h-full flex items-center justify-center text-sm text-amber-700">{histError}</div>
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
              <YAxis yAxisId="kw" orientation="right" />
              <Tooltip content={monthTooltip} />
              <Legend />

              <Bar yAxisId="kwh" dataKey="kwh" name="kWh / día">
                {monthChartData.map((row, idx) => {
                  const kind = barKind(row);
                  return <Cell key={idx} fill={barFill(kind)} />;
                })}
              </Bar>

              <Line yAxisId="kw" type="monotone" dataKey="kw_avg" name="kW prom (día)" dot={false} strokeWidth={2} />

              <Line yAxisId="kwh" type="monotone" dataKey="kwh_cum" name="kWh acumulado" dot={false} strokeWidth={2} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
