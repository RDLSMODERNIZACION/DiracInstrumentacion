import React from "react";
import { createPortal } from "react-dom";
import { MapContainer, Marker, TileLayer, ZoomControl } from "react-leaflet";
import L from "leaflet";

import { type LatLng } from "../../lib/geo";
import { focusPointIcon } from "../../lib/mapIcons";
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
import MapAssetsPanel from "./MapAssetsPanel";
import MapAssetNodePickerLayer from "./MapAssetNodePickerLayer";
import MapAssetsLayer from "./MapAssetsLayer";
import MapElevationNodesLayer from "./MapElevationNodesLayer";
import DiameterTransitionsLayer from "./DiameterTransitionsLayer";

import {
  MapClickClear,
  PipeDrawController,
  ZoomWatcher,
} from "./MapLeafletHelpers";

import {
  fetchNodesLiteSafe,
  pipeConnHintFromFeature,
} from "./mapHelpers";

import type { FocusPair, NodeLite, SimMode, ViewMode } from "./mapTypes";

import {
  createPipe,
  deletePipe,
  fetchMapAssetsLive,
  linkMapAsset,
  unlinkMapAsset,
  type MapAssetLive,
} from "../../services/mapasagua";

import { runSim } from "../../features/mapa/services/simApi";

type AssetLinkMode = "none" | "node" | "pipe";

const MAP_CENTER: [number, number] = [-37.4, -68.93];

function defaultHydraulicPositionForAsset(asset: MapAssetLive | null) {
  if (!asset) return undefined;

  if (asset.asset_type === "TANK") return "tank_outlet";
  if (asset.asset_type === "PUMP") return "pump_discharge";
  if (asset.asset_type === "MANIFOLD") return "manifold";

  return asset.hydraulic_position || undefined;
}

