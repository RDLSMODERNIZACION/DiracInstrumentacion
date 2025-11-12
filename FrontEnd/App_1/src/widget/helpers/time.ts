export const TZ = "America/Argentina/Buenos_Aires";
export const H = 60 * 60 * 1000;

export function startOfMin(ms: number) {
  const d = new Date(ms);
  d.setSeconds(0, 0);
  return d.getTime();
}
export function floorToHour(ms: number) {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}
export function floorToMinuteISO(d: Date) {
  const dd = new Date(d);
  dd.setSeconds(0, 0);
  return dd.toISOString();
}
export function fmtDayTime(ms: number, tz = TZ) {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: tz,
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(ms);
  } catch {
    return new Date(ms).toLocaleString();
  }
}
export function buildHourTicks(domain: [number, number]) {
  const [s, e] = domain;
  const start = floorToHour(s);
  const end = floorToHour(e);
  const ticks: number[] = [];
  for (let t = start; t <= end; t += H) ticks.push(t);
  return ticks;
}
