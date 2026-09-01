import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { scopedUrl, getApiHeaders } from "@/lib/config";

type ViewMode = "pumps" | "tanks";
type PumpFilter = "impulsion" | "all";
type SortDir = "asc" | "desc";

type Props = {
  locationId?: number | string;
  selectedPumpIds?: number[] | string[] | "all";
  selectedTankIds?: number[] | string[] | "all";
  thresholdLow?: number;
};

type PumpDailyRow = {
  day_ts: string;
  pump_id: number;
  pump_name: string;
  location_id: number | null;
  location_name: string | null;
  starts_count: number;
  stops_count: number;
  running_seconds: number;
  stopped_seconds: number;
  availability_pct: number | null;
  total_state_events: number;
  estado_operativo: string;
  problem_score: number;
};

type PumpRankingRow = {
  pump_id: number;
  pump_name: string;
  location_id: number | null;
  location_name: string | null;
  starts_count: number;
  stops_count: number;
  running_seconds: number;
  stopped_seconds: number;
  availability_pct: number | null;
  total_state_events: number;
  problem_score: number;
  estado_operativo: string;
};

type TankDailyRow = {
  day_ts: string;
  tank_id: number;
  tank_name: string;
  location_id: number | null;
  location_name: string | null;
  total_events: number;
  active_events: number;
  low_events: number;
  low_critical_events: number;
  high_events: number;
  high_critical_events: number;
  min_detected_value: number | null;
  max_detected_value: number | null;
  total_duration_seconds: number;
  estado_operativo: string;
};

type TankRankingRow = TankDailyRow & { problem_score: number };

type PumpDiagnostic = {
  pump_id?: number;
  analyzer_id?: number;
  state?: string | null;
  official?: {
    current_a?: number | null;
    i_l1_a?: number | null;
    i_l2_a?: number | null;
    i_l3_a?: number | null;
    startup_type?: string | null;
    measured_at?: string | null;
  };
  model?: {
    current_a?: number | null;
    current_error_pct?: number | null;
    power_ref_kw?: number | null;
    valid_starts?: number | null;
  };
  live?: {
    power_kw?: number | null;
    power_deviation_pct?: number | null;
    power_status?: string | null;
    power_reason?: string | null;
    quality?: string | null;
  };
};

type PumpChartRow = {
  day_ts: string;
  day_label: string;
  total_starts: number;
  total_stops: number;
  avg_availability_pct: number | null;
};

type TankChartRow = {
  day_ts: string;
  day_label: string;
  low_events: number;
  low_critical_events: number;
  high_events: number;
  high_critical_events: number;
};

// Conjunto de bombas de impulsión que ya usa la app principal.
const IMPULSION_PUMP_IDS = new Set([12, 13, 14, 15, 16, 17, 18, 24, 25, 26, 29, 30]);

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function prevMonth(value: string) {
  const [y, m] = value.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(value: string) {
  const [y, m] = value.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function fmtInt(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n).toLocaleString("es-AR") : "-";
}

function fmtNum(v: unknown, d = 1) {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString("es-AR", { maximumFractionDigits: d, minimumFractionDigits: d })
    : "-";
}

function fmtPct(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n)
    ? `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`
    : "-";
}

function fmtDuration(v: unknown) {
  const s = Number(v);
  if (!Number.isFinite(s) || s <= 0) return "-";
  if (s < 60) return `${Math.round(s)} seg`;
  if (s < 3600) return `${(s / 60).toLocaleString("es-AR", { maximumFractionDigits: 1 })} min`;
  return `${(s / 3600).toLocaleString("es-AR", { maximumFractionDigits: 1 })} h`;
}

function dayLabel(day: string) {
  const p = String(day || "").split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}` : day;
}

function safeLocationId(value: Props["locationId"]) {
  if (value === undefined || value === null || value === "" || value === "all") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function buildUrl(path: string, params: Record<string, string | number | undefined | null> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "" && v !== "all") q.set(k, String(v));
  }
  const base = scopedUrl(path);
  return q.toString() ? `${base}${base.includes("?") ? "&" : "?"}${q}` : base;
}

async function fetchJson<T>(path: string, params: Record<string, string | number | undefined | null> = {}) {
  const r = await fetch(buildUrl(path, params), { headers: getApiHeaders(), cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => r.statusText)}`);
  return (await r.json()) as T;
}

