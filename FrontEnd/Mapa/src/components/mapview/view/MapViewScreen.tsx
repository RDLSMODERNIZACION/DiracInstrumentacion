// src/components/mapview/view/MapViewScreen.tsx

import React from "react";
import type L from "leaflet";

import type { PipeConnectivityStats } from "../PipesLayer";
import type { SimMode } from "../mapTypes";
import type { AssetLinkMode, InsertMode, MapViewProps } from "./types";

import { createPipe, deletePipe, insertValveOnPipePoint } from "../../../services/mapasagua";

import useMapToolsSlot from "./hooks/useMapToolsSlot";
import usePipeSelection from "./hooks/usePipeSelection";
import useNodesController from "./hooks/useNodesController";
import useSimulationController from "./hooks/useSimulationController";
import useMapAssetsController from "./hooks/useMapAssetsController";

import { autoConnectPipeGeometry } from "./pipeAutoConnect";
import { insertMeta } from "./insertMode";

import MapControlsPortal from "./components/MapControlsPortal";
import MapAssetsPanelHost from "./components/MapAssetsPanelHost";
import MapCanvas from "./components/MapCanvas";
import MapDrawers from "./components/MapDrawers";
import InsertFloatingGuide from "./InsertFloatingGuide";

const showPipes = true;

