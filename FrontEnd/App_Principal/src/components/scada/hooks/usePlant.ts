// src/components/scada/hooks/usePlant.ts
import * as React from "react";
import { authHeaders } from "../../../lib/http";

type Thresholds = {
  lowCritical: number;
  lowWarning: number;
  highWarning: number;
  highCritical: number;
};
const DEFAULT_THRESHOLDS: Thresholds = {
  lowCritical: 10,
  lowWarning: 25,
  highWarning: 80,
  highCritical: 90,
};

type Tank = {
  id: number;
  name: string;
  location_id?: number | null;
  location_name?: string | null;
  locationId?: number | null;
  locationName?: string | null;
  location?: { id?: number | null; name?: string | null };
  levelPct?: number | null;
  age_sec?: number | null;
  ageSec?: number | null;
  online?: boolean | null;
  alarm?: "normal" | "alerta" | "critico";
  latest?: any;
  thresholds?: Thresholds;
};

type Pump = {
  id: number;
  name: string;
  state?: "run" | "stop";
  location_id?: number | null;
  location_name?: string | null;
  locationId?: number | null;
  locationName?: string | null;
  location?: { id?: number | null; name?: string | null };
  age_sec?: number | null;
  ageSec?: number | null;
  online?: boolean | null;
  latest_event_id?: number | null;
  event_ts?: string | null;
  latest_hb_id?: number | null;
  hb_ts?: string | null;
  latest?: any;
};

export type Plant = { tanks: Tank[]; pumps: Pump[]; alarms?: any[] };
export type Kpis = { avg: number; crit: number };

type UsePlant = {
  plant: Plant;
  setPlant: React.Dispatch<React.SetStateAction<Plant>>;
  loading: boolean;
  err: unknown;
  kpis: Kpis;
};

const ONLINE_DEAD_SEC = 180;

const API_BASE =
  (window as any).__API_BASE__ ||
  (import.meta as any).env?.VITE_API_BASE?.trim?.() ||
  "https://diracinstrumentacion.onrender.com";

/**
 * ✅ Cambios clave:
 * - Eliminado __ts (cache-buster) + no-cache + no-store => ahora puede cachear (ETag/Cache-Control del backend)
 * - Dedupe global (si dos componentes llaman a la vez, se comparte la misma promesa)
 * - Posibilidad de NO mandar Authorization para endpoints públicos (evita preflight CORS)
 * - Cache en memoria (stale-while-revalidate simple) por path, para evitar refetch redundante
 */

type JsonCacheEntry = {
  ts: number;
  data: any;
  inflight?: Promise<any> | null;
};
const JSON_CACHE: Record<string, JsonCacheEntry> = Object.create(null);

// TTL local (frontend) para no pegarle al backend cada 1s si no hace falta.
// Como el backend ya cachea 10s, acá ponemos igual o un poquito menos.
const FRONT_TTL_MS = 8_000;

/** Si tus /tanks/config y /pumps/config ya no requieren auth, dejalo en false para evitar preflight */
const CONFIG_ENDPOINTS_PUBLIC = true;

function buildHeaders(withAuth: boolean) {
  return {
    Accept: "application/json",
    ...(withAuth ? authHeaders() : {}),
  };
}

