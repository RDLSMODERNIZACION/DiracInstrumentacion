// Bandas horarias demo: VALLE 00–07h, PICO 19–23h, RESTO 07–19h
export const bandForHour = (h: number) =>
  h >= 0 && h < 7 ? "VALLE" : h >= 19 && h < 23 ? "PICO" : "RESTO";

export function buildPowerFromIsOn(data: any) {
  for (const p of data.assets.pumps) {
    const ts = data.timeseries.pumps[String(p.id)];
    if (!ts) continue;
    ts.power_kw = ts.is_on.map((on: boolean) => {
      const base = on ? p.rated_kw * 0.82 : 0.1;       // 0.82 carga aprox; 0.1 kW standby
      const jitter = on ? (Math.random() * 0.2 - 0.1) * p.rated_kw : 0; // ±10%
      return Math.max(0, Number((base + jitter).toFixed(2)));
    });
  }
}

export function kwhByBandForPump(pumpTs: { timestamps: string[]; power_kw?: number[] }) {
  if (!pumpTs?.power_kw || !pumpTs.timestamps?.length)
    return { VALLE: 0, PICO: 0, RESTO: 0, total: 0 };

  const acc: Record<"VALLE" | "PICO" | "RESTO", number> = { VALLE: 0, PICO: 0, RESTO: 0 };

  pumpTs.timestamps.forEach((t, i) => {
    const h = Number(t.slice(11, 13));
    const band = bandForHour(h) as keyof typeof acc;
    acc[band] += pumpTs.power_kw![i]!;
  });

  const total = acc.VALLE + acc.PICO + acc.RESTO;
  return { ...acc, total };
}
