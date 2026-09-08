import React from "react";

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

function apiBase() {
  const env = (import.meta as any)?.env?.VITE_API_BASE?.trim?.();
  if (env) return env;
  return "https://diracinstrumentacion.onrender.com";
}

function mainAuthHeader(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem("dirac.basic");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed?.basicToken) return { Authorization: parsed.basicToken };
  } catch {}
  return {};
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es-AR");
}

function fmtDuration(value?: number | string | null) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "—";
  if (n < 1) return "< 1 min";
  if (n < 60) return `${Math.round(n)} min`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return `${h} h ${m} min`;
}

function deviceLabel(row: ActivityRow) {
  const type = row.device_type === "mobile" ? "Celular" : row.device_type === "tablet" ? "Tablet" : "PC";
  return [type, row.os, row.browser].filter(Boolean).join(" · ");
}

function locationLabel(row: ActivityRow) {
  const parts = [row.city, row.region, row.country].filter(Boolean);
  return parts.length ? parts.join(", ") : "Sin resolver";
}

export default function Activity() {
  const [rows, setRows] = React.useState<ActivityRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      setError("");
      const headers = mainAuthHeader();
      if (!headers.Authorization) {
        throw new Error("No se encontró la sesión del usuario principal. Entrá a Administración desde el panel principal.");
      }

      const res = await fetch(`${apiBase()}/dirac/activity/sessions?limit=200`, {
        headers: { Accept: "application/json", ...headers },
        cache: "no-store",
      });

      if (res.status === 403) throw new Error("Tu usuario no tiene permisos para ver la actividad.");
      if (!res.ok) throw new Error(`Error ${res.status} al cargar actividad`);

      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const id = window.setInterval(load, 30000);
    return () => window.clearInterval(id);
  }, [load]);

  const online = rows.filter((r) => r.is_online).length;
  const users = new Set(rows.map((r) => r.user_id)).size;
  const mobile = rows.filter((r) => r.device_type === "mobile" || r.device_type === "tablet").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Auditoría</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Actividad de usuarios</h1>
          <p className="mt-1 text-sm text-slate-500">Ingresos, tiempo de uso, dispositivo, IP y última sección consultada.</p>
        </div>
        <button onClick={load} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">Actualizar</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Conectados ahora</div><div className="mt-1 text-2xl font-bold text-emerald-600">{online}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Usuarios vistos</div><div className="mt-1 text-2xl font-bold">{users}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Sesiones</div><div className="mt-1 text-2xl font-bold">{rows.length}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">Celular / tablet</div><div className="mt-1 text-2xl font-bold">{mobile}</div></div>
      </div>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Dispositivo</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Ubicación</th>
                <th className="px-4 py-3">Sección</th>
                <th className="px-4 py-3">Ingreso</th>
                <th className="px-4 py-3">Última actividad</th>
                <th className="px-4 py-3">Tiempo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">Cargando actividad…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">Todavía no hay sesiones registradas.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3"><div className="font-semibold text-slate-900">{row.full_name || row.email}</div><div className="text-xs text-slate-500">{row.email}</div></td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${row.is_online ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{row.is_online ? "Conectado" : "Inactivo"}</span></td>
                  <td className="px-4 py-3 whitespace-nowrap">{deviceLabel(row)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.ip || "—"}</td>
                  <td className="px-4 py-3">{locationLabel(row)}</td>
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
