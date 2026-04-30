import React from "react";
import {
  MapContainer,
  Marker,
  Polygon,
  TileLayer,
  Tooltip,
  ZoomControl,
} from "react-leaflet";
import L from "leaflet";

import { barrios, zones, CENTER, type Asset, type Zone } from "../../data/demo";

import { type LatLng } from "../../lib/geo";
import { centroid } from "../../lib/geoUtils";
import { focusPointIcon, locationMarkerIcon } from "../../lib/mapIcons";
import { FlyTo } from "../FlyTo";

import PipesLayer, { type PipeConnectivityStats, type SimRunResponse } from "./PipesLayer";
import PipeEditDrawer from "./PipeEditDrawer";
import PipeGeometryEditor from "./PipeGeometryEditor";
import PipeConnectDrawer from "./PipeConnectDrawer";
import NodeConnectDrawer from "./NodeConnectDrawer";
import IntersectionConnectTool from "./IntersectionConnectTool";
import ContourVisualLayer from "./ContourVisualLayer";
import PressureNodesLayer from "./PressureNodesLayer";
import MapFloatingControls from "./MapFloatingControls";
import MapLegendOverlay from "./MapLegendOverlay";
import NodeConnectPickerLayer from "./NodeConnectPickerLayer";
import PipePopup from "./PipePopup";

import {
  FitToBarrios,
  FitToRoute,
  MapClickClear,
  PipeDrawController,
  ZoomWatcher,
} from "./MapLeafletHelpers";

import {
  fetchNodesLiteSafe,
  pipeConnHintFromFeature,
  pressureLabelForBarrio,
} from "./mapHelpers";

import type { FocusPair, NodeLite, SimMode, ViewMode } from "./mapTypes";

