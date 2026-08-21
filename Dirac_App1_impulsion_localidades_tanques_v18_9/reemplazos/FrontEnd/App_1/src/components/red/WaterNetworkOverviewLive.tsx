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

type TankLiveRow = Record<string, any>;

type TankChartRow = {
  name: string;
  shortName: string;
  locationName: string;
  level: number;
};

function normalizeText(v: any) {
  return String(v ?? "").trim();
}

function shortLocation(name?: string | null) {
  const s = normalizeText(name);
  if (!s) return "Sin ubicación";
  return s.replace(/^\d+[_\s-]*/g, "").trim() || s;
}

function shortTankName(name?: string | null) {
  const s = normalizeText(name);
  return s.length > 13 ? s.slice(0, 13) + "…" : s;
}

function getTankLevel(row: any): number | null {
  const candidates = [
    row?.level_pct,
    row?.nivel_pct,
    row?.current_level_pct,
    row?.levelPercent,
    row?.current_pct,
    row?.pct,
    row?.level,
    row?.nivel,
    row?.value,
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

function isRunning(state?: string | null) {
  const s = normalizeText(state).toLowerCase();
  return s === "on" || s === "run" || s === "running" || s === "encendida" || s === "1" || s === "true";
}

function stateLabel(node?: LayoutNode) {
  if (!node) return "SIN DATO";
  if (node.online === false) return "OFFLINE";
  return isRunning(node.state) ? "ON" : "OFF";
}

function stateClass(label: string) {
  if (label === "ON") return "text-emerald-700";
  if (label === "OFFLINE") return "text-red-700";
  return "text-slate-500";
}

function dotClass(label: string) {
  if (label === "ON") return "bg-emerald-500";
  if (label === "OFFLINE") return "bg-red-500";
  return "bg-slate-400";
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

function MetricCard({
  label,
  value,
  sublabel,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  tone?: "default" | "blue" | "green" | "red";
}) {
  const toneMap: Record<string, string> = {
    default: "border-slate-200 bg-white text-slate-900",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    red: "border-red-200 bg-red-50 text-red-800",
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneMap[tone]}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">
        {label}
      </div>
      <div className="mt-1 text-4xl font-black leading-none">{value}</div>
      {sublabel && <div className="mt-2 text-xs opacity-70">{sublabel}</div>}
    </div>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-4">
      <div className="text-2xl font-bold text-slate-900">{title}</div>
      <div className="text-sm text-slate-500">{subtitle}</div>
    </div>
  );
}

export default function WaterNetworkOverviewLive() {
  const [availability, setAvailability] = useState<PumpAvailability[]>([]);
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode[]>([]);
  const [tankLive, setTankLive] = useState<TankLiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tankError, setTankError] = useState("");
  const [error, setError] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [a, l] = await Promise.all([
          getJson<PumpAvailability[]>("/infraestructura/pump_availability"),
          getJson<LayoutNode[]>("/infraestructura/get_layout_combined"),
        ]);

        let tanks: TankLiveRow[] = [];
        let tErr = "";
        try {
          tanks = await getJson<TankLiveRow[]>("/kpi/tanques/live");
        } catch (e: any) {
          tErr = e?.message || "No se pudieron cargar los tanques.";
        }

        if (!active) return;
        setAvailability(Array.isArray(a) ? a : []);
        setLayoutNodes(Array.isArray(l) ? l : []);
        setTankLive(Array.isArray(tanks) ? tanks : []);
        setTankError(tErr);
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

  const nodesByPumpId = useMemo(() => {
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
        const node = nodesByPumpId.get(Number(p.id));
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
        const c1 = a.locationName.localeCompare(b.locationName);
        return c1 || String(a.name ?? "").localeCompare(String(b.name ?? ""));
      });
  }, [availability, nodesByPumpId]);

  const pumpGroups = useMemo(() => {
    const groups = new Map<string, typeof pumpRows>();
    for (const row of pumpRows) {
      const key = row.locationName || "Sin ubicación";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return Array.from(groups.entries()).map(([locationName, rows]) => ({
      locationName,
      rows,
    }));
  }, [pumpRows]);

  const tankRows = useMemo(() => {
    const rows: {
      id: number;
      name: string;
      locationName: string;
      level: number;
      critical: boolean;
      low: boolean;
    }[] = [];

    for (const row of tankLive) {
      const id = getTankId(row);
      const level = getTankLevel(row);
      if (!Number.isFinite(id as number) || level == null) continue;

      const layout = tankLayoutById.get(Number(id));
      const name = normalizeText(row?.name || row?.tank_name || layout?.name || `Tanque ${id}`);
      const lower = name.toLowerCase();

      if (
        lower.includes("pozo") ||
        lower.includes("cargadero") ||
        lower.includes("bombeo")
      ) {
        continue;
      }

      rows.push({
        id: Number(id),
        name,
        locationName: shortLocation(layout?.location_name),
        level,
        critical: level < 20,
        low: level < 40,
      });
    }

    return rows.sort((a, b) => a.locationName.localeCompare(b.locationName) || a.name.localeCompare(b.name));
  }, [tankLive, tankLayoutById]);

  const tankGroups = useMemo(() => {
    const groups = new Map<string, typeof tankRows>();
    for (const row of tankRows) {
      const key = row.locationName || "Sin ubicación";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return Array.from(groups.entries()).map(([locationName, rows]) => ({
      locationName,
      rows,
    }));
  }, [tankRows]);

  const tankChartData: TankChartRow[] = useMemo(() => {
    return tankRows.map((r) => ({
      name: r.name,
      shortName: shortTankName(r.name),
      locationName: r.locationName,
      level: r.level,
    }));
  }, [tankRows]);

  const totalPumps = pumpRows.length;
  const disponibles = pumpRows.filter((r) => r.disponible).length;
  const noDisponibles = totalPumps - disponibles;
  const operando = pumpRows.filter((r) => r.operando).length;
  const offline = pumpRows.filter((r) => r.estado === "OFFLINE").length;
  const utilizacion = disponibles > 0 ? Math.round((operando / disponibles) * 100) : 0;

  const estadoImpulsion =
    totalPumps === 0
      ? "SIN DATOS"
      : noDisponibles > 2
      ? "ATENCIÓN"
      : utilizacion >= 90
      ? "EXIGIDA"
      : "NORMAL";

  const nivelPromedio =
    tankRows.length > 0
      ? Math.round(
          tankRows.reduce((acc, t) => acc + t.level, 0) / tankRows.length
        )
      : 0;

  const tanquesBajos = tankRows.filter((t) => t.low).length;
  const tanquesCriticos = tankRows.filter((t) => t.critical).length;

  const estadoDistribucion =
    tankRows.length === 0
      ? "SIN DATOS"
      : tanquesCriticos > 0
      ? "CRÍTICO"
      : tanquesBajos > 0
      ? "ATENCIÓN"
      : "NORMAL";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-3xl font-bold tracking-tight text-slate-900">
              Resumen principal de red
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Impulsión por localidad + distribución con gráfico de tanques
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

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <SectionTitle
            title="Impulsión"
            subtitle="Bombas principales agrupadas por localidad"
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Operando"
              value={`${operando}/${totalPumps || 12}`}
              sublabel="bombas principales"
              tone="blue"
            />
            <MetricCard
              label="Disponibles"
              value={disponibles}
              sublabel={`${noDisponibles} no disponibles`}
            />
            <MetricCard
              label="Utilización"
              value={`${utilizacion}%`}
              sublabel="sobre las disponibles"
            />
            <MetricCard
              label="Estado"
              value={estadoImpulsion}
              sublabel={offline > 0 ? `${offline} offline` : "sin alertas críticas"}
              tone={
                estadoImpulsion === "NORMAL"
                  ? "green"
                  : estadoImpulsion === "ATENCIÓN"
                  ? "red"
                  : "default"
              }
            />
          </div>

          <div className="space-y-3">
            {pumpGroups.map((group) => (
              <div
                key={group.locationName}
                className="rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <div className="text-sm font-bold text-slate-800">
                    {group.locationName}
                  </div>
                  <div className="text-xs text-slate-400">
                    {group.rows.filter((r) => r.operando).length}/{group.rows.length} operando
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {group.rows.map((r) => (
                    <div
                      key={r.id}
                      className="grid grid-cols-[minmax(0,1.4fr)_120px_140px] items-center gap-3 px-4 py-3 text-sm"
                    >
                      <div className="font-semibold text-slate-800">
                        {r.name || `Bomba ${r.id}`}
                      </div>

                      <div className={`font-semibold ${stateClass(r.estado)}`}>
                        <span className="inline-flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${dotClass(r.estado)}`} />
                          {r.estado}
                        </span>
                      </div>

                      <div>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
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

            {!loading && pumpGroups.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-400 shadow-sm">
                No se encontraron bombas marcadas como impulsión principal.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <SectionTitle
            title="Distribución"
            subtitle="Estado de tanques principales y nivel actual"
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Nivel promedio"
              value={`${nivelPromedio}%`}
              sublabel={`${tankRows.length} tanques`}
              tone="blue"
            />
            <MetricCard
              label="Tanques bajos"
              value={tanquesBajos}
              sublabel="por debajo de 40%"
              tone={tanquesBajos > 0 ? "red" : "default"}
            />
            <MetricCard
              label="Críticos"
              value={tanquesCriticos}
              sublabel="por debajo de 20%"
              tone={tanquesCriticos > 0 ? "red" : "default"}
            />
            <MetricCard
              label="Estado"
              value={estadoDistribucion}
              sublabel={tankError ? "gráfico parcial" : "datos en vivo"}
              tone={
                estadoDistribucion === "NORMAL"
                  ? "green"
                  : estadoDistribucion === "ATENCIÓN" || estadoDistribucion === "CRÍTICO"
                  ? "red"
                  : "default"
              }
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-base font-bold text-slate-900">
                  Gráfico de tanques
                </div>
                <div className="text-xs text-slate-400">
                  Nivel actual por tanque principal
                </div>
              </div>
            </div>

            {tankError && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                {tankError}
              </div>
            )}

            <div className="h-[340px] rounded-xl bg-slate-50 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={tankChartData}
                  margin={{ top: 12, right: 16, left: 0, bottom: 40 }}
                >
                  <CartesianGrid stroke="#e7edf4" strokeDasharray="3 5" vertical={false} />
                  <XAxis
                    dataKey="shortName"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={{ stroke: "#dbe3ec" }}
                    angle={-20}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    tickFormatter={(v) => `${v}%`}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <Tooltip
                    formatter={(value: any) => `${Number(value).toFixed(1)}%`}
                    labelFormatter={(_, payload) => {
                      const p = Array.isArray(payload) ? payload[0]?.payload : null;
                      return p ? `${p.name} · ${p.locationName}` : "";
                    }}
                  />
                  <ReferenceLine y={40} stroke="#f59e0b" strokeDasharray="5 5" />
                  <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="5 5" />
                  <Bar dataKey="level" name="Nivel" fill="#2563eb" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-3">
            {tankGroups.map((group) => (
              <div
                key={group.locationName}
                className="rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <div className="text-sm font-bold text-slate-800">
                    {group.locationName}
                  </div>
                  <div className="text-xs text-slate-400">
                    promedio{" "}
                    {Math.round(
                      group.rows.reduce((acc, r) => acc + r.level, 0) /
                        Math.max(1, group.rows.length)
                    )}
                    %
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {group.rows.map((r) => (
                    <div
                      key={r.id}
                      className="grid grid-cols-[minmax(0,1.4fr)_110px_110px] items-center gap-3 px-4 py-3 text-sm"
                    >
                      <div className="font-semibold text-slate-800">{r.name}</div>

                      <div className="font-black text-slate-900">
                        {r.level.toFixed(1)}%
                      </div>

                      <div>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                            r.critical
                              ? "border-red-200 bg-red-50 text-red-700"
                              : r.low
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {r.critical
                            ? "Crítico"
                            : r.low
                            ? "Bajo"
                            : "Normal"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {!loading && tankGroups.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-400 shadow-sm">
                No se pudieron mostrar tanques principales con nivel actual.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
