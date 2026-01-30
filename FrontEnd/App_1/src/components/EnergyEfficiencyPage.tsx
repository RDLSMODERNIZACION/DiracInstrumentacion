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
} from "recharts";

import { getApiRoot, getApiHeaders } from "@/lib/config";

type Props = {
  analyzerId?: number;
};

type LatestReading = {
  id: number;
  analyzer_id: number | null;
  ts: string | null;
  p_kw: number | null;
  pf: number | null;
  source?: string | null;
};

/**
 * Para LIVE y para HISTÓRICO "DÍA" (serie temporal)
 */
type LivePoint = {
  t: string; // ISO ts
  kw: number; // abs(kW)
  pf: number | null;
};

/**
 * Para HISTÓRICO "MES" (agregado por día)
 * Ideal: el backend te da kwh del día real.
 * Si no hay kwh, el front puede estimar con kw_avg*24 (aprox).
 */
type MonthPoint = {
  day: string; // "2026-01-15"
  kwh: number | null;
  kw_avg: number | null;
  pf_avg: number | null;
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

function startOfDayISO(dateStr: string) {
  return `${dateStr}T00:00:00.000Z`;
}
function endOfDayISO(dateStr: string) {
  return `${dateStr}T23:59:59.999Z`;
}
function monthRange(monthStr: string) {
  // monthStr: "2026-01"
  const [y, m] = monthStr.split("-").map((x) => Number(x));
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)); // último día del mes
  return { start: isoDate(start), end: isoDate(end) };
}

/**
 * Integración simple para estimar kWh a partir de puntos kW vs tiempo.
 * Usa trapezoidal entre muestras.
 */
function estimateKwhFromSeries(points: LivePoint[]): number | null {
  if (!points || points.length < 2) return null;
  let kwh = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const ta = Date.parse(a.t);
    const tb = Date.parse(b.t);
    if (!Number.isFinite(ta) || !Number.isFinite(tb) || tb <= ta) continue;

    const dtHours = (tb - ta) / 3600000;
    const kwa = Number.isFinite(a.kw) ? a.kw : 0;
    const kwb = Number.isFinite(b.kw) ? b.kw : 0;
    kwh += ((kwa + kwb) / 2) * dtHours;
  }
  return Number.isFinite(kwh) ? kwh : null;
}

