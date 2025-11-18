import type { Dataset, PumpTimeseries } from "../types";
import { bandForHour, type Band } from "./format";


// Completa power_kw usando is_on y rated_kw de cada bomba
export function buildPowerFromIsOn(data: Dataset) {
for (const p of data.assets.pumps) {
const ts = data.timeseries.pumps[String(p.id)];
if (!ts) continue;
ts.power_kw = ts.is_on.map((on: boolean) => {
const base = on ? p.rated_kw * 0.82 : 0.1; // 0.82 factor de carga, 0.1 kW standby
const jitter = on ? (Math.random() * 0.2 - 0.1) * p.rated_kw : 0; // ±10%
return Math.max(0, Number((base + jitter).toFixed(2)));
});
}
}


export function kwhByBandForPump(pumpTs?: PumpTimeseries) {
if (!pumpTs?.power_kw) return { VALLE: 0, PICO: 0, RESTO: 0, total: 0 };
const acc: Record<Band, number> = { VALLE: 0, PICO: 0, RESTO: 0 };
pumpTs.timestamps.forEach((t, i) => {
const h = Number(t.slice(11, 13));
const band = bandForHour(h);
const kwh = pumpTs.power_kw![i]; // 1 hora por punto
acc[band] += kwh;
});
const total = acc.VALLE + acc.PICO + acc.RESTO;
return { ...acc, total };
}