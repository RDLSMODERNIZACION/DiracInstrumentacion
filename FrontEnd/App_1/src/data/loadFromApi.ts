// src/data/loadFromApi.ts
import {
  fetchActiveAlarms,
  fetchLocations,
  fetchTotalsByLocation,
  fetchUptime30dByLocation,
  type TotalsByLocationRow,
  type UptimeLocRow,
} from "@/api/kpi";

import {
  fetchBuckets,
  fetchPumpsActive,
  fetchTankLevelAvg,
  type PumpsActive,
  type TankLevelAvg,
} from "@/api/graphs";

type AnyObj = Record<string, any>;

const pickNum = (r: AnyObj, ks: string[], fb = 0) => {
  for (const k of ks) if (r[k] != null) return Number(r[k]);
  return fb;
};

function normalize24h(
  buckets: string[],
  rows: AnyObj[],
  tsKey: string,
  valueKey: string,
  agg: (xs: number[]) => number
) {
  const m = new Map<string, number[]>();
  for (const r of rows) {
    const t = String(r[tsKey]);
    const raw = r[valueKey];
    // si viene null (ej. avg_level_pct), ignoramos en el agregado
    const v = raw == null ? NaN : Number(raw);
    const arr = m.get(t) || [];
    arr.push(Number.isFinite(v) ? v : NaN);
    m.set(t, arr);
  }
  return buckets.map((t) => {
    const xs = (m.get(t) || []).filter((x) => Number.isFinite(x)) as number[];
    return agg(xs);
  });
}

// rango por defecto últimas 24h
function defaultRangeISO(hours = 24) {
  const to = new Date();
  const from = new Date(to.getTime() - hours * 3600 * 1000);
  // sin ms
  const toISO = new Date(to.getTime() - to.getMilliseconds()).toISOString();
  const fromISO = new Date(from.getTime() - from.getMilliseconds()).toISOString();
  return { fromISO, toISO };
}

export async function loadDashboard(location_id?: number | "all") {
  // 1) locations/totales/uptime/alarms
  const [locations, totals, uptime, alarms] = await Promise.all([
    fetchLocations(),
    fetchTotalsByLocation({ location_id }),
    fetchUptime30dByLocation({ location_id }),
    fetchActiveAlarms({ location_id }),
  ]);

  // tabla por ubicación + uptime
  const uptimeByLoc = new Map<number | string, number>();
  (uptime as UptimeLocRow[]).forEach((u) =>
    uptimeByLoc.set(u.location_id, pickNum(u as AnyObj, ["uptime_pct_30d", "uptime_pct"], null as any))
  );

  const byLocation = (totals as TotalsByLocationRow[]).map((t: any) => ({
    location_id: t.location_id,
    location_code: t.location_code ?? t.code ?? null,
    location_name: t.location_name ?? t.name ?? "",
    tanks_count: pickNum(t, ["tanks_count", "tanks_total", "tanks"]),
    pumps_count: pickNum(t, ["pumps_count", "pumps_total", "pumps"]),
    valves_count: pickNum(t, ["valves_count", "valves_total", "valves"]),
    manifolds_count: pickNum(t, ["manifolds_count", "manifolds_total", "manifolds"]),
    uptime_pct_30d: uptimeByLoc.get(t.location_id) ?? null,
  }));

  // 2) series (from/to y filtros)
  const { fromISO, toISO } = defaultRangeISO();
  const locParam =
    location_id !== undefined && location_id !== "all" ? Number(location_id) : undefined;

  const [buckets, pumpsActive, tankLevels] = await Promise.all([
    fetchBuckets(fromISO, toISO),
    fetchPumpsActive(fromISO, toISO, locParam),
    fetchTankLevelAvg(fromISO, toISO, locParam),
  ]);

  // timeline HH:00
  const ts = (buckets || []).map((b) => b.local_hour);

  // bombas: ya viene una fila por hora, pero normalizamos por si hay duplicados
  const pumpsPerHour = normalize24h(
    ts,
    (pumpsActive as PumpsActive[]) as AnyObj[],
    "local_hour",
    "pumps_count",
    (xs) => (xs.length ? Math.max(...xs) : 0) // si hay varias entradas de la misma hora, nos quedamos con el máximo
  );

  // tanques: promedio por hora; si no hay lecturas, dejamos 0 (como hacía tu loader)
  const levelAvgPerHour = normalize24h(
    ts,
    (tankLevels as TankLevelAvg[]) as AnyObj[],
    "local_hour",
    "avg_level_pct",
    (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  );

  return {
    locations,
    byLocation,
    overview: { alarms },
    pumpTs: { timestamps: ts, is_on: pumpsPerHour },
    tankTs: { timestamps: ts, level_percent: levelAvgPerHour },
  };
}
