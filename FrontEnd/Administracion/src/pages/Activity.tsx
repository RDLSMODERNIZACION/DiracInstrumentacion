import React from "react";
import { useAuth } from "../lib/auth";

type Period = "today" | "7d" | "30d" | "month" | "prev_month";
type Metric = "sessions" | "users" | "minutes";

type ActivityRow = {
  id: number;
  user_id: number;
  email: string;
  full_name?: string | null;
  started_at: string;
  last_seen_at: string;
  ended_at?: string | null;
  device_type?: string | null;
  browser?: string | null;
  os?: string | null;
  ip?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  current_section?: string | null;
  current_path?: string | null;
  duration_minutes?: number | string | null;
  is_online?: boolean;
};

type Summary = {
  kpis: {
    online: number;
    users: number;
    sessions: number;
    significant_sessions: number;
    total_minutes: number;
    avg_minutes: number;
    mobile_pct: number;
  };
  daily: Array<{ day: string; sessions: number; users: number; minutes: number }>;
  ranking: Array<{
    user_id: number;
    email: string;
    full_name?: string | null;
    sessions: number;
    minutes: number;
    last_seen_at: string;
  }>;
};

function apiBase() {
  const env = (import.meta as any)?.env?.VITE_API_BASE?.trim?.();
  if (env) return env;
  return "https://diracinstrumentacion.onrender.com";
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es-AR");
}

function fmtDay(value?: string | null) {
  if (!value) return "";
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function fmtDuration(value?: number | string | null) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "—";
  if (n < 1) return "< 1 min";
  if (n < 60) return `${Math.round(n)} min`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return `${h} h${m ? ` ${m} min` : ""}`;
}

function deviceLabel(row: ActivityRow) {
  const type = row.device_type === "mobile" ? "Celular" : row.device_type === "tablet" ? "Tablet" : "PC";
  return [type, row.os, row.browser].filter(Boolean).join(" · ");
}

function locationLabel(row: ActivityRow) {
  const parts = [row.city, row.region, row.country].filter(Boolean);
  return parts.length ? parts.join(", ") : "Sin resolver";
}

function KpiCard({ label, value, sub, accent = false }: { label: string; value: React.ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-black ${accent ? "text-emerald-600" : "text-slate-900"}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-400">{sub}</div> : null}
    </div>
  );
}

