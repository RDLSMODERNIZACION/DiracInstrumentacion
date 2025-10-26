// src/api/kpi.ts
// Backend base
const BASE = import.meta.env?.VITE_API_BASE ?? "https://backend-v85n.onrender.com";

/* =====================
 * Tipos base del backend
 * ===================== */
export type Pump = {
  pump_id: number;
  name: string;
  location_id: number | null;
  location_name: string | null;
  state: string | null;
  latest_event_id?: number | null;
  age_sec: number | null;
  online: boolean | null;
  event_ts?: string | null;
  latest_hb_id?: number | null;
  hb_ts: string | null;
};

export type Tank = {
  tank_id: number;
  name: string;
  location_id: number | null;
  location_name: string | null;
  low_pct: number | null;
  low_low_pct: number | null;
  high_pct: number | null;
  high_high_pct: number | null;
  updated_by: string | null;
  updated_at: string | null;
  level_pct: number | null;
  age_sec: number | null;
  online: boolean | null;
  alarma: string | null; // "normal" | "alerta" | "critico" | null
};

/* =====================
 * Tipos esperados por el front legado
 * ===================== */
export type TotalsByLocationRow = {
  location_id: number | string;
  location_name: string;
  location_code: string;
  tanks_count: number;
  pumps_count: number;
  valves_count: number;
  manifolds_count: number;
};

export type UptimeLocRow = {
  location_id: number | string;
  uptime_pct_30d: number;     // dejamos ambas por compatibilidad
  uptime_pct?: number;
};

export type PumpActivityRow = {
  local_hour: string;
  // el front chequea varios nombres, exponemos al menos uno:
  pumps_count?: number;
  pumps_with_reading?: number;
  count?: number;
};

export type TankLevelAvgLocRow = {
  local_hour: string;
  // idem, varios alias posibles:
  avg_level_pct?: number;
  level_avg_pct?: number;
};

export type LocationRow = {
  location_id: number | string;
  location_name: string;
  location_code: string;
};

export type Alarm = {
  id: string;
  message: string;
  severity: "critical" | "warning";
  is_active: boolean;
  asset_type: "tank";
  asset_id: number;
  ts_raised: string; // ISO
};

/* =====================
 * Helpers
 * ===================== */
async function http<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

function slug(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function locKey(id: number | string | null, name: string | null) {
  return `${id ?? ""}|${name ?? ""}`;
}

/* =====================
 * Endpoints base (nuevos)
 * ===================== */
export const getPumps = () => http<Pump[]>("/kpi/pumps/status");
export const getTanks = () => http<Tank[]>("/kpi/tanks/latest");

/* =====================
 * Locations y totales por ubicación
 * ===================== */
export async function fetchLocations(): Promise<LocationRow[]> {
  const [pumps, tanks] = await Promise.all([getPumps(), getTanks()]);
  const buckets = new Map<string, { id: number | string; name: string; code: string }>();

  function upsert(id: number | null, name: string | null) {
    const key = locKey(id, name);
    if (!buckets.has(key)) {
      const display = name ?? String(id ?? "-");
      buckets.set(key, { id: id ?? display, name: display, code: slug(display) });
    }
  }
  tanks.forEach(t => upsert(t.location_id, t.location_name));
  pumps.forEach(p => upsert(p.location_id, p.location_name));

  return Array.from(buckets.values()).map(b => ({
    location_id: b.id,
    location_name: b.name,
    location_code: b.code,
  }));
}

export async function fetchTotalsByLocation(args: { location_id?: number | "all" } = {}): Promise<TotalsByLocationRow[]> {
  const [pumps, tanks] = await Promise.all([getPumps(), getTanks()]);
  const m = new Map<string, TotalsByLocationRow>();

  function touch(id: number | null, name: string | null) {
    const key = locKey(id, name);
    if (!m.has(key)) {
      const display = name ?? String(id ?? "-");
      m.set(key, {
        location_id: id ?? display,
        location_name: display,
        location_code: slug(display),
        tanks_count: 0,
        pumps_count: 0,
        valves_count: 0,
        manifolds_count: 0,
      });
    }
    return m.get(key)!;
  }

  tanks.forEach(t => { touch(t.location_id, t.location_name).tanks_count++; });
  pumps.forEach(p => { touch(p.location_id, p.location_name).pumps_count++; });

  let rows = Array.from(m.values());
  if (args.location_id !== undefined && args.location_id !== "all") {
    rows = rows.filter(r => String(r.location_id) === String(args.location_id));
  }
  return rows;
}

/* =====================
 * Uptime 30d (aproximado con snapshot de bombas online)
 * ===================== */
export async function fetchUptime30dByLocation(
  args: { location_id?: number | "all" } = {}
): Promise<UptimeLocRow[]> {
  const pumps = await getPumps();
  const m = new Map<string, { total: number; online: number; id: number | string }>();
  for (const p of pumps) {
    const key = locKey(p.location_id, p.location_name);
    const cur = m.get(key) ?? { total: 0, online: 0, id: p.location_id ?? (p.location_name ?? "-") };
    cur.total += 1;
    if (p.online) cur.online += 1;
    m.set(key, cur);
  }

  let rows = Array.from(m.values()).map(v => {
    const pct = v.total ? Math.round((v.online / v.total) * 100) : 0;
    return { location_id: v.id, uptime_pct_30d: pct, uptime_pct: pct };
  });

  if (args.location_id !== undefined && args.location_id !== "all") {
    const match = rows.filter(r => String(r.location_id) === String(args.location_id));
    if (match.length) return match;
  }
  return rows;
}

/* =====================
 * Alarmas activas (derivadas de v_tanks_with_config)
 * ===================== */
export async function fetchActiveAlarms(args: { location_id?: number | "all" } = {}): Promise<Alarm[]> {
  const tanks = await getTanks();
  const now = Date.now();
  const loc = args.location_id;

  return tanks
    .filter(t => {
      const active = t.alarma && t.alarma !== "normal";
      const matchLoc = loc === undefined || loc === "all"
        ? true
        : (t.location_id ?? t.location_name) === loc;
      return active && matchLoc;
    })
    .map(t => {
      const sev: Alarm["severity"] = t.alarma === "critico" ? "critical" : "warning";
      const ts = t.age_sec != null ? new Date(now - t.age_sec * 1000).toISOString() : new Date().toISOString();
      return {
        id: `tank-${t.tank_id}-${sev}`,
        message: `Tanque ${t.name}: ${t.alarma}`,
        severity: sev,
        is_active: true,
        asset_type: "tank",
        asset_id: t.tank_id,
        ts_raised: ts,
      };
    });
}

/* =====================
 * Buckets y series 24h (placeholder compatibles)
 * ===================== */
export async function fetchTimeBuckets24h(): Promise<{ local_hour: string }[]> {
  // 24 buckets hora local "HH:00"
  const now = new Date();
  const out: { local_hour: string }[] = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600 * 1000);
    const hh = String(d.getHours()).padStart(2, "0");
    out.push({ local_hour: `${hh}:00` });
  }
  return out;
}

