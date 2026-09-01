import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
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

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-950">{value}</div>
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

  if (loading) {
    return <div className="p-8 text-slate-500">Cargando análisis de bomba...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Análisis individual de bomba</div>
              <h1 className="mt-1 text-3xl font-black text-slate-950">{pumpName}</h1>
              <div className="mt-1 text-sm text-slate-500">{locationName} · ID {pumpIdNum}</div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={month}
                onChange={(e) => setSearchParams({ month: e.target.value })}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
              />
              <button onClick={() => window.close()} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                Cerrar pestaña
              </button>
            </div>
          </div>
        </section>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Card label="Disponibilidad" value={fmtPct(summary.availability)} />
          <Card label="Arranques" value={String(summary.starts)} />
          <Card label="Paradas" value={String(summary.stops)} />
          <Card label="T. encendida" value={fmtDuration(summary.run)} />
          <Card label="T. apagada" value={fmtDuration(summary.stop)} />
          <Card label="Score" value={fmtNum(summary.score, 0)} />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Referencia eléctrica oficial</h2>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><span className="text-slate-500">Corriente de referencia</span><b>{diagnostic?.official?.current_a != null ? `${fmtNum(diagnostic.official.current_a)} A` : "--"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Fases I1 / I2 / I3</span><b>{diagnostic?.official?.i_l1_a != null ? `${fmtNum(diagnostic.official.i_l1_a)} / ${fmtNum(diagnostic.official.i_l2_a)} / ${fmtNum(diagnostic.official.i_l3_a)} A` : "--"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Tipo de arranque</span><b>{diagnostic?.official?.startup_type || "--"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Potencia normal aprendida</span><b>{diagnostic?.model?.power_ref_kw != null ? `${fmtNum(diagnostic.model.power_ref_kw)} kW` : "--"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Corriente estimada ABB</span><b>{diagnostic?.model?.current_a != null ? `${fmtNum(diagnostic.model.current_a)} A` : "--"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Error ABB vs pinza</span><b>{diagnostic?.model?.current_error_pct != null ? fmtPct(diagnostic.model.current_error_pct) : "--"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Arranques usados por el modelo</span><b>{diagnostic?.model?.valid_starts ?? "--"}</b></div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Diagnóstico de potencia</h2>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><span className="text-slate-500">Estado actual</span><b>{diagnostic?.state || "--"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Potencia inferida último arranque</span><b>{diagnostic?.live?.power_kw != null ? `${fmtNum(diagnostic.live.power_kw)} kW` : "--"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Desvío vs normal</span><b>{diagnostic?.live?.power_deviation_pct != null ? fmtPct(diagnostic.live.power_deviation_pct) : "--"}</b></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Estado diagnóstico</span><span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClass(diagnostic?.live?.power_status)}`}>{diagnostic?.live?.power_status || "monitoring"}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Calidad de inferencia</span><b>{diagnostic?.live?.quality || "--"}</b></div>
              {diagnostic?.live?.power_reason && <div className="rounded-xl bg-slate-50 p-3 text-slate-600">{diagnostic.live.power_reason}</div>}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Comportamiento diario</h2>
          <div className="mt-4 h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={daily.map((r) => ({ ...r, day_label: dayLabel(r.day_ts) }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day_label" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" name="Arranques" dataKey="starts_count" fill="#2563eb" />
                <Bar yAxisId="left" name="Paradas" dataKey="stops_count" fill="#94a3b8" />
                <Line yAxisId="right" name="Disponibilidad %" dataKey="availability_pct" stroke="#16a34a" strokeWidth={3} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Detalle diario</h2>
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
                  <tr key={r.day_ts} className="border-t border-slate-200">
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
