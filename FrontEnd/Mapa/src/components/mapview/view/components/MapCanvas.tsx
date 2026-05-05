// src/components/mapview/view/components/MapCanvas.tsx

import { CircleMarker, MapContainer, Marker, TileLayer, ZoomControl } from "react-leaflet";
import type L from "leaflet";

import { focusPointIcon } from "../../../../lib/mapIcons";
import { FlyTo } from "../../../FlyTo";

import PipesLayer, { type PipeConnectivityStats, type SimRunResponse } from "../../PipesLayer";
import IntersectionConnectTool from "../../IntersectionConnectTool";
import ContourVisualLayer from "../../ContourVisualLayer";
import PressureNodesLayer from "../../PressureNodesLayer";
import MapLegendOverlay from "../../MapLegendOverlay";
import NodeConnectPickerLayer from "../../NodeConnectPickerLayer";
import PipePopup from "../../PipePopup";
import MapAssetNodePickerLayer from "../../MapAssetNodePickerLayer";
import MapAssetsLayer from "../../MapAssetsLayer";
import MapElevationNodesLayer from "../../MapElevationNodesLayer";
import DiameterTransitionsLayer from "../../DiameterTransitionsLayer";
import MapValvesLayer from "../../MapValvesLayer";

import {
  MapClickClear,
  PipeDrawController,
  ZoomWatcher,
} from "../../MapLeafletHelpers";

import type { NodeLite } from "../../mapTypes";
import type { FocusPair, SimMode } from "../../mapTypes";
import type { MapAssetLive } from "../../../../services/mapasagua";
import type { InsertMode } from "../types";
import { MAP_CENTER } from "../constants";
import { insertMeta } from "../insertMode";
import MapRefCapture from "../MapRefCapture";
import MapCursorController from "../MapCursorController";

type PipeSelectArgs = {
  id: string;
  layer: L.Layer;
  label?: string | null;
  feature?: any;
  latlng?: L.LatLng;
};