export async function fetchPumpsActivity24h(args: { location_id?: number | "all" } = {}): Promise<PumpActivityRow[]> {
  // Snapshot repetido: bombas online ahora, mismo valor en cada hora (compatible con la UI)
  const [pumps, buckets] = await Promise.all([getPumps(), fetchTimeBuckets24h()]);
  const loc = args.location_id;
  const filtered = pumps.filter(p => (loc === undefined || loc === "all") ? true : (p.location_id ?? p.location_name) === loc);
  const onlineNow = filtered.filter(p => !!p.online).length;

  return buckets.map(b => ({
    local_hour: b.local_hour,
    pumps_count: onlineNow,
  }));
}

export async function fetchTankLevelAvg24hByLocation(args: { location_id?: number | "all" } = {}): Promise<TankLevelAvgLocRow[]> {
  // Snapshot repetido: promedio de level_pct actual por ubicación
  const [tanks, buckets] = await Promise.all([getTanks(), fetchTimeBuckets24h()]);
  const loc = args.location_id;
  const filtered = tanks.filter(t => (loc === undefined || loc === "all") ? true : (t.location_id ?? t.location_name) === loc);
  const vals = filtered.map(t => t.level_pct).filter((x): x is number => typeof x === "number");
  const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : 0;

  return buckets.map(b => ({
    local_hour: b.local_hour,
    avg_level_pct: avg,
  }));
}

// ===== Reliability (por bomba) — snapshot con /kpi/pumps/status =====

export type UptimePumpRow = {
  pump_id: number;
  uptime_pct_30d: number;      // mismo nombre que usa el front
  uptime_pct?: number;         // alias por compatibilidad
  name?: string;
  location_id?: number | string | null;
  location_name?: string | null;
};

/**
 * Aproxima el uptime 30d por bomba usando el snapshot actual:
 *   uptime ≈ online ? 100 : 0
 * Mantiene nombre y shape para no tocar ReliabilityPage.tsx.
 *
 * Filtros:
 *  - location_id?: number | "all"
 *  - pump_id?: number  (si lo pasás, devuelve solo esa bomba)
 */
export async function fetchUptime30dByPump(
  args: { location_id?: number | "all"; pump_id?: number } = {}
): Promise<UptimePumpRow[]> {
  const pumps = await getPumps(); // /kpi/pumps/status
  let items = pumps;

  if (args.location_id !== undefined && args.location_id !== "all") {
    items = items.filter(
      p => (p.location_id ?? p.location_name) === args.location_id
    );
  }
  if (args.pump_id !== undefined) {
    items = items.filter(p => p.pump_id === args.pump_id);
  }

  return items.map(p => {
    const pct = p.online ? 100 : 0;
    return {
      pump_id: p.pump_id,
      uptime_pct_30d: pct,
      uptime_pct: pct,
      name: p.name,
      location_id: p.location_id ?? (p.location_name ?? null),
      location_name: p.location_name,
    };
  });
}