function TrendChart({ data, metric }: { data: Summary["daily"]; metric: Metric }) {
  const width = 900;
  const height = 250;
  const padX = 42;
  const padTop = 18;
  const padBottom = 38;
  const values = data.map((d) => Number(d[metric] ?? 0));
  const max = Math.max(1, ...values);
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;
  const pts = data.map((d, i) => {
    const x = data.length <= 1 ? width / 2 : padX + (i * innerW) / (data.length - 1);
    const y = padTop + innerH - (Number(d[metric] ?? 0) / max) * innerH;
    return { x, y, d };
  });
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const label = metric === "sessions" ? "Sesiones" : metric === "users" ? "Usuarios únicos" : "Minutos de uso";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="font-bold text-slate-900">Uso de la plataforma</div>
          <div className="text-xs text-slate-500">{label} por día</div>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="grid h-56 place-items-center text-sm text-slate-400">Sin datos para el período seleccionado.</div>
      ) : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[720px] w-full">
            {[0, 0.25, 0.5, 0.75, 1].map((r) => {
              const y = padTop + innerH - r * innerH;
              return <line key={r} x1={padX} y1={y} x2={width - padX} y2={y} stroke="currentColor" className="text-slate-100" />;
            })}
            <path d={path} fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-800" />
            {pts.map((p, i) => (
              <g key={`${p.d.day}-${i}`}>
                <circle cx={p.x} cy={p.y} r="4" fill="currentColor" className="text-slate-900" />
                {(data.length <= 12 || i % Math.ceil(data.length / 10) === 0 || i === data.length - 1) && (
                  <text x={p.x} y={height - 12} textAnchor="middle" fontSize="11" fill="currentColor" className="text-slate-400">{fmtDay(p.d.day)}</text>
                )}
              </g>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}

export default function Activity() {
  const { companyId, companyName, getAuthHeader } = useAuth();
  const [period, setPeriod] = React.useState<Period>("30d");
  const [metric, setMetric] = React.useState<Metric>("sessions");
  const [rows, setRows] = React.useState<ActivityRow[]>([]);
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [geoLoading, setGeoLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [userFilter, setUserFilter] = React.useState("");
  const [deviceFilter, setDeviceFilter] = React.useState("");
  const [sectionFilter, setSectionFilter] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      setError("");
      if (companyId == null) throw new Error("No hay una empresa activa para Administración.");
      const headers = { Accept: "application/json", ...getAuthHeader() };
      const [sessionsRes, summaryRes] = await Promise.all([
        fetch(`${apiBase()}/dirac/activity/sessions?limit=500&company_id=${companyId}&period=${period}`, { headers, cache: "no-store" }),
        fetch(`${apiBase()}/dirac/activity/summary?company_id=${companyId}&period=${period}`, { headers, cache: "no-store" }),
      ]);

      if (sessionsRes.status === 403 || summaryRes.status === 403) throw new Error("Tu usuario no tiene permisos para ver la actividad de esta empresa.");
      if (!sessionsRes.ok) throw new Error(`Error ${sessionsRes.status} al cargar sesiones`);
      if (!summaryRes.ok) throw new Error(`Error ${summaryRes.status} al cargar KPIs`);

      const sessionsData = await sessionsRes.json();
      const summaryData = await summaryRes.json();
      setRows(Array.isArray(sessionsData) ? sessionsData : []);
      setSummary(summaryData);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [companyId, getAuthHeader, period]);

  React.useEffect(() => {
    setLoading(true);
    load();
    const id = window.setInterval(load, 30000);
    return () => window.clearInterval(id);
  }, [load]);

  const resolveLocations = React.useCallback(async () => {
    if (companyId == null) return;
    try {
      setGeoLoading(true);
      setError("");
      const res = await fetch(`${apiBase()}/dirac/activity/geo/backfill?company_id=${companyId}&limit=50`, {
        method: "POST",
        headers: { Accept: "application/json", ...getAuthHeader() },
      });
      if (!res.ok) throw new Error(`No se pudieron resolver ubicaciones (${res.status})`);
      await load();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setGeoLoading(false);
    }
  }, [companyId, getAuthHeader, load]);

  const filteredRows = React.useMemo(() => {
    const u = userFilter.trim().toLowerCase();
    const d = deviceFilter.trim().toLowerCase();
    const s = sectionFilter.trim().toLowerCase();
    return rows.filter((r) => {
      const userText = `${r.full_name ?? ""} ${r.email ?? ""}`.toLowerCase();
      const deviceText = deviceLabel(r).toLowerCase();
      const sectionText = `${r.current_section ?? ""} ${r.current_path ?? ""}`.toLowerCase();
      return (!u || userText.includes(u)) && (!d || deviceText.includes(d)) && (!s || sectionText.includes(s));
    });
  }, [rows, userFilter, deviceFilter, sectionFilter]);

  const k = summary?.kpis;
  const unresolved = rows.filter((r) => !r.city && !r.region && !r.country).length;
  const periods: Array<{ id: Period; label: string }> = [
    { id: "today", label: "Hoy" },
    { id: "7d", label: "7 días" },
    { id: "30d", label: "30 días" },
    { id: "month", label: "Este mes" },
    { id: "prev_month", label: "Mes anterior" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Auditoría</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Actividad de usuarios</h1>
          <p className="mt-1 text-sm text-slate-500">
            Solo usuarios de <span className="font-semibold text-slate-700">{companyName ?? "esta empresa"}</span>.
            <span className="ml-1">La ubicación es aproximada según la IP, no GPS.</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={resolveLocations} disabled={geoLoading || unresolved === 0} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 disabled:opacity-50">
            {geoLoading ? "Resolviendo…" : unresolved ? `Resolver ubicaciones (${unresolved})` : "Ubicaciones resueltas"}
          </button>
          <button onClick={load} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">Actualizar</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        {periods.map((p) => (
          <button key={p.id} onClick={() => setPeriod(p.id)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${period === p.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <KpiCard label="Conectados ahora" value={k?.online ?? 0} accent />
        <KpiCard label="Usuarios activos" value={k?.users ?? 0} />
        <KpiCard label="Sesiones" value={k?.sessions ?? 0} sub={`${k?.significant_sessions ?? 0} de más de 1 min`} />
        <KpiCard label="Tiempo total" value={fmtDuration(k?.total_minutes ?? 0)} />
        <KpiCard label="Promedio por sesión" value={fmtDuration(k?.avg_minutes ?? 0)} />
        <KpiCard label="Uso móvil" value={`${k?.mobile_pct ?? 0}%`} sub="Celular + tablet" />
      </div>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-5 2xl:grid-cols-[2fr_1fr]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["sessions", "users", "minutes"] as Metric[]).map((m) => (
              <button key={m} onClick={() => setMetric(m)} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${metric === m ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}>
                {m === "sessions" ? "Sesiones" : m === "users" ? "Usuarios" : "Minutos"}
              </button>
            ))}
          </div>
          <TrendChart data={summary?.daily ?? []} metric={metric} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="font-bold text-slate-900">Usuarios con mayor uso</div>
          <div className="mt-1 text-xs text-slate-500">Ranking del período seleccionado</div>
          <div className="mt-4 space-y-2">
            {(summary?.ranking ?? []).length === 0 ? <div className="text-sm text-slate-400">Sin datos.</div> : (summary?.ranking ?? []).map((r, idx) => (
              <div key={r.user_id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-black text-slate-600">{idx + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-slate-900">{r.full_name || r.email}</div>
                  <div className="truncate text-xs text-slate-400">{r.email}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-slate-900">{fmtDuration(r.minutes)}</div>
                  <div className="text-xs text-slate-400">{r.sessions} sesiones</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <div className="mb-1 text-xs font-medium text-slate-500">Usuario</div>
            <input value={userFilter} onChange={(e) => setUserFilter(e.target.value)} placeholder="Nombre o email" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="min-w-[180px] flex-1">
            <div className="mb-1 text-xs font-medium text-slate-500">Dispositivo</div>
            <input value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)} placeholder="PC, Android, Chrome…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="min-w-[180px] flex-1">
            <div className="mb-1 text-xs font-medium text-slate-500">Sección</div>
            <input value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} placeholder="Operaciones, KPI…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="pb-2 text-xs font-semibold text-slate-400">{filteredRows.length} registros</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="font-bold text-slate-900">Detalle de sesiones</div>
          <div className="text-xs text-slate-500">Auditoría individual del período seleccionado.</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1220px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Dispositivo</th><th className="px-4 py-3">IP</th><th className="px-4 py-3">Ubicación</th><th className="px-4 py-3">Sección</th><th className="px-4 py-3">Ingreso</th><th className="px-4 py-3">Última actividad</th><th className="px-4 py-3">Tiempo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">Cargando actividad…</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">Sin resultados para los filtros actuales.</td></tr>
              ) : filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3"><div className="font-semibold text-slate-900">{row.full_name || row.email}</div><div className="text-xs text-slate-500">{row.email}</div></td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${row.is_online ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{row.is_online ? "Conectado" : "Inactivo"}</span></td>
                  <td className="px-4 py-3 whitespace-nowrap">{deviceLabel(row)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.ip || "—"}</td>
                  <td className="px-4 py-3"><div className="font-medium text-slate-800">{locationLabel(row)}</div>{row.ip ? <div className="mt-0.5 text-[10px] text-slate-400">Ubicación estimada por IP</div> : null}</td>
                  <td className="px-4 py-3"><div className="font-medium">{row.current_section || "—"}</div><div className="text-xs text-slate-400">{row.current_path || ""}</div></td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtDate(row.started_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtDate(row.last_seen_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-semibold">{fmtDuration(row.duration_minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
