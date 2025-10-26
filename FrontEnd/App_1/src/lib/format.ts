export const k = (n: number) => new Intl.NumberFormat("es-AR").format(n);
export const pct = (n: number) => `${n.toFixed(1)}%`;


// Bandas horarias demo: VALLE 00–07, PICO 19–23, RESTO 07–19
export type Band = "VALLE" | "PICO" | "RESTO";
export const bandForHour = (h: number): Band => {
if (h >= 0 && h < 7) return "VALLE";
if (h >= 19 && h < 23) return "PICO";
return "RESTO";
};