function statusClass(status?: string | null) {
  const s = String(status || "").toLowerCase();
  if (s.includes("baja") || s.includes("muchos") || s.includes("revisar")) {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }
  if (s.includes("severo") || s.includes("crítico") || s.includes("critico")) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function powerStatusClass(status?: string | null) {
  const s = String(status || "");
  if (s === "low_power" || s === "high_power") return "border-red-200 bg-red-50 text-red-700";
  if (s === "normal") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xl">
      <div className="mb-2 font-bold">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-5">
          <span className="text-slate-500">{p.name}</span>
          <span className="font-semibold">{typeof p.value === "number" ? fmtNum(p.value, 1) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReliabilityPage({ locationId = "all" }: Props) {
  const [view, setView] = useState<ViewMode>("pumps");
  const [pumpFilter, setPumpFilter] = useState<PumpFilter>("impulsion");
  const [month, setMonth] = useState(currentMonth());
  const [pumpDaily, setPumpDaily] = useState<PumpDailyRow[]>([]);
  const [pumpRows, setPumpRows] = useState<PumpRankingRow[]>([]);
  const [tankDaily, setTankDaily] = useState<TankDailyRow[]>([]);
  const [tankRows, setTankRows] = useState<TankRankingRow[]>([]);
  const [sortKey, setSortKey] = useState<string>("problem_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedPump, setSelectedPump] = useState<PumpRankingRow | null>(null);
  const [diagnostic, setDiagnostic] = useState<PumpDiagnostic | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const locParam = safeLocationId(locationId);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([
      fetchJson<{ items: PumpDailyRow[] }>("/kpi/operation-reliability/pump-daily", { month, location_id: locParam }),
      fetchJson<{ items: PumpRankingRow[] }>("/kpi/operation-reliability/pump-ranking", { month, location_id: locParam, limit: 100 }),
      fetchJson<{ items: TankDailyRow[] }>("/kpi/operation-reliability/tank-daily", { month, location_id: locParam }),
      fetchJson<{ items: TankRankingRow[] }>("/kpi/operation-reliability/tank-ranking", { month, location_id: locParam, limit: 100 }),
    ])
      .then(([pd, pr, td, tr]) => {
        if (!alive) return;
        setPumpDaily(Array.isArray(pd.items) ? pd.items : []);
        setPumpRows(Array.isArray(pr.items) ? pr.items : []);
        setTankDaily(Array.isArray(td.items) ? td.items : []);
        setTankRows(Array.isArray(tr.items) ? tr.items : []);
      })
      .catch((e) => alive && setError(e?.message || "No se pudieron cargar los KPI"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [month, locParam]);

  useEffect(() => {
    if (!selectedPump) {
      setDiagnostic(null);
      return;
    }
    let alive = true;
    setDiagLoading(true);
    fetchJson<PumpDiagnostic>(`/components/network_analyzers/pump-diagnostic/${selectedPump.pump_id}`)
      .then((d) => alive && setDiagnostic(d))
      .catch(() => alive && setDiagnostic(null))
      .finally(() => alive && setDiagLoading(false));
    return () => {
      alive = false;
    };
  }, [selectedPump]);

  const filteredPumpRows = useMemo(() => {
    const rows = pumpFilter === "impulsion"
      ? pumpRows.filter((r) => IMPULSION_PUMP_IDS.has(Number(r.pump_id)))
      : pumpRows;
    return [...rows].sort((a: any, b: any) => {
      if (sortKey === "location_name" || sortKey === "pump_name" || sortKey === "estado_operativo") {
        const av = String(a[sortKey] || "");
        const bv = String(b[sortKey] || "");
        const cmp = av.localeCompare(bv, "es", { numeric: true, sensitivity: "base" });
        if (cmp !== 0) return sortDir === "asc" ? cmp : -cmp;
        return String(a.pump_name || "").localeCompare(String(b.pump_name || ""), "es", { numeric: true });
      }
      const av = toNum(a[sortKey], -999999);
      const bv = toNum(b[sortKey], -999999);
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [pumpRows, pumpFilter, sortKey, sortDir]);

  const filteredPumpIds = useMemo(() => new Set(filteredPumpRows.map((r) => Number(r.pump_id))), [filteredPumpRows]);

  const pumpChart = useMemo<PumpChartRow[]>(() => {
    const m = new Map<string, { starts: number; stops: number; sum: number; n: number }>();
    for (const r of pumpDaily) {
      if (!filteredPumpIds.has(Number(r.pump_id))) continue;
      const cur = m.get(r.day_ts) || { starts: 0, stops: 0, sum: 0, n: 0 };
      cur.starts += toNum(r.starts_count);
      cur.stops += toNum(r.stops_count);
      if (r.availability_pct !== null && r.availability_pct !== undefined) {
        cur.sum += toNum(r.availability_pct);
        cur.n += 1;
      }
      m.set(r.day_ts, cur);
    }
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day_ts, x]) => ({
        day_ts,
        day_label: dayLabel(day_ts),
        total_starts: x.starts,
        total_stops: x.stops,
        avg_availability_pct: x.n ? x.sum / x.n : null,
      }));
  }, [pumpDaily, filteredPumpIds]);

  const tankChart = useMemo<TankChartRow[]>(() => {
    const m = new Map<string, TankChartRow>();
    for (const r of tankDaily) {
      const cur = m.get(r.day_ts) || {
        day_ts: r.day_ts,
        day_label: dayLabel(r.day_ts),
        low_events: 0,
        low_critical_events: 0,
        high_events: 0,
        high_critical_events: 0,
      };
      cur.low_events += toNum(r.low_events);
      cur.low_critical_events += toNum(r.low_critical_events);
      cur.high_events += toNum(r.high_events);
      cur.high_critical_events += toNum(r.high_critical_events);
      m.set(r.day_ts, cur);
    }
    return [...m.values()].sort((a, b) => a.day_ts.localeCompare(b.day_ts));
  }, [tankDaily]);

  const selectedPumpDays = useMemo(() => {
    if (!selectedPump) return [];
    return pumpDaily
      .filter((r) => Number(r.pump_id) === Number(selectedPump.pump_id))
      .sort((a, b) => a.day_ts.localeCompare(b.day_ts));
  }, [selectedPump, pumpDaily]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "location_name" || key === "pump_name" ? "asc" : "desc");
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Operación y confiabilidad</div>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Seguimiento mensual de {view === "pumps" ? "bombas" : "tanques"}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-1">
              <button onClick={() => setView("pumps")} className={`rounded-xl px-4 py-2 text-sm font-semibold ${view === "pumps" ? "bg-slate-950 text-white" : "text-slate-600"}`}>Bombas</button>
              <button onClick={() => setView("tanks")} className={`rounded-xl px-4 py-2 text-sm font-semibold ${view === "tanks" ? "bg-slate-950 text-white" : "text-slate-600"}`}>Tanques</button>
            </div>
            <button onClick={() => setMonth(prevMonth(month))} className="rounded-xl border px-3 py-2 text-sm font-semibold">← Mes anterior</button>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border px-3 py-2 text-sm font-semibold" />
            <button onClick={() => setMonth(nextMonth(month))} className="rounded-xl border px-3 py-2 text-sm font-semibold">Mes siguiente →</button>
          </div>
        </div>
      </section>

      {error && <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</section>}

      {view === "pumps" ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Filtro de bombas</span>
              <button onClick={() => setPumpFilter("impulsion")} className={`rounded-full border px-4 py-2 text-sm font-semibold ${pumpFilter === "impulsion" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"}`}>Impulsión</button>
              <button onClick={() => setPumpFilter("all")} className={`rounded-full border px-4 py-2 text-sm font-semibold ${pumpFilter === "all" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"}`}>Todas</button>
              <span className="ml-1 text-xs text-slate-400">{filteredPumpRows.length} bombas</span>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-black text-slate-950">Arranques, paradas y disponibilidad por día</h3>
            <div className="mt-4 h-[360px]">
              {loading ? <div className="flex h-full items-center justify-center text-slate-500">Cargando...</div> : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={pumpChart} margin={{ top: 12, right: 18, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day_label" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                    <Bar yAxisId="left" name="Arranques" dataKey="total_starts" fill="#2563eb" radius={[8, 8, 0, 0]} />
                    <Bar yAxisId="left" name="Paradas" dataKey="total_stops" fill="#94a3b8" radius={[8, 8, 0, 0]} />
                    <Line yAxisId="right" name="Disponibilidad %" type="monotone" dataKey="avg_availability_pct" stroke="#16a34a" strokeWidth={3} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-lg font-black text-slate-950">Tabla mensual ordenable de bombas</h3>
              <p className="text-sm text-slate-500">Tocá Ubicación para agrupar por localidad. Tocá una bomba para abrir su análisis individual.</p>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th onClick={() => toggleSort("pump_name")} className="cursor-pointer px-4 py-3 text-left font-bold hover:bg-slate-100">Equipo</th>
                    <th onClick={() => toggleSort("location_name")} className="cursor-pointer px-4 py-3 text-left font-bold hover:bg-slate-100">Ubicación {sortKey === "location_name" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
                    {[
                      ["starts_count", "Arranques"], ["stops_count", "Paradas"], ["availability_pct", "Disponibilidad"],
                      ["running_seconds", "T. encendida"], ["stopped_seconds", "T. apagada"], ["problem_score", "Score"],
                    ].map(([k, label]) => <th key={k} onClick={() => toggleSort(k)} className="cursor-pointer px-4 py-3 text-right font-bold hover:bg-slate-100">{label}</th>)}
                    <th className="px-4 py-3 text-right font-bold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPumpRows.map((r) => (
                    <tr key={r.pump_id} className="border-t border-slate-200 hover:bg-slate-50">
                      <td className="px-4 py-4 font-bold">
                        <button onClick={() => setSelectedPump(r)} className="text-left text-slate-950 underline-offset-4 hover:text-blue-700 hover:underline">{r.pump_name}</button>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{r.location_name || "-"}</td>
                      <td className="px-4 py-4 text-right">{fmtInt(r.starts_count)}</td>
                      <td className="px-4 py-4 text-right">{fmtInt(r.stops_count)}</td>
                      <td className="px-4 py-4 text-right font-semibold">{fmtPct(r.availability_pct)}</td>
                      <td className="px-4 py-4 text-right">{fmtDuration(r.running_seconds)}</td>
                      <td className="px-4 py-4 text-right">{fmtDuration(r.stopped_seconds)}</td>
                      <td className="px-4 py-4 text-right font-black">{fmtInt(r.problem_score)}</td>
                      <td className="px-4 py-4 text-right"><span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClass(r.estado_operativo)}`}>{r.estado_operativo}</span></td>
                    </tr>
                  ))}
                  {!filteredPumpRows.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">No hay bombas para este filtro.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-black">Eventos de tanques por día</h3>
            <div className="mt-4 h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={tankChart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day_label" />
                  <YAxis />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                  <Bar name="Bajo" dataKey="low_events" stackId="e" fill="#60a5fa" />
                  <Bar name="Bajo crítico" dataKey="low_critical_events" stackId="e" fill="#1d4ed8" />
                  <Bar name="Alto" dataKey="high_events" stackId="e" fill="#fb923c" />
                  <Bar name="Alto crítico" dataKey="high_critical_events" stackId="e" fill="#dc2626" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-black">Tabla mensual de tanques</h3>
            <div className="overflow-x-auto rounded-2xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50"><tr><th className="px-4 py-3 text-left">Tanque</th><th className="px-4 py-3 text-left">Ubicación</th><th className="px-4 py-3 text-right">Eventos</th><th className="px-4 py-3 text-right">Bajo crítico</th><th className="px-4 py-3 text-right">Alto crítico</th><th className="px-4 py-3 text-right">Estado</th></tr></thead>
                <tbody>{tankRows.map((r) => <tr key={r.tank_id} className="border-t"><td className="px-4 py-4 font-bold">{r.tank_name}</td><td className="px-4 py-4">{r.location_name || "-"}</td><td className="px-4 py-4 text-right">{fmtInt(r.total_events)}</td><td className="px-4 py-4 text-right">{fmtInt(r.low_critical_events)}</td><td className="px-4 py-4 text-right">{fmtInt(r.high_critical_events)}</td><td className="px-4 py-4 text-right">{r.estado_operativo}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {selectedPump && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={() => setSelectedPump(null)}>
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Análisis individual de bomba</div>
                <h3 className="text-2xl font-black text-slate-950">{selectedPump.pump_name}</h3>
                <div className="text-sm text-slate-500">{selectedPump.location_name || "Sin ubicación"} · {month}</div>
              </div>
              <button onClick={() => setSelectedPump(null)} className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700">Cerrar</button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {[
                ["Disponibilidad", fmtPct(selectedPump.availability_pct)],
                ["Arranques", fmtInt(selectedPump.starts_count)],
                ["Paradas", fmtInt(selectedPump.stops_count)],
                ["T. encendida", fmtDuration(selectedPump.running_seconds)],
                ["T. apagada", fmtDuration(selectedPump.stopped_seconds)],
                ["Score", fmtInt(selectedPump.problem_score)],
              ].map(([a, b]) => <div key={a} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-semibold uppercase text-slate-400">{a}</div><div className="mt-1 text-xl font-black">{b}</div></div>)}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-5">
                <h4 className="font-black text-slate-900">Referencia eléctrica</h4>
                {diagLoading ? <div className="mt-4 text-sm text-slate-500">Cargando diagnóstico...</div> : diagnostic ? (
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Corriente oficial (pinza)</span><b>{diagnostic.official?.current_a != null ? `${fmtNum(diagnostic.official.current_a, 1)} A` : "--"}</b></div>
                    <div className="flex justify-between"><span className="text-slate-500">Fases de referencia</span><b>{diagnostic.official?.i_l1_a != null ? `${fmtNum(diagnostic.official.i_l1_a, 1)} / ${fmtNum(diagnostic.official.i_l2_a, 1)} / ${fmtNum(diagnostic.official.i_l3_a, 1)} A` : "--"}</b></div>
                    <div className="flex justify-between"><span className="text-slate-500">Tipo de arranque</span><b>{diagnostic.official?.startup_type || "--"}</b></div>
                    <div className="flex justify-between"><span className="text-slate-500">Potencia normal aprendida</span><b>{diagnostic.model?.power_ref_kw != null ? `${fmtNum(diagnostic.model.power_ref_kw, 1)} kW` : "--"}</b></div>
                    <div className="flex justify-between"><span className="text-slate-500">Estimación de corriente ABB</span><b>{diagnostic.model?.current_a != null ? `${fmtNum(diagnostic.model.current_a, 1)} A` : "--"}</b></div>
                    <div className="flex justify-between"><span className="text-slate-500">Error modelo vs pinza</span><b>{diagnostic.model?.current_error_pct != null ? fmtPct(diagnostic.model.current_error_pct) : "--"}</b></div>
                  </div>
                ) : <div className="mt-4 text-sm text-slate-500">Sin referencia eléctrica disponible.</div>}
              </div>

              <div className="rounded-2xl border border-slate-200 p-5">
                <h4 className="font-black text-slate-900">Diagnóstico de potencia</h4>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Estado actual</span><b>{diagnostic?.state || "--"}</b></div>
                  <div className="flex justify-between"><span className="text-slate-500">Potencia inferida último arranque</span><b>{diagnostic?.live?.power_kw != null ? `${fmtNum(diagnostic.live.power_kw, 1)} kW` : "--"}</b></div>
                  <div className="flex justify-between"><span className="text-slate-500">Desvío vs normal</span><b>{diagnostic?.live?.power_deviation_pct != null ? fmtPct(diagnostic.live.power_deviation_pct) : "--"}</b></div>
                  <div className="flex justify-between"><span className="text-slate-500">Estado diagnóstico</span><span className={`rounded-full border px-3 py-1 text-xs font-bold ${powerStatusClass(diagnostic?.live?.power_status)}`}>{diagnostic?.live?.power_status || "monitoring"}</span></div>
                  {diagnostic?.live?.power_reason && <div className="rounded-xl bg-slate-50 p-3 text-slate-600">{diagnostic.live.power_reason}</div>}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 p-5">
              <h4 className="font-black text-slate-900">Comportamiento diario de la bomba</h4>
              <div className="mt-4 h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={selectedPumpDays.map((r) => ({ ...r, day_label: dayLabel(r.day_ts) }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day_label" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                    <Bar yAxisId="left" name="Arranques" dataKey="starts_count" fill="#2563eb" />
                    <Line yAxisId="right" name="Disponibilidad %" dataKey="availability_pct" stroke="#16a34a" strokeWidth={3} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
