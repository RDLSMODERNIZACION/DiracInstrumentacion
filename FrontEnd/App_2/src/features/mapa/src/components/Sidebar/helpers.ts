import { type Asset, type Edge, barrios, zones, valveRouting } from "../../data/demo";

export function dotColor(status: Asset["status"]) {
  switch (status) {
    case "OK":
      return "var(--ok)";
    case "WARN":
      return "var(--warn)";
    case "ALARM":
      return "var(--alarm)";
    case "OFF":
      return "var(--off)";
    default:
      return "var(--off)";
  }
}

export function edgeColor(type: Edge["type"]) {
  return type === "WATER" ? "var(--water)" : "var(--sludge)";
}

export function assetTypeLabel(t: Asset["type"]) {
  switch (t) {
    case "TANK":
      return "Tanque";
    case "PUMP":
      return "Bomba";
    case "VALVE":
      return "Válvula";
    case "MANIFOLD":
      return "Manifold";
  }
}

export function edgeRequiresOpen(e: Edge): string[] {
  const ro = (e.meta as any)?.requiresOpen;
  return Array.isArray(ro) ? ro.filter((x) => typeof x === "string") : [];
}

export function pipeLabel(e: Edge, assetsById: Map<string, Asset>) {
  const from = assetsById.get(e.from)?.name ?? e.from;
  const to = assetsById.get(e.to)?.name ?? e.to;
  const nm = (e.meta as any)?.name;
  return nm ?? `${from} → ${to}`;
}

export function getValveTargets(args: { valveId: string; assetsById: Map<string, Asset> }) {
  const { valveId, assetsById } = args;
  const rt = (valveRouting as any)[valveId];
  const targets = rt?.targets ?? [];

  const barrioNames: string[] = [];
  const locationNames: string[] = [];
  const assetNames: string[] = [];

  for (const t of targets) {
    if (t.kind === "BARRIO") {
      const b = barrios.find((x) => x.id === t.barrioId);
      barrioNames.push(b?.name ?? t.barrioId);
      continue;
    }
    if (t.kind === "LOCATION") {
      const z = zones.find((x) => x.id === t.locationId);
      locationNames.push(z?.name ?? t.locationId);
      continue;
    }
    if (t.kind === "ASSET") {
      const a = assetsById.get(t.assetId);
      assetNames.push(a?.name ?? t.assetId);
    }
  }

  return { barrioNames, locationNames, assetNames, note: rt?.note ?? null };
}