import { createPipe, deletePipe } from "../../services/mapasagua";
import { runSim } from "../../features/mapa/services/simApi";

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
    assetsById,
    highlightedBarrioIds,
    highlightedBarrioIdsExtra,
    dashedEdgeIdsExtra,
    onSelectZone,
    focusPair,
    focusTarget,
    viewMode,
    viewSelectedId,
    mapGrey,
    activeValvePos,
  } = props;

  const hasRoute = (dashedEdgeIdsExtra?.size ?? 0) > 0;
  const hasBarrioImpact = (highlightedBarrioIdsExtra?.size ?? 0) > 0;

  const showZones = viewMode === "ALL" || viewMode === "ZONES";
  const showPipes = viewMode === "ALL" || viewMode === "PIPES";
  const showBarrios = viewMode === "ALL" || viewMode === "BARRIOS";

  const zonesToShow =
    viewMode === "ZONES" && viewSelectedId
      ? zones.filter((z) => z.id === viewSelectedId)
      : zones;

  const BARRIOS_MIN_ZOOM = 13.2;
  const canDrawBarrios = zoom >= BARRIOS_MIN_ZOOM || (mode === "ZONE" && selectedZoneId);

  const barriosToShow =
    mode === "ZONE" && selectedZoneId
      ? barrios.filter((b) => b.locationId === selectedZoneId)
      : barrios;

  const [selectedPipeId, setSelectedPipeId] = React.useState<string | null>(null);
  const [selectedPipeLabel, setSelectedPipeLabel] = React.useState<string | null>(null);
  const [selectedPipeLayer, setSelectedPipeLayer] = React.useState<L.Layer | null>(null);
  const [selectedPipePos, setSelectedPipePos] = React.useState<[number, number] | null>(null);
  const [selectedPipeFeature, setSelectedPipeFeature] = React.useState<any>(null);

  const [editingPipeId, setEditingPipeId] = React.useState<string | null>(null);
  const [editingGeomOpen, setEditingGeomOpen] = React.useState(false);
  const [creatingPipe, setCreatingPipe] = React.useState(false);

  const [showContours, setShowContours] = React.useState(false);
  const [showPressureNodes, setShowPressureNodes] = React.useState(true);
  const [showLegend, setShowLegend] = React.useState(true);

  const [simMode, setSimMode] = React.useState<SimMode>("topografico");
  const [sim, setSim] = React.useState<SimRunResponse | null>(null);
  const [simBusy, setSimBusy] = React.useState(false);
  const [simErr, setSimErr] = React.useState<string | null>(null);

  const [pipesReloadKey, setPipesReloadKey] = React.useState(0);

  const [connectOpen, setConnectOpen] = React.useState(false);
  const [nodesLite, setNodesLite] = React.useState<NodeLite[]>([]);
  const [nodesBusy, setNodesBusy] = React.useState(false);
  const [pipeConnectivityStats, setPipeConnectivityStats] =
    React.useState<PipeConnectivityStats | null>(null);

  const [nodeConnectOpen, setNodeConnectOpen] = React.useState(false);
  const [nodeConnectFrom, setNodeConnectFrom] = React.useState("");
  const [nodeConnectTo, setNodeConnectTo] = React.useState("");
  const [nodeConnectPickMode, setNodeConnectPickMode] =
    React.useState<"from" | "to">("from");

  const [intersectionConnectOpen, setIntersectionConnectOpen] = React.useState(false);

  const connHint = React.useMemo(
    () => pipeConnHintFromFeature(selectedPipeFeature),
    [selectedPipeFeature]
  );

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

  function closeEditionTools() {
    setCreatingPipe(false);
    setEditingPipeId(null);
    setEditingGeomOpen(false);
    setConnectOpen(false);
    setNodeConnectOpen(false);
    setIntersectionConnectOpen(false);
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

  function pickNodeForConnection(nodeId: string) {
    if (nodeConnectPickMode === "from") {
      setNodeConnectFrom(nodeId);

      if (!nodeConnectTo || nodeConnectTo === nodeId) {
        setNodeConnectPickMode("to");
      }

      return;
    }

    setNodeConnectTo(nodeId);
  }

  async function openNodeConnector() {
    if (sim) {
      alert("Apagá la simulación para editar conexiones de nodos.");
      return;
    }

    setCreatingPipe(false);
    setEditingPipeId(null);
    setEditingGeomOpen(false);
    setConnectOpen(false);
    setIntersectionConnectOpen(false);
    setNodeConnectOpen(true);

    await ensureNodes();
  }

  function openIntersectionConnector() {
    if (sim) {
      alert("Apagá la simulación para conectar cruces. Después de conectar, corré la simulación de nuevo.");
      return;
    }

    clearPipeSelection();
    setCreatingPipe(false);
    setEditingPipeId(null);
    setEditingGeomOpen(false);
    setConnectOpen(false);
    setNodeConnectOpen(false);
    setIntersectionConnectOpen((v) => !v);
  }

  async function runSimulation(modeToRun: SimMode = simMode) {
    setSimBusy(true);
    setSimErr(null);

    try {
      const r = await runSim({
        default_diam_mm: 75,
        r_scale: 1,
        head_drop_scale: modeToRun === "topografico" ? 0 : 0.0000001,
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

  function toggleSimMode() {
    const next: SimMode = simMode === "topografico" ? "hidraulico_suave" : "topografico";
    setSimMode(next);

    if (sim) {
      runSimulation(next);
    }
  }

  function toggleCreatingPipe() {
    setNodeConnectOpen(false);
    setIntersectionConnectOpen(false);
    setConnectOpen(false);
    setCreatingPipe((v) => !v);
  }

  async function handleDeleteSelectedPipe() {
    if (!selectedPipeId) return;

    const ok = confirm(`¿Borrar cañería "${selectedPipeLabel ?? ""}"?`);
    if (!ok) return;

    try {
      await deletePipe(selectedPipeId);
      clearPipeSelection();
      setPipesReloadKey((k) => k + 1);

      if (sim) {
        setSim(null);
      }
    } catch (err: any) {
      alert(err?.message ?? "No se pudo borrar");
    }
  }

  return (
    <>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <MapFloatingControls
          creatingPipe={creatingPipe}
          onToggleCreatingPipe={toggleCreatingPipe}
          nodeConnectOpen={nodeConnectOpen}
          onOpenNodeConnector={openNodeConnector}
          showContours={showContours}
          setShowContours={setShowContours}
          showPressureNodes={showPressureNodes}
          setShowPressureNodes={setShowPressureNodes}
          simMode={simMode}
          onToggleSimMode={toggleSimMode}
          simActive={!!sim}
          simBusy={simBusy}
          onToggleSim={() => {
            if (sim) {
              setSim(null);
            } else {
              closeEditionTools();
              runSimulation();
            }
          }}
          showLegend={showLegend}
          setShowLegend={setShowLegend}
        />

        <button
          onClick={openIntersectionConnector}
          style={{
            position: "absolute",
            right: 198,
            top: 16,
            zIndex: 1000,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.22)",
            background: intersectionConnectOpen
              ? "rgba(239,68,68,0.96)"
              : "rgba(15,23,42,0.82)",
            color: "#fff",
            fontWeight: 900,
            cursor: "pointer",
            boxShadow: "0 12px 25px rgba(0,0,0,0.24)",
            whiteSpace: "nowrap",
          }}
          title="Crear un nodo en una intersección y partir las cañerías cercanas"
        >
          {intersectionConnectOpen ? "Cancelar cruce" : "Conectar cruce"}
        </button>

        {simErr && (
          <div
            style={{
              position: "absolute",
              right: 16,
              top: 318,
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

        {showPipes && pipeConnectivityStats && (
          <div className="pipeConnOverlay" style={{ top: simErr ? 365 : 318 }}>
            <div className="pipeConnOverlay__title">
              {sim ? "Cañerías simuladas" : "Conectividad de cañerías"}
            </div>

            <div className="pipeConnOverlay__row">
              <span className="pipeConnOverlay__dot pipeConnOverlay__dot--ok" />
              <span>{pipeConnectivityStats.connected} conectadas</span>
            </div>

            <div className="pipeConnOverlay__row">
              <span className="pipeConnOverlay__dot pipeConnOverlay__dot--warn" />
              <span>{pipeConnectivityStats.unconnected} sin conectar</span>
            </div>
          </div>
        )}

        {showLegend && (
          <MapLegendOverlay simActive={!!sim} showPressureNodes={showPressureNodes} />
        )}

        <MapContainer
          className={mapGrey ? "mapGrey" : undefined}
          center={CENTER}
          zoom={13.8}
          minZoom={11}
          maxZoom={22}
          zoomControl={false}
          style={{ height: "100%", width: "100%" }}
        >
          <ZoomWatcher onZoom={setZoom} />
          <ZoomControl position="bottomright" />

          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={22}
            maxNativeZoom={19}
          />

          <ContourVisualLayer visible={showContours} opacity={0.68} />

          <MapClickClear
            onClear={clearPipeSelection}
            enabled={
              !editingPipeId &&
              !editingGeomOpen &&
              !connectOpen &&
              !nodeConnectOpen &&
              !intersectionConnectOpen
            }
          />

          <IntersectionConnectTool
            active={intersectionConnectOpen}
            defaultToleranceM={2}
            onCancel={() => {
              setIntersectionConnectOpen(false);
            }}
            onCreated={() => {
              setIntersectionConnectOpen(false);
              clearPipeSelection();
              setPipesReloadKey((k) => k + 1);

              if (sim) {
                setSim(null);
              }
            }}
          />

          <NodeConnectPickerLayer
            visible={nodeConnectOpen}
            nodes={nodesLite}
            fromNodeId={nodeConnectFrom}
            toNodeId={nodeConnectTo}
            pickMode={nodeConnectPickMode}
            onPick={pickNodeForConnection}
          />

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

                if (sim) {
                  setSim(null);
                }
              } catch (e: any) {
                alert(e?.message ?? "No se pudo crear");
                setCreatingPipe(false);
              }
            }}
          />

          {showPipes && (
            <PipesLayer
              key={pipesReloadKey}
              visible={showPipes}
              selectedId={selectedPipeId}
              freeze={editingGeomOpen}
              sim={sim}
              showOnlySimulated={!!sim}
              onConnectivityStats={setPipeConnectivityStats}
              onSelect={(id, layer, label, feature) => {
                if (intersectionConnectOpen) return;

                setSelectedPipeId(id);
                setSelectedPipeLabel(label ?? null);
                setSelectedPipeLayer(layer);
                setSelectedPipeFeature(feature ?? null);

                setEditingPipeId(null);
                setEditingGeomOpen(false);
                setConnectOpen(false);
                setNodeConnectOpen(false);

                try {
                  const anyLayer: any = layer as any;
                  const center =
                    anyLayer?.getBounds?.().getCenter?.() ?? anyLayer?.getLatLng?.();

                  if (
                    center &&
                    typeof center.lat === "number" &&
                    typeof center.lng === "number"
                  ) {
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

          {sim && showPressureNodes && <PressureNodesLayer sim={sim} visible={true} />}

          {selectedPipeId &&
            selectedPipePos &&
            !editingPipeId &&
            !editingGeomOpen &&
            !connectOpen &&
            !nodeConnectOpen &&
            !intersectionConnectOpen && (
              <PipePopup
                selectedPipeId={selectedPipeId}
                selectedPipeLabel={selectedPipeLabel}
                selectedPipePos={selectedPipePos}
                connHint={connHint}
                sim={sim}
                nodesBusy={nodesBusy}
                onEdit={() => {
                  setSelectedPipePos(null);
                  setEditingGeomOpen(false);
                  setConnectOpen(false);
                  setNodeConnectOpen(false);
                  setEditingPipeId(selectedPipeId);
                }}
                onEditGeometry={() => {
                  if (sim) {
                    alert("Apagá la simulación para editar el recorrido.");
                    return;
                  }

                  setSelectedPipePos(null);
                  setEditingPipeId(null);
                  setConnectOpen(false);
                  setNodeConnectOpen(false);
                  setIntersectionConnectOpen(false);
                  setEditingGeomOpen(true);
                }}
                onConnect={async () => {
                  if (!selectedPipeId) return;

                  if (sim) {
                    alert("Apagá la simulación para conectar manualmente cañerías.");
                    return;
                  }

                  setIntersectionConnectOpen(false);
                  await ensureNodes();
                  setConnectOpen(true);
                }}
                onDelete={handleDeleteSelectedPipe}
                onClose={clearPipeSelection}
              />
            )}

          {showZones &&
            zonesToShow.map((z) => {
              const sel = mode === "ZONE" && selectedZoneId === z.id;
              const c = centroid(z.polygon);

              const icon = sel
                ? locationMarkerIcon(z.name, true, 1, 1)
                : locationMarkerIcon(z.name, false, 0.78, 0.55);

              const showPolygon = sel || zoom >= 15;

              return (
                <React.Fragment key={z.id}>
                  <Marker
                    position={c}
                    icon={icon}
                    eventHandlers={{ click: () => onSelectZone(z) }}
                  />

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

          <FitToRoute
            enabled={hasRoute}
            dashedEdgeIdsExtra={dashedEdgeIdsExtra}
            assetsById={assetsById}
          />

          {!hasRoute && (
            <FitToBarrios
              enabled={hasBarrioImpact}
              barrioIds={highlightedBarrioIdsExtra}
              includePoint={activeValvePos ?? null}
            />
          )}

          {!hasRoute && !hasBarrioImpact && <FlyTo target={focusTarget} />}

          {focusPair && (
            <>
              <Marker
                interactive={false}
                position={focusPair.a.pos}
                icon={focusPointIcon(focusPair.a.label)}
              />
              <Marker
                interactive={false}
                position={focusPair.b.pos}
                icon={focusPointIcon(focusPair.b.label)}
              />
            </>
          )}
        </MapContainer>
      </div>

      <PipeConnectDrawer
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        pipeId={selectedPipeId}
        pipeFeature={selectedPipeFeature}
        nodes={nodesLite}
        initialFrom={connHint.from_node}
        initialTo={connHint.to_node}
        onConnected={(from, to) => {
          setSelectedPipeFeature((prev: any) => {
            if (!prev) return prev;

            return {
              ...prev,
              properties: {
                ...(prev.properties ?? {}),
                from_node: from,
                to_node: to,
                connected: true,
              },
            };
          });

          setPipesReloadKey((k) => k + 1);

          if (sim) {
            setSim(null);
          }
        }}
      />

      <NodeConnectDrawer
        open={nodeConnectOpen}
        onClose={() => setNodeConnectOpen(false)}
        nodes={nodesLite}
        nodesBusy={nodesBusy}
        ensureNodes={ensureNodes}
        fromNodeId={nodeConnectFrom}
        toNodeId={nodeConnectTo}
        pickMode={nodeConnectPickMode}
        setFromNodeId={setNodeConnectFrom}
        setToNodeId={setNodeConnectTo}
        setPickMode={setNodeConnectPickMode}
        onCreated={() => {
          setPipesReloadKey((k) => k + 1);

          if (sim) {
            setSim(null);
          }
        }}
      />

      <PipeGeometryEditor
        open={editingGeomOpen}
        pipeId={selectedPipeId}
        pipeLayer={selectedPipeLayer}
        pipeFeature={selectedPipeFeature}
        onClose={() => setEditingGeomOpen(false)}
        onSaved={() => {
          setPipesReloadKey((k) => k + 1);

          if (sim) {
            runSimulation();
          }
        }}
      />

      <PipeEditDrawer
        pipeId={editingPipeId}
        onClose={() => setEditingPipeId(null)}
        onUpdated={(feature) => {
          const nextLabel =
            feature?.properties?.props?.Layer ?? feature?.properties?.props?.layer ?? null;

          if (nextLabel != null) {
            setSelectedPipeLabel(String(nextLabel));
          }

          setPipesReloadKey((k) => k + 1);

          if (sim) {
            runSimulation();
          }
        }}
      />
    </>
  );
}