export default function MapViewScreen(props: MapViewProps) {
  const { setZoom, focusPair, focusTarget, mapGrey } = props;

  const mapToolsSlot = useMapToolsSlot();
  const [leafletMap, setLeafletMap] = React.useState<L.Map | null>(null);

  const {
    selectedPipeId,
    selectedPipeLabel,
    selectedPipeLayer,
    selectedPipePos,
    selectedPipeFeature,
    connHint,
    setSelectedPipeLabel,
    setSelectedPipePos,
    setSelectedPipeFeature,
    clearPipeSelection: clearPipeSelectionBase,
    selectPipe,
  } = usePipeSelection();

  const {
    nodesLite,
    nodesBusy,
    ensureNodes,
    refreshNodeElevationsAfterMapChange,
    handleNodeUpdated,
  } = useNodesController();

  const {
    simMode,
    sim,
    setSim,
    simBusy,
    simErr,
    runSimulation,
    toggleSimMode,
  } = useSimulationController();

  const assets = useMapAssetsController();

  const [editingPipeId, setEditingPipeId] = React.useState<string | null>(null);
  const [editingGeomOpen, setEditingGeomOpen] = React.useState(false);
  const [creatingPipe, setCreatingPipe] = React.useState(false);

  const [showContours, setShowContours] = React.useState(false);
  const [showPressureNodes, setShowPressureNodes] = React.useState(true);
  const [showElevationNodes, setShowElevationNodes] = React.useState(false);
  const [showDiameterTransitions, setShowDiameterTransitions] = React.useState(false);
  const [showValves, setShowValves] = React.useState(false);
  const [showLegend, setShowLegend] = React.useState(true);

  const [pipesReloadKey, setPipesReloadKey] = React.useState(0);
  const [valvesReloadKey, setValvesReloadKey] = React.useState(0);
  const [pipeConnectivityStats, setPipeConnectivityStats] =
    React.useState<PipeConnectivityStats | null>(null);

  const [insertMode, setInsertMode] = React.useState<InsertMode>("none");
  const [insertBusy, setInsertBusy] = React.useState(false);
  const [insertHoverLatLng, setInsertHoverLatLng] = React.useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [insertHoverScreenPoint, setInsertHoverScreenPoint] = React.useState<{
    x: number;
    y: number;
  } | null>(null);
  const [insertHoverPipeId, setInsertHoverPipeId] = React.useState<string | null>(null);

  const [connectOpen, setConnectOpen] = React.useState(false);
  const [nodeConnectOpen, setNodeConnectOpen] = React.useState(false);
  const [nodeConnectFrom, setNodeConnectFrom] = React.useState("");
  const [nodeConnectTo, setNodeConnectTo] = React.useState("");
  const [nodeConnectPickMode, setNodeConnectPickMode] =
    React.useState<"from" | "to">("from");
  const [intersectionConnectOpen, setIntersectionConnectOpen] = React.useState(false);

  React.useEffect(() => {
    if (insertMode === "none") return;

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") clearInsertMode();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertMode, insertBusy]);

  React.useEffect(() => {
    if (assets.showMapAssets && assets.mapAssets.length === 0 && !assets.mapAssetsBusy) {
      assets.loadMapAssets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.showMapAssets]);

  React.useEffect(() => {
    if (assets.assetsPanelOpen && assets.mapAssets.length === 0 && !assets.mapAssetsBusy) {
      assets.loadMapAssets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.assetsPanelOpen]);

  React.useEffect(() => {
    if ((assets.showMapAssets || assets.assetsPanelOpen) && nodesLite.length === 0 && !nodesBusy) {
      ensureNodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.showMapAssets, assets.assetsPanelOpen]);

  React.useEffect(() => {
    if (showElevationNodes && nodesLite.length === 0 && !nodesBusy) {
      ensureNodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showElevationNodes]);

  function clearPipeSelection() {
    clearPipeSelectionBase();
    setEditingPipeId(null);
    setEditingGeomOpen(false);
    setConnectOpen(false);
  }

  function clearInsertMode() {
    if (insertBusy) return;
    setInsertMode("none");
    setInsertHoverLatLng(null);
    setInsertHoverScreenPoint(null);
    setInsertHoverPipeId(null);
  }

  function closeEditionTools() {
    setCreatingPipe(false);
    setEditingPipeId(null);
    setEditingGeomOpen(false);
    setConnectOpen(false);
    setNodeConnectOpen(false);
    setIntersectionConnectOpen(false);
    assets.setAssetLinkMode("none");
  }

  function handleSelectInsertMode(mode: InsertMode) {
    if (insertBusy) return;

    closeEditionTools();
    clearPipeSelection();

    setInsertHoverLatLng(null);
    setInsertHoverScreenPoint(null);
    setInsertHoverPipeId(null);
    setInsertMode(mode);

    if (mode === "valve") setShowValves(true);

    if (mode === "tank" || mode === "pump") {
      assets.setShowMapAssets(true);
    }
  }

  async function startAssetLinkMode(mode: "node" | "pipe") {
    if (!assets.selectedMapAsset) {
      alert("Primero seleccioná un activo real.");
      return;
    }

    closeEditionTools();
    clearPipeSelection();
    clearInsertMode();

    if (mode === "node") await ensureNodes();

    assets.setShowMapAssets(true);
    assets.setAssetLinkMode(mode);
  }

  async function handleLinkSelectedAssetToNode(nodeId: string) {
    try {
      await assets.linkSelectedAssetToNode(nodeId);
    } catch (e: any) {
      alert(e?.message ?? "No se pudo ubicar el activo en el nodo");
    }
  }

  async function handleLinkSelectedAssetToPipe(pipeId: string) {
    try {
      await assets.linkSelectedAssetToPipe(pipeId);
    } catch (e: any) {
      alert(e?.message ?? "No se pudo ubicar el activo en la cañería");
    }
  }

  async function handleUnlinkSelectedAsset() {
    try {
      await assets.unlinkSelectedAsset();
    } catch (e: any) {
      alert(e?.message ?? "No se pudo desubicar el activo");
    }
  }

  function pickNodeForConnection(nodeId: string) {
    if (nodeConnectPickMode === "from") {
      setNodeConnectFrom(nodeId);
      if (!nodeConnectTo || nodeConnectTo === nodeId) setNodeConnectPickMode("to");
      return;
    }

    setNodeConnectTo(nodeId);
  }

  async function openNodeConnector() {
    if (sim) {
      alert("Apagá la simulación para editar conexiones de nodos.");
      return;
    }

    closeEditionTools();
    clearInsertMode();
    setNodeConnectOpen(true);
    await ensureNodes();
  }

  function openIntersectionConnector() {
    if (sim) {
      alert("Apagá la simulación para conectar cruces. Después de conectar, corré la simulación de nuevo.");
      return;
    }

    clearPipeSelection();
    closeEditionTools();
    clearInsertMode();
    setIntersectionConnectOpen((v) => !v);
  }

  function toggleCreatingPipe() {
    setNodeConnectOpen(false);
    setIntersectionConnectOpen(false);
    setConnectOpen(false);
    assets.setAssetLinkMode("none");
    clearInsertMode();
    setCreatingPipe((v) => !v);
  }

  async function handleDeleteSelectedPipe() {
    if (!selectedPipeId) return;

    try {
      await deletePipe(selectedPipeId);
      clearPipeSelection();
      setPipesReloadKey((k) => k + 1);
      if (sim) setSim(null);
    } catch (err: any) {
      alert(err?.message ?? "No se pudo borrar");
    }
  }

  async function handlePipeCreated(geom: any) {
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

      await autoConnectPipeGeometry(geom, {
        includeVertices: true,
        includeInternalProbes: true,
      });

      await refreshNodeElevationsAfterMapChange();

      setCreatingPipe(false);
      setPipesReloadKey((k) => k + 1);
      if (sim) setSim(null);
    } catch (e: any) {
      alert(e?.message ?? "No se pudo crear");
      setCreatingPipe(false);
    }
  }

  async function handleInsertOnPipeClick(args: {
    pipeId: string;
    lat: number;
    lng: number;
    label?: string | null;
  }) {
    if (insertBusy) return;

    setInsertBusy(true);

    try {
      if (insertMode === "valve") {
        const defaultName = `Válvula ${args.label ?? args.pipeId.slice(0, 8)}`;
        const name = prompt("Nombre de la válvula:", defaultName);
        if (name === null) return;

        await insertValveOnPipePoint({
          pipe_id: args.pipeId,
          lat: args.lat,
          lng: args.lng,
          name: name.trim() || defaultName,
          is_open: true,
          valve_type: "MANUAL",
          source: "MANUAL",
          notes: "Insertada desde el mapa sobre punto de cañería",
          block_side: "to",
        });

        await refreshNodeElevationsAfterMapChange();
        setShowValves(true);
        setValvesReloadKey((k) => k + 1);
        setPipesReloadKey((k) => k + 1);
      }

      if (insertMode === "tank") {
        assets.setShowMapAssets(true);
        assets.setAssetsPanelOpen(true);
        alert("Punto marcado para tanque. Siguiente paso: asociar un tanque real desde el panel de activos.");
      }

      if (insertMode === "pump") {
        assets.setShowMapAssets(true);
        assets.setAssetsPanelOpen(true);
        alert("Punto marcado para bomba. Siguiente paso: asociar una bomba real desde el panel de activos.");
      }

      clearInsertMode();
      clearPipeSelection();
      if (sim) await runSimulation();
    } catch (e: any) {
      alert(e?.message ?? "No se pudo insertar el elemento");
    } finally {
      setInsertBusy(false);
    }
  }

  function handleValveChanged() {
    setValvesReloadKey((k) => k + 1);
    if (sim) runSimulation();
  }

  function handlePipeHover(
    pipeId: string | null,
    latlng: { lat: number; lng: number } | null,
    screenPoint: { x: number; y: number } | null
  ) {
    if (insertMode === "none") return;

    setInsertHoverPipeId(pipeId);
    setInsertHoverLatLng(latlng);
    setInsertHoverScreenPoint(screenPoint);
  }

  async function handlePipeSelect(args: {
    id: string;
    layer: L.Layer;
    label?: string | null;
    feature?: any;
    latlng?: L.LatLng;
  }) {
    if (intersectionConnectOpen) return;

    if (insertMode !== "none") {
      if (!args.latlng) {
        alert("No pude detectar el punto exacto sobre la cañería.");
        return;
      }

      await handleInsertOnPipeClick({
        pipeId: args.id,
        lat: args.latlng.lat,
        lng: args.latlng.lng,
        label: args.label,
      });
      return;
    }

    if (assets.assetLinkMode === "pipe" && assets.selectedMapAsset) {
      await handleLinkSelectedAssetToPipe(args.id);
      return;
    }

    selectPipe(args);
    setEditingPipeId(null);
    setEditingGeomOpen(false);
    setConnectOpen(false);
    setNodeConnectOpen(false);
    assets.setAssetLinkMode("none");
  }

  function handlePipesChanged() {
    setPipesReloadKey((k) => k + 1);
    if (sim) setSim(null);
  }

  const activeInsertMeta = insertMeta(insertMode);

  return (
    <>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <MapControlsPortal
          slot={mapToolsSlot}
          creatingPipe={creatingPipe}
          onToggleCreatingPipe={toggleCreatingPipe}
          insertMode={insertMode}
          onSelectInsertMode={handleSelectInsertMode}
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
          showValves={showValves}
          setShowValves={setShowValves}
          showMapAssets={assets.showMapAssets}
          setShowMapAssets={assets.setShowMapAssets}
          assetsPanelOpen={assets.assetsPanelOpen}
          setAssetsPanelOpen={assets.setAssetsPanelOpen}
          simMode={simMode}
          onToggleSimMode={toggleSimMode}
          simActive={!!sim}
          simBusy={simBusy}
          onToggleSim={() => {
            if (sim) setSim(null);
            else {
              closeEditionTools();
              runSimulation();
            }
          }}
          showLegend={showLegend}
          setShowLegend={setShowLegend}
          pipeConnectivityStats={pipeConnectivityStats}
          simErr={simErr}
        />

        <MapAssetsPanelHost
          open={assets.assetsPanelOpen}
          assets={assets.mapAssets}
          busy={assets.mapAssetsBusy}
          error={assets.mapAssetsErr}
          selectedAsset={assets.selectedMapAsset}
          linkMode={assets.assetLinkMode}
          onClose={() => {
            assets.setAssetsPanelOpen(false);
            assets.setAssetLinkMode("none");
          }}
          onRefresh={assets.loadMapAssets}
          onSelectAsset={(asset) => {
            assets.setSelectedMapAsset(asset);
            assets.setAssetLinkMode("none");
            assets.setShowMapAssets(true);
          }}
          onStartLinkNode={() => startAssetLinkMode("node")}
          onStartLinkPipe={() => startAssetLinkMode("pipe")}
          onCancelLink={() => assets.setAssetLinkMode("none")}
          onUnlink={handleUnlinkSelectedAsset}
        />

        <InsertFloatingGuide
          mode={insertMode}
          busy={insertBusy}
          hoverScreenPoint={insertHoverScreenPoint}
          onCancel={clearInsertMode}
        />

        <MapCanvas
          mapGrey={mapGrey}
          setZoom={setZoom}
          onMapReady={setLeafletMap}
          focusPair={focusPair}
          focusTarget={focusTarget}
          showLegend={showLegend}
          sim={sim}
          showPressureNodes={showPressureNodes}
          showContours={showContours}
          insertMode={insertMode}
          insertBusy={insertBusy}
          insertHoverLatLng={insertHoverLatLng}
          activeInsertMeta={activeInsertMeta}
          clearPipeSelection={clearPipeSelection}
          editingPipeId={editingPipeId}
          editingGeomOpen={editingGeomOpen}
          connectOpen={connectOpen}
          nodeConnectOpen={nodeConnectOpen}
          intersectionConnectOpen={intersectionConnectOpen}
          assetLinkMode={assets.assetLinkMode}
          setIntersectionConnectOpen={setIntersectionConnectOpen}
          setPipesReloadKey={setPipesReloadKey}
          nodeConnectFrom={nodeConnectFrom}
          nodeConnectTo={nodeConnectTo}
          nodeConnectPickMode={nodeConnectPickMode}
          nodesLite={nodesLite}
          pickNodeForConnection={pickNodeForConnection}
          assetsPanelOpen={assets.assetsPanelOpen}
          selectedMapAsset={assets.selectedMapAsset}
          handleLinkSelectedAssetToNode={handleLinkSelectedAssetToNode}
          showElevationNodes={showElevationNodes}
          handleNodeUpdated={handleNodeUpdated}
          creatingPipe={creatingPipe}
          onPipeCreated={handlePipeCreated}
          showPipes={showPipes}
          selectedPipeId={selectedPipeId}
          pipesReloadKey={pipesReloadKey}
          setPipeConnectivityStats={setPipeConnectivityStats}
          handlePipeHover={handlePipeHover}
          onPipeSelect={handlePipeSelect}
          showDiameterTransitions={showDiameterTransitions}
          showValves={showValves}
          valvesReloadKey={valvesReloadKey}
          handleValveChanged={handleValveChanged}
          showMapAssets={assets.showMapAssets}
          mapAssets={assets.mapAssets}
          setSelectedMapAsset={assets.setSelectedMapAsset}
          setAssetLinkMode={assets.setAssetLinkMode}
          setAssetsPanelOpen={assets.setAssetsPanelOpen}
          connHint={connHint}
          selectedPipeLabel={selectedPipeLabel}
          selectedPipePos={selectedPipePos}
          nodesBusy={nodesBusy}
          onEditPipeData={() => {
            setSelectedPipePos(null);
            setEditingGeomOpen(false);
            setConnectOpen(false);
            setNodeConnectOpen(false);
            assets.setAssetLinkMode("none");
            clearInsertMode();
            setEditingPipeId(selectedPipeId);
          }}
          onEditPipeGeometry={() => {
            if (sim) {
              alert("Apagá la simulación para editar el recorrido.");
              return;
            }

            setSelectedPipePos(null);
            setEditingPipeId(null);
            setConnectOpen(false);
            setNodeConnectOpen(false);
            setIntersectionConnectOpen(false);
            assets.setAssetLinkMode("none");
            clearInsertMode();
            setEditingGeomOpen(true);
          }}
          onConnectPipeManually={async () => {
            if (!selectedPipeId) return;
            if (sim) {
              alert("Apagá la simulación para conectar manualmente cañerías.");
              return;
            }
            setIntersectionConnectOpen(false);
            assets.setAssetLinkMode("none");
            clearInsertMode();
            await ensureNodes();
            setConnectOpen(true);
          }}
          onCreateValveFromPipe={() => handleSelectInsertMode("valve")}
          onDeleteSelectedPipe={handleDeleteSelectedPipe}
        />
      </div>

      <MapDrawers
        connectOpen={connectOpen}
        setConnectOpen={setConnectOpen}
        selectedPipeId={selectedPipeId}
        selectedPipeLayer={selectedPipeLayer}
        selectedPipeFeature={selectedPipeFeature}
        setSelectedPipeFeature={setSelectedPipeFeature}
        connHint={connHint}
        nodesLite={nodesLite}
        nodesBusy={nodesBusy}
        ensureNodes={ensureNodes}
        nodeConnectOpen={nodeConnectOpen}
        setNodeConnectOpen={setNodeConnectOpen}
        nodeConnectFrom={nodeConnectFrom}
        nodeConnectTo={nodeConnectTo}
        nodeConnectPickMode={nodeConnectPickMode}
        setNodeConnectFrom={setNodeConnectFrom}
        setNodeConnectTo={setNodeConnectTo}
        setNodeConnectPickMode={setNodeConnectPickMode}
        editingGeomOpen={editingGeomOpen}
        setEditingGeomOpen={setEditingGeomOpen}
        leafletMap={leafletMap}
        editingPipeId={editingPipeId}
        setEditingPipeId={setEditingPipeId}
        setSelectedPipeLabel={setSelectedPipeLabel}
        onPipesChanged={handlePipesChanged}
        onGeometrySaved={async () => {
          setPipesReloadKey((k) => k + 1);
          await refreshNodeElevationsAfterMapChange();
          if (sim) runSimulation();
        }}
      />
    </>
  );
}
