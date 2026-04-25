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
type SortDir = "asc" | "desc";

type Props = {
  locationId?: number | string;
  selectedPumpIds?: number[] | "all";
  selectedTankIds?: number[] | "all";
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

type TankDailyRow = {
  day_ts: string;
  tank_id: number;
  tank_name: string;
  location_id: number | null;
  location_name: string | null;
  total_events: number;
  active_events: number;
  normalized_events: number;
  low_events: number;
  low_critical_events: number;
  high_events: number;
  high_critical_events: number;
  min_detected_value: number | null;
  max_detected_value: number | null;
  avg_detected_value: number | null;
  total_duration_seconds: number;
  estado_operativo: string;
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

type TankRankingRow = {
  tank_id: number;
  tank_name: string;
  location_id: number | null;
  location_name: string | null;
  total_events: number;
  active_events: number;
  normalized_events: number;
  low_events: number;
  low_critical_events: number;
  high_events: number;
  high_critical_events: number;
  min_detected_value: number | null;
  max_detected_value: number | null;
  avg_detected_value: number | null;
  total_duration_seconds: number;
  problem_score: number;
  estado_operativo: string;
};

type ChartRow = {
  day_ts: string;
  total_starts?: number;
  total_stops?: number;
  avg_availability_pct?: number | null;
  total_problem_score?: number;
  total_events?: number;
  active_events?: number;
  low_events?: number;
  low_critical_events?: number;
  high_events?: number;
  high_critical_events?: number;
  total_duration_seconds?: number;
};

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

function toNum(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmtInt(value: any) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return Math.round(n).toLocaleString("es-AR");
}

function fmtPct(value: any) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

function fmtHours(seconds: any) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return "-";
  const h = s / 3600;
  if (h < 1) return `${Math.round(s / 60)} min`;
  return `${h.toLocaleString("es-AR", { maximumFractionDigits: 1 })} h`;
}

function dayLabel(day: string) {
  if (!day) return "-";
  const parts = day.split("-");
  if (parts.length !== 3) return day;
  return `${parts[2]}/${parts[1]}`;
}

function buildUrl(path: string, params: Record<string, string | number | undefined | null>) {
  const url = new URL(scopedUrl(path));
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "" && value !== "all") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function fetchJson<T>(path: string, params: Record<string, string | number | undefined | null> = {}): Promise<T> {
  const res = await fetch(buildUrl(path, params), {
    method: "GET",
    headers: getApiHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Error ${res.status}: ${text || res.statusText}`);
  }

  return res.json();
}

function statusStyle(status?: string) {
  const s = String(status || "").toLowerCase();

  if (
    s.includes("severo") ||
    s.includes("activo") ||
    s.includes("vacio") ||
    s.includes("vacío") ||
    s.includes("rebalse") ||
    s.includes("muy")
  ) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (s.includes("baja") || s.includes("prolongado") || s.includes("inestable")) {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (s.includes("revisar") || s.includes("muchos")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function problemBarClass(score: number) {
  if (score >= 120) return "bg-red-500";
  if (score >= 60) return "bg-orange-500";
  if (score >= 25) return "bg-amber-400";
  return "bg-emerald-500";
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs shadow-xl">
      <div className="mb-2 font-semibold text-slate-900">{label}</div>
      <div className="space-y-1">
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex justify-between gap-4">
            <span className="text-slate-500">{p.name || p.dataKey}</span>
            <span className="font-semibold text-slate-900">
              {typeof p.value === "number"
                ? p.value.toLocaleString("es-AR", { maximumFractionDigits: 2 })
                : p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  help,
  tone = "slate",
}: {
  label: string;
  value: string;
  help?: string;
  tone?: "slate" | "red" | "orange" | "emerald" | "blue";
}) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-900",
    red: "border-red-200 bg-red-50 text-red-800",
    orange: "border-orange-200 bg-orange-50 text-orange-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
  };

  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${tones[tone]}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-2 text-3xl font-black tracking-tight">{value}</div>
      {help ? <div className="mt-1 text-xs opacity-70">{help}</div> : null}
    </div>
  );
}

export default function ReliabilityPage({
  locationId = "all",
  selectedPumpIds = "all",
  selectedTankIds = "all",
}: Props) {
  const [view, setView] = useState<ViewMode>("pumps");
  const [month, setMonth] = useState(currentMonth());

  const [pumpDaily, setPumpDaily] = useState<PumpDailyRow[]>([]);
  const [tankDaily, setTankDaily] = useState<TankDailyRow[]>([]);
  const [pumpRanking, setPumpRanking] = useState<PumpRankingRow[]>([]);
  const [tankRanking, setTankRanking] = useState<TankRankingRow[]>([]);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState("problem_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const locParam = locationId === "all" ? undefined : Number(locationId);

  const selectedPumpSet = useMemo(() => {
    if (selectedPumpIds === "all" || !Array.isArray(selectedPumpIds) || selectedPumpIds.length === 0) return null;
    return new Set(selectedPumpIds.map(Number));
  }, [selectedPumpIds]);

  const selectedTankSet = useMemo(() => {
    if (selectedTankIds === "all" || !Array.isArray(selectedTankIds) || selectedTankIds.length === 0) return null;
    return new Set(selectedTankIds.map(Number));
  }, [selectedTankIds]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const [pd, pr, td, tr] = await Promise.all([
          fetchJson<{ ok: boolean; items: PumpDailyRow[] }>("/kpi/operation-reliability/pump-daily", {
            month,
            location_id: locParam,
          }),
          fetchJson<{ ok: boolean; items: PumpRankingRow[] }>("/kpi/operation-reliability/pump-ranking", {
            month,
            location_id: locParam,
            limit: 100,
          }),
          fetchJson<{ ok: boolean; items: TankDailyRow[] }>("/kpi/operation-reliability/tank-daily", {
            month,
            location_id: locParam,
          }),
          fetchJson<{ ok: boolean; items: TankRankingRow[] }>("/kpi/operation-reliability/tank-ranking", {
            month,
            location_id: locParam,
            limit: 100,
          }),
        ]);

        if (!alive) return;

        setPumpDaily(Array.isArray(pd.items) ? pd.items : []);
        setPumpRanking(Array.isArray(pr.items) ? pr.items : []);
        setTankDaily(Array.isArray(td.items) ? td.items : []);
        setTankRanking(Array.isArray(tr.items) ? tr.items : []);
        setSelectedDay(null);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "No se pudieron cargar los datos.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, [month, locParam]);

  const filteredPumpDaily = useMemo(() => {
    if (!selectedPumpSet) return pumpDaily;
    return pumpDaily.filter((r) => selectedPumpSet.has(Number(r.pump_id)));
  }, [pumpDaily, selectedPumpSet]);

  const filteredTankDaily = useMemo(() => {
    if (!selectedTankSet) return tankDaily;
    return tankDaily.filter((r) => selectedTankSet.has(Number(r.tank_id)));
  }, [tankDaily, selectedTankSet]);

  const filteredPumpRanking = useMemo(() => {
    if (!selectedPumpSet) return pumpRanking;
    return pumpRanking.filter((r) => selectedPumpSet.has(Number(r.pump_id)));
  }, [pumpRanking, selectedPumpSet]);

  const filteredTankRanking = useMemo(() => {
    if (!selectedTankSet) return tankRanking;
    return tankRanking.filter((r) => selectedTankSet.has(Number(r.tank_id)));
  }, [tankRanking, selectedTankSet]);

  const pumpChart = useMemo<ChartRow[]>(() => {
    const map = new Map<string, ChartRow & { availability_sum: number; availability_count: number }>();

    for (const r of filteredPumpDaily) {
      const key = r.day_ts;
      const curr =
        map.get(key) ||
        ({
          day_ts: key,
          total_starts: 0,
          total_stops: 0,
          total_problem_score: 0,
          avg_availability_pct: null,
          availability_sum: 0,
          availability_count: 0,
        } as ChartRow & { availability_sum: number; availability_count: number });

      curr.total_starts = toNum(curr.total_starts) + toNum(r.starts_count);
      curr.total_stops = toNum(curr.total_stops) + toNum(r.stops_count);
      curr.total_problem_score = toNum(curr.total_problem_score) + toNum(r.problem_score);

      if (r.availability_pct !== null && r.availability_pct !== undefined) {
        curr.availability_sum += toNum(r.availability_pct);
        curr.availability_count += 1;
        curr.avg_availability_pct = Number((curr.availability_sum / curr.availability_count).toFixed(2));
      }

      map.set(key, curr);
    }

    return Array.from(map.values())
      .sort((a, b) => a.day_ts.localeCompare(b.day_ts))
      .map(({ availability_sum, availability_count, ...r }) => r);
  }, [filteredPumpDaily]);

  const tankChart = useMemo<ChartRow[]>(() => {
    const map = new Map<string, ChartRow>();

    for (const r of filteredTankDaily) {
      const key = r.day_ts;
      const curr =
        map.get(key) ||
        ({
          day_ts: key,
          total_events: 0,
          active_events: 0,
          low_events: 0,
          low_critical_events: 0,
          high_events: 0,
          high_critical_events: 0,
          total_duration_seconds: 0,
        } as ChartRow);

      curr.total_events = toNum(curr.total_events) + toNum(r.total_events);
      curr.active_events = toNum(curr.active_events) + toNum(r.active_events);
      curr.low_events = toNum(curr.low_events) + toNum(r.low_events);
      curr.low_critical_events = toNum(curr.low_critical_events) + toNum(r.low_critical_events);
      curr.high_events = toNum(curr.high_events) + toNum(r.high_events);
      curr.high_critical_events = toNum(curr.high_critical_events) + toNum(r.high_critical_events);
      curr.total_duration_seconds = toNum(curr.total_duration_seconds) + toNum(r.total_duration_seconds);

      map.set(key, curr);
    }

    return Array.from(map.values()).sort((a, b) => a.day_ts.localeCompare(b.day_ts));
  }, [filteredTankDaily]);

  const chartData = view === "pumps" ? pumpChart : tankChart;

  const selectedRows = useMemo(() => {
    if (!selectedDay) return [];
    return view === "pumps"
      ? filteredPumpDaily.filter((r) => r.day_ts === selectedDay)
      : filteredTankDaily.filter((r) => r.day_ts === selectedDay);
  }, [selectedDay, view, filteredPumpDaily, filteredTankDaily]);

  const sortedRanking = useMemo(() => {
    const rows = view === "pumps" ? [...filteredPumpRanking] : [...filteredTankRanking];

    rows.sort((a: any, b: any) => {
      const av = toNum(a[sortKey], -999999);
      const bv = toNum(b[sortKey], -999999);
      return sortDir === "asc" ? av - bv : bv - av;
    });

    return rows;
  }, [view, filteredPumpRanking, filteredTankRanking, sortKey, sortDir]);

  const summary = useMemo(() => {
    if (view === "pumps") {
      const starts = filteredPumpDaily.reduce((acc, r) => acc + toNum(r.starts_count), 0);
      const stops = filteredPumpDaily.reduce((acc, r) => acc + toNum(r.stops_count), 0);
      const score = filteredPumpDaily.reduce((acc, r) => acc + toNum(r.problem_score), 0);
      const severe = filteredPumpRanking.filter((r) => r.estado_operativo !== "normal").length;
      const availabilityRows = filteredPumpDaily.filter((r) => r.availability_pct !== null);
      const avgAvailability =
        availabilityRows.length > 0
          ? availabilityRows.reduce((acc, r) => acc + toNum(r.availability_pct), 0) / availabilityRows.length
          : null;

      return {
        a: fmtInt(starts),
        b: fmtInt(stops),
        c: avgAvailability === null ? "-" : fmtPct(avgAvailability),
        d: fmtInt(severe),
        score,
      };
    }

    const events = filteredTankDaily.reduce((acc, r) => acc + toNum(r.total_events), 0);
    const crit =
      filteredTankDaily.reduce((acc, r) => acc + toNum(r.low_critical_events), 0) +
      filteredTankDaily.reduce((acc, r) => acc + toNum(r.high_critical_events), 0);
    const active = filteredTankDaily.reduce((acc, r) => acc + toNum(r.active_events), 0);
    const duration = filteredTankDaily.reduce((acc, r) => acc + toNum(r.total_duration_seconds), 0);

    return {
      a: fmtInt(events),
      b: fmtInt(crit),
      c: fmtInt(active),
      d: fmtHours(duration),
      score: events,
    };
  }, [view, filteredPumpDaily, filteredPumpRanking, filteredTankDaily]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const hasData = chartData.length > 0 || sortedRanking.length > 0;

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Operación y confiabilidad
            </div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
              Seguimiento mensual de {view === "pumps" ? "bombas" : "tanques"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Comparación día a día, ranking de equipos problemáticos y detalle por jornada.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => {
                  setView("pumps");
                  setSelectedDay(null);
                  setSortKey("problem_score");
                  setSortDir("desc");
                }}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  view === "pumps" ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-white"
                }`}
              >
                Bombas
              </button>
              <button
                type="button"
                onClick={() => {
                  setView("tanks");
                  setSelectedDay(null);
                  setSortKey("problem_score");
                  setSortDir("desc");
                }}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  view === "tanks" ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-white"
                }`}
              >
                Tanques
              </button>
            </div>

            <button
              type="button"
              onClick={() => setMonth(prevMonth(month))}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              ← Mes anterior
            </button>

            <input
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setSelectedDay(null);
              }}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm outline-none"
            />

            <button
              type="button"
              onClick={() => setMonth(nextMonth(month))}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Mes siguiente →
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-slate-100 px-3 py-1">
            Ubicación: {locationId === "all" ? "Todas" : locationId}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1">
            Mes: {month}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1">
            Filtro superior aplicado
          </span>
        </div>
      </section>

      {error ? (
        <section className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {view === "pumps" ? (
          <>
            <KpiCard label="Arranques" value={summary.a} help="Total del mes filtrado" tone={summary.score > 150 ? "red" : "blue"} />
            <KpiCard label="Paradas" value={summary.b} help="Eventos de apagado" />
            <KpiCard label="Disponibilidad prom." value={summary.c} help="Promedio de días con datos" tone="emerald" />
            <KpiCard label="Bombas a revisar" value={summary.d} help="Estados distintos de normal" tone={Number(summary.d) > 0 ? "orange" : "emerald"} />
          </>
        ) : (
          <>
            <KpiCard label="Eventos" value={summary.a} help="Total del mes filtrado" tone={summary.score > 30 ? "red" : "blue"} />
            <KpiCard label="Críticos" value={summary.b} help="Low-low + high-high" tone={Number(summary.b) > 0 ? "orange" : "emerald"} />
            <KpiCard label="Activos" value={summary.c} help="Eventos todavía activos" tone={Number(summary.c) > 0 ? "red" : "emerald"} />
            <KpiCard label="Duración acum." value={summary.d} help="Tiempo total de eventos" />
          </>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.85fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-950">
                {view === "pumps" ? "Arranques y disponibilidad por día" : "Eventos de tanques por día"}
              </h3>
              <p className="text-sm text-slate-500">
                Tocá una barra para ver el detalle del día. Tocá de nuevo el área de ranking para volver al resumen.
              </p>
            </div>

            {selectedDay ? (
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                Ver ranking mensual
              </button>
            ) : null}
          </div>

          <div className="h-[360px]">
            {loading ? (
              <div className="flex h-full items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">
                Cargando datos...
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">
                No hay datos para este mes o filtro.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData.map((r) => ({ ...r, day_label: dayLabel(r.day_ts) }))}
                  margin={{ top: 12, right: 18, left: -8, bottom: 0 }}
                  onClick={(state: any) => {
                    const day = state?.activePayload?.[0]?.payload?.day_ts;
                    if (day) setSelectedDay(day);
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day_label" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                  {view === "pumps" ? (
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 12 }} />
                  ) : null}
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />

                  {view === "pumps" ? (
                    <>
                      <Bar yAxisId="left" name="Arranques" dataKey="total_starts" fill="#2563eb" radius={[8, 8, 0, 0]} />
                      <Bar yAxisId="left" name="Paradas" dataKey="total_stops" fill="#94a3b8" radius={[8, 8, 0, 0]} />
                      <Line
                        yAxisId="right"
                        name="Disponibilidad %"
                        type="monotone"
                        dataKey="avg_availability_pct"
                        stroke="#16a34a"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                      />
                    </>
                  ) : (
                    <>
                      <Bar name="Bajo" dataKey="low_events" stackId="events" fill="#60a5fa" radius={[0, 0, 0, 0]} />
                      <Bar name="Bajo crítico" dataKey="low_critical_events" stackId="events" fill="#1d4ed8" radius={[0, 0, 0, 0]} />
                      <Bar name="Alto" dataKey="high_events" stackId="events" fill="#fb923c" radius={[0, 0, 0, 0]} />
                      <Bar name="Alto crítico" dataKey="high_critical_events" stackId="events" fill="#dc2626" radius={[8, 8, 0, 0]} />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          {selectedDay ? (
            <>
              <div className="mb-4">
                <h3 className="text-lg font-black text-slate-950">Detalle del {dayLabel(selectedDay)}</h3>
                <p className="text-sm text-slate-500">
                  {view === "pumps" ? "Bombas ordenadas por score del día." : "Tanques ordenados por eventos del día."}
                </p>
              </div>

              <div className="space-y-3">
                {selectedRows.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No hay detalle para este día.</div>
                ) : (
                  selectedRows
                    .slice()
                    .sort((a: any, b: any) =>
                      view === "pumps"
                        ? toNum(b.problem_score) - toNum(a.problem_score)
                        : toNum(b.total_events) - toNum(a.total_events)
                    )
                    .map((r: any) => (
                      <div key={`${selectedDay}-${view === "pumps" ? r.pump_id : r.tank_id}`} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-bold text-slate-900">{view === "pumps" ? r.pump_name : r.tank_name}</div>
                            <div className="text-xs text-slate-500">{r.location_name || "Sin ubicación"}</div>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyle(r.estado_operativo)}`}>
                            {r.estado_operativo}
                          </span>
                        </div>

                        {view === "pumps" ? (
                          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded-xl bg-slate-50 p-2">
                              <div className="text-slate-500">Arranques</div>
                              <div className="font-black">{fmtInt(r.starts_count)}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-2">
                              <div className="text-slate-500">Disp.</div>
                              <div className="font-black">{fmtPct(r.availability_pct)}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-2">
                              <div className="text-slate-500">Score</div>
                              <div className="font-black">{fmtInt(r.problem_score)}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded-xl bg-slate-50 p-2">
                              <div className="text-slate-500">Eventos</div>
                              <div className="font-black">{fmtInt(r.total_events)}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-2">
                              <div className="text-slate-500">Críticos</div>
                              <div className="font-black">{fmtInt(toNum(r.low_critical_events) + toNum(r.high_critical_events))}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-2">
                              <div className="text-slate-500">Duración</div>
                              <div className="font-black">{fmtHours(r.total_duration_seconds)}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="mb-4">
                <h3 className="text-lg font-black text-slate-950">Ranking mensual</h3>
                <p className="text-sm text-slate-500">
                  Sin seleccionar un día, se muestra lo más problemático del mes.
                </p>
              </div>

              <div className="space-y-3">
                {sortedRanking.slice(0, 8).map((r: any, index) => {
                  const score = toNum(r.problem_score);
                  const name = view === "pumps" ? r.pump_name : r.tank_name;
                  const metric =
                    view === "pumps"
                      ? `${fmtInt(r.starts_count)} arranques · ${fmtPct(r.availability_pct)}`
                      : `${fmtInt(r.total_events)} eventos · ${fmtInt(toNum(r.low_critical_events) + toNum(r.high_critical_events))} críticos`;

                  return (
                    <div key={`${view}-${index}-${name}`} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-900">{name}</div>
                          <div className="text-xs text-slate-500">{r.location_name || "Sin ubicación"}</div>
                          <div className="mt-1 text-sm text-slate-600">{metric}</div>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyle(r.estado_operativo)}`}>
                          {r.estado_operativo}
                        </span>
                      </div>

                      <div className="mt-3 h-2 rounded-full bg-slate-100">
                        <div
                          className={`h-2 rounded-full ${problemBarClass(score)}`}
                          style={{ width: `${Math.min(100, Math.max(4, score))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-950">
              Tabla ordenable de {view === "pumps" ? "bombas" : "tanques"}
            </h3>
            <p className="text-sm text-slate-500">
              Tocá una columna para ordenar. Sirve para revisar disponibilidad, arranques, eventos y score.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left font-bold">Equipo</th>
                <th className="px-4 py-3 text-left font-bold">Ubicación</th>

                {view === "pumps" ? (
                  <>
                    <th onClick={() => toggleSort("starts_count")} className="cursor-pointer px-4 py-3 text-right font-bold hover:bg-slate-100">
                      Arranques
                    </th>
                    <th onClick={() => toggleSort("stops_count")} className="cursor-pointer px-4 py-3 text-right font-bold hover:bg-slate-100">
                      Paradas
                    </th>
                    <th onClick={() => toggleSort("availability_pct")} className="cursor-pointer px-4 py-3 text-right font-bold hover:bg-slate-100">
                      Disponibilidad
                    </th>
                    <th onClick={() => toggleSort("problem_score")} className="cursor-pointer px-4 py-3 text-right font-bold hover:bg-slate-100">
                      Score
                    </th>
                  </>
                ) : (
                  <>
                    <th onClick={() => toggleSort("total_events")} className="cursor-pointer px-4 py-3 text-right font-bold hover:bg-slate-100">
                      Eventos
                    </th>
                    <th onClick={() => toggleSort("low_critical_events")} className="cursor-pointer px-4 py-3 text-right font-bold hover:bg-slate-100">
                      Bajo crítico
                    </th>
                    <th onClick={() => toggleSort("high_critical_events")} className="cursor-pointer px-4 py-3 text-right font-bold hover:bg-slate-100">
                      Alto crítico
                    </th>
                    <th onClick={() => toggleSort("problem_score")} className="cursor-pointer px-4 py-3 text-right font-bold hover:bg-slate-100">
                      Score
                    </th>
                  </>
                )}

                <th className="px-4 py-3 text-right font-bold">Estado</th>
              </tr>
            </thead>

            <tbody>
              {!hasData ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    No hay datos para mostrar.
                  </td>
                </tr>
              ) : (
                sortedRanking.map((r: any) => (
                  <tr key={`${view}-${view === "pumps" ? r.pump_id : r.tank_id}`} className="border-t border-slate-200 hover:bg-slate-50">
                    <td className="px-4 py-4 font-bold text-slate-900">{view === "pumps" ? r.pump_name : r.tank_name}</td>
                    <td className="px-4 py-4 text-slate-600">{r.location_name || "-"}</td>

                    {view === "pumps" ? (
                      <>
                        <td className="px-4 py-4 text-right">{fmtInt(r.starts_count)}</td>
                        <td className="px-4 py-4 text-right">{fmtInt(r.stops_count)}</td>
                        <td className="px-4 py-4 text-right font-semibold">{fmtPct(r.availability_pct)}</td>
                        <td className="px-4 py-4 text-right font-black">{fmtInt(r.problem_score)}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-4 text-right">{fmtInt(r.total_events)}</td>
                        <td className="px-4 py-4 text-right">{fmtInt(r.low_critical_events)}</td>
                        <td className="px-4 py-4 text-right">{fmtInt(r.high_critical_events)}</td>
                        <td className="px-4 py-4 text-right font-black">{fmtInt(r.problem_score)}</td>
                      </>
                    )}

                    <td className="px-4 py-4 text-right">
                      <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusStyle(r.estado_operativo)}`}>
                        {r.estado_operativo}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}