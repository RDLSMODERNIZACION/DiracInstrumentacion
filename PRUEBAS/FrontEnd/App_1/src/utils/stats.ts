// src/utils/stats.ts
// Tipos mínimos para no romper el build
type AnyTS = { [k: string]: any } | any[];

export function tankStats(ts: AnyTS) {
  if (!ts) return { min: null, max: null, mean: null, range: null };
  const arr: number[] = ts.level_percent || [];
  if (!arr.length) return { min: null, max: null, mean: null, range: null };
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const range = max - min;
  return { min, max, mean, range };
}

export function tempStats(ts: AnyTS) {
  const arr: number[] = ts?.temperature_c || [];
  if (!arr.length) return { mean: null, min: null, max: null };
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return { mean, min, max };
}

export function turnoverEstimatePerDay(levelRangePct: number) {
  // Estimación simple: renovación ≈ variación % de nivel en 24h
  return Math.max(0, Number(levelRangePct.toFixed(1)));
}

export function criticalResolvedUnder24h(alarms: any[]) {
  const crit = (alarms || []).filter((a) => a.severity === "critical");
  if (!crit.length) return { pct: 100, total: 0 };
  const ok = crit.filter((a) => a.is_active === false).length; // demo
  const pct = (ok / crit.length) * 100;
  return { pct, total: crit.length };
}

export function topEnergyByLocation(data: any) {
  const map = new Map<number, number>();
  for (const p of data.assets.pumps) {
    const rec = data.analytics30d.pump_energy_kwh[String(p.id)];
    map.set(p.location_id, (map.get(p.location_id) || 0) + (rec ? rec.kwh_30d : 0));
  }
  const rows = data.locations.map((l: any) => ({
    location_id: l.location_id,
    location_name: l.location_name,
    code: l.location_code,
    kwh_30d: map.get(l.location_id) || 0,
  }));
  return rows.sort((a, b) => b.kwh_30d - a.kwh_30d).slice(0, 3);
}