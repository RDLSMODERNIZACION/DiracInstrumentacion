import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { scopedUrl, getApiHeaders } from "@/lib/config";

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

type PumpReference = {
  pump_id?: number;
  pump_name?: string | null;
  i_avg_a?: number | null;
};

type PumpEvent = {
  pump_id: number;
  location_id: number | null;
  event_type: "start" | "stop" | string;
  event_ts: string;
  event_time: string;
};

type SignalPoint = {
  ts: string;
  value?: number | null;
  p_kw?: number | null;
  current_a?: number | null;
  pf?: number | null;
};

type HydraulicContext = {
  available: boolean;
  mapping_source?: string;
  signal_id?: number;
  manifold_id?: number;
  manifold_name?: string | null;
  tag?: string | null;
  unit?: string | null;
  before?: number | null;
  after?: number | null;
  delta?: number | null;
  series: SignalPoint[];
};

type EnergyContext = {
  available: boolean;
  mapping_source?: string;
  analyzer_id?: number;
  analyzer_name?: string | null;
  before?: { p_kw?: number | null; current_a?: number | null };
  after?: { p_kw?: number | null; current_a?: number | null };
  delta?: { p_kw?: number | null; current_a?: number | null };
  series: SignalPoint[];
};

type EventContext = {
  ok: boolean;
  pump?: {
    pump_id: number;
    pump_name: string;
    location_id: number | null;
    location_name: string | null;
  };
  event?: {
    type?: string | null;
    ts: string;
    window_minutes: number;
    from: string;
    to: string;
  };
  energy: EnergyContext;
  pressure: HydraulicContext;
  flow: HydraulicContext;
};

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function fmtNum(v: unknown, d = 1) {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString("es-AR", { maximumFractionDigits: d, minimumFractionDigits: d })
    : "--";
}

function fmtPct(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n)
    ? `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`
    : "--";
}

function fmtDuration(v: unknown) {
  const s = Number(v);
  if (!Number.isFinite(s) || s <= 0) return "--";
  if (s < 60) return `${Math.round(s)} seg`;
  if (s < 3600) return `${(s / 60).toLocaleString("es-AR", { maximumFractionDigits: 1 })} min`;
  return `${(s / 3600).toLocaleString("es-AR", { maximumFractionDigits: 1 })} h`;
}