async function fetchLatestNoScope(
  analyzerId: number,
  signal?: AbortSignal
): Promise<LatestReading> {
  const root = getApiRoot();
  const url = `${root}/components/network_analyzers/${analyzerId}/latest`;

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

/**
 * HISTÓRICO:
 * - granularity="minute" → puntos ts/kw/pf para un día (o rango corto)
 * - granularity="day"    → puntos por día con kwh/kw_avg/pf_avg para un mes
 *
 * Ajustá la URL a tu backend real.
 */
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

  // 👇 Cambiá SOLO esto si tu backend tiene otro path:
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

export default function EnergyEfficiencyPage({
  analyzerId: initialAnalyzerId = 1,
}: Props) {
  const [analyzerId, setAnalyzerId] = useState<number>(initialAnalyzerId);

  const [mode, setMode] = useState<Mode>("live");

  // selectors
  const today = useMemo(() => isoDate(new Date()), []);
  const thisMonth = useMemo(() => today.slice(0, 7), [today]);

  const [selectedDay, setSelectedDay] = useState<string>(today);
  const [selectedMonth, setSelectedMonth] = useState<string>(thisMonth);

  // LIVE state
  const [latest, setLatest] = useState<LatestReading | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [series, setSeries] = useState<LivePoint[]>([]);
  const lastMsRef = useRef<number | null>(null);

  // HIST state
  const [histError, setHistError] = useState<string | null>(null);
  const [daySeries, setDaySeries] = useState<LivePoint[]>([]);
  const [monthSeries, setMonthSeries] = useState<MonthPoint[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  // RESET helper
  function resetAll() {
    setLatest(null);
    setLiveError(null);
    setSeries([]);
    lastMsRef.current = null;

    setHistError(null);
    setDaySeries([]);
    setMonthSeries([]);
    setLoadingHist(false);
  }

  // polling live (solo si mode === "live")
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
        const ms = Date.parse(ts);

        const kw = absKw(row.p_kw) ?? 0;
        const pf = toNum(row.pf);

        setSeries((prev) => {
          const next = [...prev, { t: ts, kw, pf }];
          if (next.length > 300) next.splice(0, next.length - 300); // ~10 min
          return next;
        });

        if (Number.isFinite(ms)) lastMsRef.current = ms;
      } catch (e: any) {
        if (!alive) return;
        if (String(e?.message).includes("SIN_LECTURAS")) {
          setLatest(null);
          setLiveError("Sin lecturas todavía (mandá datos al analizador).");
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

  // fetch histórico al cambiar mode/day/month/analyzer
  useEffect(() => {
    if (mode === "live") return;

    let alive = true;
    const ctrl = new AbortController();

    async function run() {
      try {
        setLoadingHist(true);
        setHistError(null);

        if (mode === "day") {
          const from = startOfDayISO(selectedDay);
          const to = endOfDayISO(selectedDay);

          const json = await fetchHistory(
            analyzerId,
            { from, to, granularity: "minute" },
            ctrl.signal
          );

          // Soporta 2 formatos:
          // A) { points: [{ts,p_kw,pf}] }
          // B) [{ts,p_kw,pf}] directo
          const arr = Array.isArray(json) ? json : json?.points ?? [];
          const pts: LivePoint[] = (arr || [])
            .map((r: any) => {
              const ts = r.ts ?? r.t;
              const kw = absKw(r.p_kw ?? r.kw) ?? 0;
              const pf = toNum(r.pf);
              if (!ts) return null;
              return { t: String(ts), kw, pf };
            })
            .filter(Boolean);

          if (!alive) return;
          setDaySeries(pts);
          setMonthSeries([]);
        }

        if (mode === "month") {
          const { start, end } = monthRange(selectedMonth);
          const from = startOfDayISO(start);
          const to = endOfDayISO(end);

          const json = await fetchHistory(
            analyzerId,
            { from, to, granularity: "day" },
            ctrl.signal
          );

          // Soporta:
          // A) { days: [{day,kwh,kw_avg,pf_avg}] }
          // B) [{day,kwh,kw_avg,pf_avg}] directo
          const arr = Array.isArray(json) ? json : json?.days ?? json?.points ?? [];
          const pts: MonthPoint[] = (arr || [])
            .map((r: any) => {
              const day = r.day ?? (r.ts ? String(r.ts).slice(0, 10) : null);
              if (!day) return null;
              return {
                day,
                kwh: toNum(r.kwh),
                kw_avg: toNum(r.kw_avg ?? r.kw),
                pf_avg: toNum(r.pf_avg ?? r.pf),
              };
            })
            .filter(Boolean);

          if (!alive) return;
          setMonthSeries(pts);
          setDaySeries([]);
        }
      } catch (e: any) {
        if (!alive) return;
        if (String(e?.message).includes("SIN_HISTORIA")) {
          setHistError("Sin histórico para ese período.");
        } else {
          setHistError(e?.message ?? String(e));
        }
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

  // ---------------------
  // UI computed values
  // ---------------------
  const liveChartData = useMemo(
    () =>
      series.map((p) => ({
        t: p.t.slice(11, 19),
        kw: p.kw,
        pf: p.pf ?? undefined,
      })),
    [series]
  );

  const dayChartData = useMemo(
    () =>
      daySeries.map((p) => ({
        t: p.t.slice(11, 19),
        kw: p.kw,
        pf: p.pf ?? undefined,
      })),
    [daySeries]
  );

  const monthChartData = useMemo(() => {
    return monthSeries.map((d) => {
      const kwh = d.kwh ?? (d.kw_avg != null ? d.kw_avg * 24 : null); // fallback aprox
      return {
        day: d.day.slice(8, 10), // "15"
        kwh: kwh ?? undefined,
        pf: d.pf_avg ?? undefined,
      };
    });
  }, [monthSeries]);

  const kwNow = useMemo(() => absKw(latest?.p_kw), [latest?.p_kw]);
  const pfNow = useMemo(() => toNum(latest?.pf), [latest?.pf]);

  function seriesMaxKw(pts: LivePoint[]) {
    if (!pts.length) return null;
    return pts.reduce((m, p) => Math.max(m, p.kw), 0);
  }
  function seriesAvgKw(pts: LivePoint[]) {
    if (!pts.length) return null;
    const s = pts.reduce((acc, p) => acc + (Number.isFinite(p.kw) ? p.kw : 0), 0);
    return s / pts.length;
  }
  function seriesAvgPf(pts: LivePoint[]) {
    const vals = pts.map((p) => p.pf).filter((x) => typeof x === "number") as number[];
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  const liveKwMax = useMemo(() => seriesMaxKw(series), [series]);
  const liveKwhEst = useMemo(() => estimateKwhFromSeries(series), [series]);

  const dayKwMax = useMemo(() => seriesMaxKw(daySeries), [daySeries]);
  const dayKwAvg = useMemo(() => seriesAvgKw(daySeries), [daySeries]);
  const dayPfAvg = useMemo(() => seriesAvgPf(daySeries), [daySeries]);
  const dayKwhEst = useMemo(() => estimateKwhFromSeries(daySeries), [daySeries]);

  const monthKwhTotal = useMemo(() => {
    if (!monthSeries.length) return null;
    const vals = monthSeries.map((d) => d.kwh ?? (d.kw_avg != null ? d.kw_avg * 24 : null));
    const ok = vals.filter((x) => typeof x === "number") as number[];
    if (!ok.length) return null;
    return ok.reduce((a, b) => a + b, 0);
  }, [monthSeries]);

  const monthPfAvg = useMemo(() => {
    const vals = monthSeries.map((d) => d.pf_avg).filter((x) => typeof x === "number") as number[];
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [monthSeries]);

  const statusText = useMemo(() => {
    const err = mode === "live" ? liveError : histError;
    if (err) return { ok: false, text: err };
    if (mode !== "live" && loadingHist) return { ok: true, text: "Cargando…" };
    return { ok: true, text: "OK" };
  }, [mode, liveError, histError, loadingHist]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-gray-700">
            Eficiencia Energética
          </div>
          <div className="text-xs text-gray-500">
            LIVE (polling) + Histórico por día/mes.
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center text-xs">
          {/* Mode */}
          <div className="flex items-center gap-1 border bg-white rounded-xl p-1">
            <button
              className={`px-2 py-1 rounded-lg ${
                mode === "live" ? "bg-gray-900 text-white" : "text-gray-600"
              }`}
              onClick={() => {
                setMode("live");
                setHistError(null);
                setDaySeries([]);
                setMonthSeries([]);
              }}
            >
              LIVE
            </button>
            <button
              className={`px-2 py-1 rounded-lg ${
                mode === "day" ? "bg-gray-900 text-white" : "text-gray-600"
              }`}
              onClick={() => {
                setMode("day");
                setSeries([]);
                setLatest(null);
                setLiveError(null);
              }}
            >
              Día
            </button>
            <button
              className={`px-2 py-1 rounded-lg ${
                mode === "month" ? "bg-gray-900 text-white" : "text-gray-600"
              }`}
              onClick={() => {
                setMode("month");
                setSeries([]);
                setLatest(null);
                setLiveError(null);
              }}
            >
              Mes
            </button>
          </div>

          {/* Period selectors */}
          {mode === "day" && (
            <label className="flex items-center gap-1">
              <span className="text-gray-500">Día:</span>
              <input
                type="date"
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="border rounded-md px-2 py-1 text-xs bg-white"
              />
            </label>
          )}

          {mode === "month" && (
            <label className="flex items-center gap-1">
              <span className="text-gray-500">Mes:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="border rounded-md px-2 py-1 text-xs bg-white"
              />
            </label>
          )}

          {/* Analyzer */}
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
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {mode === "live" ? (
          <>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">kW ahora</div>
              <div className="text-xl font-semibold">{fmt1(kwNow, " kW")}</div>
              <div className="text-[11px] text-gray-400">
                src: {latest?.source ?? "--"}
              </div>
            </div>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">kW pico (buffer)</div>
              <div className="text-xl font-semibold">{fmt1(liveKwMax, " kW")}</div>
              <div className="text-[11px] text-gray-400">
                últimos {series.length} pts
              </div>
            </div>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">PF actual</div>
              <div className="text-xl font-semibold">{fmt(pfNow, 3)}</div>
              <div className="text-[11px] text-gray-400">factor de potencia</div>
            </div>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">Estado</div>
              <div className="text-sm font-medium">
                {statusText.ok ? (
                  <span className="text-green-600">{statusText.text}</span>
                ) : (
                  <span className="text-amber-600">{statusText.text}</span>
                )}
              </div>
              <div className="text-[11px] text-gray-400">
                kWh est: {fmt1(liveKwhEst, " kWh")}
              </div>
            </div>
          </>
        ) : mode === "day" ? (
          <>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">Energía (estimada)</div>
              <div className="text-xl font-semibold">{fmt1(dayKwhEst, " kWh")}</div>
              <div className="text-[11px] text-gray-400">{selectedDay}</div>
            </div>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">kW promedio</div>
              <div className="text-xl font-semibold">{fmt1(dayKwAvg, " kW")}</div>
              <div className="text-[11px] text-gray-400">muestras: {daySeries.length}</div>
            </div>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">kW pico</div>
              <div className="text-xl font-semibold">{fmt1(dayKwMax, " kW")}</div>
              <div className="text-[11px] text-gray-400">día completo</div>
            </div>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">PF promedio</div>
              <div className="text-xl font-semibold">{fmt(dayPfAvg, 3)}</div>
              <div className="text-[11px] text-gray-400">
                {statusText.ok ? (
                  <span className="text-green-600">{statusText.text}</span>
                ) : (
                  <span className="text-amber-600">{statusText.text}</span>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">kWh mes (ideal)</div>
              <div className="text-xl font-semibold">{fmt1(monthKwhTotal, " kWh")}</div>
              <div className="text-[11px] text-gray-400">{selectedMonth}</div>
            </div>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">PF promedio</div>
              <div className="text-xl font-semibold">{fmt(monthPfAvg, 3)}</div>
              <div className="text-[11px] text-gray-400">mes</div>
            </div>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">Días con datos</div>
              <div className="text-xl font-semibold">
                {monthSeries.length ? monthSeries.length : "--"}
              </div>
              <div className="text-[11px] text-gray-400">agregado diario</div>
            </div>
            <div className="border rounded-2xl bg-white p-3">
              <div className="text-[11px] text-gray-500">Estado</div>
              <div className="text-sm font-medium">
                {statusText.ok ? (
                  <span className="text-green-600">{statusText.text}</span>
                ) : (
                  <span className="text-amber-600">{statusText.text}</span>
                )}
              </div>
              <div className="text-[11px] text-gray-400">
                Nota: si no hay kWh real, se estima con kw_avg*24.
              </div>
            </div>
          </>
        )}
      </div>

      {/* Gráfico */}
      <div className="h-72 border rounded-2xl bg-white p-2">
        {mode !== "live" && loadingHist ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">
            Cargando histórico…
          </div>
        ) : mode === "live" ? (
          liveChartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-500">
              Sin datos aún.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={liveChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" hide />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="kw" name="abs(kW)" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="pf" name="PF" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )
        ) : mode === "day" ? (
          dayChartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-500">
              Sin datos para el día seleccionado.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dayChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="kw" name="abs(kW)" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="pf" name="PF" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )
        ) : monthChartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">
            Sin datos para el mes seleccionado.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="kwh" name="kWh / día" />
              {/* Si querés ver PF en el mismo chart, mejor separarlo o usar un segundo eje.
                  Acá lo dejo como línea simple para no complicar: */}
              {/* <Line type="monotone" dataKey="pf" name="PF prom" dot={false} strokeWidth={2} /> */}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
