import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";
import { scopedUrl, getApiHeaders } from "@/lib/config";

type PumpAvailability = {
  id: number;
  name?: string | null;
  location_id?: number | null;
  rol_red?: string | null;
  disponible: boolean;
  disponibilidad_actualizada_at?: string | null;
};

type LayoutNode = {
  node_id?: string;
  id?: number | string;
  type?: string | null;
  name?: string | null;
  state?: string | null;
  online?: boolean | null;
  location_id?: number | null;
  location_name?: string | null;
};

type TankRow = {
  id: number;
  name: string;
  locationName: string;
  level: number;
  critical: boolean;
  low: boolean;
};

function normalizeText(v: any) {
  return String(v ?? "").trim();
}

function shortLocation(name?: string | null) {
  const s = normalizeText(name);
  if (!s) return "Sin ubicación";
  return s.replace(/^\d+[_\s-]*/g, "").trim() || s;
}

function shortLabel(name?: string | null, max = 12) {
  const s = normalizeText(name);
  if (!s) return "—";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function isRunning(state?: string | null) {
  const s = normalizeText(state).toLowerCase();
  return ["on", "run", "running", "encendida", "1", "true"].includes(s);
}

function stateLabel(node?: LayoutNode) {
  if (!node) return "SIN DATO";
  if (node.online === false) return "OFFLINE";
  return isRunning(node.state) ? "ON" : "OFF";
}

function unwrapArray<T = any>(payload: any): T[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  if (payload && typeof payload === "object") {
    const values = Object.values(payload);
    if (values.every((v) => typeof v === "object")) {
      return values as T[];
    }
  }
  return [];
}

function getTankLevel(row: any): number | null {
  const candidates = [
    row?.level_pct,
    row?.nivel_pct,
    row?.levelPercent,
    row?.current_level_pct,
    row?.current_pct,
    row?.pct,
    row?.level,
    row?.nivel,
    row?.value,
    row?.nivel_actual,
  ];

  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
  }
  return null;
}

