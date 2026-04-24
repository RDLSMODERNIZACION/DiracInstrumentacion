import { useEffect, useMemo, useState } from "react";
import { scopedUrl, getApiHeaders } from "@/lib/config";

type OperationSummary = {
  active_tank_events: number;
  total_tank_events: number;
  pumps_running: number;
  pumps_stopped: number;
  total_starts: number;
  total_stops: number;
};

type TankCriticalEvent = {
  id: number;
  tank_id: number;
  tank_name: string;
  location_id: number | null;
  location_name: string | null;
  event_type: string;
  event_label: string;
  configured_limit: number | null;
  detected_value: number | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  duration_label: string | null;
  status: string;
  status_label: string;
  created_at: string;
};

type PumpOperation = {
  pump_id: number;
  pump_name: string;
  location_id: number | null;
  location_name: string | null;
  current_state: string;
  current_state_label: string;
  online: boolean;
  starts_count: number;
  stops_count: number;
  running_time_label: string;
  stopped_time_label: string;
  availability_pct: number | null;
  last_started_at: string | null;
  last_stopped_at: string | null;
  last_activity_at: string | null;
  last_activity_label: string;
};

type ApiSummaryResponse = {
  ok: boolean;
  summary: OperationSummary;
};

type ApiListResponse<T> = {
  ok: boolean;
  items: T[];
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function n(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  return `${Number(value).toLocaleString("es-AR", {
    maximumFractionDigits: 2,
  })}${suffix}`;
}

function statusClass(value?: string | null) {
  const v = String(value || "").toLowerCase();

  if (
    v.includes("active") ||
    v.includes("activo") ||
    v.includes("low") ||
    v.includes("high") ||
    v.includes("crit")
  ) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (
    v.includes("run") ||
    v.includes("encendida") ||
    v.includes("normalizado") ||
    v.includes("normalized")
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (v.includes("stop") || v.includes("apagada")) {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

function normalizeLabel(value?: string | null) {
  return String(value || "-")
    .replaceAll("Ã­", "í")
    .replaceAll("Ã³", "ó")
    .replaceAll("Ã¡", "á")
    .replaceAll("Ã©", "é")
    .replaceAll("Ãº", "ú")
    .replaceAll("Ã±", "ñ")
    .replaceAll("Ã", "Á")
    .replaceAll("Ã‰", "É")
    .replaceAll("Ã", "Í")
    .replaceAll("Ã“", "Ó")
    .replaceAll("Ãš", "Ú")
    .replaceAll("Ã‘", "Ñ");
}

function Kpi({
  title,
  value,
  help,
  danger = false,
}: {
  title: string;
  value: string | number;
  help?: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm ${
        danger ? "border-red-200" : "border-slate-200"
      }`}
    >
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div
        className={`mt-2 text-4xl font-bold ${
          danger ? "text-red-700" : "text-slate-900"
        }`}
      >
        {value}
      </div>
      {help ? <div className="mt-1 text-sm text-slate-500">{help}</div> : null}
    </div>
  );
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(scopedUrl(path), {
    method: "GET",
    headers: getApiHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Error ${res.status} cargando ${path}`);
  }

  return res.json();
}

export default function OperacionConfiabilidadMockup() {
  const [summary, setSummary] = useState<OperationSummary | null>(null);
  const [tankEvents, setTankEvents] = useState<TankCriticalEvent[]>([]);
  const [pumps, setPumps] = useState<PumpOperation[]>([]);
  const [locationId, setLocationId] = useState<string>("all");
  const [onlyActiveTankEvents, setOnlyActiveTankEvents] = useState(false);
  const [onlyRunningPumps, setOnlyRunningPumps] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  async function loadData({ silent = false }: { silent?: boolean } = {}) {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);

      setError(null);

      const [summaryData, tankData, pumpData] = await Promise.all([
        fetchJson<ApiSummaryResponse>("/kpi/operation-reliability/summary"),
        fetchJson<ApiListResponse<TankCriticalEvent>>(
          "/kpi/operation-reliability/tank-events?limit=100"
        ),
        fetchJson<ApiListResponse<PumpOperation>>(
          "/kpi/operation-reliability/pumps"
        ),
      ]);

      setSummary(summaryData.summary);
      setTankEvents(tankData.items || []);
      setPumps(pumpData.items || []);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e?.message || "No se pudieron cargar los datos.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();

    const timer = window.setInterval(() => {
      loadData({ silent: true });
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  const locations = useMemo(() => {
    const map = new Map<number, string>();

    for (const p of pumps) {
      if (p.location_id !== null && p.location_name) {
        map.set(p.location_id, p.location_name);
      }
    }

    for (const e of tankEvents) {
      if (e.location_id !== null && e.location_name) {
        map.set(e.location_id, e.location_name);
      }
    }

    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [pumps, tankEvents]);

  const filteredTankEvents = useMemo(() => {
    return tankEvents.filter((e) => {
      if (locationId !== "all" && String(e.location_id) !== locationId) {
        return false;
      }

      if (onlyActiveTankEvents && e.status !== "active") {
        return false;
      }

      return true;
    });
  }, [tankEvents, locationId, onlyActiveTankEvents]);

  const filteredPumps = useMemo(() => {
    return pumps.filter((p) => {
      if (locationId !== "all" && String(p.location_id) !== locationId) {
        return false;
      }

      if (onlyRunningPumps && p.current_state !== "run") {
        return false;
      }

      return true;
    });
  }, [pumps, locationId, onlyRunningPumps]);

  const activeEventsCount = summary?.active_tank_events ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Operación y confiabilidad
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Eventos críticos de tanques y detalle operativo de bombas.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none"
              >
                <option value="all">Todas las ubicaciones</option>
                {locations.map(([id, name]) => (
                  <option key={id} value={String(id)}>
                    {name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => loadData({ silent: true })}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
                disabled={refreshing}
              >
                {refreshing ? "Actualizando..." : "Actualizar"}
              </button>
            </div>
          </div>

          <div className="mt-4 text-xs text-slate-500">
            {lastRefresh
              ? `Última actualización: ${formatDateTime(lastRefresh.toISOString())}`
              : "Esperando datos..."}
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Kpi
            title="Eventos activos"
            value={summary?.active_tank_events ?? "-"}
            help="Tanques"
            danger={activeEventsCount > 0}
          />
          <Kpi
            title="Eventos históricos"
            value={summary?.total_tank_events ?? "-"}
            help="Mínimos y máximos"
          />
          <Kpi
            title="Bombas encendidas"
            value={summary?.pumps_running ?? "-"}
            help="Estado actual"
          />
          <Kpi
            title="Bombas apagadas"
            value={summary?.pumps_stopped ?? "-"}
            help="Estado actual"
          />
          <Kpi
            title="Encendidos"
            value={summary?.total_starts ?? "-"}
            help="Últimos 30 días"
          />
          <Kpi
            title="Apagados"
            value={summary?.total_stops ?? "-"}
            help="Últimos 30 días"
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Tanques</h2>
              <p className="mt-1 text-sm text-slate-600">
                Historial de eventos críticos: mínimos y máximos configurados.
              </p>
            </div>

            <label className="flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={onlyActiveTankEvents}
                onChange={(e) => setOnlyActiveTankEvents(e.target.checked)}
              />
              Solo activos
            </label>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Evento</th>
                  <th className="px-4 py-3 text-left font-medium">Tanque</th>
                  <th className="px-4 py-3 text-left font-medium">Ubicación</th>
                  <th className="px-4 py-3 text-right font-medium">Límite</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                  <th className="px-4 py-3 text-right font-medium">Inicio</th>
                  <th className="px-4 py-3 text-right font-medium">Duración</th>
                  <th className="px-4 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      Cargando eventos...
                    </td>
                  </tr>
                ) : filteredTankEvents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      No hay eventos críticos para mostrar.
                    </td>
                  </tr>
                ) : (
                  filteredTankEvents.map((event) => (
                    <tr key={event.id} className="border-t border-slate-200">
                      <td className="px-4 py-4 font-medium">
                        {normalizeLabel(event.event_label)}
                      </td>
                      <td className="px-4 py-4">{event.tank_name}</td>
                      <td className="px-4 py-4">{event.location_name || "-"}</td>
                      <td className="px-4 py-4 text-right">
                        {n(event.configured_limit, "%")}
                      </td>
                      <td className="px-4 py-4 text-right font-semibold">
                        {n(event.detected_value, "%")}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {formatDateTime(event.started_at)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {event.status === "active"
                          ? "Activo"
                          : event.duration_label || "-"}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClass(
                            event.status
                          )}`}
                        >
                          {normalizeLabel(event.status_label)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Bombas</h2>
              <p className="mt-1 text-sm text-slate-600">
                Resumen de encendidos, apagados y tiempos acumulados de los últimos 30 días.
              </p>
            </div>

            <label className="flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={onlyRunningPumps}
                onChange={(e) => setOnlyRunningPumps(e.target.checked)}
              />
              Solo encendidas
            </label>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Bomba</th>
                  <th className="px-4 py-3 text-left font-medium">Ubicación</th>
                  <th className="px-4 py-3 text-left font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Encendidos</th>
                  <th className="px-4 py-3 text-right font-medium">Apagados</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Tiempo encendida
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Tiempo frenada
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Disponibilidad
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Último evento
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      Cargando bombas...
                    </td>
                  </tr>
                ) : filteredPumps.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      No hay bombas para mostrar.
                    </td>
                  </tr>
                ) : (
                  filteredPumps.map((pump) => (
                    <tr key={pump.pump_id} className="border-t border-slate-200">
                      <td className="px-4 py-4 font-medium text-slate-900">
                        {pump.pump_name}
                      </td>
                      <td className="px-4 py-4">{pump.location_name || "-"}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClass(
                            pump.current_state
                          )}`}
                        >
                          {normalizeLabel(pump.current_state_label)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">{pump.starts_count}</td>
                      <td className="px-4 py-4 text-right">{pump.stops_count}</td>
                      <td className="px-4 py-4 text-right">
                        {pump.running_time_label}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {pump.stopped_time_label}
                      </td>
                      <td className="px-4 py-4 text-right font-semibold">
                        {pump.availability_pct === null
                          ? "-"
                          : n(pump.availability_pct, "%")}
                      </td>
                      <td className="px-4 py-4 text-right text-slate-600">
                        {normalizeLabel(pump.last_activity_label)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}