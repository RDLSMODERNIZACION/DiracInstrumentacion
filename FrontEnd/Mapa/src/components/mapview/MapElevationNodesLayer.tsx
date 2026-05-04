// src/components/mapview/MapElevationNodesLayer.tsx

import L from "leaflet";
import { Marker, Tooltip } from "react-leaflet";
import type { NodeLite } from "./mapTypes";

function getElevColor(elev: number | null | undefined) {
  if (elev == null || !Number.isFinite(Number(elev))) return "#f97316"; // naranja sin cota
  if (Number(elev) < 450 || Number(elev) > 900) return "#ef4444"; // rojo raro
  return "#22c55e"; // verde ok
}

function fmtElev(elev: number | null | undefined) {
  if (elev == null || !Number.isFinite(Number(elev))) return "SIN COTA";
  return `${Number(elev).toFixed(1)} m`;
}

export default function MapElevationNodesLayer({
  visible,
  nodes,
}: {
  visible: boolean;
  nodes: NodeLite[];
}) {
  if (!visible) return null;

  const safeNodes = (Array.isArray(nodes) ? nodes : []).filter(
    (n) =>
      n.id &&
      n.lat != null &&
      n.lng != null &&
      Number.isFinite(Number(n.lat)) &&
      Number.isFinite(Number(n.lng))
  );

  return (
    <>
      {safeNodes.map((n) => {
        const elev = (n as any).elev_m;
        const color = getElevColor(elev);
        const hasElev = elev != null && Number.isFinite(Number(elev));

        const icon = L.divIcon({
          className: "elevationNodeMarker",
          html: `
            <div style="
              min-width:${hasElev ? 44 : 26}px;
              height:22px;
              padding:0 6px;
              border-radius:999px;
              background:${color};
              color:white;
              display:flex;
              align-items:center;
              justify-content:center;
              font-size:10px;
              font-weight:900;
              border:2px solid rgba(15,23,42,.95);
              box-shadow:0 6px 16px rgba(0,0,0,.35);
              white-space:nowrap;
            ">
              ${hasElev ? Number(elev).toFixed(0) : "?"}
            </div>
          `,
          iconSize: [50, 24],
          iconAnchor: [25, 12],
        });

        return (
          <Marker
            key={`elev-node-${n.id}`}
            position={[Number(n.lat), Number(n.lng)]}
            icon={icon}
            interactive={true}
          >
            <Tooltip direction="top" opacity={0.98} sticky>
              <div style={{ fontWeight: 900 }}>
                Nodo {String(n.id).slice(0, 8)}…
              </div>

              <div style={{ fontSize: 12 }}>
                Cota: <b>{fmtElev(elev)}</b>
              </div>

              <div style={{ fontSize: 12 }}>
                Tipo: {(n as any).kind || "—"}
              </div>

              {!hasElev && (
                <div style={{ marginTop: 4, color: "#b45309", fontWeight: 800 }}>
                  Falta elev_m
                </div>
              )}
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}