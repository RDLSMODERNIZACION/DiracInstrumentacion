import React from "react";
import {
  MapContainer,
  Marker,
  Popup,
  Polyline,
  Polygon,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { barrios, edges, zones, CENTER, type Asset, type Edge, type Zone } from "../data/demo";

import { type LatLng } from "../lib/geo";
import { centroid } from "../lib/geoUtils";
import { focusPointIcon, locationMarkerIcon } from "../lib/mapIcons";
import { FlyTo } from "./FlyTo";

// ✅ Pipes (backend + editor)
import PipesLayer from "./PipesLayer";
import PipeEditDrawer from "./PipeEditDrawer";
import PipeGeometryEditor from "./PipeGeometryEditor";

export type ViewMode = "ALL" | "ZONES" | "PIPES" | "BARRIOS";

/* ---------------------------
   Zoom watcher
--------------------------- */
function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  useMapEvents({
    zoomend: (e) => onZoom(e.target.getZoom()),
    moveend: (e) => onZoom(e.target.getZoom()),
  });
  return null;
}

/* ---------------------------
   Click en mapa (fondo) => limpiar selección/cerrar modal
--------------------------- */
function MapClickClear({ onClear }: { onClear: () => void }) {
  useMapEvents({
    click: () => onClear(),
  });
  return null;
}

function edgeColor(type: Edge["type"]) {
  return type === "WATER" ? "var(--water)" : "var(--sludge)";
}

export type FocusPair =
  | {
      a: { label: string; pos: LatLng };
      b: { label: string; pos: LatLng };
    }
  | null;

/* ---------------------------
   Helpers barrios
--------------------------- */
function pressureLabelForBarrio(b: any): { label: string; tone: "good" | "mid" | "bad" | "na" } {
  const m = (b?.meta ?? {}) as any;

  const kpa = typeof m.presion_kpa === "number" ? m.presion_kpa : null;
  const bar = typeof m.presion_bar === "number" ? m.presion_bar : null;
  const pct = typeof m.presion_pct === "number" ? m.presion_pct : null;

  if (bar != null) {
    if (bar >= 2.2) return { label: `Presión: Buena (${bar.toFixed(1)} bar)`, tone: "good" };
    if (bar >= 1.6) return { label: `Presión: Media (${bar.toFixed(1)} bar)`, tone: "mid" };
    return { label: `Presión: Mala (${bar.toFixed(1)} bar)`, tone: "bad" };
  }
  if (kpa != null) {
    if (kpa >= 220) return { label: `Presión: Buena (${Math.round(kpa)} kPa)`, tone: "good" };
    if (kpa >= 160) return { label: `Presión: Media (${Math.round(kpa)} kPa)`, tone: "mid" };
    return { label: `Presión: Mala (${Math.round(kpa)} kPa)`, tone: "bad" };
  }
  if (pct != null) {
    if (pct >= 75) return { label: `Presión: Buena (${Math.round(pct)}%)`, tone: "good" };
    if (pct >= 45) return { label: `Presión: Media (${Math.round(pct)}%)`, tone: "mid" };
    return { label: `Presión: Mala (${Math.round(pct)}%)`, tone: "bad" };
  }

  return { label: "Presión: N/D", tone: "na" };
}

/* ---------------------------
   Fit helpers (sin cambios)
--------------------------- */
function FitToRoute({
  dashedEdgeIdsExtra,
  assetsById,
  enabled,
}: {
  dashedEdgeIdsExtra?: Set<string>;
  assetsById: Map<string, Asset>;
  enabled: boolean;
}) {
  const map = useMap();

  React.useEffect(() => {
    if (!enabled) return;
    if (!dashedEdgeIdsExtra || dashedEdgeIdsExtra.size === 0) return;

    const pts: [number, number][] = [];

    for (const e of edges) {
      if (!dashedEdgeIdsExtra.has(e.id)) continue;

      if (Array.isArray((e as any).path) && (e as any).path.length) {
        for (const p of (e as any).path as [number, number][]) pts.push(p);
        continue;
      }

      const a = assetsById.get(e.from);
      const b = assetsById.get(e.to);
      if (a) pts.push([a.lat, a.lng]);
      if (b) pts.push([b.lat, b.lng]);
    }

    if (pts.length < 2) return;

    const bounds = L.latLngBounds(pts as any);
    map.fitBounds(bounds, { padding: [90, 90] });
  }, [enabled, dashedEdgeIdsExtra, assetsById, map]);

  return null;
}

