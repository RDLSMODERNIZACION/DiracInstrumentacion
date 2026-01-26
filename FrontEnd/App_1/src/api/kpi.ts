// src/api/kpi.ts
import { scopedUrl, getApiHeaders } from "@/lib/config";

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
  uptime_pct_30d: number;
  uptime_pct?: number;
};

export type PumpActivityRow = {
  local_hour: string;
  pumps_count?: number;
  pumps_with_reading?: number;
  count?: number;
};

export type TankLevelAvgLocRow = {
  local_hour: string;
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

// ===== Reliability (por bomba) — snapshot con /kpi/pumps/status =====
export type UptimePumpRow = {
  pump_id: number;
  uptime_pct_30d: number;
  uptime_pct?: number;
  name?: string;
  location_id?: number | string | null;
  location_name?: string | null;
};

/* =====================
 * Helpers (HTTP + cache SWR)
 * ===================== */

/**
 * ✅ SWR:
 *  - Si hay value cacheado => responde YA (UI rápida)
 *  - Luego refresca en background (si está vencido)
 *  - Si falla / timeout => mantiene último valor bueno
 */
const DEFAULT_TTL_MS = 10_000; // tiempo “fresco”
const DEFAULT_STALE_MS = 5 * 60_000; // cuánto aceptamos usar “viejo” (para no bloquear UI)
const DEFAULT_TIMEOUT_MS = 7_000; // abort fetch si cuelga

type CacheEntry<T> = {
  exp: number; // fresh until
  staleExp: number; // acceptable until (stale)
  value?: T;
  inflight?: Promise<T>;
  lastOkAt?: number;
  lastErrAt?: number;
  lastErr?: string;
};

const cache = new Map<string, CacheEntry<any>>();

function nowMs() {
  return Date.now();
}

/** separa cache por “scope” (por company/tenant), evitando mezclar datos */
function scopeNs() {
  // scopedUrl("/kpi/...") ya cambia con el scope; usamos el host+base como namespace
  try {
    const u = new URL(scopedUrl("/"));
    return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
  } catch {
    // fallback si scopedUrl no es URL absoluta
    return String(scopedUrl("/")).replace(/\/+$/, "");
  }
}

function k(key: string) {
  return `${scopeNs()}::${key}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function http<T>(path: string, opts?: { timeoutMs?: number }): Promise<T> {
  const url = scopedUrl(path);
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), timeoutMs);

  const t0 = performance.now();
  try {
    const res = await fetch(url, { headers: getApiHeaders(), signal: ac.signal });
    const dt = Math.round(performance.now() - t0);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[API ${res.status}] ${res.statusText} (${dt}ms) ::`, body || "(sin cuerpo)");
      throw new Error(`[API ${res.status}] ${res.statusText}`);
    }

    const json = (await res.json()) as T;
    // log liviano (solo si tarda)
    if (dt > 1200) console.warn(`[API] ${path} tardó ${dt}ms`);
    return json;
  } catch (err: any) {
    const dt = Math.round(performance.now() - t0);
    const msg =
      err?.name === "AbortError"
        ? `Timeout ${timeoutMs}ms en ${path}`
        : `Error en ${path}: ${String(err?.message ?? err)}`;
    console.warn(`[API] ${msg} (${dt}ms)`);
    throw err;
  } finally {
    clearTimeout(to);
  }
}

/** localStorage “best effort” para mostrar algo instantáneo tras refresh */
function lsKey(key: string) {
  return `dirac:kpi-cache:${k(key)}`;
}
function lsGet<T>(key: string): { t: number; v: T } | null {
  try {
    const raw = localStorage.getItem(lsKey(key));
    if (!raw) return null;
    return JSON.parse(raw) as { t: number; v: T };
  } catch {
    return null;
  }
}
function lsSet<T>(key: string, v: T) {
  try {
    localStorage.setItem(lsKey(key), JSON.stringify({ t: nowMs(), v }));
  } catch {
    // ignore
  }
}

/**
 * httpSWR:
 * - devuelve cache al toque si existe (aunque esté stale)
 * - refresca si está vencido y no hay inflight
 * - si no hay cache, espera a fetch (primera carga)
 */
