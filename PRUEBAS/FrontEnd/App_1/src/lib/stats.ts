import type { Alarm, Dataset } from "../types";


export function availabilityPct(isOn: boolean[]) {
const on = isOn.filter(Boolean).length;
return (on / Math.max(1, isOn.length)) * 100;
}


export function avgOnDurationHours(isOn: boolean[]) {
let total = 0, runs = 0, current = 0;
for (let i = 0; i < isOn.length; i++) {
if (isOn[i]) current++;
if ((i === isOn.length - 1 || !isOn[i]) && current > 0) {
total += current; runs++; current = 0;
}
}
return runs ? total / runs : 0;
}


export function mtbaHours(alarms: Alarm[]) {
if (!alarms || alarms.length < 2) return null;
const times = alarms.map((a) => new Date(a.ts_raised).getTime()).sort((a, b) => a - b);
let gaps = 0, sum = 0;
for (let i = 1; i < times.length; i++) { sum += times[i] - times[i - 1]; gaps++; }
return sum / Math.max(1, gaps) / 3600000; // horas
}


export function tankStats(ts?: { level_percent?: number[] }) {
if (!ts) return { min: null, max: null, mean: null, range: null } as const;
const arr = ts.level_percent || [];
if (!arr.length) return { min: null, max: null, mean: null, range: null } as const;
const min = Math.min(...arr);
const max = Math.max(...arr);
const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
const range = max - min;
return { min, max, mean, range } as const;
}


export function tempStats(ts?: { temperature_c?: number[] }) {
const arr = ts?.temperature_c || [];
if (!arr.length) return { mean: null, min: null, max: null } as const;
const min = Math.min(...arr);
const max = Math.max(...arr);
const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
return { mean, min, max } as const;
}


// Estimación simple: renovación ≈ rango % de nivel en 24h
export const turnoverEstimatePerDay = (levelRangePct: number) => Math.max(0, Number(levelRangePct.toFixed(1)));


export function criticalResolvedUnder24h(alarms: Alarm[]) {
const crit = alarms.filter((a) => a.severity === "critical");
if (!crit.length) return { pct: 100, total: 0 } as const;
const ok = crit.filter((a) => a.is_active === false).length; // demo
const pct = (ok / crit.length) * 100;
return { pct, total: crit.length } as const;
}


export function topEnergyByLocation(data: Dataset) {
const map = new Map<number, number>();
for (const p of data.assets.pumps) {
const rec = data.analytics30d.pump_energy_kwh[String(p.id)];
map.set(p.location_id, (map.get(p.location_id) || 0) + (rec ? rec.kwh_30d : 0));
}
const rows = data.locations.map((l) => ({
location_id: l.location_id,
location_name: l.location_name,
code: l.location_code,
kwh_30d: map.get(l.location_id) || 0,
}));
return rows.sort((a, b) => b.kwh_30d - a.kwh_30d).slice(0, 3);
}