function getTankId(row: any): number | null {
  const candidates = [row?.id, row?.tank_id, row?.entity_id];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function getTankName(row: any, fallback = "") {
  return normalizeText(row?.name || row?.tank_name || row?.label || fallback);
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(scopedUrl(path), {
    method: "GET",
    headers: getApiHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Error ${res.status} en ${path}`);
  }

  return res.json();
}

function Metric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-3xl font-black leading-none text-slate-900">
        {value}
      </div>
      {helper && <div className="mt-1 text-xs text-slate-400">{helper}</div>}
    </div>
  );
}

export default function WaterNetworkOverviewLive() {
  const [availability, setAvailability] = useState<PumpAvailability[]>([]);
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode[]>([]);
  const [tankLive, setTankLive] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tankWarning, setTankWarning] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [availabilityRaw, layoutRaw] = await Promise.all([
          getJson<any>("/infraestructura/pump_availability"),
          getJson<any>("/infraestructura/get_layout_combined"),
        ]);

        let tankRaw: any = [];
        let tankWarn = "";
        try {
          tankRaw = await getJson<any>("/kpi/tanques/live");
        } catch (e: any) {
          tankWarn = e?.message || "No se pudieron cargar los tanques.";
        }

        if (!active) return;

        setAvailability(unwrapArray<PumpAvailability>(availabilityRaw));
        setLayoutNodes(unwrapArray<LayoutNode>(layoutRaw));
        setTankLive(unwrapArray<any>(tankRaw));
        setTankWarning(tankWarn);
        setError("");
        setLastUpdate(new Date());
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || "No se pudieron cargar los datos.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    const timer = window.setInterval(load, 15000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const pumpNodesById = useMemo(() => {
    const map = new Map<number, LayoutNode>();
    for (const n of layoutNodes) {
      if (normalizeText(n.type).toLowerCase() !== "pump") continue;
      const id = Number(n.id);
      if (Number.isFinite(id)) map.set(id, n);
    }
    return map;
  }, [layoutNodes]);

  const tankLayoutById = useMemo(() => {
    const map = new Map<number, LayoutNode>();
    for (const n of layoutNodes) {
      if (normalizeText(n.type).toLowerCase() !== "tank") continue;
      const id = Number(n.id);
      if (Number.isFinite(id)) map.set(id, n);
    }
    return map;
  }, [layoutNodes]);

  const pumpRows = useMemo(() => {
    return availability
      .filter((p) => p.rol_red === "impulsion_principal")
      .map((p) => {
        const node = pumpNodesById.get(Number(p.id));
        const estado = stateLabel(node);
        const locationName = shortLocation(node?.location_name);

        return {
          ...p,
          node,
          estado,
          locationName,
          operando: estado === "ON",
        };
      })
      .sort((a, b) => {
        const c = a.locationName.localeCompare(b.locationName);
        return c || String(a.name ?? "").localeCompare(String(b.name ?? ""));
      });
  }, [availability, pumpNodesById]);

  const pumpGroupCards = useMemo(() => {
    const groups = new Map<string, typeof pumpRows>();
    for (const row of pumpRows) {
      const key = row.locationName || "Sin ubicación";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    return Array.from(groups.entries()).map(([locationName, rows]) => ({
      locationName,
      rows,
      operando: rows.filter((r) => r.operando).length,
      disponibles: rows.filter((r) => r.disponible).length,
      total: rows.length,
    }));
  }, [pumpRows]);

  const pumpChartData = useMemo(() => {
    return pumpGroupCards.map((g) => ({
      name: shortLabel(g.locationName, 14),
      locationName: g.locationName,
      operando: g.operando,
      disponibles: g.disponibles,
      total: g.total,
    }));
  }, [pumpGroupCards]);

  const tankRows = useMemo(() => {
    const out: TankRow[] = [];

    for (const row of tankLive) {
      const id = getTankId(row);
      const level = getTankLevel(row);
      if (!Number.isFinite(id as number) || level == null) continue;

      const layout = tankLayoutById.get(Number(id));
      const name = getTankName(row, layout?.name || `Tanque ${id}`);
      const lower = name.toLowerCase();

      if (
        lower.includes("pozo") ||
        lower.includes("bombeo") ||
        lower.includes("cargadero")
      ) {
        continue;
      }

      out.push({
        id: Number(id),
        name,
        locationName: shortLocation(layout?.location_name),
        level,
        critical: level < 20,
        low: level < 40,
      });
    }

    return out.sort(
      (a, b) => a.locationName.localeCompare(b.locationName) || a.name.localeCompare(b.name)
    );
  }, [tankLive, tankLayoutById]);

  const tankChartData = useMemo(() => {
    return tankRows.map((t) => ({
      name: shortLabel(t.name, 12),
      fullName: t.name,
      locationName: t.locationName,
      level: Number(t.level.toFixed(1)),
    }));
  }, [tankRows]);

  const tankGroupCards = useMemo(() => {
    const groups = new Map<string, TankRow[]>();
    for (const row of tankRows) {
      const key = row.locationName || "Sin ubicación";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    return Array.from(groups.entries()).map(([locationName, rows]) => ({
      locationName,
      rows,
      promedio: Math.round(
        rows.reduce((acc, r) => acc + r.level, 0) / Math.max(1, rows.length)
      ),
    }));
  }, [tankRows]);

  const totalPumps = pumpRows.length;
  const operando = pumpRows.filter((r) => r.operando).length;
  const disponibles = pumpRows.filter((r) => r.disponible).length;
  const noDisponibles = totalPumps - disponibles;
  const utilizacion = disponibles > 0 ? Math.round((operando / disponibles) * 100) : 0;

  const totalTanks = tankRows.length;
  const nivelPromedio =
    totalTanks > 0
      ? Math.round(tankRows.reduce((acc, r) => acc + r.level, 0) / totalTanks)
      : 0;
  const bajos = tankRows.filter((r) => r.low).length;
  const criticos = tankRows.filter((r) => r.critical).length;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-2xl font-bold text-slate-900">
              Resumen operativo principal
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Impulsión y distribución en una vista más limpia
            </div>
          </div>

          <div className="text-xs text-slate-400">
            {lastUpdate
              ? `actualizado ${lastUpdate.toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : loading
              ? "cargando..."
              : ""}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-4">
          <div>
            <div className="text-2xl font-bold text-slate-900">Impulsión</div>
            <div className="text-sm text-slate-500">
              Bombas principales agrupadas por localidad
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Operando" value={`${operando}/${totalPumps || 12}`} helper="bombas principales" />
            <Metric label="Disponibles" value={disponibles} helper={`${noDisponibles} no disponibles`} />
            <Metric label="Utilización" value={`${utilizacion}%`} helper="sobre disponibles" />
            <Metric label="Estado" value={disponibles > 0 ? "Normal" : "Sin datos"} helper="situación actual" />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2">
              <div className="text-base font-bold text-slate-900">Gráfico de bombas</div>
              <div className="text-xs text-slate-400">
                Operando vs disponibles por localidad
              </div>
            </div>

            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pumpChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#e7edf4" strokeDasharray="3 5" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={{ stroke: "#dbe3ec" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={false}
                    width={28}
                  />
                  <Tooltip
                    formatter={(value: any) => [value, ""]}
                    labelFormatter={(_, payload) => {
                      const p = Array.isArray(payload) ? payload[0]?.payload : null;
                      return p?.locationName || "";
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="operando" name="Operando" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="disponibles" name="Disponibles" fill="#cbd5e1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-2xl font-bold text-slate-900">Distribución</div>
            <div className="text-sm text-slate-500">
              Tanques principales y nivel actual
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Nivel promedio" value={`${nivelPromedio}%`} helper={`${totalTanks} tanques`} />
            <Metric label="Tanques bajos" value={bajos} helper="por debajo de 40%" />
            <Metric label="Críticos" value={criticos} helper="por debajo de 20%" />
            <Metric label="Estado" value={totalTanks > 0 ? "Normal" : "Sin datos"} helper="situación actual" />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2">
              <div className="text-base font-bold text-slate-900">Gráfico de tanques</div>
              <div className="text-xs text-slate-400">
                Nivel actual por tanque principal
              </div>
            </div>

            {tankWarning && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                {tankWarning}
              </div>
            )}

            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tankChartData} margin={{ top: 10, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="#e7edf4" strokeDasharray="3 5" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={{ stroke: "#dbe3ec" }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    tickFormatter={(v) => `${v}%`}
                    tickLine={false}
                    axisLine={false}
                    width={34}
                  />
                  <Tooltip
                    formatter={(value: any) => [`${value}%`, "Nivel"]}
                    labelFormatter={(_, payload) => {
                      const p = Array.isArray(payload) ? payload[0]?.payload : null;
                      return p ? `${p.fullName} · ${p.locationName}` : "";
                    }}
                  />
                  <ReferenceLine y={40} stroke="#f59e0b" strokeDasharray="4 4" />
                  <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="4 4" />
                  <Bar dataKey="level" name="Nivel" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3">
            <div className="text-base font-bold text-slate-900">
              Detalle de bombas por localidad
            </div>
            <div className="text-xs text-slate-400">
              Vista compacta y operativa
            </div>
          </div>

          <div className="space-y-3">
            {pumpGroupCards.map((group) => (
              <div key={group.locationName} className="rounded-xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                  <div className="font-semibold text-slate-800">{group.locationName}</div>
                  <div className="text-xs text-slate-400">
                    {group.operando}/{group.total} operando
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {group.rows.map((r) => (
                    <div
                      key={r.id}
                      className="grid grid-cols-[minmax(0,1.4fr)_100px_120px] items-center gap-3 px-4 py-2.5 text-sm"
                    >
                      <div className="font-medium text-slate-800">{r.name || `Bomba ${r.id}`}</div>
                      <div className={`font-medium ${r.estado === "ON" ? "text-emerald-700" : r.estado === "OFFLINE" ? "text-red-700" : "text-slate-500"}`}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${r.estado === "ON" ? "bg-emerald-500" : r.estado === "OFFLINE" ? "bg-red-500" : "bg-slate-400"}`}
                          />
                          {r.estado}
                        </span>
                      </div>
                      <div>
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            r.disponible
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-red-200 bg-red-50 text-red-700"
                          }`}
                        >
                          {r.disponible ? "Disponible" : "No disponible"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {!loading && pumpGroupCards.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">
                No se encontraron bombas de impulsión.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3">
            <div className="text-base font-bold text-slate-900">
              Detalle de tanques por localidad
            </div>
            <div className="text-xs text-slate-400">
              Niveles actuales agrupados
            </div>
          </div>

          <div className="space-y-3">
            {tankGroupCards.map((group) => (
              <div key={group.locationName} className="rounded-xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                  <div className="font-semibold text-slate-800">{group.locationName}</div>
                  <div className="text-xs text-slate-400">
                    promedio {group.promedio}%
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {group.rows.map((r) => (
                    <div
                      key={r.id}
                      className="grid grid-cols-[minmax(0,1.4fr)_80px_100px] items-center gap-3 px-4 py-2.5 text-sm"
                    >
                      <div className="font-medium text-slate-800">{r.name}</div>
                      <div className="font-semibold text-slate-900">{r.level.toFixed(1)}%</div>
                      <div>
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            r.critical
                              ? "border-red-200 bg-red-50 text-red-700"
                              : r.low
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {r.critical ? "Crítico" : r.low ? "Bajo" : "Normal"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {!loading && tankGroupCards.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">
                No se pudieron mostrar tanques principales con nivel actual.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
