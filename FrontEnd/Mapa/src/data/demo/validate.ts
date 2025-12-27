// src/data/demo/validate.ts
import { assets } from "./assets";
import { barrios } from "./barrios";
import { edges } from "./edges";
import { zones } from "./zones";
import { valveRouting } from "./routing";

function uniq(ids: string[]) {
  return new Set(ids).size === ids.length;
}

export function validateDemo() {
  const zoneIds = zones.map((z) => z.id);
  const assetIds = assets.map((a) => a.id);
  const barrioIds = barrios.map((b) => b.id);

  const errors: string[] = [];

  if (!uniq(zoneIds)) errors.push("Hay Zone.id duplicados");
  if (!uniq(assetIds)) errors.push("Hay Asset.id duplicados");
  if (!uniq(barrioIds)) errors.push("Hay Barrio.id duplicados");

  for (const a of assets) {
    if (!zoneIds.includes(a.locationId)) errors.push(`Asset ${a.id} locationId inválido: ${a.locationId}`);
  }

  for (const b of barrios) {
    if (!zoneIds.includes(b.locationId)) errors.push(`Barrio ${b.id} locationId inválido: ${b.locationId}`);
    if (!assetIds.includes(b.meta.alimentado_por))
      errors.push(`Barrio ${b.id} alimentado_por inválido: ${b.meta.alimentado_por}`);
  }

  for (const e of edges) {
    if (!assetIds.includes(e.from)) errors.push(`Edge ${e.id} from inválido: ${e.from}`);
    if (!assetIds.includes(e.to)) errors.push(`Edge ${e.id} to inválido: ${e.to}`);
  }

  for (const [valveId, r] of Object.entries(valveRouting)) {
    if (!assetIds.includes(valveId)) errors.push(`Routing válvula no existe: ${valveId}`);
    for (const t of r.targets ?? []) {
      if (t.kind === "BARRIO" && !barrioIds.includes(t.barrioId))
        errors.push(`Routing ${valveId} target barrio inválido: ${t.barrioId}`);
      if (t.kind === "LOCATION" && !zoneIds.includes(t.locationId))
        errors.push(`Routing ${valveId} target location inválido: ${t.locationId}`);
      if (t.kind === "ASSET" && !assetIds.includes(t.assetId))
        errors.push(`Routing ${valveId} target asset inválido: ${t.assetId}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
