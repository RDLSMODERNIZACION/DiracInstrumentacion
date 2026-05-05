// src/components/mapview/view/components/MapControlsPortal.tsx

import { createPortal } from "react-dom";
import MapFloatingControls from "../../MapFloatingControls";
import type { PipeConnectivityStats } from "../../PipesLayer";
import type { InsertMode } from "../types";
import type { SimMode } from "../../mapTypes";

type BoolSetter = (updater: (v: boolean) => boolean) => void;

export default function MapControlsPortal({
  slot,
  creatingPipe,
  onToggleCreatingPipe,
  insertMode,
  onSelectInsertMode,
  nodeConnectOpen,
  onOpenNodeConnector,
  intersectionConnectOpen,
  onOpenIntersectionConnector,
  showContours,
  setShowContours,
  showPressureNodes,
  setShowPressureNodes,
  showElevationNodes,
  setShowElevationNodes,
  showDiameterTransitions,
  setShowDiameterTransitions,
  showValves,
  setShowValves,
  showMapAssets,
  setShowMapAssets,
  assetsPanelOpen,
  setAssetsPanelOpen,
  simMode,
  onToggleSimMode,
  simActive,
  simBusy,
  onToggleSim,
  showLegend,
  setShowLegend,
  pipeConnectivityStats,
  simErr,
}: {
  slot: HTMLElement | null;
  creatingPipe: boolean;
  onToggleCreatingPipe: () => void;
  insertMode: InsertMode;
  onSelectInsertMode: (mode: InsertMode) => void;
  nodeConnectOpen: boolean;
  onOpenNodeConnector: () => void;
  intersectionConnectOpen: boolean;
  onOpenIntersectionConnector: () => void;
  showContours: boolean;
  setShowContours: BoolSetter;
  showPressureNodes: boolean;
  setShowPressureNodes: BoolSetter;
  showElevationNodes: boolean;
  setShowElevationNodes: BoolSetter;
  showDiameterTransitions: boolean;
  setShowDiameterTransitions: BoolSetter;
  showValves: boolean;
  setShowValves: BoolSetter;
  showMapAssets: boolean;
  setShowMapAssets: BoolSetter;
  assetsPanelOpen: boolean;
  setAssetsPanelOpen: BoolSetter;
  simMode: SimMode;
  onToggleSimMode: () => void;
  simActive: boolean;
  simBusy: boolean;
  onToggleSim: () => void;
  showLegend: boolean;
  setShowLegend: BoolSetter;
  pipeConnectivityStats: PipeConnectivityStats | null;
  simErr: string | null;
}) {
  if (!slot) return null;

  return createPortal(
    <MapFloatingControls
      creatingPipe={creatingPipe}
      onToggleCreatingPipe={onToggleCreatingPipe}
      insertMode={insertMode}
      onSelectInsertMode={onSelectInsertMode}
      nodeConnectOpen={nodeConnectOpen}
      onOpenNodeConnector={onOpenNodeConnector}
      intersectionConnectOpen={intersectionConnectOpen}
      onOpenIntersectionConnector={onOpenIntersectionConnector}
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
      showMapAssets={showMapAssets}
      setShowMapAssets={setShowMapAssets}
      assetsPanelOpen={assetsPanelOpen}
      setAssetsPanelOpen={setAssetsPanelOpen}
      simMode={simMode}
      onToggleSimMode={onToggleSimMode}
      simActive={simActive}
      simBusy={simBusy}
      onToggleSim={onToggleSim}
      showLegend={showLegend}
      setShowLegend={setShowLegend}
      pipeConnectivityStats={pipeConnectivityStats}
      simErr={simErr}
    />,
    slot
  );
}