async function httpSWR<T>(
  key: string,
  path: string,
  opts?: {
    ttlMs?: number;
    staleMs?: number;
    timeoutMs?: number;
    force?: boolean; // obliga fetch y espera (modo “gestión”)
    background?: boolean; // si true, si hay cache NO espera
  }
): Promise<T> {
  const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
  const staleMs = opts?.staleMs ?? DEFAULT_STALE_MS;
  const force = !!opts?.force;
  const background = opts?.background ?? true;

  const key2 = k(key);
  const t = nowMs();
  const e = cache.get(key2) as CacheEntry<T> | undefined;

  // 1) si hay cache válido (fresh)
  if (!force && e?.value !== undefined && e.exp > t) {
    return e.value;
  }

  // 2) si hay cache stale aceptable: devolver YA y refrescar en bg
  if (!force && e?.value !== undefined && e.staleExp > t) {
    if (!e.inflight) {
      // disparar refresh en background sin bloquear
      void refresh<T>(key, path, ttlMs, staleMs, opts?.timeoutMs);
    }
    return e.value;
  }

  // 2b) si no hay memoria, intentá levantar localStorage (instantáneo) + refresh bg
  if (!force && (!e?.value || e.staleExp <= t)) {
    const ls = lsGet<T>(key);
    if (ls?.v !== undefined) {
      cache.set(key2, {
        exp: t + 250, // “fresh” muy corto, para disparar refresh pronto
        staleExp: t + staleMs,
        value: ls.v,
        lastOkAt: ls.t,
      });
      // refrescar sí o sí
      void refresh<T>(key, path, ttlMs, staleMs, opts?.timeoutMs);
      return ls.v;
    }
  }

  // 3) si hay inflight (dedupe)
  if (!force && e?.inflight) return e.inflight;

  // 4) primera carga real (sin cache): fetch y esperar
  if (background && !force && e?.value !== undefined) {
    // ya cubierto arriba, pero por si acaso
    void refresh<T>(key, path, ttlMs, staleMs, opts?.timeoutMs);
    return e.value;
  }

  // fetch y esperar
  return refresh<T>(key, path, ttlMs, staleMs, opts?.timeoutMs);
}

async function refresh<T>(
  key: string,
  path: string,
  ttlMs: number,
  staleMs: number,
  timeoutMs?: number
): Promise<T> {
  const key2 = k(key);
  const t = nowMs();
  const prev = cache.get(key2) as CacheEntry<T> | undefined;

  const p = (async () => {
    try {
      const val = await http<T>(path, { timeoutMs });
      const now = nowMs();
      cache.set(key2, {
        exp: now + ttlMs,
        staleExp: now + staleMs,
        value: val,
        lastOkAt: now,
      });
      lsSet(key, val);
      return val;
    } catch (err: any) {
      const cur = cache.get(key2) as CacheEntry<T> | undefined;
      const now = nowMs();

      // si teníamos valor, lo mantenemos y extendemos “stale” un poco para no bloquear
      if (cur?.value !== undefined) {
        cache.set(key2, {
          exp: Math.min(cur.exp, now + 500), // no lo hagas fresh real
          staleExp: now + staleMs,
          value: cur.value,
          lastOkAt: cur.lastOkAt,
          lastErrAt: now,
          lastErr: String(err?.message ?? err),
        });
        return cur.value;
      }

      // si no había nada, re-throw
      cache.set(key2, {
        exp: t + 250,
        staleExp: t + 250,
        lastErrAt: now,
        lastErr: String(err?.message ?? err),
      });
      throw err;
    } finally {
      // limpiar inflight si quedó marcado
      const cur = cache.get(key2) as CacheEntry<T> | undefined;
      if (cur?.inflight) {
        cache.set(key2, {
          exp: cur.exp,
          staleExp: cur.staleExp,
          value: cur.value,
          lastOkAt: cur.lastOkAt,
          lastErrAt: cur.lastErrAt,
          lastErr: cur.lastErr,
        });
      }
    }
  })();

  cache.set(key2, {
    exp: prev?.exp ?? t + ttlMs,
    staleExp: prev?.staleExp ?? t + staleMs,
    value: prev?.value,
    inflight: p,
    lastOkAt: prev?.lastOkAt,
    lastErrAt: prev?.lastErrAt,
    lastErr: prev?.lastErr,
  });

  return p;
}

/** Permite invalidar cache (por ejemplo al cambiar company_id / login / etc.) */
export function invalidateKpiCache() {
  cache.clear();
  // no limpiamos localStorage a lo bruto; si querés: localStorage.clear() no da.
}

/* helpers de strings */
function slug(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function locKey(id: number | string | null, name: string | null) {
  return `${id ?? ""}|${name ?? ""}`;
}

/* =====================
 * Endpoints base (nuevos)
 * ===================== */

/**
 * ✅ SNAPSHOT SWR:
 * - por defecto: devuelve cache rápido y refresca bg
 * - si necesitás “esperar sí o sí”: opts.force=true
 */
export const getPumps = (opts?: {
  force?: boolean;
  ttlMs?: number;
  staleMs?: number;
  timeoutMs?: number;
  background?: boolean;
}) => httpSWR<Pump[]>("kpi:pumps:status", "/kpi/pumps/status", opts);

export const getTanks = (opts?: {
  force?: boolean;
  ttlMs?: number;
  staleMs?: number;
  timeoutMs?: number;
  background?: boolean;
}) => httpSWR<Tank[]>("kpi:tanks:latest", "/kpi/tanks/latest", opts);

/** opcional: warmup para disparar refresh temprano sin bloquear UI */
export function warmupKpiSnapshots() {
  void getPumps({ background: true }).catch(() => {});
  void getTanks({ background: true }).catch(() => {});
}

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

  tanks.forEach((t) => upsert(t.location_id, t.location_name));
  pumps.forEach((p) => upsert(p.location_id, p.location_name));

  return Array.from(buckets.values()).map((b) => ({
    location_id: b.id,
    location_name: b.name,
    location_code: b.code,
  }));
}

