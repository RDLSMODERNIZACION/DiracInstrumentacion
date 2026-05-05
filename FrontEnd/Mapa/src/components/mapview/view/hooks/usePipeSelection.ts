// src/components/mapview/view/hooks/usePipeSelection.ts

import React from "react";
import type L from "leaflet";
import { pipeConnHintFromFeature } from "../../mapHelpers";

export default function usePipeSelection() {
  const [selectedPipeId, setSelectedPipeId] = React.useState<string | null>(null);
  const [selectedPipeLabel, setSelectedPipeLabel] = React.useState<string | null>(null);
  const [selectedPipeLayer, setSelectedPipeLayer] = React.useState<L.Layer | null>(null);
  const [selectedPipePos, setSelectedPipePos] = React.useState<[number, number] | null>(null);
  const [selectedPipeFeature, setSelectedPipeFeature] = React.useState<any>(null);

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
  }

  function selectPipe(args: {
    id: string;
    layer: L.Layer;
    label?: string | null;
    feature?: any;
    pos?: [number, number] | null;
  }) {
    setSelectedPipeId(args.id);
    setSelectedPipeLabel(args.label ?? null);
    setSelectedPipeLayer(args.layer);
    setSelectedPipeFeature(args.feature ?? null);
    setSelectedPipePos(args.pos ?? null);
  }

  return {
    selectedPipeId,
    selectedPipeLabel,
    selectedPipeLayer,
    selectedPipePos,
    selectedPipeFeature,
    connHint,
    setSelectedPipeLabel,
    setSelectedPipePos,
    setSelectedPipeFeature,
    clearPipeSelection,
    selectPipe,
  };
}
