// src/components/mapview/view/components/MapDrawers.tsx

import type L from "leaflet";
import PipeConnectDrawer from "../../PipeConnectDrawer";
import NodeConnectDrawer from "../../NodeConnectDrawer";
import PipeGeometryEditor from "../../PipeGeometryEditor";
import PipeEditDrawer from "../../PipeEditDrawer";
import type { NodeLite } from "../../mapTypes";
import type { PipeConnHint } from "../../mapTypes";

export default function MapDrawers({
  connectOpen,
  setConnectOpen,
  selectedPipeId,
  selectedPipeLayer,
  selectedPipeFeature,
  setSelectedPipeFeature,
  connHint,
  nodesLite,
  nodesBusy,
  ensureNodes,
  nodeConnectOpen,
  setNodeConnectOpen,
  nodeConnectFrom,
  nodeConnectTo,
  nodeConnectPickMode,
  setNodeConnectFrom,
  setNodeConnectTo,
  setNodeConnectPickMode,
  editingGeomOpen,
  setEditingGeomOpen,
  leafletMap,
  editingPipeId,
  setEditingPipeId,
  setSelectedPipeLabel,
  onPipesChanged,
  onGeometrySaved,
}: {
  connectOpen: boolean;
  setConnectOpen: (v: boolean) => void;
  selectedPipeId: string | null;
  selectedPipeLayer: L.Layer | null;
  selectedPipeFeature: any;
  setSelectedPipeFeature: (updater: any) => void;
  connHint: PipeConnHint;
  nodesLite: NodeLite[];
  nodesBusy: boolean;
  ensureNodes: () => void | Promise<void>;
  nodeConnectOpen: boolean;
  setNodeConnectOpen: (v: boolean) => void;
  nodeConnectFrom: string;
  nodeConnectTo: string;
  nodeConnectPickMode: "from" | "to";
  setNodeConnectFrom: (v: string) => void;
  setNodeConnectTo: (v: string) => void;
  setNodeConnectPickMode: (v: "from" | "to") => void;
  editingGeomOpen: boolean;
  setEditingGeomOpen: (v: boolean) => void;
  leafletMap: L.Map | null;
  editingPipeId: string | null;
  setEditingPipeId: (v: string | null) => void;
  setSelectedPipeLabel: (v: string) => void;
  onPipesChanged: () => void;
  onGeometrySaved: () => void | Promise<void>;
}) {
  return (
    <>
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

          onPipesChanged();
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
        onCreated={onPipesChanged}
      />

      <PipeGeometryEditor
        open={editingGeomOpen}
        pipeId={selectedPipeId}
        pipeLayer={selectedPipeLayer}
        pipeFeature={selectedPipeFeature}
        map={leafletMap}
        onClose={() => setEditingGeomOpen(false)}
        onSaved={onGeometrySaved}
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

          onPipesChanged();
        }}
      />
    </>
  );
}
