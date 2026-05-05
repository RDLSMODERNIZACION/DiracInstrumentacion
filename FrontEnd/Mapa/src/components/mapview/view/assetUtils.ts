import type { MapAssetLive } from "../../../services/mapasagua";

export function defaultHydraulicPositionForAsset(asset: MapAssetLive | null) {
  if (!asset) return undefined;

  if (asset.asset_type === "TANK") return "tank_outlet";
  if (asset.asset_type === "PUMP") return "pump_discharge";
  if (asset.asset_type === "MANIFOLD") return "manifold";

  return asset.hydraulic_position || undefined;
}
