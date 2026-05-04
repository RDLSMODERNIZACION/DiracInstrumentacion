import L from "leaflet";
import { Marker, Tooltip } from "react-leaflet";
import type { MapAssetLive } from "../../services/mapasagua";
import type { NodeLite } from "./mapTypes";

function assetColor(a: MapAssetLive) {
  if (a.live_status === "STALE") return "#f97316";
  if (a.live_status === "NO_DATA") return "#94a3b8";
  if (a.asset_type === "TANK") return "#38bdf8";
  if (a.asset_type === "PUMP") return a.run_status === "run" ? "#22c55e" : "#64748b";
  if (a.asset_type === "MANIFOLD") return "#a78bfa";
  return "#e2e8f0";
}

function assetShort(a: MapAssetLive) {
  if (a.asset_type === "TANK") return "TK";
  if (a.asset_type === "PUMP") return "B";
  if (a.asset_type === "MANIFOLD") return "M";
  return "A";
}

function assetTitle(a: MapAssetLive) {
  return a.asset_name || `${a.asset_type} ${a.asset_id}`;
}

function fmt(v: number | null | undefined, digits = 2) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Number(v).toFixed(digits);
}

export default function MapAssetsLayer({
  visible,
  assets,
  nodes,
  selectedAssetId,
  onSelectAsset,
}: {
  visible: boolean;
  assets: MapAssetLive[];
  nodes: NodeLite[];
  selectedAssetId?: string | null;
  onSelectAsset?: (asset: MapAssetLive) => void;
}) {
  if (!visible) return null;

  const nodeById = new Map<string, NodeLite>();
  for (const n of nodes || []) {
    if (n.id) nodeById.set(n.id, n);
  }

  const linkedAssets = assets.filter((a) => a.map_node_id && nodeById.has(a.map_node_id));

  return (
    <>
      {linkedAssets.map((a) => {
        const n = nodeById.get(a.map_node_id!)!;
        const c = assetColor(a);
        const selected = selectedAssetId === a.asset_link_id;
        const size = selected ? 32 : 28;

        const icon = L.divIcon({
          className: "mapAssetMarker",
          html:
            '<div style="width:' +
            size +
            "px;height:" +
            size +
            "px;border-radius:999px;background:" +
            c +
            ';border:3px solid rgba(15,23,42,.95);box-shadow:0 0 0 4px rgba(255,255,255,.36),0 14px 26px rgba(0,0,0,.34);display:grid;place-items:center;color:white;font-size:10px;font-weight:950;">' +
            assetShort(a) +
            "</div>",
          iconSize: [size + 6, size + 6],
          iconAnchor: [(size + 6) / 2, (size + 6) / 2],
        });

        return (
          <Marker
            key={`map-asset-${a.asset_link_id}`}
            position={[Number(n.lat), Number(n.lng)]}
            icon={icon}
            eventHandlers={{
              click: (e) => {
                e.originalEvent?.preventDefault?.();
                e.originalEvent?.stopPropagation?.();
                onSelectAsset?.(a);
              },
            }}
          >
            <Tooltip direction="top" opacity={0.98} sticky>
              <div style={{ fontWeight: 950 }}>{assetTitle(a)}</div>
              <div style={{ fontSize: 12 }}>
                {a.asset_type === "TANK" && <>Nivel: {fmt(a.level_pct, 1)} %</>}
                {a.asset_type === "PUMP" && <>Estado: {a.run_status || "—"}</>}
                {a.asset_type === "MANIFOLD" && (
                  <>
                    Presión: {fmt(a.pressure_bar, 2)} bar · Caudal: {fmt(a.flow_lps, 2)} l/s
                  </>
                )}
              </div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>{a.live_status || "—"}</div>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}