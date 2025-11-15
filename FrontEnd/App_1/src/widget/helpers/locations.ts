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
  return { id, name };
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
  const m = new Map<number, string>();
  for (const o of prev) m.set(o.id, o.name);
  for (const o of next) {
    const cur = m.get(o.id);
    if (!cur || (o.name && o.name.length > cur.length)) {
      m.set(o.id, o.name);
    }
  }
  return sortByName(Array.from(m, ([id, name]) => ({ id, name })));
}

function uniqueById(arr: LocOpt[]): LocOpt[] {
  const m = new Map<number, string>();
  arr.forEach((o) => {
    if (!m.has(o.id)) m.set(o.id, o.name);
  });
  return Array.from(m, ([id, name]) => ({ id, name }));
}

function sortByName(arr: LocOpt[]): LocOpt[] {
  // uso "es" para ordenar mejor en castellano
  return [...arr].sort((a, b) => a.name.localeCompare(b.name, "es"));
}
