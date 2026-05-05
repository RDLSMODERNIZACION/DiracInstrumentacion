import React from "react";
import type { AssetLinkMode } from "../types";

export function useEditionTools() {
  const [editingPipeId, setEditingPipeId] = React.useState<string | null>(null);
  const [editingGeomOpen, setEditingGeomOpen] = React.useState(false);
  const [creatingPipe, setCreatingPipe] = React.useState(false);
  const [connectOpen, setConnectOpen] = React.useState(false);

  const [assetLinkMode, setAssetLinkMode] = React.useState<AssetLinkMode>("none");

  const [nodeConnectOpen, setNodeConnectOpen] = React.useState(false);
  const [nodeConnectFrom, setNodeConnectFrom] = React.useState("");
  const [nodeConnectTo, setNodeConnectTo] = React.useState("");
  const [nodeConnectPickMode, setNodeConnectPickMode] =
    React.useState<"from" | "to">("from");

  const [intersectionConnectOpen, setIntersectionConnectOpen] = React.useState(false);

  const closeEditionTools = React.useCallback(() => {
    setCreatingPipe(false);
    setEditingPipeId(null);
    setEditingGeomOpen(false);
    setConnectOpen(false);
    setNodeConnectOpen(false);
    setIntersectionConnectOpen(false);
    setAssetLinkMode("none");
  }, []);

  const pickNodeForConnection = React.useCallback(
    (nodeId: string) => {
      if (nodeConnectPickMode === "from") {
        setNodeConnectFrom(nodeId);

        if (!nodeConnectTo || nodeConnectTo === nodeId) {
          setNodeConnectPickMode("to");
        }

        return;
      }

      setNodeConnectTo(nodeId);
    },
    [nodeConnectPickMode, nodeConnectTo]
  );

  return {
    editingPipeId,
    setEditingPipeId,
    editingGeomOpen,
    setEditingGeomOpen,
    creatingPipe,
    setCreatingPipe,
    connectOpen,
    setConnectOpen,
    assetLinkMode,
    setAssetLinkMode,
    nodeConnectOpen,
    setNodeConnectOpen,
    nodeConnectFrom,
    setNodeConnectFrom,
    nodeConnectTo,
    setNodeConnectTo,
    nodeConnectPickMode,
    setNodeConnectPickMode,
    intersectionConnectOpen,
    setIntersectionConnectOpen,
    closeEditionTools,
    pickNodeForConnection,
  };
}