function FitToBarrios({
  enabled,
  barrioIds,
  includePoint,
}: {
  enabled: boolean;
  barrioIds?: Set<string>;
  includePoint?: LatLng | null;
}) {
  const map = useMap();

  React.useEffect(() => {
    if (!enabled) return;
    if (!barrioIds || barrioIds.size === 0) return;

    const pts: [number, number][] = [];

    for (const b of barrios) {
      if (!barrioIds.has(b.id)) continue;
      for (const p of b.polygon) pts.push(p);
    }

    if (includePoint) pts.push(includePoint);

    if (pts.length < 2) return;

    const bounds = L.latLngBounds(pts as any);
    map.fitBounds(bounds, { padding: [110, 110] });
  }, [enabled, barrioIds, includePoint, map]);

  return null;
}

/* ===========================
   MAP VIEW
=========================== */
export function MapView(props: {
  zoom: number;
  setZoom: (z: number) => void;

  mode: "NONE" | "ZONE" | "ASSET";
  selectedZoneId: string | null;

  assets: Asset[];
  assetsById: Map<string, Asset>;

  valveEnabled: Record<string, boolean>;
  highlightedBarrioIds: Set<string>;
  highlightedEdgeIds: Set<string>;

  highlightedBarrioIdsExtra?: Set<string>;
  dashedEdgeIdsExtra?: Set<string>;

  onSelectZone: (z: Zone) => void;
  onSelectAsset: (id: string) => void;

  shrinkOthers: boolean;
  focusPair: FocusPair;
  focusTarget: LatLng | null;

  viewMode: ViewMode;
  viewSelectedId: string | null;
  mapGrey: boolean;

  activeValvePos?: LatLng | null;
  forceShowAssetIds?: Set<string>;
}) {
  const {
    zoom,
    setZoom,
    mode,
    selectedZoneId,
    assets,
    assetsById,
    valveEnabled,
    highlightedBarrioIds,
    highlightedBarrioIdsExtra,
    dashedEdgeIdsExtra,
    onSelectZone,
    onSelectAsset,
    shrinkOthers,
    focusPair,
    focusTarget,
    viewMode,
    viewSelectedId,
    mapGrey,
    activeValvePos,
    forceShowAssetIds,
  } = props;

  const showAssets = zoom >= 14.5 || (mode === "ZONE" && selectedZoneId);
  const hasRoute = (dashedEdgeIdsExtra?.size ?? 0) > 0;
  const hasBarrioImpact = (highlightedBarrioIdsExtra?.size ?? 0) > 0;

  const showZones = viewMode === "ALL" || viewMode === "ZONES";
  const showPipes = viewMode === "ALL" || viewMode === "PIPES";
  const showBarrios = viewMode === "ALL" || viewMode === "BARRIOS";

  const zonesToShow =
    viewMode === "ZONES" && viewSelectedId ? zones.filter((z) => z.id === viewSelectedId) : zones;

  const BARRIOS_MIN_ZOOM = 13.2;
  const canDrawBarrios = zoom >= BARRIOS_MIN_ZOOM || (mode === "ZONE" && selectedZoneId);

  const barriosToShow =
    mode === "ZONE" && selectedZoneId
      ? barrios.filter((b) => b.locationId === selectedZoneId)
      : barrios;

  /* ---------------------------
     Pipes selection + editor
     ✅ NUEVO FLUJO:
     - selectedPipeId: selecciona/highlight
     - selectedPipeLayer: para geometry editor
     - selectedPipePos: donde mostrar el popup
     - editingPipeId: abre modal SOLO con botón "Editar"
  --------------------------- */
  const [selectedPipeId, setSelectedPipeId] = React.useState<string | null>(null);
  const [selectedPipeLayer, setSelectedPipeLayer] = React.useState<L.Layer | null>(null);
  const [selectedPipePos, setSelectedPipePos] = React.useState<[number, number] | null>(null);
  const [editingPipeId, setEditingPipeId] = React.useState<string | null>(null);

  function clearPipeSelection() {
    setSelectedPipeId(null);
    setSelectedPipeLayer(null);
    setSelectedPipePos(null);
    setEditingPipeId(null);
  }

  return (
    <>
      <MapContainer
        className={mapGrey ? "mapGrey" : undefined}
        center={CENTER}
        zoom={13.8}
        zoomControl={false}
        style={{ height: "100%", width: "100%" }}
      >
        <ZoomWatcher onZoom={setZoom} />
        <ZoomControl position="bottomright" />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        <MapClickClear onClear={clearPipeSelection} />

        {/* =====================
            CAÑERÍAS (DB)
        ===================== */}
        {showPipes && (
          <PipesLayer
            visible={showPipes}
            selectedId={selectedPipeId}
            onSelect={(id, layer) => {
              setSelectedPipeId(id);
              setSelectedPipeLayer(layer);

              // si seleccionás otra cañería, cerramos edición
              setEditingPipeId(null);

              // calculamos posición para el popup (centro del bounds o latlng)
              try {
                const anyLayer: any = layer as any;
                const center = anyLayer?.getBounds?.().getCenter?.() ?? anyLayer?.getLatLng?.();
                if (center && typeof center.lat === "number" && typeof center.lng === "number") {
                  setSelectedPipePos([center.lat, center.lng]);
                } else {
                  setSelectedPipePos(null);
                }
              } catch {
                setSelectedPipePos(null);
              }
            }}
          />
        )}

        {/* Popup de la cañería seleccionada */}
        {selectedPipeId && selectedPipePos && (
          <Popup position={selectedPipePos}>
            <div className="text-sm" style={{ minWidth: 220 }}>
              <div className="font-semibold">Cañería</div>
              <div className="text-xs text-slate-600">ID: {selectedPipeId}</div>

              <div className="mt-2 flex gap-2">
                <button
                  className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm"
                  onClick={() => setEditingPipeId(selectedPipeId)}
                >
                  Editar
                </button>

                <button
                  className="px-3 py-1.5 rounded border text-sm"
                  onClick={clearPipeSelection}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </Popup>
        )}

        {/* =====================
            ZONAS
        ===================== */}
        {showZones &&
          zonesToShow.map((z) => {
            const sel = mode === "ZONE" && selectedZoneId === z.id;
            const c = centroid(z.polygon);

            const icon = (() => {
              if (!shrinkOthers) return locationMarkerIcon(z.name, sel, 1, 1);
              if (sel) return locationMarkerIcon(z.name, true, 1, 1);
              return locationMarkerIcon(z.name, false, 0.78, 0.55);
            })();

            const showPolygon = sel || zoom >= 15;

            return (
              <React.Fragment key={z.id}>
                <Marker position={c} icon={icon} eventHandlers={{ click: () => onSelectZone(z) }} />

                {showPolygon && (
                  <Polygon
                    positions={z.polygon}
                    pathOptions={{
                      color: "rgba(255,255,255,0.35)",
                      weight: sel ? 3 : 1.5,
                      fillOpacity: sel ? 0.07 : 0.03,
                      dashArray: sel ? undefined : "8 12",
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                    eventHandlers={{ click: () => onSelectZone(z) }}
                  />
                )}
              </React.Fragment>
            );
          })}

        {/* =====================
            BARRIOS
        ===================== */}
        {showBarrios &&
          canDrawBarrios &&
          barriosToShow.map((b) => {
            const hlBase = highlightedBarrioIds.has(b.id);
            const hlByValve = highlightedBarrioIdsExtra?.has(b.id) ?? false;
            const hl = hlBase || hlByValve;

            const pres = pressureLabelForBarrio(b);

            return (
              <Polygon
                key={b.id}
                positions={b.polygon}
                pathOptions={{
                  color: hl ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.55)",
                  fillColor: hl ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.15)",
                  fillOpacity: hl ? 0.45 : 0.3,
                  weight: hl ? 4 : 2,
                }}
              >
                <Tooltip sticky direction="top" opacity={0.98}>
                  <div style={{ fontWeight: 900 }}>{b.name}</div>
                  <div style={{ fontSize: 12 }}>{pres.label}</div>
                </Tooltip>
              </Polygon>
            );
          })}

        <FitToRoute enabled={hasRoute} dashedEdgeIdsExtra={dashedEdgeIdsExtra} assetsById={assetsById} />

        {!hasRoute && (
          <FitToBarrios
            enabled={hasBarrioImpact}
            barrioIds={highlightedBarrioIdsExtra}
            includePoint={activeValvePos ?? null}
          />
        )}

        {!hasRoute && !hasBarrioImpact && <FlyTo target={focusTarget} />}

        {/* assets demo */}
        {(viewMode === "ALL" || viewMode === "ZONES") &&
          (showAssets || (forceShowAssetIds && forceShowAssetIds.size > 0)) &&
          assets
            .filter((a) => {
              if (mode === "ZONE" && selectedZoneId) return a.locationId === selectedZoneId;
              return true;
            })
            .filter((a) => showAssets || (forceShowAssetIds?.has(a.id) ?? false))
            .map((a) => {
              const isValve = a.type === "VALVE";
              const on = !isValve || valveEnabled[a.id] !== false;
              const alpha = on ? 1.0 : 0.35;

              const isForced = forceShowAssetIds?.has(a.id) ?? false;

              const size = isForced ? 16 : 12;
              const html = `
                <div class="pulse" style="
                  width:${size}px;height:${size}px;
                  border-radius:999px;
                  background:${on ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.7)"};
                  box-shadow:${isForced ? "0 0 0 6px rgba(255,255,255,0.18)" : "none"};
                  opacity:${alpha};
                "></div>
              `;

              return (
                <Marker
                  key={a.id}
                  position={[a.lat, a.lng]}
                  icon={new L.DivIcon({
                    className: "",
                    html,
                    iconSize: [size, size],
                    iconAnchor: [size / 2, size / 2],
                  })}
                  eventHandlers={{ click: () => onSelectAsset(a.id) }}
                >
                  <Popup>
                    <div style={{ fontWeight: 900 }}>{a.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                      {a.type} · {a.status} · {a.locationId}
                    </div>
                  </Popup>
                </Marker>
              );
            })}

        {/* 2 puntos A/B */}
        {focusPair && (
          <>
            <Marker interactive={false} position={focusPair.a.pos} icon={focusPointIcon(focusPair.a.label)} />
            <Marker interactive={false} position={focusPair.b.pos} icon={focusPointIcon(focusPair.b.label)} />
          </>
        )}
      </MapContainer>

      {/* =====================
          EDITOR DE GEOMETRÍA (opcional)
      ===================== */}
      <PipeGeometryEditor pipeId={selectedPipeId} pipeLayer={selectedPipeLayer} />

      {/* =====================
          EDITOR DE PROPIEDADES (MODAL)
          ✅ abre solo con "Editar"
      ===================== */}
      <PipeEditDrawer
        pipeId={editingPipeId}
        onClose={() => setEditingPipeId(null)}
        onUpdated={() => {}}
      />
    </>
  );
}
