import { useMemo } from "react";
import { barrios, edges, type Asset, type Edge } from "../data/demo";

export function useInventory(args: { selectedZoneId: string | null; assets: Asset[]; assetsById: Map<string, Asset> }) {
  const { selectedZoneId, assets, assetsById } = args;

  return useMemo(() => {
    if (!selectedZoneId) {
      return {
        valves: [] as Asset[],
        pumps: [] as Asset[],
        tanks: [] as Asset[],
        manifolds: [] as Asset[],
        barrios: [] as typeof barrios,
        pipes: [] as Edge[],
      };
    }

    const inLoc = (a: Asset) => a.locationId === selectedZoneId;

    const valves = assets.filter((a) => a.type === "VALVE" && inLoc(a));
    const pumps = assets.filter((a) => a.type === "PUMP" && inLoc(a));
    const tanks = assets.filter((a) => a.type === "TANK" && inLoc(a));
    const manifolds = assets.filter((a) => a.type === "MANIFOLD" && inLoc(a));

    const barriosIn = barrios.filter((b) => b.locationId === selectedZoneId);

    const pipes = edges.filter((e) => {
      const from = assetsById.get(e.from);
      const to = assetsById.get(e.to);
      return from?.locationId === selectedZoneId || to?.locationId === selectedZoneId;
    });

    return { valves, pumps, tanks, manifolds, barrios: barriosIn, pipes };
  }, [selectedZoneId, assets, assetsById]);
}
