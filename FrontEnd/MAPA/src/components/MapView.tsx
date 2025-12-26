import React from "react";
import {
  MapContainer,
  Marker,
  Popup,
  Polyline,
  Polygon,
  TileLayer,
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

export type ViewMode = "ALL" | "ZONES" | "PIPES" | "BARRIOS";

function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  useMapEvents({
    zoomend: (e) => onZoom(e.target.getZoom()),
    moveend: (e) => onZoom(e.target.getZoom()),
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

/**
 * ✅ Cuando hay recorrido (dashedEdgeIdsExtra), encuadra TODO el recorrido.
 * Usa edge.path si existe, si no usa endpoints (assets).
 */
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

/**
 * ✅ cuando una válvula impacta barrios (highlightedBarrioIdsExtra),
 * encuadra los polígonos para que SIEMPRE se vean.
 */
function FitToBarrios({
  enabled,
  barrioIds,
}: {
  enabled: boolean;
  barrioIds?: Set<string>;
}) {
  const map = useMap();

  React.useEffect(() => {
    if (!enabled) return;
    if (!barrioIds || barrioIds.size === 0) return;

    const pts: [number, number][] = [];
    for (const b of barrios) {
      if (!barrioIds.has(b.id)) continue;
      for (const p of b.polygon) pts.push(p); // [lat,lng]
    }

    if (pts.length < 2) return;

    const bounds = L.latLngBounds(pts as any);
    map.fitBounds(bounds, { padding: [90, 90] });
  }, [enabled, barrioIds, map]);

  return null;
}

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

  // ✅ extras por impacto de válvula (barrios + cañerías punteadas)
  highlightedBarrioIdsExtra?: Set<string>;
  dashedEdgeIdsExtra?: Set<string>;

  // acciones
  onSelectZone: (z: Zone) => void;
  onSelectAsset: (id: string) => void;

  // mejoras
  shrinkOthers: boolean;
  focusPair: FocusPair;

  focusTarget: LatLng | null;

  // ✅ filtro/vista
  viewMode: ViewMode;
  viewSelectedId: string | null;
  mapGrey: boolean;
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
    highlightedEdgeIds,
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
  } = props;

  const showAssets = zoom >= 14.5 || (mode === "ZONE" && selectedZoneId);

  // ✅ si hay recorrido punteado, NO hacemos FlyTo a un punto, sino fitBounds al recorrido completo
  const hasRoute = (dashedEdgeIdsExtra?.size ?? 0) > 0;

  // ✅ si la válvula impacta barrios, encuadrar esos barrios (si no hay route)
  const hasBarrioImpact = (highlightedBarrioIdsExtra?.size ?? 0) > 0;

  // ✅ qué se muestra según modo + selección
  const showZones = viewMode === "ALL" || viewMode === "ZONES";
  const showPipes = viewMode === "ALL" || viewMode === "PIPES";
  const showBarrios = viewMode === "ALL" || viewMode === "BARRIOS";

  const zonesToShow =
    viewMode === "ZONES" && viewSelectedId ? zones.filter((z) => z.id === viewSelectedId) : zones;

  const edgesToShow =
    viewMode === "PIPES" && viewSelectedId ? edges.filter((e) => e.id === viewSelectedId) : edges;

  const barriosToShowBase =
    viewMode === "BARRIOS" && viewSelectedId ? barrios.filter((b) => b.id === viewSelectedId) : barrios;

  /**
   * ✅ FIX: Barrios antes se dibujaban solo con zoom>=15 o zona seleccionada.
   * Eso hace que NO se vean al arrancar (zoom 13.8).
   * Ahora: se dibujan desde zoom>=13.2 (ajustable) o si estás dentro de una zona.
   */
  const BARRIOS_MIN_ZOOM = 13.2;
  const canDrawBarrios = zoom >= BARRIOS_MIN_ZOOM || (mode === "ZONE" && selectedZoneId);

  /**
   * ✅ (Opcional): si estás en modo ZONE, mostrás solo barrios de esa localidad
   */
  const barriosToShow =
    mode === "ZONE" && selectedZoneId
      ? barriosToShowBase.filter((b) => b.locationId === selectedZoneId)
      : barriosToShowBase;

  return (
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

      {/* Localidades */}
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
              <Marker position={c} icon={icon} eventHandlers={{ click: () => onSelectZone(z) }}>
                <Popup>
                  <div style={{ fontWeight: 900 }}>{z.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>Click para abrir panel</div>
                </Popup>
              </Marker>

              {showPolygon && (
                <Polygon
                  positions={z.polygon}
                  pathOptions={{
                    color: "rgba(34,211,238,0.35)",
                    weight: sel ? 3 : 1.5,
                    fillOpacity: sel ? 0.08 : 0.03,
                    dashArray: sel ? undefined : "8 12",
                  }}
                  eventHandlers={{ click: () => onSelectZone(z) }}
                />
              )}
            </React.Fragment>
          );
        })}

      {/* Barrios */}
      {showBarrios &&
        canDrawBarrios &&
        barriosToShow.map((b) => {
          const hlBase = highlightedBarrioIds.has(b.id);
          const hlByValve = highlightedBarrioIdsExtra?.has(b.id) ?? false;
          const hl = hlBase || hlByValve;

          return (
            <Polygon
              key={b.id}
              positions={b.polygon}
              pathOptions={{
                color: hl ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.18)",
                weight: hlByValve ? 4 : hl ? 3 : 1.2,
                fillOpacity: hlByValve ? 0.22 : hl ? 0.12 : 0.05,
                dashArray: hl ? undefined : "10 14",
              }}
            />
          );
        })}

      {/* Cañerías */}
      {showPipes &&
        edgesToShow.map((e) => {
          const a = assetsById.get(e.from);
          const b = assetsById.get(e.to);
          if (!a || !b) return null;

          const toAsset = assetsById.get(e.to);
          const fromAsset = assetsById.get(e.from);

          let disabled = false;
          if (toAsset?.type === "VALVE" && valveEnabled[toAsset.id] === false) disabled = true;
          if (fromAsset?.type === "VALVE" && valveEnabled[fromAsset.id] === false) disabled = true;

          const isHighlighted = highlightedEdgeIds.has(e.id);
          const dashed = dashedEdgeIdsExtra?.has(e.id) ?? false;

          const positions: [number, number][] = e.path ? e.path : [[a.lat, a.lng], [b.lat, b.lng]];

          const baseOpacity = zoom < 14.5 ? 0.25 : 0.55;
          const opacity = disabled ? 0.18 : isHighlighted || dashed ? 1.0 : baseOpacity;

          const weight = disabled ? 3 : dashed ? 6 : isHighlighted ? 7 : zoom < 14.5 ? 3 : 4;

          return (
            <Polyline
              key={e.id}
              positions={positions}
              pathOptions={{
                color: edgeColor(e.type),
                opacity,
                weight,
                dashArray: dashed ? "6 10" : undefined,
              }}
              eventHandlers={{
                click: () => onSelectAsset(e.to),
              }}
            />
          );
        })}

      {/* Assets (solo en ALL/ZONES para no ensuciar cuando filtrás PIPES/BARRIOS) */}
      {(viewMode === "ALL" || viewMode === "ZONES") &&
        showAssets &&
        assets
          .filter((a) => {
            if (mode === "ZONE" && selectedZoneId) return a.locationId === selectedZoneId;
            return true;
          })
          .map((a) => {
            const isValve = a.type === "VALVE";
            const on = !isValve || valveEnabled[a.id] !== false;
            const alpha = on ? 1.0 : 0.35;

            const size = 12;
            const html = `
              <div class="pulse" style="
                width:${size}px;height:${size}px;
                background:${on ? "rgba(34,211,238,0.95)" : "rgba(255,255,255,0.7)"};
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

      {/* 2 puntos A/B (NO interactivos) */}
      {focusPair && (
        <>
          <Marker interactive={false} position={focusPair.a.pos} icon={focusPointIcon(focusPair.a.label)} />
          <Marker interactive={false} position={focusPair.b.pos} icon={focusPointIcon(focusPair.b.label)} />
        </>
      )}

      {/* Si hay recorrido punteado, encuadrarlo */}
      <FitToRoute enabled={hasRoute} dashedEdgeIdsExtra={dashedEdgeIdsExtra} assetsById={assetsById} />

      {/* Si NO hay recorrido, pero hay impacto a barrios, encuadrar barrios */}
      {!hasRoute && <FitToBarrios enabled={hasBarrioImpact} barrioIds={highlightedBarrioIdsExtra} />}

      {/* Si NO hay recorrido NI barrio impacto, mantenemos centrar */}
      {!hasRoute && !hasBarrioImpact && <FlyTo target={focusTarget} />}
    </MapContainer>
  );
}
