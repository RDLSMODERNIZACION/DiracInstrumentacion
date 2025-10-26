// src/services/loadDashboard.ts
const BASE = import.meta.env?.VITE_API_BASE ?? "https://backend-v85n.onrender.com";

type Pump = {
  pump_id: number;
  name: string;
  location_id: number | null;
  location_name: string | null;
  state: string | null;
  age_sec: number | null;
  online: boolean | null;
  hb_ts: string | null;
};

type Tank = {
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

export async function loadDashboard() {
  // 1) Traemos datos crudos del backend
  const [pumps, tanks] = await Promise.all([
    http<Pump[]>("/kpi/pumps/status"),
    http<Tank[]>("/kpi/tanks/latest"),
  ]);

  // 2) Locations únicas (de lo que venga en tanks+pumps)
  const locMap = new Map<string | number, { location_id: string | number; location_name: string; location_code: string }>();
  for (const t of tanks) {
    const id = t.location_id ?? t.location_name ?? "-";
    const name = t.location_name ?? String(t.location_id ?? "-");
    if (!locMap.has(id)) locMap.set(id, { location_id: id, location_name: name, location_code: slug(name) });
  }
  for (const p of pumps) {
    const id = p.location_id ?? p.location_name ?? "-";
    const name = p.location_name ?? String(p.location_id ?? "-");
    if (!locMap.has(id)) locMap.set(id, { location_id: id, location_name: name, location_code: slug(name) });
  }
  const locations = Array.from(locMap.values());

  // 3) KPIs simples
  const tanksCount = tanks.length;
  const pumpsCount = pumps.length;
  const alarmsActive = tanks.filter(t => (t.alarma ?? "normal") !== "normal").length;
  const levelVals = tanks.map(t => t.level_pct).filter((x): x is number => typeof x === "number");
  const avgLevel = levelVals.length ? (levelVals.reduce((a, b) => a + b, 0) / levelVals.length) : 0;

  const MOCK_DATA = {
    kpis: {
      assets_total: tanksCount + pumpsCount, // ajustalo si querés incluir otros
      tanks: tanksCount,
      pumps: pumpsCount,
      valves: 0,                  // no lo tenemos en estos endpoints
      alarms_active: alarmsActive,
      avg_level_pct_30d: avgLevel // aproximación: promedio actual; si querés 30d reales, después usamos series
    },
    alarms: [] as any[], // si tenés un endpoint de alarmas, lo llenamos luego
  };

  // 4) Resumen por ubicación (lo que consume ByLocationTable)
  //    Ajustá columnas si tu tabla espera otras props.
  const byLoc = locations.map(loc => {
    const tks = tanks.filter(t => (t.location_id ?? t.location_name) === loc.location_id);
    const pps = pumps.filter(p => (p.location_id ?? p.location_name) === loc.location_id);
    const avgLevelLocVals = tks.map(t => t.level_pct).filter((x): x is number => typeof x === "number");
    const avgLevelLoc = avgLevelLocVals.length ? (avgLevelLocVals.reduce((a,b)=>a+b,0)/avgLevelLocVals.length) : null;
    const alarmsCrit = tks.filter(t => (t.alarma ?? "normal") === "critico").length;
    const alarmsAlt  = tks.filter(t => (t.alarma ?? "normal") === "alerta").length;
    const pumpsOn    = pps.filter(p => !!p.online).length;
    return {
      location_id: loc.location_id,
      location_name: loc.location_name,
      location_code: loc.location_code,
      pumps_total: pps.length,
      pumps_online: pumpsOn,
      tanks_total: tks.length,
      avg_level_pct: avgLevelLoc,
      alarms_criticas: alarmsCrit,
      alarms_alerta:  alarmsAlt,
    };
  });

  const filtered = {
    byLocation: byLoc
  };

  // 5) Series agregadas (tus componentes aceptan null/undefined)
  const tankTs = null; // { timestamps: [...], level_percent: [...] } si después querés
  const pumpTs = null; // { timestamps: [...], is_on: [...] }       idem

  // 6) Default pump (por si tu UI lo usa)
  const defaultPumpId = pumps[0]?.pump_id ?? "";

  return {
    locations,
    filtered,
    tankTs,
    pumpTs,
    defaultPumpId,
    MOCK_DATA,
  };
}
