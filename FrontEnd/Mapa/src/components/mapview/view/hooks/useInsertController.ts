import React from "react";

import { insertValveOnPipePoint } from "../../../../services/mapasagua";
import type { InsertMode } from "../types";

export function useInsertController({
  closeEditionTools,
  clearPipeSelection,
  setShowValves,
  setShowMapAssets,
  setAssetsPanelOpen,
  bumpPipesReload,
  bumpValvesReload,
  simActive,
  runSimulation,
}: {
  closeEditionTools: () => void;
  clearPipeSelection: () => void;
  setShowValves: (v: boolean) => void;
  setShowMapAssets: (v: boolean) => void;
  setAssetsPanelOpen: (v: boolean) => void;
  bumpPipesReload: () => void;
  bumpValvesReload: () => void;
  simActive: boolean;
  runSimulation: () => Promise<void>;
}) {
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

  const clearInsertMode = React.useCallback(() => {
    if (insertBusy) return;

    setInsertMode("none");
    setInsertHoverLatLng(null);
    setInsertHoverScreenPoint(null);
    setInsertHoverPipeId(null);
  }, [insertBusy]);

  React.useEffect(() => {
    if (insertMode === "none") return;

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") clearInsertMode();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [clearInsertMode, insertMode]);

  const selectInsertMode = React.useCallback(
    (mode: InsertMode) => {
      if (insertBusy) return;

      closeEditionTools();
      clearPipeSelection();

      setInsertHoverLatLng(null);
      setInsertHoverScreenPoint(null);
      setInsertHoverPipeId(null);
      setInsertMode(mode);

      if (mode === "valve") setShowValves(true);
      if (mode === "tank" || mode === "pump") setShowMapAssets(true);
    },
    [clearPipeSelection, closeEditionTools, insertBusy, setShowMapAssets, setShowValves]
  );

  const handlePipeHover = React.useCallback(
    (
      pipeId: string | null,
      latlng: { lat: number; lng: number } | null,
      screenPoint: { x: number; y: number } | null
    ) => {
      if (insertMode === "none") return;

      setInsertHoverPipeId(pipeId);
      setInsertHoverLatLng(latlng);
      setInsertHoverScreenPoint(screenPoint);
    },
    [insertMode]
  );

  const insertOnPipeClick = React.useCallback(
    async (args: { pipeId: string; lat: number; lng: number; label?: string | null }) => {
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

          setShowValves(true);
          bumpValvesReload();
          bumpPipesReload();
        }

        if (insertMode === "tank") {
          setShowMapAssets(true);
          setAssetsPanelOpen(true);
          alert(
            "Punto marcado para tanque. Siguiente paso: asociar un tanque real desde el panel de activos."
          );
        }

        if (insertMode === "pump") {
          setShowMapAssets(true);
          setAssetsPanelOpen(true);
          alert(
            "Punto marcado para bomba. Siguiente paso: asociar una bomba real desde el panel de activos."
          );
        }

        clearInsertMode();
        clearPipeSelection();

        if (simActive) await runSimulation();
      } catch (e: any) {
        alert(e?.message ?? "No se pudo insertar el elemento");
      } finally {
        setInsertBusy(false);
      }
    },
    [
      bumpPipesReload,
      bumpValvesReload,
      clearInsertMode,
      clearPipeSelection,
      insertBusy,
      insertMode,
      runSimulation,
      setAssetsPanelOpen,
      setShowMapAssets,
      setShowValves,
      simActive,
    ]
  );

  return {
    insertMode,
    insertBusy,
    insertHoverLatLng,
    insertHoverScreenPoint,
    insertHoverPipeId,
    clearInsertMode,
    selectInsertMode,
    handlePipeHover,
    insertOnPipeClick,
  };
}
