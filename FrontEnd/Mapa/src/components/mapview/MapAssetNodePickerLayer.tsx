import L from "leaflet";
import { Marker, Tooltip } from "react-leaflet";
import type { MapAssetLive } from "../../services/mapasagua";
import type { NodeLite } from "./mapTypes";

function assetLabel(asset: MapAssetLive | null) {
  if (!asset) return "Activo";
  return asset.asset_name || `${asset.asset_type} ${asset.asset_id}`;
}

export default function MapAssetNodePickerLayer({
  visible,
  nodes,
  selectedAsset,
  onPick,
}: {
  visible: boolean;
  nodes: NodeLite[];
  selectedAsset: MapAssetLive | null;
  onPick: (nodeId: string) => void;
}) {
  if (!visible || !selectedAsset) return null;

  const safeNodes = (Array.isArray(nodes) ? nodes : []).filter(
    (n) => n.id && n.lat != null && n.lng != null && isFinite(Number(n.lat)) && isFinite(Number(n.lng))
  );

  return (
    <>
      {safeNodes.map((n) => {
        const icon = L.divIcon({
          className: "mapAssetNodePickerMarker",
          html:
            '<div style="width:16px;height:16px;border-radius:999px;background:#22c55e;border:2px solid rgba(15,23,42,.95);box-shadow:0 0 0 4px rgba(34,197,94,.24),0 12px 22px rgba(0,0,0,.35);"></div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        return (
          <Marker
            key={`asset-node-picker-${n.id}`}
            position={[Number(n.lat), Number(n.lng)]}
            icon={icon}
            eventHandlers={{
              click: (e) => {
                e.originalEvent?.preventDefault?.();
                e.originalEvent?.stopPropagation?.();
                onPick(n.id);
              },
            }}
          >
            <Tooltip direction="top" opacity={0.98} sticky>
              <div style={{ fontWeight: 900 }}>Ubicar: {assetLabel(selectedAsset)}</div>
              <div style={{ fontSize: 12 }}>{n.label || n.kind || "Nodo"}</div>
              <div style={{ fontSize: 11, opacity: 0.82 }}>{n.id}</div>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}