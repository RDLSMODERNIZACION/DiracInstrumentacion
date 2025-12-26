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

function pressureLabelForBarrio(b: any): { label: string; tone: "good" | "mid" | "bad" | "na" } {
  const m = (b?.meta ?? {}) as any;

  // Soportes posibles (si después los agregás al meta)
  const kpa = typeof m.presion_kpa === "number" ? m.presion_kpa : null;
  const bar = typeof m.presion_bar === "number" ? m.presion_bar : null;
  const pct = typeof m.presion_pct === "number" ? m.presion_pct : null;

  // Heurística simple (ajustable)
  if (bar != null) {
    // Ej: >2.2 buena, 1.6-2.2 media, <1.6 mala
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

/**
 * ✅ Cuando hay recorrido (dashedEdgeIdsExtra), encuadra TODO el recorrido.
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
 * ✅ encuadra barrios impactados, e INCLUYE además el punto de la válvula (para que se vea la localización).
 */
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
      for (const p of b.polygon) pts.push(p); // [lat,lng]
    }

    if (includePoint) pts.push(includePoint);

    if (pts.length < 2) return;

    const bounds = L.latLngBounds(pts as any);
    map.fitBounds(bounds, { padding: [110, 110] });
  }, [enabled, barrioIds, includePoint, map]);

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

  // ✅ NUEVO: para encuadrar también la ubicación donde abriste la válvula
  activeValvePos?: LatLng | null;

  // ✅ NUEVO: forzar que se muestre el marker aunque el zoom sea bajo
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

  const edgesToShow =
    viewMode === "PIPES" && viewSelectedId ? edges.filter((e) => e.id === viewSelectedId) : edges;

  const barriosToShowBase =
    viewMode === "BARRIOS" && viewSelectedId
      ? barrios.filter((b) => b.id === viewSelectedId)
      : barrios;

  const BARRIOS_MIN_ZOOM = 13.2;
  const canDrawBarrios = zoom >= BARRIOS_MIN_ZOOM || (mode === "ZONE" && selectedZoneId);

  const barriosToShow =
    mode === "ZONE" && selectedZoneId
      ? barriosToShowBase.filter((b) => b.locationId === selectedZoneId)
      : barriosToShowBase;

  // 🎨 Estilo “blanco lindo” + bordes suaves + hover
  const barrioBaseStyle = (hl: boolean, hlByValve: boolean) => {
    // Borde
    const stroke = hlByValve
      ? "rgba(255,255,255,0.95)"
      : hl
      ? "rgba(255,255,255,0.80)"
      : "rgba(255,255,255,0.55)";

    // Relleno blanco “glass”
    const fillColor = hlByValve
      ? "rgba(255,255,255,0.28)"
      : hl
      ? "rgba(255,255,255,0.22)"
      : "rgba(255,255,255,0.14)";

    const fillOpacity = hlByValve ? 0.55 : hl ? 0.42 : 0.30;

    return {
      color: stroke,
      fillColor,
      fillOpacity,
      weight: hlByValve ? 4 : hl ? 3 : 2,
      lineCap: "round",
      lineJoin: "round",
      dashArray: undefined,
    } as const;
  };

  const barrioHoverStyle = (hl: boolean, hlByValve: boolean) => {
    // un poquito más marcado al hover
    const base = barrioBaseStyle(hl, hlByValve);
    return {
      ...base,
      fillOpacity: Math.min(0.68, (base.fillOpacity ?? 0.45) + 0.12),
      weight: (base.weight ?? 2) + 1,
    } as const;
  };

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

      {/* Barrios */}
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
              pathOptions={barrioBaseStyle(hl, hlByValve)}
              eventHandlers={{
                mouseover: (ev) => {
                  const layer = ev.target as any;
                  if (layer?.setStyle) layer.setStyle(barrioHoverStyle(hl, hlByValve));
                },
                mouseout: (ev) => {
                  const layer = ev.target as any;
                  if (layer?.setStyle) layer.setStyle(barrioBaseStyle(hl, hlByValve));
                },
              }}
            >
              <Tooltip
                sticky
                direction="top"
                opacity={0.98}
                className={`barrioTooltip tone-${pres.tone}`}
              >
                <div style={{ fontWeight: 900 }}>{b.name}</div>
                <div style={{ fontSize: 12, opacity: 0.9 }}>{pres.label}</div>
              </Tooltip>
            </Polygon>
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

      {/* Assets: mostrar en ALL/ZONES, y además forzar el marker de la válvula activa aunque el zoom sea bajo */}
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

      {/* 2 puntos A/B (NO interactivos) */}
      {focusPair && (
        <>
          <Marker interactive={false} position={focusPair.a.pos} icon={focusPointIcon(focusPair.a.label)} />
          <Marker interactive={false} position={focusPair.b.pos} icon={focusPointIcon(focusPair.b.label)} />
        </>
      )}

      {/* Si hay recorrido punteado, encuadrarlo */}
      <FitToRoute enabled={hasRoute} dashedEdgeIdsExtra={dashedEdgeIdsExtra} assetsById={assetsById} />

      {/* Si NO hay recorrido, pero hay impacto a barrios, encuadrar barrios + incluir punto de válvula */}
      {!hasRoute && (
        <FitToBarrios
          enabled={hasBarrioImpact}
          barrioIds={highlightedBarrioIdsExtra}
          includePoint={activeValvePos ?? null}
        />
      )}

      {/* Si NO hay recorrido NI barrio impacto, mantenemos centrar */}
      {!hasRoute && !hasBarrioImpact && <FlyTo target={focusTarget} />}
    </MapContainer>
  );
}