async function fetchJSON(path: string, opts?: { withAuth?: boolean }) {
  const withAuth = opts?.withAuth ?? true;
  const url = `${API_BASE}${path}`;

  const res = await fetch(url, {
    method: "GET",
    headers: buildHeaders(withAuth),
    // NO seteamos cache: "no-store" ni Cache-Control: no-cache
    // dejamos que el browser y el backend manejen ETag / Cache-Control
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GET ${path} -> ${res.status} ${res.statusText}${txt ? ` | ${txt.slice(0, 200)}` : ""}`);
  }

  return res.json();
}

/**
 * getJSON con:
 * - dedupe de requests en vuelo por path
 * - cache local con TTL (evita doble fetch dentro del mismo intervalo)
 */
async function getJSON(path: string, opts?: { withAuth?: boolean; ttlMs?: number }) {
  const ttlMs = opts?.ttlMs ?? FRONT_TTL_MS;
  const withAuth = opts?.withAuth ?? true;

  const now = Date.now();
  const ent = JSON_CACHE[path];

  // Cache local válido
  if (ent?.data !== undefined && now - ent.ts < ttlMs) {
    return ent.data;
  }

  // Dedupe inflight
  if (ent?.inflight) return ent.inflight;

  const inflight = fetchJSON(path, { withAuth })
    .then((data) => {
      JSON_CACHE[path] = { ts: Date.now(), data, inflight: null };
      return data;
    })
    .catch((err) => {
      // si falla, dejamos data previa si existía, pero limpiamos inflight
      if (JSON_CACHE[path]) JSON_CACHE[path].inflight = null;
      throw err;
    });

  JSON_CACHE[path] = { ts: ent?.ts ?? 0, data: ent?.data, inflight };
  return inflight;
}

async function getFirstJSON(paths: string[], opts?: { withAuth?: boolean; ttlMs?: number }) {
  let lastErr: any = null;
  for (const p of paths) {
    try {
      return await getJSON(p, opts);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function toNumOr(def: number, x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}
function normOnline(online: any, ageSec: any) {
  if (typeof online === "boolean") return online;
  const age = Number(ageSec);
  return Number.isFinite(age) ? age <= ONLINE_DEAD_SEC : false;
}

function mapTanks(rows: any[]): Tank[] {
  return rows.map((r) => {
    const id = Number(r.tank_id ?? r.id);
    const name = String(r.name ?? `Tanque ${r.tank_id ?? r.id}`);
    const location_id = r.location_id ?? null;
    const location_name = r.location_name ?? null;
    const levelPct = typeof r.level_pct === "number" ? r.level_pct : undefined;
    const age_sec = typeof r.age_sec === "number" ? r.age_sec : undefined;
    const online = normOnline(r.online, age_sec);
    const alarm: Tank["alarm"] =
      typeof r.alarma === "string" && (r.alarma === "normal" || r.alarma === "alerta" || r.alarma === "critico")
        ? r.alarma
        : "normal";

    return {
      id,
      name,
      location_id,
      location_name,
      online,
      levelPct,
      alarm,
      locationId: location_id,
      locationName: location_name,
      location: { id: location_id, name: location_name },
      ageSec: age_sec,
      age_sec,
      thresholds: {
        lowCritical: toNumOr(DEFAULT_THRESHOLDS.lowCritical, r.low_low_pct),
        lowWarning: toNumOr(DEFAULT_THRESHOLDS.lowWarning, r.low_pct),
        highWarning: toNumOr(DEFAULT_THRESHOLDS.highWarning, r.high_pct),
        highCritical: toNumOr(DEFAULT_THRESHOLDS.highCritical, r.high_high_pct),
      },
    };
  });
}

function mapPumps(rows: any[]): Pump[] {
  return rows.map((r) => {
    const id = Number(r.pump_id ?? r.id);
    const name = String(r.name ?? `Bomba ${r.pump_id ?? r.id}`);
    const location_id = r.location_id ?? null;
    const location_name = r.location_name ?? null;
    const state: "run" | "stop" = r.state === "run" ? "run" : "stop";
    const age_sec = typeof r.age_sec === "number" ? r.age_sec : undefined;
    const online = typeof r.online === "boolean" ? r.online : undefined;

    return {
      id,
      name,
      state,
      location_id,
      location_name,
      locationId: location_id,
      locationName: location_name,
      location: { id: location_id, name: location_name },
      latest: r.event_ts ? { ts: r.event_ts } : undefined,
      ...(age_sec !== undefined ? { age_sec } : {}),
      ...(online !== undefined ? { online } : {}),
    };
  });
}

function isCritical(level: number | null | undefined, th?: Thresholds): boolean {
  if (level == null || typeof level !== "number") return false;
  const t = th || DEFAULT_THRESHOLDS;
  return level <= t.lowCritical || level >= t.highCritical;
}

function computeKpis(tanks: Tank[]): Kpis {
  const levels = tanks.map((t) => (typeof t.levelPct === "number" ? t.levelPct : 0));
  const avg = levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : 0;

  const crit = tanks.reduce((acc, t) => {
    if (t.alarm === "critico") return acc + 1;
    if (t.alarm == null) return acc + (isCritical(t.levelPct, t.thresholds) ? 1 : 0);
    return acc;
  }, 0);

  return { avg, crit };
}

function getLocId(x: { location_id?: any; locationId?: any; location?: any }) {
  return x.location_id ?? x.locationId ?? x.location?.id ?? null;
}

// === Hook principal (sin flicker) ===
export function usePlant(pollMs = 1000, allowedLocationIds?: Set<number>): UsePlant {
  const [plant, setPlant] = React.useState<Plant>({ tanks: [], pumps: [] });
  const [loading, setLoading] = React.useState<boolean>(true);
  const [err, setErr] = React.useState<unknown>(null);
  const [kpis, setKpis] = React.useState<Kpis>({ avg: 0, crit: 0 });

  // snapshot actual para cálculo de KPIs cuando una mitad falla
  const plantRef = React.useRef<Plant>(plant);
  React.useEffect(() => {
    plantRef.current = plant;
  }, [plant]);

  // evitar llamadas superpuestas
  const inflightRef = React.useRef(false);

  const fetchAll = React.useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;

    try {
      setErr(null);

      // Si config endpoints son públicos, NO mandamos Authorization => evita preflight
      const withAuthForConfig = !CONFIG_ENDPOINTS_PUBLIC;

      const [tanksRes, pumpsRes] = await Promise.allSettled([
        getFirstJSON(["/tanks/config"], { withAuth: withAuthForConfig }),
        getFirstJSON(["/pumps/config"], { withAuth: withAuthForConfig }),
      ]);

      const tanksOk = tanksRes.status === "fulfilled" && Array.isArray(tanksRes.value);
      const pumpsOk = pumpsRes.status === "fulfilled" && Array.isArray(pumpsRes.value);

      const mappedTanks = tanksOk ? mapTanks(tanksRes.value as any[]) : plantRef.current.tanks;
      const mappedPumps = pumpsOk ? mapPumps(pumpsRes.value as any[]) : plantRef.current.pumps;

      // 🧠 filtro: set vacío = “sin filtro”
      const filterSet = allowedLocationIds && allowedLocationIds.size ? allowedLocationIds : undefined;
      const pass = (locId: any) => !filterSet || (locId != null && filterSet.has(Number(locId)));

      const filtTanks = mappedTanks.filter((t) => pass(getLocId(t)));
      const filtPumps = mappedPumps.filter((p) => pass(getLocId(p)));

      // merge conservando "latest" si existía
      setPlant((prev) => {
        const mergedTanks = filtTanks.map((t) => {
          const old = prev.tanks.find((x) => x.id === t.id);
          return old ? { ...old, ...t, latest: old.latest } : t;
        });
        const mergedPumps = filtPumps.map((p) => {
          const old = prev.pumps.find((x) => x.id === p.id);
          return old ? { ...old, ...p, latest: old.latest } : p;
        });
        return { ...prev, tanks: mergedTanks, pumps: mergedPumps };
      });

      setKpis(computeKpis(filtTanks));
      setLoading(false);
    } catch (e) {
      setErr(e);
      setLoading(false);
    } finally {
      inflightRef.current = false;
    }
  }, [allowedLocationIds]);

  React.useEffect(() => {
    let timer: number | null = null;

    const start = () => {
      if (pollMs > 0 && timer == null) timer = window.setInterval(fetchAll, pollMs);
    };
    const stop = () => {
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
    };

    fetchAll(); // primera carga
    start();

    const onVis = () => {
      if (document.visibilityState === "hidden") stop();
      else {
        fetchAll();
        start();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchAll, pollMs]);

  return { plant, setPlant, loading, err, kpis };
}

export default usePlant;