export async function fetchTotalsByLocation(
  args: { location_id?: number | "all" } = {}
): Promise<TotalsByLocationRow[]> {
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

  tanks.forEach((t) => touch(t.location_id, t.location_name).tanks_count++);
  pumps.forEach((p) => touch(p.location_id, p.location_name).pumps_count++);

  let rows = Array.from(m.values());
  if (args.location_id !== undefined && args.location_id !== "all") {
    rows = rows.filter((r) => String(r.location_id) === String(args.location_id));
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

  let rows = Array.from(m.values()).map((v) => {
    const pct = v.total ? Math.round((v.online / v.total) * 100) : 0;
    return { location_id: v.id, uptime_pct_30d: pct, uptime_pct: pct };
  });

  if (args.location_id !== undefined && args.location_id !== "all") {
    const match = rows.filter((r) => String(r.location_id) === String(args.location_id));
    if (match.length) return match;
  }
  return rows;
}

/* =====================
 * Alarmas activas (derivadas de v_tanks_with_config)
 * ===================== */

export async function fetchActiveAlarms(
  args: { location_id?: number | "all" } = {}
): Promise<Alarm[]> {
  const tanks = await getTanks();
  const now = Date.now();
  const loc = args.location_id;

  return tanks
    .filter((t) => {
      const active = t.alarma && t.alarma !== "normal";
      const matchLoc =
        loc === undefined || loc === "all" ? true : (t.location_id ?? t.location_name) === loc;
      return !!active && matchLoc;
    })
    .map((t) => {
      const sev: Alarm["severity"] = t.alarma === "critico" ? "critical" : "warning";
      const ts =
        t.age_sec != null ? new Date(now - t.age_sec * 1000).toISOString() : new Date().toISOString();
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

/** memo simple: recalcula buckets solo si cambia la hora */
let _bucketsCache: { stamp: string; data: { local_hour: string }[] } | null = null;

export async function fetchTimeBuckets24h(): Promise<{ local_hour: string }[]> {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
  if (_bucketsCache?.stamp === stamp) return _bucketsCache.data;

  const out: { local_hour: string }[] = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600 * 1000);
    const hh = String(d.getHours()).padStart(2, "0");
    out.push({ local_hour: `${hh}:00` });
  }
  _bucketsCache = { stamp, data: out };
  return out;
}

export async function fetchPumpsActivity24h(
  args: { location_id?: number | "all" } = {}
): Promise<PumpActivityRow[]> {
  const [pumps, buckets] = await Promise.all([getPumps(), fetchTimeBuckets24h()]);
  const loc = args.location_id;
  const filtered = pumps.filter((p) =>
    loc === undefined || loc === "all" ? true : (p.location_id ?? p.location_name) === loc
  );
  const onlineNow = filtered.filter((p) => !!p.online).length;

  return buckets.map((b) => ({
    local_hour: b.local_hour,
    pumps_count: onlineNow,
  }));
}

export async function fetchTankLevelAvg24hByLocation(
  args: { location_id?: number | "all" } = {}
): Promise<TankLevelAvgLocRow[]> {
  const [tanks, buckets] = await Promise.all([getTanks(), fetchTimeBuckets24h()]);
  const loc = args.location_id;
  const filtered = tanks.filter((t) =>
    loc === undefined || loc === "all" ? true : (t.location_id ?? t.location_name) === loc
  );
  const vals = filtered.map((t) => t.level_pct).filter((x): x is number => typeof x === "number");
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

  return buckets.map((b) => ({
    local_hour: b.local_hour,
    avg_level_pct: avg,
    level_avg_pct: avg,
  }));
}

/* =====================
 * Uptime 30d por bomba (aprox)
 * ===================== */

export async function fetchUptime30dByPump(
  args: { location_id?: number | "all"; pump_id?: number } = {}
): Promise<UptimePumpRow[]> {
  const pumps = await getPumps();
  let items = pumps;

  if (args.location_id !== undefined && args.location_id !== "all") {
    items = items.filter((p) => (p.location_id ?? p.location_name) === args.location_id);
  }
  if (args.pump_id !== undefined) {
    items = items.filter((p) => p.pump_id === args.pump_id);
  }

  return items.map((p) => {
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