export function MapView(props: {
  zoom: number;
  setZoom: (z: number) => void;

  focusPair: FocusPair;
  focusTarget: LatLng | null;
  mapGrey: boolean;

  /**
   * Props viejas que venían de data/demo.
   * Se dejan opcionales para no romper el componente padre,
   * pero ya no se usan en este mapa.
   */
  mode?: "NONE" | "ZONE" | "ASSET";
  selectedZoneId?: string | null;
  assets?: any[];
  assetsById?: Map<string, any>;
  valveEnabled?: Record<string, boolean>;
  highlightedBarrioIds?: Set<string>;
  highlightedEdgeIds?: Set<string>;
  highlightedBarrioIdsExtra?: Set<string>;
  dashedEdgeIdsExtra?: Set<string>;
  onSelectZone?: (z: any) => void;
  onSelectAsset?: (id: string) => void;
  shrinkOthers?: boolean;
  viewMode?: ViewMode;
  viewSelectedId?: string | null;
  activeValvePos?: LatLng | null;
  forceShowAssetIds?: Set<string>;
}) {
  const { setZoom, focusPair, focusTarget, mapGrey } = props;

  const showPipes = true;

  const [mapToolsSlot, setMapToolsSlot] = React.useState<HTMLElement | null>(null);

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
  const [showElevationNodes, setShowElevationNodes] = React.useState(false);
  const [showDiameterTransitions, setShowDiameterTransitions] = React.useState(false);
  const [showLegend, setShowLegend] = React.useState(true);

  const [showMapAssets, setShowMapAssets] = React.useState(false);
  const [assetsPanelOpen, setAssetsPanelOpen] = React.useState(false);

  const [mapAssets, setMapAssets] = React.useState<MapAssetLive[]>([]);
  const [mapAssetsBusy, setMapAssetsBusy] = React.useState(false);
  const [mapAssetsErr, setMapAssetsErr] = React.useState<string | null>(null);
  const [selectedMapAsset, setSelectedMapAsset] = React.useState<MapAssetLive | null>(null);
  const [assetLinkMode, setAssetLinkMode] = React.useState<AssetLinkMode>("none");

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

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    let tries = 0;
    let timer: number | undefined;

    const findSlot = () => {
      const slot = document.getElementById("map-tools-slot");

      if (slot) {
        setMapToolsSlot(slot);
        if (timer) window.clearInterval(timer);
        return;
      }

      tries += 1;

      if (tries > 40 && timer) {
        window.clearInterval(timer);
      }
    };

    findSlot();
    timer = window.setInterval(findSlot, 150);

    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, []);

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
    setAssetLinkMode("none");
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

  async function loadMapAssets() {
    setMapAssetsBusy(true);
    setMapAssetsErr(null);

    try {
      const items = await fetchMapAssetsLive({ limit: 1000 });
      const safeItems = Array.isArray(items) ? items : [];

      setMapAssets(safeItems);

      setSelectedMapAsset((prev) => {
        if (!prev) return prev;
        return safeItems.find((a) => a.asset_link_id === prev.asset_link_id) ?? prev;
      });
    } catch (e: any) {
      setMapAssetsErr(e?.message ?? "No se pudieron cargar los activos reales");
    } finally {
      setMapAssetsBusy(false);
    }
  }

  React.useEffect(() => {
    if (showMapAssets && mapAssets.length === 0 && !mapAssetsBusy) {
      loadMapAssets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMapAssets]);

  React.useEffect(() => {
    if (assetsPanelOpen && mapAssets.length === 0 && !mapAssetsBusy) {
      loadMapAssets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsPanelOpen]);

  React.useEffect(() => {
    if ((showMapAssets || assetsPanelOpen) && nodesLite.length === 0 && !nodesBusy) {
      ensureNodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMapAssets, assetsPanelOpen]);

  React.useEffect(() => {
    if (showElevationNodes && nodesLite.length === 0 && !nodesBusy) {
      ensureNodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showElevationNodes]);

  async function startAssetLinkMode(mode: "node" | "pipe") {
    if (!selectedMapAsset) {
      alert("Primero seleccioná un activo real.");
      return;
    }

    closeEditionTools();
    clearPipeSelection();

    if (mode === "node") {
      await ensureNodes();
    }

    setShowMapAssets(true);
    setAssetLinkMode(mode);
  }

  async function handleLinkSelectedAssetToNode(nodeId: string) {
    if (!selectedMapAsset) return;

    try {
      const updated = await linkMapAsset(selectedMapAsset.asset_link_id, {
        map_node_id: nodeId,
        hydraulic_position: defaultHydraulicPositionForAsset(selectedMapAsset),
        notes: "Ubicado manualmente desde el mapa",
      });

      setSelectedMapAsset(updated);
      setAssetLinkMode("none");
      await loadMapAssets();
    } catch (e: any) {
      alert(e?.message ?? "No se pudo ubicar el activo en el nodo");
    }
  }

  async function handleLinkSelectedAssetToPipe(pipeId: string) {
    if (!selectedMapAsset) return;

    try {
      const updated = await linkMapAsset(selectedMapAsset.asset_link_id, {
        map_pipe_id: pipeId,
        hydraulic_position: defaultHydraulicPositionForAsset(selectedMapAsset),
        notes: "Ubicado manualmente sobre cañería desde el mapa",
      });

      setSelectedMapAsset(updated);
      setAssetLinkMode("none");
      await loadMapAssets();
    } catch (e: any) {
      alert(e?.message ?? "No se pudo ubicar el activo en la cañería");
    }
  }

  async function handleUnlinkSelectedAsset() {
    if (!selectedMapAsset) return;

    const ok = confirm(
      `¿Desubicar ${selectedMapAsset.asset_name ?? selectedMapAsset.asset_id} del mapa?`
    );
    if (!ok) return;

    try {
      const updated = await unlinkMapAsset(selectedMapAsset.asset_link_id);
      setSelectedMapAsset(updated);
      setAssetLinkMode("none");
      await loadMapAssets();
    } catch (e: any) {
      alert(e?.message ?? "No se pudo desubicar el activo");
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
    setAssetLinkMode("none");
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
    setAssetLinkMode("none");
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
    setAssetLinkMode("none");
    setCreatingPipe((v) => !v);
  }

  async function handleDeleteSelectedPipe() {
    if (!selectedPipeId) return;

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
        {mapToolsSlot &&
          createPortal(
            <MapFloatingControls
              creatingPipe={creatingPipe}
              onToggleCreatingPipe={toggleCreatingPipe}
              nodeConnectOpen={nodeConnectOpen}
              onOpenNodeConnector={openNodeConnector}
              intersectionConnectOpen={intersectionConnectOpen}
              onOpenIntersectionConnector={openIntersectionConnector}
              showContours={showContours}
              setShowContours={setShowContours}
              showPressureNodes={showPressureNodes}
              setShowPressureNodes={setShowPressureNodes}
              showElevationNodes={showElevationNodes}
              setShowElevationNodes={setShowElevationNodes}
              showDiameterTransitions={showDiameterTransitions}
              setShowDiameterTransitions={setShowDiameterTransitions}
              showMapAssets={showMapAssets}
              setShowMapAssets={setShowMapAssets}
              assetsPanelOpen={assetsPanelOpen}
              setAssetsPanelOpen={setAssetsPanelOpen}
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
              pipeConnectivityStats={pipeConnectivityStats}
              simErr={simErr}
            />,
            mapToolsSlot
          )}

        <MapAssetsPanel
          open={assetsPanelOpen}
          assets={mapAssets}
          busy={mapAssetsBusy}
          error={mapAssetsErr}
          selectedAsset={selectedMapAsset}
          linkMode={assetLinkMode}
          onClose={() => {
            setAssetsPanelOpen(false);
            setAssetLinkMode("none");
          }}
          onRefresh={loadMapAssets}
          onSelectAsset={(asset) => {
            setSelectedMapAsset(asset);
            setAssetLinkMode("none");
            setShowMapAssets(true);
          }}
          onStartLinkNode={() => startAssetLinkMode("node")}
          onStartLinkPipe={() => startAssetLinkMode("pipe")}
          onCancelLink={() => setAssetLinkMode("none")}
          onUnlink={handleUnlinkSelectedAsset}
        />

        {showLegend && (
          <MapLegendOverlay simActive={!!sim} showPressureNodes={showPressureNodes} />
        )}

        <MapContainer
          className={mapGrey ? "mapGrey" : undefined}
          center={MAP_CENTER}
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
              !intersectionConnectOpen &&
              assetLinkMode === "none"
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

          <MapAssetNodePickerLayer
            visible={assetsPanelOpen && assetLinkMode === "node" && !!selectedMapAsset}
            nodes={nodesLite}
            selectedAsset={selectedMapAsset}
            onPick={handleLinkSelectedAssetToNode}
          />

          <MapElevationNodesLayer
            visible={showElevationNodes}
            nodes={nodesLite}
          />

          <DiameterTransitionsLayer
            visible={showDiameterTransitions}
            minDeltaMm={20}
            minRatio={1.1}
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

                if (assetLinkMode === "pipe" && selectedMapAsset) {
                  handleLinkSelectedAssetToPipe(id);
                  return;
                }

                setSelectedPipeId(id);
                setSelectedPipeLabel(label ?? null);
                setSelectedPipeLayer(layer);
                setSelectedPipeFeature(feature ?? null);
                setSelectedPipePos(null);

                setEditingPipeId(null);
                setEditingGeomOpen(false);
                setConnectOpen(false);
                setNodeConnectOpen(false);
                setAssetLinkMode("none");
              }}
            />
          )}

          {sim && showPressureNodes && <PressureNodesLayer sim={sim} visible={true} />}

          <MapAssetsLayer
            visible={showMapAssets}
            assets={mapAssets}
            nodes={nodesLite}
            selectedAssetId={selectedMapAsset?.asset_link_id ?? null}
            onSelectAsset={(asset) => {
              setSelectedMapAsset(asset);
              setAssetLinkMode("none");
              setAssetsPanelOpen(true);
            }}
          />

          {!focusPair && <FlyTo target={focusTarget} />}

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

        {selectedPipeId &&
          !editingPipeId &&
          !editingGeomOpen &&
          !connectOpen &&
          !nodeConnectOpen &&
          !intersectionConnectOpen &&
          assetLinkMode === "none" && (
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
                setAssetLinkMode("none");
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
                setAssetLinkMode("none");
                setEditingGeomOpen(true);
              }}
              onConnect={async () => {
                if (!selectedPipeId) return;

                if (sim) {
                  alert("Apagá la simulación para conectar manualmente cañerías.");
                  return;
                }

                setIntersectionConnectOpen(false);
                setAssetLinkMode("none");
                await ensureNodes();
                setConnectOpen(true);
              }}
              onDelete={handleDeleteSelectedPipe}
              onClose={clearPipeSelection}
            />
          )}
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