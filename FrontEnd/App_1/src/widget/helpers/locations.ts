// src/widget/helpers/locations.ts
import type { LocOpt } from "../types";

/**
 * Normaliza distintas formas de “location” que puedan venir del backend:
 * - fetchLocations(): { location_id, location_name, location_code }
 * - byLocation:       { location_id, location_name, ... }
 * - futuros:          { id, name, code }
 */
function normalizeLoc(row: any): LocOpt | null {
  if (!row) return null;

  const idRaw =
    row.id ??
    row.location_id ??
    row.locationId ??
    null;

  const nameRaw =
    row.name ??
    row.location_name ??
    row.locationName ??
    row.code ??
    row.location_code ??
    "";

  const idNum = Number(idRaw);
  const id = Number.isFinite(idNum) && idNum > 0 ? idNum : null;
  const name = String(nameRaw).trim();

  if (!id || !name) return null;
  const orderRaw = row.displayOrder ?? row.location_display_order ?? row.display_order;
  const order = orderRaw == null ? NaN : Number(orderRaw);
  return { id, name, displayOrder: Number.isFinite(order) ? order : undefined };
}

export function deriveLocOptions(liveLocations: any, byLocation: any): LocOpt[] {
  const fromLive = (Array.isArray(liveLocations) ? liveLocations : [])
    .map(normalizeLoc)
    .filter(Boolean) as LocOpt[];

  // Si la API ya trae un listado de ubicaciones, lo usamos como fuente principal.
  if (fromLive.length > 0) {
    return sortByName(uniqueById(fromLive));
  }

  // Fallback: derivar desde la tabla por ubicación
  const fromBL = (Array.isArray(byLocation) ? byLocation : [])
    .map(normalizeLoc)
    .filter(Boolean) as LocOpt[];

  return sortByName(uniqueById(fromBL));
}

export function mergeLocOptions(prev: LocOpt[], next: LocOpt[]): LocOpt[] {
  const m = new Map<number, LocOpt>();
  for (const o of [...prev, ...next]) {
    const current = m.get(o.id);
    m.set(o.id, { ...current, ...o, displayOrder: o.displayOrder ?? current?.displayOrder });
  }
  return sortByName(Array.from(m.values()));
}

function uniqueById(arr: LocOpt[]): LocOpt[] {
  return Array.from(new Map(arr.map((o) => [o.id, o])).values());
}

function sortByName(arr: LocOpt[]): LocOpt[] {
  return [...arr].sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999)
    || a.name.localeCompare(b.name, "es", { numeric: true, sensitivity: "base" }));
}
