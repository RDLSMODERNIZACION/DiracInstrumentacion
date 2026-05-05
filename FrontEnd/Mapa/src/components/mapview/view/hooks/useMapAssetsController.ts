// src/components/mapview/view/hooks/useMapAssetsController.ts

import React from "react";
import {
  fetchMapAssetsLive,
  linkMapAsset,
  unlinkMapAsset,
  type MapAssetLive,
} from "../../../../services/mapasagua";
import type { AssetLinkMode } from "../types";

function defaultHydraulicPositionForAsset(asset: MapAssetLive | null) {
  if (!asset) return undefined;

  if (asset.asset_type === "TANK") return "tank_outlet";
  if (asset.asset_type === "PUMP") return "pump_discharge";
  if (asset.asset_type === "MANIFOLD") return "manifold";

  return asset.hydraulic_position || undefined;
}

export default function useMapAssetsController() {
  const [showMapAssets, setShowMapAssets] = React.useState(false);
  const [assetsPanelOpen, setAssetsPanelOpen] = React.useState(false);
  const [mapAssets, setMapAssets] = React.useState<MapAssetLive[]>([]);
  const [mapAssetsBusy, setMapAssetsBusy] = React.useState(false);
  const [mapAssetsErr, setMapAssetsErr] = React.useState<string | null>(null);
  const [selectedMapAsset, setSelectedMapAsset] = React.useState<MapAssetLive | null>(null);
  const [assetLinkMode, setAssetLinkMode] = React.useState<AssetLinkMode>("none");

  async function loadMapAssets() {
    setMapAssetsBusy(true);
    setMapAssetsErr(null);

    try {
      const items = await fetchMapAssetsLive({ limit: 1000 });
      const safeItems = Array.isArray(items) ? items : [];

      setMapAssets(safeItems);
      setSelectedMapAsset((prev) => {
        if (!prev) return prev;
        return safeItems.find((a) => a.asset_link_id === prev.asset_link_id) ?? prev;
      });
    } catch (e: any) {
      setMapAssetsErr(e?.message ?? "No se pudieron cargar los activos reales");
    } finally {
      setMapAssetsBusy(false);
    }
  }

  async function linkSelectedAssetToNode(nodeId: string) {
    if (!selectedMapAsset) return;

    const updated = await linkMapAsset(selectedMapAsset.asset_link_id, {
      map_node_id: nodeId,
      hydraulic_position: defaultHydraulicPositionForAsset(selectedMapAsset),
      notes: "Ubicado manualmente desde el mapa",
    });

    setSelectedMapAsset(updated);
    setAssetLinkMode("none");
    await loadMapAssets();
  }

  async function linkSelectedAssetToPipe(pipeId: string) {
    if (!selectedMapAsset) return;

    const updated = await linkMapAsset(selectedMapAsset.asset_link_id, {
      map_pipe_id: pipeId,
      hydraulic_position: defaultHydraulicPositionForAsset(selectedMapAsset),
      notes: "Ubicado manualmente sobre cañería desde el mapa",
    });

    setSelectedMapAsset(updated);
    setAssetLinkMode("none");
    await loadMapAssets();
  }

  async function unlinkSelectedAsset() {
    if (!selectedMapAsset) return;

    const ok = confirm(
      `¿Desubicar ${selectedMapAsset.asset_name ?? selectedMapAsset.asset_id} del mapa?`
    );
    if (!ok) return;

    const updated = await unlinkMapAsset(selectedMapAsset.asset_link_id);
    setSelectedMapAsset(updated);
    setAssetLinkMode("none");
    await loadMapAssets();
  }

  return {
    showMapAssets,
    setShowMapAssets,
    assetsPanelOpen,
    setAssetsPanelOpen,
    mapAssets,
    mapAssetsBusy,
    mapAssetsErr,
    selectedMapAsset,
    setSelectedMapAsset,
    assetLinkMode,
    setAssetLinkMode,
    loadMapAssets,
    linkSelectedAssetToNode,
    linkSelectedAssetToPipe,
    unlinkSelectedAsset,
  };
}
