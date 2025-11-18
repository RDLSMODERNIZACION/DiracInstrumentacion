// src/utils/format.ts
export const k = (n: number) => new Intl.NumberFormat("es-AR").format(n);
export const pct = (n: number) => `${n.toFixed(1)}%`;