export default function MapCanvas({
  mapGrey,
  setZoom,
  onMapReady,
  focusPair,
  focusTarget,
  showLegend,
  sim,
  showPressureNodes,
  showContours,
  insertMode,
  insertBusy,
  insertHoverLatLng,
  activeInsertMeta,
  clearPipeSelection,
  editingPipeId,
  editingGeomOpen,
  connectOpen,
  nodeConnectOpen,
  intersectionConnectOpen,
  assetLinkMode,
  setIntersectionConnectOpen,
  setPipesReloadKey,
  nodeConnectFrom,
  nodeConnectTo,
  nodeConnectPickMode,
  nodesLite,
  pickNodeForConnection,
  assetsPanelOpen,
  selectedMapAsset,
  handleLinkSelectedAssetToNode,
  showElevationNodes,
  handleNodeUpdated,
  creatingPipe,
  onPipeCreated,
  showPipes,
  selectedPipeId,
  pipesReloadKey,
  setPipeConnectivityStats,
  handlePipeHover,
  onPipeSelect,
  showDiameterTransitions,
  showValves,
  valvesReloadKey,
  handleValveChanged,
  showMapAssets,
  mapAssets,
  setSelectedMapAsset,
  setAssetLinkMode,
  setAssetsPanelOpen,
  connHint,
  selectedPipeLabel,
  selectedPipePos,
  nodesBusy,
  onEditPipeData,
  onEditPipeGeometry,
  onConnectPipeManually,
  onCreateValveFromPipe,
  onDeleteSelectedPipe,
}: {
  mapGrey: boolean;
  setZoom: (zoom: number) => void;
  onMapReady: (map: L.Map) => void;
  focusPair: FocusPair;
  focusTarget: any;
  showLegend: boolean;
  sim: SimRunResponse | null;
  showPressureNodes: boolean;
  showContours: boolean;
  insertMode: InsertMode;
  insertBusy: boolean;
  insertHoverLatLng: { lat: number; lng: number } | null;
  activeInsertMeta: ReturnType<typeof insertMeta>;
  clearPipeSelection: () => void;
  editingPipeId: string | null;
  editingGeomOpen: boolean;
  connectOpen: boolean;
  nodeConnectOpen: boolean;
  intersectionConnectOpen: boolean;
  assetLinkMode: string;
  setIntersectionConnectOpen: (v: boolean) => void;
  setPipesReloadKey: (updater: (k: number) => number) => void;
  nodeConnectFrom: string;
  nodeConnectTo: string;
  nodeConnectPickMode: "from" | "to";
  nodesLite: NodeLite[];
  pickNodeForConnection: (nodeId: string) => void;
  assetsPanelOpen: boolean;
  selectedMapAsset: MapAssetLive | null;
  handleLinkSelectedAssetToNode: (nodeId: string) => void | Promise<void>;
  showElevationNodes: boolean;
  handleNodeUpdated: (node: any) => void;
  creatingPipe: boolean;
  onPipeCreated: (geom: any) => Promise<void>;
  showPipes: boolean;
  selectedPipeId: string | null;
  pipesReloadKey: number;
  setPipeConnectivityStats: (stats: PipeConnectivityStats | null) => void;
  handlePipeHover: (
    pipeId: string | null,
    latlng: { lat: number; lng: number } | null,
    screenPoint: { x: number; y: number } | null
  ) => void;
  onPipeSelect: (args: PipeSelectArgs) => void | Promise<void>;
  showDiameterTransitions: boolean;
  showValves: boolean;
  valvesReloadKey: number;
  handleValveChanged: () => void;
  showMapAssets: boolean;
  mapAssets: MapAssetLive[];
  setSelectedMapAsset: (asset: MapAssetLive | null) => void;
  setAssetLinkMode: (mode: any) => void;
  setAssetsPanelOpen: (v: boolean) => void;
  connHint: any;
  selectedPipeLabel: string | null;
  selectedPipePos: [number, number] | null;
  nodesBusy: boolean;
  onEditPipeData: () => void;
  onEditPipeGeometry: () => void;
  onConnectPipeManually: () => void | Promise<void>;
  onCreateValveFromPipe: () => void;
  onDeleteSelectedPipe: () => void | Promise<void>;
}) {
  return (
    <>
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
        <MapRefCapture onReady={onMapReady} />

        <MapCursorController
          insertMode={insertMode}
          creatingPipe={creatingPipe}
          busy={insertBusy}
        />

        <ZoomWatcher onZoom={setZoom} />
        <ZoomControl position="bottomright" />

        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={22}
          maxNativeZoom={19}
        />

        <ContourVisualLayer visible={showContours} opacity={0.68} />

        {insertMode !== "none" && insertHoverLatLng && (
          <>
            <CircleMarker
              center={[insertHoverLatLng.lat, insertHoverLatLng.lng]}
              radius={16}
              pathOptions={{
                color: activeInsertMeta.color,
                weight: 2.5,
                fillColor: activeInsertMeta.color,
                fillOpacity: 0.12,
                opacity: 0.95,
              }}
            />

            <CircleMarker
              center={[insertHoverLatLng.lat, insertHoverLatLng.lng]}
              radius={7}
              pathOptions={{
                color: "#ffffff",
                weight: 2.5,
                fillColor: activeInsertMeta.color,
                fillOpacity: 1,
                opacity: 1,
              }}
            />
          </>
        )}

        <MapClickClear
          onClear={clearPipeSelection}
          enabled={
            insertMode === "none" &&
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
          onCancel={() => setIntersectionConnectOpen(false)}
          onCreated={() => {
            setIntersectionConnectOpen(false);
            clearPipeSelection();
            setPipesReloadKey((k) => k + 1);
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
          onNodeUpdated={handleNodeUpdated}
        />

        <PipeDrawController enabled={creatingPipe} onCreated={onPipeCreated} />

        {showPipes && (
          <PipesLayer
            key={pipesReloadKey}
            visible={showPipes}
            selectedId={selectedPipeId}
            freeze={editingGeomOpen}
            sim={sim}
            showOnlySimulated={!!sim}
            onConnectivityStats={setPipeConnectivityStats}
            {...({ onPipeHover: handlePipeHover } as any)}
            onSelect={async (id, layer, label, feature, latlng) => {
              await onPipeSelect({ id, layer, label, feature, latlng });
            }}
          />
        )}

        {sim && showPressureNodes && <PressureNodesLayer sim={sim} visible={true} />}

        <DiameterTransitionsLayer
          visible={showDiameterTransitions}
          minDeltaMm={20}
          minRatio={1.1}
        />

        <MapValvesLayer
          visible={showValves}
          reloadKey={valvesReloadKey}
          onChanged={handleValveChanged}
        />

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
        insertMode === "none" &&
        assetLinkMode === "none" && (
          <PipePopup
            selectedPipeId={selectedPipeId}
            selectedPipeLabel={selectedPipeLabel}
            selectedPipePos={selectedPipePos}
            connHint={connHint}
            sim={sim}
            nodesBusy={nodesBusy}
            onEdit={onEditPipeData}
            onEditGeometry={onEditPipeGeometry}
            onConnect={onConnectPipeManually}
            onCreateValve={onCreateValveFromPipe}
            onDelete={onDeleteSelectedPipe}
            onClose={clearPipeSelection}
          />
        )}
    </>
  );
}
