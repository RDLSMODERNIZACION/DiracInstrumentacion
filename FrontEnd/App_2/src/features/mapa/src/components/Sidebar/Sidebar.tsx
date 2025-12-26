import React, { useMemo, useState } from "react";
import { SidebarProps } from "./types";
import {
  dotColor,
  edgeColor,
  assetTypeLabel,
  getValveTargets,
  pipeLabel,
  edgeRequiresOpen,
} from "./helpers";

// 👇 todo lo demás ES TU CÓDIGO ACTUAL
export function Sidebar(props: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const {
    mode,
    selectedZone,
    selectedAsset,
    zoneTab,
    setZoneTab,
    locationInventory,
    valveEnabled,
    onToggleValve,
    onReset,
    assetsById,
    activeValveId,
    setActiveValveId,
    showValveImpact,
    viewMode,
    setViewMode,
    viewSelectedId,
    setViewSelectedId,
    zonesAll,
    barriosAll,
    edgesAll,
  } = props;

  const valveImpact = useMemo(() => {
    if (!activeValveId) return null;

    const v = assetsById.get(activeValveId);
    const { barrioNames, locationNames, assetNames, note } =
      getValveTargets({ valveId: activeValveId, assetsById });

    const pipes = (locationInventory.pipes ?? []).filter((e) => {
      if (e.from === activeValveId || e.to === activeValveId) return true;
      return edgeRequiresOpen(e).includes(activeValveId);
    });

    return {
      valveName: v?.name ?? activeValveId,
      barrioNames,
      locationNames,
      assetNames,
      note,
      pipes,
    };
  }, [activeValveId, assetsById, locationInventory.pipes]);

  // 👇 acá sigue TODO tu JSX actual
  return (
    <div className="sidebar">
      {/* tu header, vista, tabs, etc */}
    </div>
  );
}
