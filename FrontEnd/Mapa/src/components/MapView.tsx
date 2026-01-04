import React from "react";
import {
  MapContainer,
  Marker,
  Popup,
  Polygon,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { barrios, edges, zones, CENTER, type Asset, type Zone } from "../data/demo";

import { type LatLng } from "../lib/geo";
import { centroid } from "../lib/geoUtils";
import { focusPointIcon, locationMarkerIcon } from "../lib/mapIcons";
import { FlyTo } from "./FlyTo";

// ✅ Pipes (backend + editor)
import PipesLayer, { type SimRunResponse } from "./PipesLayer";
import PipeEditDrawer from "./PipeEditDrawer";
import PipeGeometryEditor from "./PipeGeometryEditor";

// ✅ Connect drawer
import PipeConnectDrawer from "./PipeConnectDrawer";

// ✅ Create / Delete
import { createPipe, deletePipe } from "../services/mapasagua";

// ✅ Sim API
import { runSim } from "../features/mapa/services/simApi";

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
   Click en mapa (fondo) => limpiar selección/cerrar modales
--------------------------- */
function MapClickClear({
  onClear,
  enabled = true,
}: {
  onClear: () => void;
  enabled?: boolean;
}) {
  useMapEvents({
    click: (e: any) => {
      if (!enabled) return;

      const t = e?.originalEvent?.target as any;
      if (!t) return;

      // Si el click se originó dentro de un popup, no limpiamos
      if (t.closest?.(".leaflet-popup")) return;

      // ✅ Si el click es sobre markers/handles de Geoman, no limpiamos
      if (
        t.closest?.(".leaflet-pm-draggable") ||
        t.closest?.(".leaflet-pm-marker") ||
        t.closest?.(".leaflet-pm-icon-marker") ||
        t.closest?.(".leaflet-pm-vertex") ||
        t.closest?.(".leaflet-pm-middle-marker") ||
        t.closest?.(".leaflet-pm-edit-marker")
      ) {
        return;
      }

      onClear();
    },
  });
  return null;
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
   Fit helpers
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

/* ---------------------------
   Crear cañería dibujando (Leaflet-Geoman)
--------------------------- */
function PipeDrawController({
  enabled,
  onCreated,
}: {
  enabled: boolean;
  onCreated: (geom: any) => void;
}) {
  const map = useMap();

  React.useEffect(() => {
    const m: any = map as any;
    if (!m?.pm) return;

    const handleCreate = (e: any) => {
      try {
        const gj = e?.layer?.toGeoJSON?.();
        const geom = gj?.geometry;
        if (geom) onCreated(geom);
      } catch {}

      // eliminamos el layer temporal (se recargará desde backend)
      try {
        map.removeLayer(e.layer);
      } catch {}
    };

    map.on("pm:create", handleCreate);
    return () => {
      map.off("pm:create", handleCreate);
    };
  }, [map, onCreated]);

  React.useEffect(() => {
    const m: any = map as any;
    if (!m?.pm) return;

    if (enabled) {
      try {
        m.pm.enableDraw("Line", {
          snappable: true,
          snapDistance: 10,
        });
      } catch {}
    } else {
      try {
        m.pm.disableDraw("Line");
      } catch {}
    }
  }, [map, enabled]);

  return null;
}

/* ===========================
   Helpers API (nodes lite)
   - backend /mapa/nodes devuelve { items: [{id, kind, label, ...}] }
=========================== */
type NodeLite = { id: string; kind?: string; label?: string };

async function fetchNodesLiteSafe(): Promise<NodeLite[]> {
  try {
    const res = await fetch(`/mapa/nodes`, { headers: { "Content-Type": "application/json" } });
    if (!res.ok) return [];
    const j = await res.json();
    const items = Array.isArray(j) ? j : Array.isArray(j?.items) ? j.items : [];
    return items
      .map((x: any) => ({
        id: String(x?.id),
        kind: x?.kind ? String(x.kind) : undefined,
        label: x?.label ? String(x.label) : undefined,
      }))
      .filter((x: any) => !!x.id);
  } catch {
    return [];
  }
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

  // Pipes state
  const [selectedPipeId, setSelectedPipeId] = React.useState<string | null>(null);
  const [selectedPipeLabel, setSelectedPipeLabel] = React.useState<string | null>(null);
  const [selectedPipeLayer, setSelectedPipeLayer] = React.useState<L.Layer | null>(null);
  const [selectedPipePos, setSelectedPipePos] = React.useState<[number, number] | null>(null);
  const [selectedPipeFeature, setSelectedPipeFeature] = React.useState<any>(null);

  const [editingPipeId, setEditingPipeId] = React.useState<string | null>(null);
  const [editingGeomOpen, setEditingGeomOpen] = React.useState(false);

  // creación por dibujo
  const [creatingPipe, setCreatingPipe] = React.useState(false);

  // forzar recarga de pipes
  const [pipesReloadKey, setPipesReloadKey] = React.useState(0);

  // SIM
  const [sim, setSim] = React.useState<SimRunResponse | null>(null);
  const [simBusy, setSimBusy] = React.useState(false);
  const [simErr, setSimErr] = React.useState<string | null>(null);

  // Connect drawer
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [nodesLite, setNodesLite] = React.useState<NodeLite[]>([]);
  const [nodesBusy, setNodesBusy] = React.useState(false);

  function clearPipeSelection() {
    setSelectedPipeId(null);
    setSelectedPipeLabel(null);
    setSelectedPipeLayer(null);
    setSelectedPipePos(null);
    setSelectedPipeFeature(null);
    setEditingPipeId(null);
    setEditingGeomOpen(false);
    setConnectOpen(false);
  }

  async function ensureNodes() {
    if (nodesBusy) return;
    setNodesBusy(true);
    try {
      const items = await fetchNodesLiteSafe();
      setNodesLite(items);
    } finally {
      setNodesBusy(false);
    }
  }

  async function runSimulation() {
    setSimBusy(true);
    setSimErr(null);
    try {
      const r = await runSim({
        default_diam_mm: 75,
        r_scale: 1,
        // estas opciones en SIMPLE no afectan, pero las dejamos para compatibilidad
        ignore_unconnected: true,
        closed_valve_blocks_node: true,
        min_pressure_m: 0,
      });
      setSim(r as any);
    } catch (e: any) {
      setSimErr(e?.message ?? "No se pudo simular");
    } finally {
      setSimBusy(false);
    }
  }

  // from/to iniciales si el GeoJSON los trae
  const connHint = React.useMemo(() => {
    const p = selectedPipeFeature?.properties ?? {};
    const props = p?.props ?? {};
    const from_node = (p.from_node ?? props.from_node ?? null) as string | null;
    const to_node = (p.to_node ?? props.to_node ?? null) as string | null;
    return { from_node, to_node };
  }, [selectedPipeFeature]);

  return (
    <>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {/* Botón flotante crear */}
        <button
          onClick={() => setCreatingPipe((v) => !v)}
          style={{
            position: "absolute",
            right: 16,
            top: 16,
            zIndex: 1000,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.2)",
            background: creatingPipe ? "rgba(37,99,235,0.95)" : "rgba(15,23,42,0.75)",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {creatingPipe ? "Cancelar dibujo" : "+ Cañería"}
        </button>

        {/* Botón flotante SIM */}
        <button
          onClick={() => {
            if (sim) setSim(null);
            else runSimulation();
          }}
          style={{
            position: "absolute",
            right: 16,
            top: 64,
            zIndex: 1000,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.2)",
            background: sim ? "rgba(34,197,94,0.95)" : "rgba(15,23,42,0.75)",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
          title={sim ? "Quitar simulación" : "Correr simulación"}
        >
          {simBusy ? "Simulando..." : sim ? "SIM: ON" : "SIM"}
        </button>

        {simErr && (
          <div
            style={{
              position: "absolute",
              right: 16,
              top: 114,
              zIndex: 1000,
              background: "rgba(220,38,38,0.92)",
              color: "#fff",
              padding: "8px 10px",
              borderRadius: 10,
              maxWidth: 360,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {simErr}
          </div>
        )}

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

          {/* mientras haya un modal abierto, NO limpiamos por click en mapa */}
          <MapClickClear onClear={clearPipeSelection} enabled={!editingPipeId && !editingGeomOpen && !connectOpen} />

          {/* Crear cañería (dibujar) */}
          <PipeDrawController
            enabled={creatingPipe}
            onCreated={async (geom) => {
              try {
                await createPipe({
                  geometry: geom,
                  properties: {
                    type: "WATER",
                    estado: "OK",
                    flow_func: "DISTRIBUCION",
                    diametro_mm: null,
                    material: null,
                    props: { Layer: "Nueva cañería" },
                    style: {},
                  },
                });
                setCreatingPipe(false);
                setPipesReloadKey((k) => k + 1);
              } catch (e: any) {
                alert(e?.message ?? "No se pudo crear");
                setCreatingPipe(false);
              }
            }}
          />

          {/* CAÑERÍAS */}
          {showPipes && (
            <PipesLayer
              key={pipesReloadKey}
              visible={showPipes}
              selectedId={selectedPipeId}
              freeze={editingGeomOpen}
              sim={sim}
              onSelect={(id, layer, label, feature) => {
                setSelectedPipeId(id);
                setSelectedPipeLabel(label ?? null);
                setSelectedPipeLayer(layer);
                setSelectedPipeFeature(feature ?? null);

                setEditingPipeId(null);
                setEditingGeomOpen(false);

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

          {/* Popup */}
          {selectedPipeId && selectedPipePos && !editingPipeId && !editingGeomOpen && !connectOpen && (
            <Popup position={selectedPipePos} className="pipe-popup" closeButton={true} autoClose={false}>
              <div className="pipePopup">
                <div className="pipePopup__title" title={selectedPipeLabel ?? ""}>
                  {selectedPipeLabel ?? "Cañería"}
                </div>

                <div className="pipePopup__actions">
                  <button
                    className="pipePopup__btn pipePopup__btn--primary"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedPipePos(null);
                      setEditingGeomOpen(false);
                      setEditingPipeId(selectedPipeId);
                    }}
                  >
                    Editar
                  </button>

                  <button
                    className="pipePopup__btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedPipePos(null);
                      setEditingPipeId(null);
                      setEditingGeomOpen(true);
                    }}
                  >
                    Recorrido
                  </button>

                  {/* Conectar manual */}
                  <button
                    className="pipePopup__btn"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!selectedPipeId) return;
                      await ensureNodes();
                      setConnectOpen(true);
                    }}
                    title={nodesBusy ? "Cargando nodos..." : "Conectar a nodos (manual)"}
                  >
                    {nodesBusy ? "Nodos..." : "Conectar"}
                  </button>

                  <button
                    className="pipePopup__btn"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!selectedPipeId) return;

                      const ok = confirm(`¿Borrar cañería "${selectedPipeLabel ?? ""}"?`);
                      if (!ok) return;

                      try {
                        await deletePipe(selectedPipeId);
                        clearPipeSelection();
                        setPipesReloadKey((k) => k + 1);
                      } catch (err: any) {
                        alert(err?.message ?? "No se pudo borrar");
                      }
                    }}
                  >
                    Borrar
                  </button>

                  <button
                    className="pipePopup__btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      clearPipeSelection();
                    }}
                  >
                    Cerrar
                  </button>
                </div>

                {/* hint sim */}
                {sim?.pipes?.[selectedPipeId] && (
                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
                    <div>
                      <b>Q</b>: {Number(sim.pipes[selectedPipeId].q_lps ?? 0).toFixed(3)} L/s{" "}
                      ({sim.pipes[selectedPipeId].dir === 1 ? "from→to" : "to→from"})
                    </div>
                    <div>
                      <b>ΔH</b>:{" "}
                      {sim.pipes[selectedPipeId].dH_m == null
                        ? "N/D"
                        : Number(sim.pipes[selectedPipeId].dH_m).toFixed(2)}{" "}
                      m
                    </div>
                    {sim.pipes[selectedPipeId].blocked && (
                      <div style={{ fontWeight: 800, color: "#b91c1c" }}>BLOQUEADO</div>
                    )}
                  </div>
                )}
              </div>
            </Popup>
          )}

          {/* ZONAS */}
          {showZones &&
            zonesToShow.map((z) => {
              const sel = mode === "ZONE" && selectedZoneId === z.id;
              const c = centroid(z.polygon);

              const icon = (() => {
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

          {/* BARRIOS */}
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
            <FitToBarrios enabled={hasBarrioImpact} barrioIds={highlightedBarrioIdsExtra} includePoint={activeValvePos ?? null} />
          )}

          {!hasRoute && !hasBarrioImpact && <FlyTo target={focusTarget} />}

          {/* 2 puntos A/B */}
          {focusPair && (
            <>
              <Marker interactive={false} position={focusPair.a.pos} icon={focusPointIcon(focusPair.a.label)} />
              <Marker interactive={false} position={focusPair.b.pos} icon={focusPointIcon(focusPair.b.label)} />
            </>
          )}
        </MapContainer>
      </div>

      {/* Drawer conectar pipe */}
      <PipeConnectDrawer
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        pipeId={selectedPipeId}
        nodes={nodesLite}
        initialFrom={connHint.from_node}
        initialTo={connHint.to_node}
        onConnected={() => {
          setPipesReloadKey((k) => k + 1);
          if (sim) runSimulation();
        }}
      />

      {/* Editor recorrido (modal) */}
      <PipeGeometryEditor
        open={editingGeomOpen}
        pipeId={selectedPipeId}
        pipeLayer={selectedPipeLayer}
        onClose={() => setEditingGeomOpen(false)}
        onSaved={() => {
          setPipesReloadKey((k) => k + 1);
          if (sim) runSimulation();
        }}
      />

      {/* Editor propiedades (modal) */}
      <PipeEditDrawer
        pipeId={editingPipeId}
        onClose={() => setEditingPipeId(null)}
        onUpdated={(feature) => {
          const nextLabel = feature?.properties?.props?.Layer ?? feature?.properties?.props?.layer ?? null;
          if (nextLabel != null) setSelectedPipeLabel(String(nextLabel));
          setPipesReloadKey((k) => k + 1);
          if (sim) runSimulation();
        }}
      />
    </>
  );
}
