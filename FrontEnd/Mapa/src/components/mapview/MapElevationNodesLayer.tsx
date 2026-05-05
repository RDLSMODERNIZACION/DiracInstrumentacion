// src/components/mapview/MapElevationNodesLayer.tsx

import L from "leaflet";
import { Marker, Popup, Tooltip } from "react-leaflet";
import type { NodeLite } from "./mapTypes";
import {
  sampleNearestContour,
  updateNode,
  type NodeDTO,
} from "../../services/mapasagua";

function getElevColor(elev: number | null | undefined) {
  if (elev == null || !Number.isFinite(Number(elev))) return "#f97316"; // naranja: sin cota
  if (Number(elev) < 450 || Number(elev) > 900) return "#ef4444"; // rojo: valor raro
  return "#22c55e"; // verde: ok
}

function fmtElev(elev: number | null | undefined) {
  if (elev == null || !Number.isFinite(Number(elev))) return "SIN COTA";
  return `${Number(elev).toFixed(1)} m`;
}

function nodeTitle(n: NodeLite) {
  return n.label || `Nodo ${String(n.id).slice(0, 8)}…`;
}

export default function MapElevationNodesLayer({
  visible,
  nodes,
  onNodeUpdated,
}: {
  visible: boolean;
  nodes: NodeLite[];
  onNodeUpdated?: (node: NodeDTO) => void;
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

  async function editElevation(n: NodeLite) {
    const current =
      n.elev_m != null && Number.isFinite(Number(n.elev_m))
        ? Number(n.elev_m).toFixed(2)
        : "";

    const raw = prompt(`Nueva cota para ${nodeTitle(n)} en metros:`, current);

    if (raw === null) return;

    const value = Number(String(raw).replace(",", "."));

    if (!Number.isFinite(value)) {
      alert("La cota debe ser un número válido.");
      return;
    }

    try {
      const updated = await updateNode(n.id, {
        elev_m: value,
      });

      onNodeUpdated?.(updated);
    } catch (e: any) {
      alert(e?.message ?? "No se pudo actualizar la cota del nodo.");
    }
  }

  async function autoElevationFromContour(n: NodeLite) {
    if (n.lat == null || n.lng == null) return;

    try {
      const sample = await sampleNearestContour({
        lat: Number(n.lat),
        lng: Number(n.lng),
        max_distance_m: 500,
      });

      if (!sample.found || sample.elev_m == null) {
        alert("No encontré una curva cercana para calcular la cota.");
        return;
      }

      const distanceText =
        sample.distance_m != null && Number.isFinite(Number(sample.distance_m))
          ? `${Number(sample.distance_m).toFixed(1)} m`
          : "—";

      const ok = confirm(
        `Cota encontrada: ${Number(sample.elev_m).toFixed(2)} m\n` +
          `Distancia a curva: ${distanceText}\n\n` +
          `¿Actualizar este nodo?`
      );

      if (!ok) return;

      const updated = await updateNode(n.id, {
        elev_m: Number(sample.elev_m),
      });

      onNodeUpdated?.(updated);
    } catch (e: any) {
      alert(e?.message ?? "No se pudo calcular la cota desde curvas.");
    }
  }

  return (
    <>
      {safeNodes.map((n) => {
        const elev = n.elev_m;
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
          popupAnchor: [0, -12],
          tooltipAnchor: [0, -12],
        });

        return (
          <Marker
            key={`elev-node-${n.id}`}
            position={[Number(n.lat), Number(n.lng)]}
            icon={icon}
            interactive={true}
            zIndexOffset={1700}
            riseOnHover
          >
            <Tooltip direction="top" opacity={0.98} sticky>
              <div style={{ fontWeight: 900 }}>{nodeTitle(n)}</div>

              <div style={{ fontSize: 12 }}>
                Cota: <b>{fmtElev(elev)}</b>
              </div>

              <div style={{ fontSize: 12 }}>Tipo: {n.kind || "—"}</div>

              {n.is_source && (
                <div style={{ marginTop: 4, color: "#2563eb", fontWeight: 900 }}>
                  Fuente
                </div>
              )}

              {!hasElev && (
                <div style={{ marginTop: 4, color: "#b45309", fontWeight: 800 }}>
                  Falta elev_m
                </div>
              )}
            </Tooltip>

            <Popup>
              <div style={{ minWidth: 240 }}>
                <div style={{ fontWeight: 950, fontSize: 15 }}>
                  {nodeTitle(n)}
                </div>

                <div style={{ marginTop: 6, fontSize: 13 }}>
                  <div>
                    <b>ID:</b> {String(n.id).slice(0, 8)}…
                  </div>

                  <div>
                    <b>Tipo:</b> {n.kind || "—"}
                  </div>

                  <div>
                    <b>Cota:</b> {fmtElev(elev)}
                  </div>

                  {n.head_m != null && Number.isFinite(Number(n.head_m)) && (
                    <div>
                      <b>Head:</b> {Number(n.head_m).toFixed(1)} m
                    </div>
                  )}

                  {n.demand_lps != null && Number.isFinite(Number(n.demand_lps)) && (
                    <div>
                      <b>Demanda:</b> {Number(n.demand_lps).toFixed(2)} l/s
                    </div>
                  )}

                  <div>
                    <b>Lat/Lng:</b> {Number(n.lat).toFixed(6)},{" "}
                    {Number(n.lng).toFixed(6)}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr",
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => editElevation(n)}
                    style={{
                      padding: "9px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.15)",
                      background: "#2563eb",
                      color: "#fff",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    Editar cota manual
                  </button>

                  <button
                    type="button"
                    onClick={() => autoElevationFromContour(n)}
                    style={{
                      padding: "9px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.15)",
                      background: "#16a34a",
                      color: "#fff",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    Tomar cota de curva cercana
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}