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

  // ubicación (snake/camel/objeto)
  location_id?: number | null;
  location_name?: string | null;
  locationId?: number | null;
  locationName?: string | null;
  location?: { id?: number | null; name?: string | null };

  levelPct?: number | null;
  age_sec?: number | null;
  ageSec?: number | null;
  online?: boolean | null;

  // alarma textual del backend (si viene)
  alarm?: "normal" | "alerta" | "critico";

  volumeL?: number | null;
  capacityL?: number | null;
  temperatureC?: number | null;
  latest?: any;
  thresholds?: Thresholds;
};

type Pump = {
  id: number;
  name: string;
  state?: "run" | "stop";

  // ubicación
  location_id?: number | null;
  location_name?: string | null;
  locationId?: number | null;
  locationName?: string | null;
  location?: { id?: number | null; name?: string | null };

  // conectividad (de v_pumps_with_status)
  age_sec?: number | null;
  ageSec?: number | null;
  online?: boolean | null;

  // debug opcional
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

const ONLINE_DEAD_SEC = 60;

// 🔧 Backend por defecto (evita pegarle al 5173)
const API_BASE =
  (window as any).__API_BASE__ ||
  (import.meta as any).env?.VITE_API_BASE?.trim?.() ||
  "https://diracinstrumentacion.onrender.com";

async function getJSON(path: string) {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set("__ts", String(Date.now())); // cache-buster
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
      ...authHeaders(), // 👈 agrega Authorization: Basic ... si hay login
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${res.statusText}`);
  return res.json();
}

// Intenta múltiples endpoints en orden y devuelve el primero que funcione
async function getFirstJSON(paths: string[]) {
  let lastErr: any = null;
  for (const p of paths) {
    try {
      return await getJSON(p);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function toNumOr(def: number, x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

function normOnline(online: any, ageSec: any): boolean {
  if (typeof online === "boolean") return online;
  const age = Number(ageSec);
  return Number.isFinite(age) ? age <= ONLINE_DEAD_SEC : false;
}

// === Mappers (usan /tanks/config y /pumps/config como fuentes) ===
function mapTanks(rows: any[]): Tank[] {
  return rows.map((r) => {
    const id = Number(r.tank_id ?? r.id);
    const name = String(r.name ?? `Tanque ${r.tank_id ?? r.id}`);

    const location_id = r.location_id ?? null;
    const location_name = r.location_name ?? null;

    const levelPct = typeof r.level_pct === "number" ? r.level_pct : undefined;
    const age_sec = typeof r.age_sec === "number" ? r.age_sec : undefined;
    const online = normOnline(r.online, age_sec);

    // toma 'alarma' textual del backend; default "normal"
    const alarm: Tank["alarm"] =
      typeof r.alarma === "string" &&
      (r.alarma === "normal" || r.alarma === "alerta" || r.alarma === "critico")
        ? r.alarma
        : "normal";

    return {
      id,
      name,

      // snake originales
      location_id,
      location_name,
      age_sec,
      online,
      levelPct,
      alarm,

      // normalizados para UI
      locationId: location_id,
      locationName: location_name,
      location: { id: location_id, name: location_name },
      ageSec: age_sec,

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
      // snake
      location_id,
      location_name,
      // camel + objeto
      locationId: location_id,
      locationName: location_name,
      location: { id: location_id, name: location_name },
      // opcional runtime
      latest: r.event_ts ? { ts: r.event_ts } : undefined,
      ...(age_sec !== undefined ? { age_sec } : {}),
      ...(online !== undefined ? { online } : {}),
    };
  });
}

// === KPIs ===
function isCritical(level: number | null | undefined, th: Thresholds | undefined): boolean {
  if (level == null || typeof level !== "number") return false;
  const t = th || DEFAULT_THRESHOLDS;
  return level <= t.lowCritical || level >= t.highCritical;
}

function computeKpis(tanks: Tank[]): Kpis {
  const levels = tanks.map((t) => (typeof t.levelPct === "number" ? t.levelPct : 0));
  const avg = levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : 0;

  // Prioridad: usar alarma textual; fallback a umbrales
  const crit = tanks.reduce((acc, t) => {
    if (t.alarm === "critico") return acc + 1;
    if (t.alarm == null) return acc + (isCritical(t.levelPct, t.thresholds) ? 1 : 0);
    return acc;
  }, 0);

  return { avg, crit };
}

// Helper: obtener location_id desde distintas formas
function getLocId(x: { location_id?: any; locationId?: any; location?: any }) {
  return x.location_id ?? x.locationId ?? x.location?.id ?? null;
}

// 🔁 Hook principal
// allowedLocationIds: si viene, filtra lo que retorna el backend por esas locaciones
export function usePlant(pollMs = 1000, allowedLocationIds?: Set<number>): UsePlant {
  const [plant, setPlant] = React.useState<Plant>({ tanks: [], pumps: [] });
  const [loading, setLoading] = React.useState<boolean>(true);
  const [err, setErr] = React.useState<unknown>(null);
  const [kpis, setKpis] = React.useState<Kpis>({ avg: 0, crit: 0 });

  const fetchAll = React.useCallback(async () => {
    try {
      setErr(null);

      // Fuente de verdad: backend (con fallback por si tenés la ruta /dirac/admin/*)
      const [tanksRes, pumpsRes] = await Promise.all([
        getFirstJSON(["/tanks/config", "/dirac/admin/tanks/config"]).catch(() => [] as any[]),
        getFirstJSON(["/pumps/config", "/dirac/admin/pumps/config"]).catch(() => [] as any[]),
      ]);

      const freshTanks = Array.isArray(tanksRes) ? mapTanks(tanksRes) : [];
      const freshPumps = Array.isArray(pumpsRes) ? mapPumps(pumpsRes) : [];

      // Filtro por allowedLocationIds (si existe)
      const pass = (locId: any) =>
        !allowedLocationIds || (locId != null && allowedLocationIds.has(Number(locId)));

      const filtTanks = freshTanks.filter((t) => pass(getLocId(t)));
      const filtPumps = freshPumps.filter((p) => pass(getLocId(p)));

      setPlant((prev) => {
        const mergedTanks = filtTanks.map((t) => {
          const old = (prev.tanks || []).find((p) => p.id === t.id);
          return old ? { ...old, ...t, latest: old.latest } : t;
        });

        const mergedPumps = filtPumps.map((p) => {
          const old = (prev.pumps || []).find((x) => x.id === p.id);
          return old ? { ...old, ...p, latest: old.latest } : p;
        });

        return { tanks: mergedTanks, pumps: mergedPumps, alarms: prev.alarms };
      });

      setKpis(computeKpis(filtTanks));
      setLoading(false);
    } catch (e) {
      setErr(e);
      setLoading(false);
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
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        fetchAll(); // refresco al volver
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
