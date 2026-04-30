import L from "leaflet";
import { Marker, Tooltip } from "react-leaflet";
import type { NodeLite } from "./mapTypes";

export default function NodeConnectPickerLayer({
  visible,
  nodes,
  fromNodeId,
  toNodeId,
  pickMode,
  onPick,
}: {
  visible: boolean;
  nodes: NodeLite[];
  fromNodeId: string;
  toNodeId: string;
  pickMode: "from" | "to";
  onPick: (nodeId: string) => void;
}) {
  if (!visible) return null;

  const safeNodes = (Array.isArray(nodes) ? nodes : []).filter(
    (n) => n.id && n.lat != null && n.lng != null && isFinite(Number(n.lat)) && isFinite(Number(n.lng))
  );

  return (
    <>
      {safeNodes.map((n) => {
        const isFrom = n.id === fromNodeId;
        const isTo = n.id === toNodeId;
        const bg = isFrom ? "#2563eb" : isTo ? "#f97316" : pickMode === "from" ? "#38bdf8" : "#fb923c";
        const label = isFrom ? "O" : isTo ? "D" : "";
        const size = isFrom || isTo ? 20 : 14;

        const icon = L.divIcon({
          className: "nodeConnectMarker",
          html:
            '<div style="width:' +
            size +
            'px;height:' +
            size +
            'px;border-radius:999px;background:' +
            bg +
            ';border:2px solid rgba(15,23,42,.9);box-shadow:0 0 0 3px rgba(255,255,255,.45),0 10px 20px rgba(0,0,0,.28);display:grid;place-items:center;color:white;font-size:10px;font-weight:900;">' +
            label +
            "</div>",
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        return (
          <Marker
            key={`node-connect-${n.id}`}
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
            <Tooltip direction="top" opacity={0.96} sticky>
              <div style={{ fontWeight: 900 }}>
                {isFrom ? "Origen" : isTo ? "Destino" : pickMode === "from" ? "Elegir origen" : "Elegir destino"}
              </div>
              <div style={{ fontSize: 12 }}>{n.label || n.kind || "Nodo"}</div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>{n.id}</div>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}
