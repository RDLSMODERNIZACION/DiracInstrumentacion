import React from "react";

export function useMapVisibility() {
  const [showContours, setShowContours] = React.useState(false);
  const [showPressureNodes, setShowPressureNodes] = React.useState(true);
  const [showElevationNodes, setShowElevationNodes] = React.useState(false);
  const [showDiameterTransitions, setShowDiameterTransitions] = React.useState(false);
  const [showValves, setShowValves] = React.useState(false);
  const [showLegend, setShowLegend] = React.useState(true);
  const [showMapAssets, setShowMapAssets] = React.useState(false);
  const [assetsPanelOpen, setAssetsPanelOpen] = React.useState(false);

  return {
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
    showLegend,
    setShowLegend,
    showMapAssets,
    setShowMapAssets,
    assetsPanelOpen,
    setAssetsPanelOpen,
  };
}