function dayLabel(day: string) {
  const p = String(day || "").split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}` : day;
}

function fullDayLabel(day: string) {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function fmtEventTime(ts?: string | null) {
  if (!ts) return "--:--:--";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

function buildUrl(path: string, params: Record<string, string | number | undefined | null> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
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
  if (s === "low_power" || s === "high_power") return "border-red-200 bg-red-50 text-red-700";
  if (s === "normal") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function stateClass(state?: string | null) {
  return String(state || "").toLowerCase() === "run"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-slate-200 bg-slate-100 text-slate-700";
}

function MetricCard({
  label,
  value,
  hint,
  accent = "slate",
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "slate" | "blue" | "emerald" | "amber";
}) {
  const top =
    accent === "blue"
      ? "bg-blue-600"
      : accent === "emerald"
        ? "bg-emerald-500"
        : accent === "amber"
          ? "bg-amber-500"
          : "bg-slate-900";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`absolute inset-x-0 top-0 h-1 ${top}`} />
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function MiniStat({
  label,
  before,
  after,
  delta,
  unit,
}: {
  label: string;
  before?: number | null;
  after?: number | null;
  delta?: number | null;
  unit?: string | null;
}) {
  const u = unit ? ` ${unit}` : "";
  const deltaText =
    delta == null
      ? "--"
      : `${delta > 0 ? "+" : ""}${fmtNum(delta, 2)}${u}`;
  return (
    <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs">
      <div>
        <div className="font-semibold uppercase tracking-wide text-slate-400">{label} antes</div>
        <div className="mt-1 text-sm font-black text-slate-900">{before == null ? "--" : `${fmtNum(before, 2)}${u}`}</div>
      </div>
      <div>
        <div className="font-semibold uppercase tracking-wide text-slate-400">Después</div>
        <div className="mt-1 text-sm font-black text-slate-900">{after == null ? "--" : `${fmtNum(after, 2)}${u}`}</div>
      </div>
      <div>
        <div className="font-semibold uppercase tracking-wide text-slate-400">Δ</div>
        <div className={`mt-1 text-sm font-black ${delta != null && Math.abs(delta) > 0 ? "text-blue-700" : "text-slate-900"}`}>{deltaText}</div>
      </div>
    </div>
  );
}

function ContextChart({
  title,
  subtitle,
  unit,
  series,
  valueKey,
  eventTs,
  unavailableText,
}: {
  title: string;
  subtitle?: string;
  unit?: string | null;
  series: SignalPoint[];
  valueKey: "value" | "p_kw" | "current_a";
  eventTs?: string | null;
  unavailableText: string;
}) {
  const chart = useMemo(
    () =>
      (series || [])
        .map((p) => ({
          t: new Date(p.ts).getTime(),
          value: p[valueKey] == null ? null : Number(p[valueKey]),
        }))
        .filter((p) => Number.isFinite(p.t)),
    [series, valueKey]
  );

  if (!chart.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
        <div className="font-black text-slate-900">{title}</div>
        {subtitle && <div className="mt-1 text-xs text-slate-500">{subtitle}</div>}
        <div className="mt-8 text-center text-sm text-slate-400">{unavailableText}</div>
      </div>
    );
  }

  const eventMs = eventTs ? new Date(eventTs).getTime() : undefined;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="font-black text-slate-900">{title}</div>
      {subtitle && <div className="mt-1 text-xs text-slate-500">{subtitle}</div>}
      <div className="mt-4 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              type="number"
              dataKey="t"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) =>
                new Date(Number(v)).toLocaleTimeString("es-AR", {
                  timeZone: "America/Argentina/Buenos_Aires",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              }
              tick={{ fontSize: 11 }}
            />
            <YAxis tick={{ fontSize: 11 }} width={58} />
            <Tooltip
              labelFormatter={(v) => fmtEventTime(new Date(Number(v)).toISOString())}
              formatter={(v: any) => [`${fmtNum(v, 2)}${unit ? ` ${unit}` : ""}`, title]}
            />
            <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2.5} dot={false} connectNulls />
            {eventMs && Number.isFinite(eventMs) && (
              <ReferenceLine x={eventMs} stroke="#0f172a" strokeDasharray="5 4" strokeWidth={2} label={{ value: "EVENTO", position: "insideTopRight", fontSize: 10 }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function PumpAnalysis() {
  const { pumpId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const pumpIdNum = Number(pumpId);
  const month = searchParams.get("month") || currentMonth();

  const [daily, setDaily] = useState<PumpDailyRow[]>([]);
  const [diagnostic, setDiagnostic] = useState<PumpDiagnostic | null>(null);
  const [reference, setReference] = useState<PumpReference | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedDay, setSelectedDay] = useState<PumpDailyRow | null>(null);
  const [dayEvents, setDayEvents] = useState<PumpEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");

  const [selectedEvent, setSelectedEvent] = useState<PumpEvent | null>(null);
  const [context, setContext] = useState<EventContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState("");
  const [windowMinutes, setWindowMinutes] = useState(15);

  useEffect(() => {
    if (!Number.isFinite(pumpIdNum) || pumpIdNum <= 0) {
      setError("Bomba inválida");
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    setError("");

    Promise.all([
      fetchJson<{ items: PumpDailyRow[] }>("/kpi/operation-reliability/pump-daily", {
        month,
        pump_id: pumpIdNum,
      }),
      fetchJson<PumpDiagnostic>(`/components/network_analyzers/pump-diagnostic/${pumpIdNum}`).catch(() => null),
      fetchJson<PumpReference>(`/components/network_analyzers/pump-reference/${pumpIdNum}`).catch(() => null),
    ])
      .then(([d, diag, ref]) => {
        if (!alive) return;
        setDaily(Array.isArray(d.items) ? d.items : []);
        setDiagnostic(diag);
        setReference(ref);
      })
      .catch((e) => alive && setError(e?.message || "No se pudo cargar el análisis"))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [pumpIdNum, month]);

  useEffect(() => {
    if (!selectedDay?.day_ts) {
      setDayEvents([]);
      setEventsError("");
      return;
    }
    let alive = true;
    setEventsLoading(true);
    setEventsError("");
    setSelectedEvent(null);
    setContext(null);

    fetchJson<{ items: PumpEvent[] }>("/kpi/operation-reliability/pump-events", {
      day: selectedDay.day_ts,
      pump_ids: String(pumpIdNum),
    })
      .then((r) => {
        if (!alive) return;
        setDayEvents(Array.isArray(r.items) ? r.items : []);
      })
      .catch((e) => alive && setEventsError(e?.message || "No se pudieron cargar los eventos del día."))
      .finally(() => alive && setEventsLoading(false));

    return () => {
      alive = false;
    };
  }, [selectedDay?.day_ts, pumpIdNum]);

  useEffect(() => {
    if (!selectedEvent) {
      setContext(null);
      setContextError("");
      return;
    }
    let alive = true;
    setContextLoading(true);
    setContextError("");

    fetchJson<EventContext>("/kpi/operation-reliability/pump-event-context", {
      pump_id: pumpIdNum,
      event_ts: selectedEvent.event_ts,
      event_type: selectedEvent.event_type,
      window_minutes: windowMinutes,
    })
      .then((r) => alive && setContext(r))
      .catch((e) => {
        if (!alive) return;
        setContext(null);
        setContextError(e?.message || "No se pudo sincronizar el contexto del evento.");
      })
      .finally(() => alive && setContextLoading(false));

    return () => {
      alive = false;
    };
  }, [selectedEvent?.event_ts, selectedEvent?.event_type, pumpIdNum, windowMinutes]);

  const summary = useMemo(() => {
    const starts = daily.reduce((a, r) => a + toNum(r.starts_count), 0);
    const stops = daily.reduce((a, r) => a + toNum(r.stops_count), 0);
    const run = daily.reduce((a, r) => a + toNum(r.running_seconds), 0);
    const stop = daily.reduce((a, r) => a + toNum(r.stopped_seconds), 0);
    const total = run + stop;
    return {
      starts,
      stops,
      run,
      stop,
      availability: total > 0 ? (run / total) * 100 : null,
      score: daily.reduce((a, r) => a + toNum(r.problem_score), 0),
    };
  }, [daily]);

  const first = daily[0];
  const pumpName = first?.pump_name || reference?.pump_name || `Bomba ${pumpIdNum}`;
  const locationName = first?.location_name || "Sin ubicación";
  const chartData = useMemo(() => daily.map((r) => ({ ...r, day_label: dayLabel(r.day_ts) })), [daily]);

  function chooseDay(data: any) {
    const row = (data?.payload ?? data) as PumpDailyRow;
    if (row?.day_ts) {
      setSelectedDay(row);
      setTimeout(() => document.getElementById("event-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-7xl rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Cargando análisis operativo de la bomba...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 md:px-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="h-1.5 bg-slate-950" />
          <div className="p-6 md:p-7">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">Asset intelligence · bomba</div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-4xl">{pumpName}</h1>
                  <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${stateClass(diagnostic?.state)}`}>
                    {diagnostic?.state || "sin estado"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <span>{locationName}</span>
                  <span>•</span>
                  <span>ID {pumpIdNum}</span>
                  {diagnostic?.analyzer_id != null && (
                    <>
                      <span>•</span>
                      <span>Analizador {diagnostic.analyzer_id}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="month"
                  value={month}
                  onChange={(e) => {
                    setSelectedDay(null);
                    setSelectedEvent(null);
                    setContext(null);
                    setSearchParams({ month: e.target.value });
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 shadow-sm"
                />
                <button
                  onClick={() => window.close()}
                  className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Cerrar pestaña
                </button>
              </div>
            </div>
          </div>
        </section>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <MetricCard label="Disponibilidad" value={fmtPct(summary.availability)} hint="Tiempo operativo del período" accent="emerald" />
          <MetricCard label="Arranques" value={String(summary.starts)} hint="Eventos RUN" accent="blue" />
          <MetricCard label="Paradas" value={String(summary.stops)} hint="Eventos STOP" />
          <MetricCard label="T. encendida" value={fmtDuration(summary.run)} hint="Acumulado mensual" accent="emerald" />
          <MetricCard label="T. apagada" value={fmtDuration(summary.stop)} hint="Acumulado mensual" accent="amber" />
          <MetricCard label="Score" value={fmtNum(summary.score, 0)} hint="Índice operativo" />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
          <div className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400">Referencia eléctrica</div>
                <h2 className="mt-1 text-xl font-black text-slate-950">Parámetros oficiales y modelo</h2>
              </div>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                Base técnica
              </span>
            </div>

            <div className="mt-5 grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
              <div className="flex justify-between gap-4"><span className="text-slate-500">Corriente de referencia</span><b>{diagnostic?.official?.current_a != null ? `${fmtNum(diagnostic.official.current_a)} A` : "--"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Tipo de arranque</span><b>{diagnostic?.official?.startup_type || "--"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Fases I1 / I2 / I3</span><b>{diagnostic?.official?.i_l1_a != null ? `${fmtNum(diagnostic.official.i_l1_a)} / ${fmtNum(diagnostic.official.i_l2_a)} / ${fmtNum(diagnostic.official.i_l3_a)} A` : "--"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Potencia normal aprendida</span><b>{diagnostic?.model?.power_ref_kw != null ? `${fmtNum(diagnostic.model.power_ref_kw)} kW` : "--"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Corriente estimada ABB</span><b>{diagnostic?.model?.current_a != null ? `${fmtNum(diagnostic.model.current_a)} A` : "--"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Error ABB vs pinza</span><b>{diagnostic?.model?.current_error_pct != null ? fmtPct(diagnostic.model.current_error_pct) : "--"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Arranques del modelo</span><b>{diagnostic?.model?.valid_starts ?? "--"}</b></div>
            </div>
          </div>

          <div className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400">Diagnóstico en línea</div>
                <h2 className="mt-1 text-xl font-black text-slate-950">Potencia y calidad de inferencia</h2>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(diagnostic?.live?.power_status)}`}>
                {diagnostic?.live?.power_status || "monitoring"}
              </span>
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><span className="text-slate-500">Potencia inferida último arranque</span><b>{diagnostic?.live?.power_kw != null ? `${fmtNum(diagnostic.live.power_kw)} kW` : "--"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Desvío vs normal</span><b>{diagnostic?.live?.power_deviation_pct != null ? fmtPct(diagnostic.live.power_deviation_pct) : "--"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Calidad de inferencia</span><b>{diagnostic?.live?.quality || "--"}</b></div>
              {diagnostic?.live?.power_reason && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-600">{diagnostic.live.power_reason}</div>}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400">Histórico mensual</div>
              <h2 className="mt-1 text-xl font-black text-slate-950">Comportamiento diario</h2>
              <p className="mt-1 text-sm text-slate-500">Tocá una barra de arranques o paradas para abrir el detalle operativo de ese día.</p>
            </div>
            {selectedDay && (
              <button onClick={() => setSelectedDay(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                Limpiar selección
              </button>
            )}
          </div>

          <div className="mt-4 h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: -6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day_label" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" name="Arranques" dataKey="starts_count" fill="#2563eb" radius={[7, 7, 0, 0]} cursor="pointer" onClick={chooseDay} />
                <Bar yAxisId="left" name="Paradas" dataKey="stops_count" fill="#94a3b8" radius={[7, 7, 0, 0]} cursor="pointer" onClick={chooseDay} />
                <Line yAxisId="right" name="Disponibilidad %" dataKey="availability_pct" stroke="#16a34a" strokeWidth={3} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {selectedDay && (
          <section id="event-detail" className="scroll-mt-5 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.15em] text-blue-600">Timeline del día</div>
                <h2 className="mt-1 text-2xl font-black capitalize text-slate-950">{fullDayLabel(selectedDay.day_ts)}</h2>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-blue-700">{selectedDay.starts_count} arranques</span>
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-slate-700">{selectedDay.stops_count} paradas</span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">{fmtPct(selectedDay.availability_pct)} disponibilidad</span>
                </div>
              </div>
              <div className="text-right text-xs text-slate-500">
                Seleccioná un evento para sincronizar<br />presión, caudal y energía.
              </div>
            </div>

            {eventsLoading ? (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">Cargando eventos...</div>
            ) : eventsError ? (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{eventsError}</div>
            ) : dayEvents.length ? (
              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {dayEvents.map((ev, idx) => {
                  const selected = selectedEvent?.event_ts === ev.event_ts && selectedEvent?.event_type === ev.event_type;
                  const isStart = ev.event_type === "start";
                  return (
                    <button
                      key={`${ev.event_ts}-${idx}`}
                      onClick={() => setSelectedEvent(ev)}
                      className={`group flex items-center justify-between rounded-2xl border p-4 text-left transition ${
                        selected
                          ? "border-blue-500 bg-blue-50 shadow-sm ring-2 ring-blue-100"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black ${
                          isStart ? "bg-blue-600 text-white" : "bg-slate-800 text-white"
                        }`}>
                          {isStart ? "ON" : "OFF"}
                        </div>
                        <div>
                          <div className="text-xs font-black uppercase tracking-wide text-slate-400">{isStart ? "Arranque" : "Parada"}</div>
                          <div className="mt-0.5 font-mono text-lg font-black text-slate-950">{ev.event_time || fmtEventTime(ev.event_ts)}</div>
                        </div>
                      </div>
                      <div className="text-xl text-slate-300 transition group-hover:text-slate-500">›</div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                No hay eventos horarios registrados para este día.
              </div>
            )}

            {selectedEvent && (
              <div className="mt-7 border-t border-slate-200 pt-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.15em] text-blue-600">Evento sincronizado</div>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <h3 className="text-2xl font-black text-slate-950">
                        {selectedEvent.event_type === "start" ? "Arranque" : "Parada"} · {selectedEvent.event_time || fmtEventTime(selectedEvent.event_ts)}
                      </h3>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                        ± {windowMinutes} min
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">Variables alineadas al mismo instante para comparar el comportamiento antes y después.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Ventana</span>
                    {[5, 15, 30].map((m) => (
                      <button
                        key={m}
                        onClick={() => setWindowMinutes(m)}
                        className={`rounded-xl border px-3 py-2 text-xs font-black ${
                          windowMinutes === m ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        {m} min
                      </button>
                    ))}
                  </div>
                </div>

                {contextLoading ? (
                  <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">Sincronizando señales...</div>
                ) : contextError ? (
                  <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{contextError}</div>
                ) : context ? (
                  <>
                    <div className="mt-6 grid gap-3 lg:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="font-black text-slate-950">Presión</div>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                            context.pressure?.available ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                          }`}>{context.pressure?.available ? "Disponible" : "Sin datos"}</span>
                        </div>
                        <MiniStat label="Presión" before={context.pressure?.before} after={context.pressure?.after} delta={context.pressure?.delta} unit={context.pressure?.unit || "bar"} />
                        {context.pressure?.manifold_name && <div className="mt-2 text-xs text-slate-400">Fuente: {context.pressure.manifold_name}</div>}
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="font-black text-slate-950">Caudal</div>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                            context.flow?.available ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                          }`}>{context.flow?.available ? "Disponible" : "Sin datos"}</span>
                        </div>
                        <MiniStat label="Caudal" before={context.flow?.before} after={context.flow?.after} delta={context.flow?.delta} unit={context.flow?.unit || "m³/h"} />
                        {context.flow?.manifold_name && <div className="mt-2 text-xs text-slate-400">Fuente: {context.flow.manifold_name}</div>}
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="font-black text-slate-950">Energía</div>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                            context.energy?.available ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                          }`}>{context.energy?.available ? "Disponible" : "Sin datos"}</span>
                        </div>
                        <MiniStat label="Potencia" before={context.energy?.before?.p_kw} after={context.energy?.after?.p_kw} delta={context.energy?.delta?.p_kw} unit="kW" />
                        {context.energy?.analyzer_name && <div className="mt-2 text-xs text-slate-400">Fuente: {context.energy.analyzer_name}</div>}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-3">
                      <ContextChart
                        title="Presión sincronizada"
                        subtitle={context.pressure?.manifold_name || "Señal hidráulica"}
                        unit={context.pressure?.unit || "bar"}
                        series={context.pressure?.series || []}
                        valueKey="value"
                        eventTs={selectedEvent.event_ts}
                        unavailableText="No existe una señal de presión disponible para esta bomba/ubicación en esta ventana."
                      />
                      <ContextChart
                        title="Caudal sincronizado"
                        subtitle={context.flow?.manifold_name || "Señal hidráulica"}
                        unit={context.flow?.unit || "m³/h"}
                        series={context.flow?.series || []}
                        valueKey="value"
                        eventTs={selectedEvent.event_ts}
                        unavailableText="No existe una señal de caudal disponible para esta bomba/ubicación en esta ventana."
                      />
                      <ContextChart
                        title="Potencia sincronizada"
                        subtitle={context.energy?.analyzer_name || "Analizador de red"}
                        unit="kW"
                        series={context.energy?.series || []}
                        valueKey="p_kw"
                        eventTs={selectedEvent.event_ts}
                        unavailableText="No hay lecturas de potencia disponibles para este evento."
                      />
                    </div>

                    <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.14em] text-blue-600">Preparado para análisis inteligente</div>
                      <div className="mt-1 text-sm text-slate-700">
                        Este bloque ya deja alineados evento, presión, caudal y energía. El siguiente paso es sumar un análisis automático que compare la respuesta antes/después y marque comportamientos anómalos.
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </section>
        )}

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400">Resumen por día</div>
            <h2 className="mt-1 text-xl font-black text-slate-950">Detalle diario</h2>
          </div>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left">Día</th>
                  <th className="px-4 py-3 text-right">Arranques</th>
                  <th className="px-4 py-3 text-right">Paradas</th>
                  <th className="px-4 py-3 text-right">Disponibilidad</th>
                  <th className="px-4 py-3 text-right">T. encendida</th>
                  <th className="px-4 py-3 text-right">T. apagada</th>
                  <th className="px-4 py-3 text-right">Estado</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((r) => (
                  <tr
                    key={r.day_ts}
                    onClick={() => {
                      setSelectedDay(r);
                      setTimeout(() => document.getElementById("event-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
                    }}
                    className="cursor-pointer border-t border-slate-200 transition hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-semibold">{dayLabel(r.day_ts)}</td>
                    <td className="px-4 py-3 text-right">{r.starts_count}</td>
                    <td className="px-4 py-3 text-right">{r.stops_count}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmtPct(r.availability_pct)}</td>
                    <td className="px-4 py-3 text-right">{fmtDuration(r.running_seconds)}</td>
                    <td className="px-4 py-3 text-right">{fmtDuration(r.stopped_seconds)}</td>
                    <td className="px-4 py-3 text-right">{r.estado_operativo}</td>
                  </tr>
                ))}
                {!daily.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">Sin datos para este mes.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
