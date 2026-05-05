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

function shapeCssForAsset(a: MapAssetLive) {
  if (a.asset_type === "TANK") {
    return "border-radius:10px;";
  }

  if (a.asset_type === "PUMP") {
    return "border-radius:999px;";
  }

  if (a.asset_type === "MANIFOLD") {
    return "border-radius:14px;";
  }

  return "border-radius:12px;";
}

function buildAssetIcon(a: MapAssetLive, selected: boolean) {
  const c = assetColor(a);
  const size = selected ? 34 : 30;
  const short = assetShort(a);
  const shapeCss = shapeCssForAsset(a);

  return L.divIcon({
    className: "mapAssetMarker",
    html: `
      <div style="position:relative;width:${size + 10}px;height:${size + 10}px;display:grid;place-items:center;">
        <div
          style="
            position:absolute;
            inset:6px;
            border-radius:999px;
            background:${c};
            opacity:.18;
            transform:scale(1.3);
            filter:blur(1px);
          "
        ></div>

        <div
          style="
            width:${size}px;
            height:${size}px;
            ${shapeCss}
            background:${c};
            border:3px solid rgba(15,23,42,.96);
            box-shadow:
              0 0 0 4px rgba(255,255,255,.38),
              0 12px 24px rgba(0,0,0,.30);
            display:grid;
            place-items:center;
            color:white;
            font-size:10px;
            font-weight:950;
          "
        >
          ${short}
        </div>
      </div>
    `,
    iconSize: [size + 10, size + 10],
    iconAnchor: [(size + 10) / 2, (size + 10) / 2],
    tooltipAnchor: [0, -16],
  });
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
        const selected = selectedAssetId === a.asset_link_id;

        return (
          <Marker
            key={`map-asset-${a.asset_link_id}`}
            position={[Number(n.lat), Number(n.lng)]}
            icon={buildAssetIcon(a, selected)}
            zIndexOffset={selected ? 2100 : 1800}
            riseOnHover
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