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
  const toISO = new Date(to.getTime() - to.getMilliseconds()).toISOString();
  const fromISO = new Date(from.getTime() - from.getMilliseconds()).toISOString();
  return { fromISO, toISO };
}

type LoadDashboardOpts = {
  /** ✅ por defecto false: NO pega a /kpi/graphs/* */
  includeSeries?: boolean;
  /** si querés cambiar rango */
  hours?: number;
  /** si querés que no falle toda la carga si graphs muere */
  tolerateSeriesFailure?: boolean;
  /** ✅ logs para comparar "qué debería" vs "qué da" */
  debug?: boolean;
};

function emptySeries() {
  return {
    pumpTs: { timestamps: [] as string[], is_on: [] as number[] },
    tankTs: { timestamps: [] as string[], level_percent: [] as number[] },
  };
}

function computeTotalPumpsScope(params: {
  byLocation: Array<{ location_id: any; pumps_count: number }>;
  location_id?: number | "all";
}) {
  const { byLocation, location_id } = params;

  // si viene una ubicación puntual, usamos ese row
  if (location_id !== undefined && location_id !== "all") {
    const row = byLocation.find((r) => String(r.location_id) === String(location_id));
    return row?.pumps_count ?? 0;
  }

  // si es all, sumamos todas
  return byLocation.reduce((acc, r) => acc + (Number(r.pumps_count) || 0), 0);
}

export async function loadDashboard(location_id?: number | "all", opts: LoadDashboardOpts = {}) {
  const includeSeries = !!opts.includeSeries;
  const hours = opts.hours ?? 24;
  const tolerateSeriesFailure = opts.tolerateSeriesFailure ?? true;
  const debug = !!opts.debug;

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
    uptimeByLoc.set(
      u.location_id,
      pickNum(u as AnyObj, ["uptime_pct_30d", "uptime_pct"], null as any)
    )
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

  const totalPumpsScope = computeTotalPumpsScope({ byLocation, location_id });

  // base response (sin series)
  const base = {
    locations,
    byLocation,
    overview: { alarms },
    ...emptySeries(),
  };

  // ✅ 2) series (LEGACY GRAPHS) — solo si se pide explícitamente
  if (!includeSeries) return base;

  const { fromISO, toISO } = defaultRangeISO(hours);

  // ✅ IMPORTANTÍSIMO: graphs.ts espera opts objeto, no number
  const locParam =
    location_id !== undefined && location_id !== "all" ? Number(location_id) : undefined;

  const graphsOpts = locParam != null ? ({ locationId: locParam } as any) : undefined;

  try {
    const [buckets, pumpsActive, tankLevels] = await Promise.all([
      fetchBuckets(fromISO, toISO),
      fetchPumpsActive(fromISO, toISO, graphsOpts),
      fetchTankLevelAvg(fromISO, toISO, graphsOpts),
    ]);

    const ts = (buckets || []).map((b: any) => b.local_hour).filter(Boolean);

    // si no hay buckets, evitamos dividir/normalizar
    if (!ts.length) {
      if (debug) console.warn("[loadDashboard] buckets vacío, devolviendo series vacías");
      return base;
    }

    // 🔎 Debug: qué devuelve realmente el backend
    if (debug) {
      const sample = (pumpsActive as any[])?.slice(0, 5) ?? [];
      const raw = (pumpsActive as any[]).map((r) =>
        Number(r.pumps_count ?? r.count ?? r.pumps_with_reading ?? 0)
      );
      console.group("DEBUG PumpsActive");
      console.log("location_id:", location_id, "graphsOpts:", graphsOpts);
      console.log("totalPumpsScope:", totalPumpsScope);
      console.log("sample rows:", sample);
      console.log("max raw:", raw.length ? Math.max(...raw) : 0);
      console.groupEnd();
    }

    // bombas: normalizamos por hora (max) y clamp al total real (✅ “seguro”)
    const pumpsPerHourRaw = normalize24h(
      ts,
      (pumpsActive as PumpsActive[]) as AnyObj[],
      "local_hour",
      "pumps_count",
      (xs) => (xs.length ? Math.max(...xs) : 0)
    );

    const pumpsPerHour = pumpsPerHourRaw.map((v) =>
      totalPumpsScope > 0 ? Math.min(v, totalPumpsScope) : v
    );

    // tanques: promedio por hora
    const levelAvgPerHour = normalize24h(
      ts,
      (tankLevels as TankLevelAvg[]) as AnyObj[],
      "local_hour",
      "avg_level_pct",
      (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
    );

    return {
      ...base,
      pumpTs: { timestamps: ts, is_on: pumpsPerHour },
      tankTs: { timestamps: ts, level_percent: levelAvgPerHour },
    };
  } catch (err) {
    console.warn("[loadDashboard] falló carga de series legacy graphs:", err);
    if (!tolerateSeriesFailure) throw err;
    return base;
  }
}
