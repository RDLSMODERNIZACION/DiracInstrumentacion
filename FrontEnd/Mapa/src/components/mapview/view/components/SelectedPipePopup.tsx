import React from "react";

import PipePopup from "../../PipePopup";
import type { SimRunResponse } from "../../PipesLayer";
import type { AssetLinkMode, InsertMode } from "../types";

export default function SelectedPipePopup({
  selectedPipeId,
  selectedPipeLabel,
  selectedPipePos,
  connHint,
  sim,
  nodesBusy,
  editingPipeId,
  editingGeomOpen,
  connectOpen,
  nodeConnectOpen,
  intersectionConnectOpen,
  insertMode,
  assetLinkMode,
  onEdit,
  onEditGeometry,
  onConnect,
  onCreateValve,
  onDelete,
  onClose,
}: {
  selectedPipeId: string | null;
  selectedPipeLabel: string | null;
  selectedPipePos: [number, number] | null;
  connHint: any;
  sim: SimRunResponse | null;
  nodesBusy: boolean;
  editingPipeId: string | null;
  editingGeomOpen: boolean;
  connectOpen: boolean;
  nodeConnectOpen: boolean;
  intersectionConnectOpen: boolean;
  insertMode: InsertMode;
  assetLinkMode: AssetLinkMode;
  onEdit: () => void;
  onEditGeometry: () => void;
  onConnect: () => void | Promise<void>;
  onCreateValve: () => void;
  onDelete: () => void | Promise<void>;
  onClose: () => void;
}) {
  if (
    !selectedPipeId ||
    editingPipeId ||
    editingGeomOpen ||
    connectOpen ||
    nodeConnectOpen ||
    intersectionConnectOpen ||
    insertMode !== "none" ||
    assetLinkMode !== "none"
  ) {
    return null;
  }

  return (
    <PipePopup
      selectedPipeId={selectedPipeId}
      selectedPipeLabel={selectedPipeLabel}
      selectedPipePos={selectedPipePos}
      connHint={connHint}
      sim={sim}
      nodesBusy={nodesBusy}
      onEdit={onEdit}
      onEditGeometry={onEditGeometry}
      onConnect={onConnect}
      onCreateValve={onCreateValve}
      onDelete={onDelete}
      onClose={onClose}
    />
  );
}
